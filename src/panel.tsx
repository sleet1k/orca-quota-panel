// Панель: остаток лимита OpenRouter (rpd), режим (авто/ручной), пороги (таблица + настройка), ключ.
import {
  atom,
  Badge,
  Box,
  Button,
  Callout,
  Heading,
  Input,
  KeyValue,
  plugin,
  Progress,
  read,
  RelativeTime,
  Row,
  Select,
  Separator,
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
  turboAbove: number
  ecoBelow: number
  hasKey: boolean
}

const quota = atom<Quota | null>(null)
const turboStr = atom('turboStr', '400')
const ecoStr = atom('ecoStr', '150')
const keyStr = atom('keyStr', '')

const MODE_LABEL: Record<string, string> = { turbo: 'ТУРБО', balance: 'БАЛАНС', eco: 'ЭКО' }
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
  set(turboStr, String(q.turboAbove))
  set(ecoStr, String(q.ecoBelow))
}

async function setMode(mode: QuotaMode): Promise<void> {
  await plugin.request('quota.setMode', { mode })
  await refresh()
}

async function saveThresholds(): Promise<void> {
  const t = parseInt(read(turboStr), 10)
  const e = parseInt(read(ecoStr), 10)
  if (Number.isNaN(t) || Number.isNaN(e)) return
  await plugin.request('quota.setThresholds', { turboAbove: t, ecoBelow: e })
  await refresh()
}

async function saveKey(): Promise<void> {
  await plugin.request('quota.setKey', { key: read(keyStr) })
  set(keyStr, '')
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
  const t = read(turboStr)
  const e = read(ecoStr)

  return (
    <Stack gap="md">
      <Row justify="between" align="center">
        <Heading level={2}>OpenRouter Quota</Heading>
        <Badge tone={MODE_TONE[mode]}>{MODE_LABEL[mode]}</Badge>
      </Row>

      {!q.ok && (
        <Callout tone="danger" title="Нет данных">
          {q.error}
        </Callout>
      )}

      <Box background="card" radius="md" padding="md">
        <Stack gap="sm">
          <Row justify="between" align="center">
            <Text size="sm" muted>Осталось (rpd)</Text>
            <Text size="sm" weight="semibold">{q.remaining} / {q.limit}</Text>
          </Row>
          <Progress label="Использовано" value={pct} />
          <Row justify="between" align="center">
            <Text size="sm" muted>Сброс</Text>
            {q.resetAt ? <RelativeTime at={q.resetAt} /> : <Text size="sm">—</Text>}
          </Row>
          {q.creditsRemaining !== null && (
            <Row justify="between" align="center">
              <Text size="sm" muted>Credits</Text>
              <Text size="sm">${q.creditsRemaining.toFixed(2)}</Text>
            </Row>
          )}
        </Stack>
      </Box>

      <Select label="Режим" value={q.manualMode} options={MODE_OPTIONS} onChange={(v) => void setMode(v as QuotaMode)} />

      <Separator />

      <Stack gap="sm">
        <Text size="sm" weight="semibold">Пороги режимов</Text>
        <KeyValue
          items={[
            { label: 'ТУРБО', value: `> ${q.turboAbove}` },
            { label: 'БАЛАНС', value: `${q.ecoBelow}–${q.turboAbove}` },
            { label: 'ЭКО', value: `< ${q.ecoBelow}` }
          ]}
        />
        <Row gap="sm" align="end">
          <Input label="ТУРБО выше" value={t} onChange={(v) => set(turboStr, v)} />
          <Input label="ЭКО ниже" value={e} onChange={(v) => set(ecoStr, v)} />
        </Row>
        <Button variant="ghost" icon="check" onPress={() => void saveThresholds()}>
          Сохранить пороги
        </Button>
      </Stack>

      <Separator />

      <Stack gap="sm">
        <Text size="sm" weight="semibold">API-ключ OpenRouter</Text>
        <Input
          label="Ключ (или используется key.txt)"
          type="password"
          value={read(keyStr)}
          placeholder={q.hasKey ? '•••••••• (задан)' : 'sk-or-v1-…'}
          onChange={(v) => set(keyStr, v)}
        />
        <Button variant="ghost" icon="check" onPress={() => void saveKey()}>
          Сохранить ключ
        </Button>
      </Stack>

      <Button icon="refresh" variant="ghost" onPress={() => void refresh()}>
        Обновить
      </Button>
    </Stack>
  )
}