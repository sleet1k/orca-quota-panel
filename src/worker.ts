// Worker: опрос /api/v1/key OpenRouter. Ключ и пороги хранит сам (storage:own),
// с фолбэком на env и key.txt скилла. Делает плагин самодостаточным.
import type { OrcaWorkerApi } from 'orca/worker'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SKILL_DIR = join(homedir(), '.orca', 'bots', 'bot', 'skills', 'quota-aware-planning')
const KEY_FILE = join(SKILL_DIR, 'key.txt')
const MODE_FILE = join(SKILL_DIR, 'mode.txt')

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

async function loadKey(orca: OrcaWorkerApi): Promise<{ key: string | null; fromTxt: boolean }> {
  const env = process.env.OPENROUTER_API_KEY
  if (env && env.trim()) return { key: env.trim(), fromTxt: false }
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

export default function activate(orca: OrcaWorkerApi): void {
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

  orca.panels.handle('quota.setKey', async ({ key }) => {
    const k = key.trim()
    if (k) await orca.storage.set('orKey', k)
    else await orca.storage.delete('orKey')
    return { ok: true, hasKey: !!k }
  })

  orca.panels.handle('quota.setLang', async ({ lang }) => {
    if (lang === 'en' || lang === 'ru' || lang === 'zh') await orca.storage.set('lang', lang)
    return { ok: true, lang }
  })

  orca.panels.handle('quota.get', async () => {
    const now = Date.now()
    const manualMode = loadMode()
    const thresholds = await loadThresholds(orca)
    const modeConfigs = await loadModeConfigs(orca)
    const lang = await loadLang(orca)
    const { key, fromTxt } = await loadKey(orca)
    const base = { resetAt: nextResetUtc(now), updatedAt: now, manualMode, turboAbove: thresholds.turboAbove, ecoBelow: thresholds.ecoBelow, hasKey: !!key, keyFromTxt: fromTxt, modeConfigs, lang }
    if (!key) {
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
      return { ok: false, error: String(e), used: 0, limit: 0, remaining: 0, creditsRemaining: null, isFreeTier: false, ...base, effectiveMode: effective(0, manualMode, thresholds) }
    }
  })
}