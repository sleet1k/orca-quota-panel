// Контракт панель <-> worker.
export {}

export type QuotaMode = 'auto' | 'turbo' | 'balance' | 'eco'
export type ConfigMode = Exclude<QuotaMode, 'auto'>
export type ModeEffort = 'low' | 'medium' | 'high' | 'xhigh'
export type Lang = 'en' | 'ru' | 'zh'

/** Per-mode конфиг-метаданные. Плагин их ХРАНИТ и показывает, но НЕ применяет к агенту —
 * реальные effort/модели/воркеры задаёт агент Orca при запуске.
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
        lang: Lang | null // сохранённый язык вручную, иначе null (автоопределение)
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
    /** Задать/очистить API-ключ (пустой = очистить). pin — задать PIN для просмотра. */
    'quota.setKey': {
      input: { key: string; pin?: string }
      output: { ok: boolean; hasKey: boolean }
    }
    /** Есть ли заданный PIN для просмотра ключа. */
    'quota.hasPin': {
      output: { ok: boolean; hasPin: boolean }
    }
    /** Задать/очистить PIN (только хеш, ключ не трогается). */
    'quota.setPin': {
      input: { pin: string }
      output: { ok: boolean; error?: string }
    }
    /** Показать ключ по PIN. */
    'quota.revealKey': {
      input: { pin: string }
      output: { ok: boolean; key?: string; error?: string }
    }
    /** Очистить логи. */
    'quota.clearLogs': {
      output: { ok: boolean }
    }
    /** Сохранить язык интерфейса вручную (en/ru/zh). */
    'quota.setLang': {
      input: { lang: Lang }
      output: { ok: boolean; lang: Lang }
    }
    /** Установить скилл из бандла (сохраняя user config/key/mode). */
    'quota.installSkill': {
      output: { ok: boolean; path?: string; error?: string }
    }
    /** Удалить установленный скилл + автоматизацию. */
    'quota.uninstallSkill': {
      output: { ok: boolean; error?: string }
    }
    /** Путь установленного скилла (или null). */
    'quota.getInstalled': {
      output: { ok: boolean; path: string | null }
    }
    /** Последние логи плагина (ring buffer). */
    'quota.getLogs': {
      output: { ok: boolean; lines: { ts: number; level: string; line: string }[] }
    }
    /** Прочитать config.json скилла. */
    'quota.getSkillConfig': {
      output: { ok: boolean; config?: string; error?: string }
    }
    /** Записать config.json + синхронизировать Orca-автоматизацию из cronMinutes. */
    'quota.setSkillConfig': {
      input: { config: string }
      output: { ok: boolean; automationId?: string | null; automationError?: string | null; error?: string }
    }
  }
}