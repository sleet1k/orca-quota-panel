// Worker: опрос /api/v1/key OpenRouter. Ключ и пороги хранит сам (storage:own),
// с фолбэком на env и key.txt скилла. Делает плагин самодостаточным.
import type { OrcaWorkerApi } from 'orca/worker'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const SKILL_DIR = join(homedir(), '.orca', 'bots', 'bot', 'skills', 'quota-aware-planning')
const KEY_FILE = join(SKILL_DIR, 'key.txt')
const MODE_FILE = join(SKILL_DIR, 'mode.txt')
const OC_SKILL_DIR = join(homedir(), '.config', 'opencode', 'skills', 'quota-aware-planning')
const BOT_NAME = 'Славик'

// Plugin version (from orca-plugin.json), shown in the panel header badge.
let PLUGIN_VERSION = '1.0.0'
try {
  const here = dirname(fileURLToPath(import.meta.url))
  const man = JSON.parse(readFileSync(join(here, '..', 'orca-plugin.json'), 'utf-8'))
  if (man && typeof man.version === 'string') PLUGIN_VERSION = man.version
} catch { /* keep default */ }

// Resolve the orca CLI (on PATH, or the standard install location).
function orcaBin(): string {
  const candidates = [
    join(homedir(), 'AppData', 'Local', 'Programs', 'orca', 'resources', 'bin', 'orca.exe'),
    join(homedir(), 'AppData', 'Local', 'Programs', 'orca', 'resources', 'bin', 'orca')
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return process.platform === 'win32' ? 'orca.exe' : 'orca'
}

// Create/update/remove the real Orca bot-automation from cronMinutes. Best-effort.
let automationIdCache: string | null = null

// Run the orca CLI asynchronously (non-blocking) and resolve with stdout.
function runOrca(args: string[]): Promise<{ ok: boolean; out?: string; error?: string }> {
  return new Promise((resolve) => {
    let bin = orcaBin()
    // On Windows, if the resolved name has no extension and isn't an absolute
    // path that exists, fall back to PATH lookup via the shell.
    const useShell = process.platform === 'win32' && !existsSync(bin)
    const child = spawn(bin, args, { shell: useShell, windowsHide: true, env: process.env })
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => { out += d.toString() })
    child.stderr?.on('data', (d) => { err += d.toString() })
    child.on('error', (e) => resolve({ ok: false, error: 'spawn: ' + String(e) }))
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, out })
      else resolve({ ok: false, error: `exit ${code}: ${err.slice(0, 300) || out.slice(0, 300)}` })
    })
  })
}

function syncAutomation(mins: number): Promise<{ ok: boolean; id?: string; error?: string }> {
  const schedule = '*/' + Math.max(1, mins) + ' * * * *'
  const prompt = 'Quota loop. Read ~/.orca/bots/bot/skills/quota-aware-planning/config.json for tunables (cronMinutes, maxWorkers, perWorkerRpm, rpmCap, defaultEffort, workWindowHours). Run: bash ~/.orca/bots/bot/skills/quota-aware-planning/scripts/check.sh . If a work window is active (workWindowHours set or client asked for H hours): target_burn=remaining/H; maxConcurrent=min(maxWorkers, floor(rpmCap/perWorkerRpm)); adjust parallel workers — add if behind plan (up to maxConcurrent), ease if remaining<150 or near 0. Respect rpmCap (~20 RPM free tier) — never exceed; on HTTP 429 back off. If idle, print one short line with remaining and stop. Do not push anything to repos.'
  return (async () => {
    if (automationIdCache) {
      const r = await runOrca(['automations', 'edit', automationIdCache, '--trigger', schedule, '--json'])
      return r.ok ? { ok: true, id: automationIdCache } : { ok: false, error: r.error }
    }
    const r = await runOrca(['automations', 'create', '--name', 'Quota review', '--trigger', schedule, '--bot', BOT_NAME, '--prompt', prompt, '--json'])
    if (!r.ok) return { ok: false, error: r.error }
    try {
      const j = JSON.parse(r.out || '{}')
      const id = j && j.result && j.result.automation && j.result.automation.id
      if (id) automationIdCache = id
      return id ? { ok: true, id } : { ok: false, error: 'no id in create output' }
    } catch (e) {
      return { ok: false, error: 'parse: ' + String(e) }
    }
  })()
}

function removeAutomation(orca: OrcaWorkerApi): void {
  if (!automationIdCache) return
  const id = automationIdCache
  automationIdCache = null
  orca.storage.delete('automationId').catch(() => { /* ignore */ })
  runOrca(['automations', 'remove', id, '--json']).catch(() => { /* ignore */ })
}

type Mode = 'auto' | 'turbo' | 'balance' | 'eco'
type ConfigMode = Exclude<Mode, 'auto'>
type ModeEffort = 'low' | 'medium' | 'high' | 'xhigh'
type Lang = 'en' | 'ru' | 'zh'
interface ModeConfig { effort: ModeEffort; workers: number; subagents: boolean }
type ModeConfigs = Record<ConfigMode, ModeConfig>

async function loadLang(orca: OrcaWorkerApi): Promise<Lang | null> {
  try {
    const v = await orca.storage.get('lang')
    if (v === 'en' || v === 'ru' || v === 'zh') return v
  } catch {
    /* ignore */
  }
  return null
}

const DEFAULT_MODE_CONFIGS: ModeConfigs = {
  turbo: { effort: 'high', workers: 4, subagents: true },
  balance: { effort: 'medium', workers: 2, subagents: true },
  eco: { effort: 'low', workers: 1, subagents: false }
}

function sanitizeConfig(m: ConfigMode, raw: unknown): ModeConfig {
  const d = DEFAULT_MODE_CONFIGS[m]
  if (!raw || typeof raw !== 'object') return { ...d }
  const o = raw as Partial<ModeConfig>
  const effort: ModeEffort =
    o.effort === 'low' || o.effort === 'medium' || o.effort === 'high' || o.effort === 'xhigh' ? o.effort : d.effort
  const workers = typeof o.workers === 'number' && isFinite(o.workers) ? Math.min(4, Math.max(1, Math.round(o.workers))) : d.workers
  const subagents = typeof o.subagents === 'boolean' ? o.subagents : d.subagents
  return { effort, workers, subagents }
}

async function loadModeConfigs(orca: OrcaWorkerApi): Promise<ModeConfigs> {
  let stored: Record<string, unknown> = {}
  try {
    const t = await orca.storage.get('modeConfigs')
    if (t && typeof t === 'object') stored = t as Record<string, unknown>
  } catch {
    /* ignore */
  }
  return {
    turbo: sanitizeConfig('turbo', stored.turbo),
    balance: sanitizeConfig('balance', stored.balance),
    eco: sanitizeConfig('eco', stored.eco)
  }
}

// --- Encrypted key storage (AES-256-GCM, machine-local derived key) ---
// The key is encrypted at rest inside plugin storage. The derivation uses a
// machine-local secret (hostname + user + a fixed salt) so the blob is useless
// if copied to another machine. This is obfuscation-grade, not a hardware vault.
function machineSecret(): Buffer {
  const raw = [process.env.COMPUTERNAME || '', process.env.USERNAME || '', homedir(), 'orca-quota-panel/v1'].join('|')
  return createHash('sha256').update(raw).digest() // 32 bytes
}
function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}
function encryptKey(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', machineSecret(), iv)
  const enc = Buffer.concat([c.update(plain, 'utf-8'), c.final()])
  const tag = c.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join('.')
}
function decryptKey(blob: string): string | null {
  try {
    const [ivh, tagh, datah] = blob.split('.')
    if (!ivh || !tagh || !datah) return null
    const d = createDecipheriv('aes-256-gcm', machineSecret(), Buffer.from(ivh, 'hex'))
    d.setAuthTag(Buffer.from(tagh, 'hex'))
    const dec = Buffer.concat([d.update(Buffer.from(datah, 'hex')), d.final()])
    return dec.toString('utf-8')
  } catch {
    return null
  }
}

// Write the plaintext key to key.txt so the bash skill (check.sh) can read it.
function writeKeyTxt(key: string): void {
  try { mkdirSync(SKILL_DIR, { recursive: true }); writeFileSync(KEY_FILE, key, 'utf-8') } catch { /* ignore */ }
}

async function loadKey(orca: OrcaWorkerApi): Promise<{ key: string | null; fromTxt: boolean }> {
  const env = process.env.OPENROUTER_API_KEY
  if (env && env.trim()) return { key: env.trim(), fromTxt: false }
  // Primary: encrypted blob inside plugin storage.
  try {
    const enc = await orca.storage.get('orKeyEnc')
    if (typeof enc === 'string' && enc) {
      const dec = decryptKey(enc)
      if (dec) return { key: dec, fromTxt: false }
    }
  } catch {
    /* ignore */
  }
  // Legacy plaintext (migration).
  try {
    const stored = await orca.storage.get('orKey')
    if (typeof stored === 'string' && stored.trim()) return { key: stored.trim(), fromTxt: false }
  } catch {
    /* ignore */
  }
  try {
    const k = readFileSync(KEY_FILE, 'utf-8').trim()
    if (k) return { key: k, fromTxt: true }
  } catch {
    /* ignore */
  }
  return { key: null, fromTxt: false }
}

function loadMode(): Mode {
  try {
    const m = readFileSync(MODE_FILE, 'utf-8').trim().toLowerCase()
    if (m === 'turbo' || m === 'balance' || m === 'eco' || m === 'auto') return m
  } catch {
    /* нет файла */
  }
  return 'auto'
}

function saveMode(m: Mode): void {
  try {
    writeFileSync(MODE_FILE, m, 'utf-8')
  } catch {
    /* ignore */
  }
}

async function loadThresholds(orca: OrcaWorkerApi): Promise<{ turboAbove: number; ecoBelow: number }> {
  try {
    const t = await orca.storage.get('thresholds')
    if (t && typeof t === 'object') {
      const o = t as { turboAbove?: number; ecoBelow?: number }
      if (typeof o.turboAbove === 'number' && typeof o.ecoBelow === 'number') {
        return { turboAbove: o.turboAbove, ecoBelow: o.ecoBelow }
      }
    }
  } catch {
    /* ignore */
  }
  return { turboAbove: 400, ecoBelow: 150 }
}

function effective(remaining: number, manual: Mode, t: { turboAbove: number; ecoBelow: number }): Exclude<Mode, 'auto'> {
  if (manual !== 'auto') return manual
  if (remaining > t.turboAbove) return 'turbo'
  if (remaining >= t.ecoBelow) return 'balance'
  return 'eco'
}

function nextResetUtc(now: number): number {
  const d = new Date(now)
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.getTime()
}

const LOG: { ts: number; level: string; line: string }[] = []

export default function activate(orca: OrcaWorkerApi): void {
  // Hydrate persisted logs + automation id.
  orca.storage.get('logs').then((v) => {
    if (Array.isArray(v)) { LOG.length = 0; for (const e of v.slice(-50)) LOG.push(e as any) }
  }).catch(() => { /* ignore */ })
  orca.storage.get('automationId').then((v) => {
    if (typeof v === 'string' && v) automationIdCache = v
  }).catch(() => { /* ignore */ })
  // Migrate a legacy plaintext key (storage or key.txt) into the encrypted blob.
  orca.storage.get('orKeyEnc').then(async (enc) => {
    if (typeof enc === 'string' && enc) return
    let legacy: string | null = null
    try { const s = await orca.storage.get('orKey'); if (typeof s === 'string' && s.trim()) legacy = s.trim() } catch { /* ignore */ }
    if (!legacy) { try { const k = readFileSync(KEY_FILE, 'utf-8').trim(); if (k) legacy = k } catch { /* ignore */ } }
    if (legacy) {
      try { await orca.storage.set('orKeyEnc', encryptKey(legacy)); await orca.storage.delete('orKey') } catch { /* ignore */ }
    }
  }).catch(() => { /* ignore */ })

  const rec = (level: string, line: string): void => {
    LOG.push({ ts: Date.now(), level, line })
    if (LOG.length > 50) LOG.splice(0, LOG.length - 50)
    try { orca.log(line) } catch { /* ignore */ }
    orca.storage.set('logs', LOG.slice(-50)).catch(() => { /* ignore */ })
  }
  orca.panels.handle('quota.setMode', async ({ mode }) => {
    saveMode(mode)
    return { ok: true, manualMode: mode }
  })

  orca.panels.handle('quota.setThresholds', async ({ turboAbove, ecoBelow }) => {
    const t = { turboAbove: Math.max(0, Math.round(turboAbove)), ecoBelow: Math.max(0, Math.round(ecoBelow)) }
    await orca.storage.set('thresholds', t)
    return { ok: true, ...t }
  })

  orca.panels.handle('quota.setModeConfig', async ({ mode, config }) => {
    const clean = sanitizeConfig(mode, config)
    const all = await loadModeConfigs(orca)
    all[mode] = clean
    await orca.storage.set('modeConfigs', all)
    return { ok: true, mode, config: clean }
  })

  orca.panels.handle('quota.setKey', async ({ key, pin }) => {
    const k = key.trim()
    try {
      if (k) {
        await orca.storage.set('orKeyEnc', encryptKey(k))
        await orca.storage.delete('orKey').catch(() => { /* ignore */ })
        writeKeyTxt(k) // export for the bash skill
        // Optionally set/rotate the PIN hash used to reveal the key.
        if (typeof pin === 'string' && pin.trim()) {
          await orca.storage.set('pinHash', sha256(pin.trim()))
          rec('info', 'reveal PIN set')
        }
        rec('info', 'OpenRouter key saved (encrypted)')
      } else {
        await orca.storage.delete('orKeyEnc').catch(() => { /* ignore */ })
        await orca.storage.delete('orKey').catch(() => { /* ignore */ })
        await orca.storage.delete('pinHash').catch(() => { /* ignore */ })
        try { rmSync(KEY_FILE, { force: true }) } catch { /* ignore */ }
        rec('warn', 'OpenRouter key cleared')
      }
      return { ok: true, hasKey: !!k }
    } catch (e) {
      rec('error', 'setKey failed: ' + String(e))
      return { ok: false, hasKey: false }
    }
  })

  // Whether a reveal PIN is set, and verify/reveal the key with it.
  orca.panels.handle('quota.hasPin', async () => {
    try { const h = await orca.storage.get('pinHash'); return { ok: true, hasPin: typeof h === 'string' && !!h } }
    catch { return { ok: true, hasPin: false } }
  })

  // Set/replace only the PIN hash (does not touch the stored key).
  orca.panels.handle('quota.setPin', async ({ pin }) => {
    try {
      const p = String(pin || '').trim()
      if (p) { await orca.storage.set('pinHash', sha256(p)); rec('info', 'reveal PIN set') }
      else { await orca.storage.delete('pinHash').catch(() => { /* ignore */ }) }
      return { ok: true }
    } catch (e) { return { ok: false, error: String(e) } }
  })

  orca.panels.handle('quota.revealKey', async ({ pin }) => {
    try {
      const h = await orca.storage.get('pinHash')
      if (typeof h !== 'string' || !h) return { ok: false, error: 'no-pin' }
      if (sha256(String(pin || '').trim()) !== h) return { ok: false, error: 'bad-pin' }
      const enc = await orca.storage.get('orKeyEnc')
      if (typeof enc !== 'string' || !enc) return { ok: false, error: 'no-key' }
      const dec = decryptKey(enc)
      return dec ? { ok: true, key: dec } : { ok: false, error: 'decrypt-failed' }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  orca.panels.handle('quota.setLang', async ({ lang }) => {
    if (lang === 'en' || lang === 'ru' || lang === 'zh') await orca.storage.set('lang', lang)
    return { ok: true, lang }
  })

  orca.panels.handle('quota.installSkill', async () => {
    try {
      const here = dirname(fileURLToPath(import.meta.url))
      const src = join(here, '..', 'skill', 'quota-aware-planning')
      if (!existsSync(src)) return { ok: false, error: 'bundled skill not found' }
      // Decrypt the key once (to export key.txt into every bot + mirror).
      let keyPlain: string | null = null
      try {
        const enc = await orca.storage.get('orKeyEnc')
        if (typeof enc === 'string' && enc) keyPlain = decryptKey(enc)
      } catch { /* ignore */ }

      // Install into EVERY bot's skills dir (so all bots on opencode+openrouter get it).
      const targets: string[] = []
      const botsDir = join(homedir(), '.orca', 'bots')
      try {
        for (const name of readdirSync(botsDir)) {
          const bd = join(botsDir, name)
          try { if (statSync(bd).isDirectory()) targets.push(join(bd, 'skills', 'quota-aware-planning')) } catch { /* skip */ }
        }
      } catch { /* no bots dir */ }
      if (!targets.includes(SKILL_DIR)) targets.push(SKILL_DIR) // always ensure the primary
      targets.push(OC_SKILL_DIR) // OpenCode global mirror

      const installed: string[] = []
      for (const dest of targets) {
        try {
          // Preserve user-edited files per target so reinstall doesn't reset them.
          const keep: Record<string, string> = {}
          for (const f of ['config.json', 'key.txt', 'mode.txt']) {
            const fp = join(dest, f)
            if (existsSync(fp)) keep[f] = readFileSync(fp, 'utf-8')
          }
          mkdirSync(dirname(dest), { recursive: true })
          cpSync(src, dest, { recursive: true })
          for (const [f, content] of Object.entries(keep)) writeFileSync(join(dest, f), content, 'utf-8')
          // Export the key so each bot's bash check.sh works.
          if (keyPlain) { try { writeFileSync(join(dest, 'key.txt'), keyPlain, 'utf-8') } catch { /* ignore */ } }
          installed.push(dest)
        } catch { /* skip this target */ }
      }
      try { await orca.storage.set('skillInstalledPath', SKILL_DIR) } catch { /* ignore */ }
      rec('info', 'skill installed -> ' + installed.length + ' targets')
      return { ok: true, path: SKILL_DIR, count: installed.length }
    } catch (e) {
      rec('error', 'installSkill failed: ' + String(e))
      return { ok: false, error: String(e) }
    }
  })

  orca.panels.handle('quota.uninstallSkill', async () => {
    try {
      const botsDir = join(homedir(), '.orca', 'bots')
      const targets: string[] = [OC_SKILL_DIR]
      try {
        for (const name of readdirSync(botsDir)) {
          const bd = join(botsDir, name)
          try { if (statSync(bd).isDirectory()) targets.push(join(bd, 'skills', 'quota-aware-planning')) } catch { /* skip */ }
        }
      } catch { /* no bots dir */ }
      if (!targets.includes(SKILL_DIR)) targets.push(SKILL_DIR)
      for (const t of targets) { try { rmSync(t, { recursive: true, force: true }) } catch { /* ignore */ } }
      try { await orca.storage.delete('skillInstalledPath') } catch { /* ignore */ }
      removeAutomation(orca)
      rec('info', 'skill uninstalled')
      return { ok: true }
    } catch (e) {
      rec('error', 'uninstallSkill failed: ' + String(e))
      return { ok: false, error: String(e) }
    }
  })

  orca.panels.handle('quota.getInstalled', async () => {
    try {
      const v = await orca.storage.get('skillInstalledPath')
      return { ok: true, path: typeof v === 'string' ? v : null }
    } catch (e) {
      return { ok: false, path: null }
    }
  })

  orca.panels.handle('quota.getLogs', async () => ({ ok: true, lines: LOG.slice(-50) }))

  orca.panels.handle('quota.clearLogs', async () => {
    LOG.length = 0
    try { await orca.storage.set('logs', []) } catch { /* ignore */ }
    rec('info', 'logs cleared')
    return { ok: true }
  })

  orca.panels.handle('quota.getSkillConfig', async () => {
    try {
      const p = join(SKILL_DIR, 'config.json')
      return { ok: true, config: readFileSync(p, 'utf-8') }
    } catch (e) {
      // No skill installed yet — return bundled defaults so the form still works.
      try {
        const here = dirname(fileURLToPath(import.meta.url))
        const def = join(here, '..', 'skill', 'quota-aware-planning', 'config.json')
        return { ok: true, config: readFileSync(def, 'utf-8') }
      } catch {
        return { ok: false, error: String(e) }
      }
    }
  })

  orca.panels.handle('quota.setSkillConfig', async ({ config }) => {
    try {
      mkdirSync(SKILL_DIR, { recursive: true })
      const p = join(SKILL_DIR, 'config.json')
      writeFileSync(p, String(config), 'utf-8')
      // Create/update a real Orca bot-automation from cronMinutes (Automations tab).
      let automationId: string | null = null
      let automationError: string | null = null
      try {
        const cfg = JSON.parse(String(config))
        const mins = Math.max(1, parseInt(cfg.cronMinutes, 10) || 30)
        const r = await syncAutomation(mins)
        automationId = r.id || null
        automationError = r.ok ? null : (r.error || 'failed')
      } catch (e) { automationError = String(e) }
      if (automationId) { try { await orca.storage.set('automationId', automationId) } catch { /* ignore */ } }
      rec(automationError ? 'warn' : 'info', 'config saved; automation=' + (automationId || 'none') + (automationError ? ' (' + automationError + ')' : ''))
      return { ok: true, automationId, automationError }
    } catch (e) {
      rec('error', 'setSkillConfig failed: ' + String(e))
      return { ok: false, error: String(e) }
    }
  })

  orca.panels.handle('quota.get', async () => {
    const now = Date.now()
    const manualMode = loadMode()
    const thresholds = await loadThresholds(orca)
    const modeConfigs = await loadModeConfigs(orca)
    const lang = await loadLang(orca)
    const { key, fromTxt } = await loadKey(orca)
    const base = { resetAt: nextResetUtc(now), updatedAt: now, manualMode, turboAbove: thresholds.turboAbove, ecoBelow: thresholds.ecoBelow, hasKey: !!key, keyFromTxt: fromTxt, modeConfigs, lang, version: PLUGIN_VERSION }
    if (!key) {
      rec('warn', 'no OpenRouter key set')
      return { ok: false, error: 'Ключ OpenRouter не задан (вставьте в плагине или key.txt)', used: 0, limit: 0, remaining: 0, creditsRemaining: null, isFreeTier: false, ...base, effectiveMode: effective(0, manualMode, thresholds) }
    }
    try {
      const res = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` } })
      if (!res.ok) {
        return { ok: false, error: `OpenRouter ${res.status}`, used: 0, limit: 0, remaining: 0, creditsRemaining: null, isFreeTier: false, ...base, effectiveMode: effective(0, manualMode, thresholds) }
      }
      const j = await res.json()
      const d = j.data || {}
      const f = d.free_model_daily_requests || {}
      const remaining = f.remaining ?? 0
      return {
        ok: true,
        used: f.used ?? 0,
        limit: f.limit ?? 0,
        remaining,
        creditsRemaining: typeof d.limit_remaining === 'number' ? d.limit_remaining : null,
        isFreeTier: !!d.is_free_tier,
        ...base,
        effectiveMode: effective(remaining, manualMode, thresholds)
      }
    } catch (e) {
      rec('error', 'quota.get failed: ' + String(e))
      return { ok: false, error: String(e), used: 0, limit: 0, remaining: 0, creditsRemaining: null, isFreeTier: false, ...base, effectiveMode: effective(0, manualMode, thresholds) }
    }
  })
}