// Контракт панель <-> worker.
export {}

declare module 'orca' {
  interface PluginRequests {
    /** Свежий статус лимита OpenRouter (rpd + credits). */
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
      }
    }
  }
}