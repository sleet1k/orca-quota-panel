// Worker: тянет /api/v1/key OpenRouter, хранит ручной режим в mode.txt (читает и скилл).
import type { OrcaWorkerApi } from 'orca/worker'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SKILL_DIR = join(homedir(), '.orca', 'bots', 'bot', 'skills', 'quota-aware-planning')
const KEY_FILE = join(SKILL_DIR, 'key.txt')
const MODE_FILE = join(SKILL_DIR, 'mode.txt')

type Mode = 'auto' | 'turbo' | 'balance' | 'eco'

function loadKey(): string | null {
  const env = process.env.OPENROUTER_API_KEY
  if (env && env.trim()) return env.trim()
  try {
    const k = readFileSync(KEY_FILE, 'utf-8').trim()
    return k || null
  } catch {
    return null
  }
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

function effective(remaining: number, manual: Mode): Exclude<Mode, 'auto'> {
  if (manual !== 'auto') return manual
  if (remaining > 400) return 'turbo'
  if (remaining >= 150) return 'balance'
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
    const m: Mode = mode
    saveMode(m)
    return { ok: true, manualMode: m }
  })

  orca.panels.handle('quota.get', async () => {
    const now = Date.now()
    const manualMode = loadMode()
    const key = loadKey()
    if (!key) {
      return { ok: false, error: 'Ключ OpenRouter не найден (key.txt/env)', used: 0, limit: 0, remaining: 0, creditsRemaining: null, isFreeTier: false, resetAt: nextResetUtc(now), updatedAt: now, manualMode, effectiveMode: effective(0, manualMode) }
    }
    try {
      const res = await fetch('https://openrouter.ai/api/v1/key', {
        headers: { Authorization: `Bearer ${key}` }
      })
      if (!res.ok) {
        return { ok: false, error: `OpenRouter ${res.status}`, used: 0, limit: 0, remaining: 0, creditsRemaining: null, isFreeTier: false, resetAt: nextResetUtc(now), updatedAt: now, manualMode, effectiveMode: effective(0, manualMode) }
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
        resetAt: nextResetUtc(now),
        updatedAt: now,
        manualMode,
        effectiveMode: effective(remaining, manualMode)
      }
    } catch (e) {
      return { ok: false, error: String(e), used: 0, limit: 0, remaining: 0, creditsRemaining: null, isFreeTier: false, resetAt: nextResetUtc(now), updatedAt: now, manualMode, effectiveMode: effective(0, manualMode) }
    }
  })
}