// Контракт панель <-> worker.
export {}

export type QuotaMode = 'auto' | 'turbo' | 'balance' | 'eco'

declare module 'orca' {
  interface PluginRequests {
    /** Свежий статус лимита OpenRouter (rpd + credits + режим). */
    'quota.get': {
      output: {
        ok: boolean
        error?: string
        used: number
        limit: number
        remaining: number
        creditsRemaining: number | null
        isFreeTier: boolean
        resetAt: number | null // epoch ms (00:00 UTC)
        updatedAt: number // epoch ms
        manualMode: QuotaMode
        effectiveMode: Exclude<QuotaMode, 'auto'>
      }
    }
    /** Задать ручной режим (auto/turbo/balance/eco). */
    'quota.setMode': {
      input: { mode: QuotaMode }
      output: { ok: boolean; manualMode: QuotaMode }
    }
  }
}