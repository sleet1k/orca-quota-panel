// Панель: остаток бесплатного лимита OpenRouter (rpd) + режим.
import {
  atom,
  Badge,
  Button,
  Heading,
  plugin,
  read,
  RelativeTime,
  Row,
  set,
  Stack,
  Text,
  type PanelContext
} from 'orca'

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
}

const quota = atom<Quota | null>(null)

function modeOf(remaining: number): { label: string; tone: 'accent' | 'warn' | 'danger' } {
  if (remaining > 400) return { label: 'ТУРБО', tone: 'accent' }
  if (remaining >= 150) return { label: 'БАЛАНС', tone: 'warn' }
  return { label: 'ЭКО', tone: 'danger' }
}

async function refresh(): Promise<void> {
  const q = await plugin.request('quota.get')
  set(quota, q)
}

export function setup(ctx: PanelContext): void {
  void refresh()
  // Авто-обновление раз в 60с; таймер гасится вместе с панелью.
  const id = setInterval(() => void refresh(), 60_000)
  ctx.subscriptions.push({ dispose: () => clearInterval(id) })
}

export default function Panel() {
  const q = read(quota)
  if (!q) {
    return (
      <Stack gap="md">
        <Heading>OpenRouter Quota</Heading>
        <Text muted size="xs">Загрузка…</Text>
      </Stack>
    )
  }
  if (!q.ok) {
    return (
      <Stack gap="md">
        <Heading>OpenRouter Quota</Heading>
        <Badge tone="danger">Ошибка</Badge>
        <Text muted size="xs">{q.error}</Text>
        <Button onPress={refresh}>Обновить</Button>
      </Stack>
    )
  }
  const mode = modeOf(q.remaining)
  const pct = q.limit > 0 ? Math.round((q.used / q.limit) * 100) : 0
  return (
    <Stack gap="md">
      <Row justify="between">
        <Heading>OpenRouter Quota</Heading>
        <Badge tone={mode.tone}>{mode.label}</Badge>
      </Row>

      <Row justify="between">
        <Text size="sm" muted>Осталось (rpd)</Text>
        <Text size="sm">
          {q.remaining} / {q.limit}
        </Text>
      </Row>
      <Text muted size="xs">
        израсходовано {q.used} ({pct}%)
      </Text>

      <Row justify="between">
        <Text size="sm" muted>Сброс</Text>
        {q.resetAt ? <RelativeTime at={q.resetAt} /> : <Text size="sm">—</Text>}
      </Row>

      {q.creditsRemaining !== null && (
        <Row justify="between">
          <Text size="sm" muted>Credits</Text>
          <Text size="sm">${q.creditsRemaining.toFixed(2)}</Text>
        </Row>
      )}

      <Button onPress={refresh}>Обновить</Button>
      <Text muted size="xs">
        Сброс в 00:00 UTC (05:00 Астана). ТУРБО &gt;400, БАЛАНС 150–400, ЭКО &lt;150.
      </Text>
    </Stack>
  )
}