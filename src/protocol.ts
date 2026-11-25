// Контракт панель <-> worker.
export {}

export type QuotaMode = 'auto' | 'turbo' | 'balance' | 'eco'

declare module 'orca' {
  interface PluginRequests {
    /** Свежий статус лимита OpenRouter (rpd + credits + режим + пороги). */
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
        turboAbove: number
        ecoBelow: number
        hasKey: boolean
        keyFromTxt: boolean
      }
    }
    /** Задать ручной режим (auto/turbo/balance/eco). */
    'quota.setMode': {
      input: { mode: QuotaMode }
      output: { ok: boolean; manualMode: QuotaMode }
    }
    /** Задать пороги режимов. */
    'quota.setThresholds': {
      input: { turboAbove: number; ecoBelow: number }
      output: { ok: boolean; turboAbove: number; ecoBelow: number }
    }
    /** Задать/очистить API-ключ (пустой = очистить). */
    'quota.setKey': {
      input: { key: string }
      output: { ok: boolean; hasKey: boolean }
    }
  }
}