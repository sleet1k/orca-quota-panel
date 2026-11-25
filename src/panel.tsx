// Панель: остаток бесплатного лимита OpenRouter (rpd), режим (авто/ручной), прогресс.
import {
  atom,
  Badge,
  Box,
  Button,
  Callout,
  Heading,
  plugin,
  Progress,
  read,
  RelativeTime,
  Row,
  Select,
  set,
  Stack,
  Text,
  type PanelContext
} from 'orca'
import type { QuotaMode } from './protocol'

type Quota = {
  ok: boolean
  error?: string
  used: number
  limit: number
  remaining: number
  creditsRemaining: number | null
  isFreeTier: boolean
  resetAt: number | null
  updatedAt: number
  manualMode: QuotaMode
  effectiveMode: 'turbo' | 'balance' | 'eco'
}

const quota = atom<Quota | null>(null)

const MODE_LABEL: Record<string, string> = {
  turbo: 'ТУРБО',
  balance: 'БАЛАНС',
  eco: 'ЭКО'
}
const MODE_TONE = { turbo: 'accent', balance: 'warning', eco: 'danger' } as const

const MODE_OPTIONS = [
  { value: 'auto', label: 'Авто (по остатку)' },
  { value: 'turbo', label: 'ТУРБО (тратить быстро)' },
  { value: 'balance', label: 'БАЛАНС' },
  { value: 'eco', label: 'ЭКО (беречь)' }
] as const

async function refresh(): Promise<void> {
  const q = await plugin.request('quota.get')
  set(quota, q)
}

async function setMode(mode: QuotaMode): Promise<void> {
  await plugin.request('quota.setMode', { mode })
  await refresh()
}

export function setup(ctx: PanelContext): void {
  void refresh()
  const id = setInterval(() => void refresh(), 60_000)
  ctx.subscriptions.push({ dispose: () => clearInterval(id) })
}

export default function Panel() {
  const q = read(quota)

  if (!q) {
    return (
      <Stack gap="md">
        <Heading level={2}>OpenRouter Quota</Heading>
        <Text muted size="xs">Загрузка…</Text>
      </Stack>
    )
  }

  const mode = q.effectiveMode
  const pct = q.limit > 0 ? Math.round((q.used / q.limit) * 100) : 0

  return (
    <Stack gap="md">
      <Row justify="between" align="center">
        <Heading level={2}>OpenRouter Quota</Heading>
        <Badge tone={MODE_TONE[mode]}>{MODE_LABEL[mode]}</Badge>
      </Row>

      {!q.ok && (
        <Callout tone="danger" title="Ошибка">
          {q.error}
        </Callout>
      )}

      <Box background="card" radius="md" padding="md">
        <Stack gap="sm">
          <Row justify="between" align="center">
            <Text size="sm" muted>
              Осталось (rpd)
            </Text>
            <Text size="sm" weight="semibold">
              {q.remaining} / {q.limit}
            </Text>
          </Row>
          <Progress label="Использовано" value={pct} />
          <Row justify="between" align="center">
            <Text size="sm" muted>
              Сброс
            </Text>
            {q.resetAt ? <RelativeTime at={q.resetAt} /> : <Text size="sm">—</Text>}
          </Row>
          {q.creditsRemaining !== null && (
            <Row justify="between" align="center">
              <Text size="sm" muted>
                Credits
              </Text>
              <Text size="sm">${q.creditsRemaining.toFixed(2)}</Text>
            </Row>
          )}
        </Stack>
      </Box>

      <Select
        label="Режим"
        value={q.manualMode}
        options={MODE_OPTIONS}
        onChange={(v) => void setMode(v as QuotaMode)}
      />

      <Callout tone="accent" title="Пороги (Авто)">
        ТУРБО &gt;400 · БАЛАНС 150–400 · ЭКО &lt;150. Ручной режим перекрывает авто.
      </Callout>

      <Button icon="refresh" variant="ghost" onPress={() => void refresh()}>
        Обновить
      </Button>
    </Stack>
  )
}