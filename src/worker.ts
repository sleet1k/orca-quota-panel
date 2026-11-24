// Worker: тянет /api/v1/key OpenRouter и отдаёт статус лимита.
// Ключ: из env OPENROUTER_API_KEY, иначе из key.txt скилла quota-aware-planning.
import type { OrcaWorkerApi } from 'orca/worker'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function loadKey(): string | null {
  const env = process.env.OPENROUTER_API_KEY
  if (env && env.trim()) return env.trim()
  try {
    const p = join(homedir(), '.orca', 'bots', 'bot', 'skills', 'quota-aware-planning', 'key.txt')
    const k = readFileSync(p, 'utf-8').trim()
    return k || null
  } catch {
    return null
  }
}

function nextResetUtc(now: number): number {
  const d = new Date(now)
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + 1) // ближайший 00:00 UTC
  return d.getTime()
}

export default function activate(orca: OrcaWorkerApi): void {
  orca.panels.handle('quota.get', async () => {
    const now = Date.now()
    const key = loadKey()
    if (!key) {
      return { ok: false, error: 'Ключ OpenRouter не найден (key.txt/env)', used: 0, limit: 0, remaining: 0, creditsRemaining: null, isFreeTier: false, resetAt: nextResetUtc(now), updatedAt: now }
    }
    try {
      const res = await fetch('https://openrouter.ai/api/v1/key', {
        headers: { Authorization: `Bearer ${key}` }
      })
      if (!res.ok) {
        return { ok: false, error: `OpenRouter ${res.status}`, used: 0, limit: 0, remaining: 0, creditsRemaining: null, isFreeTier: false, resetAt: nextResetUtc(now), updatedAt: now }
      }
      const j = await res.json()
      const d = j.data || {}
      const f = d.free_model_daily_requests || {}
      return {
        ok: true,
        used: f.used ?? 0,
        limit: f.limit ?? 0,
        remaining: f.remaining ?? 0,
        creditsRemaining: typeof d.limit_remaining === 'number' ? d.limit_remaining : null,
        isFreeTier: !!d.is_free_tier,
        resetAt: nextResetUtc(now),
        updatedAt: now
      }
    } catch (e) {
      return { ok: false, error: String(e), used: 0, limit: 0, remaining: 0, creditsRemaining: null, isFreeTier: false, resetAt: nextResetUtc(now), updatedAt: now }
    }
  })
}