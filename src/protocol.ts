// Контракт панель <-> worker.
export {}

export type QuotaMode = 'auto' | 'turbo' | 'balance' | 'eco'
export type ConfigMode = Exclude<QuotaMode, 'auto'>
export type ModeEffort = 'low' | 'medium' | 'high' | 'xhigh'

/** Per-mode конфиг-метаданные. Плагин их ХРАНИТ и показывает, но НЕ применяет к агенту —
 * реально effort/моделей/воркеров задаёт агент (opencode2) через worker-start --effort.
 * Скилл/агент могут читать эти значения как подсказку. */
export interface ModeConfig {
  effort: ModeEffort
  workers: number // 1..4, макс. параллельных воркеров
  subagents: boolean
}

export type ModeConfigs = Record<ConfigMode, ModeConfig>

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
        modeConfigs: ModeConfigs
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
    /** Сохранить per-mode конфиг-метаданные (хранятся, не применяются к агенту). */
    'quota.setModeConfig': {
      input: { mode: ConfigMode; config: ModeConfig }
      output: { ok: boolean; mode: ConfigMode; config: ModeConfig }
    }
    /** Задать/очистить API-ключ (пустой = очистить). */
    'quota.setKey': {
      input: { key: string }
      output: { ok: boolean; hasKey: boolean }
    }
  }
}