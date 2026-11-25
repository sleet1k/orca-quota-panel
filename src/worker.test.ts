// Runs src/worker.ts's activate(orca) with the orca object Orca passes, over a mock host.
import { assert, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker'

test('stores thresholds and per-mode config, and reports them back', async () => {
  const host = mockHost({ storage: {} })
  const worker = await mountWorker(main, { host })

  // setThresholds persists to storage and echoes the values.
  assert.deepEqual(await worker.request('quota.setThresholds', { turboAbove: 600, ecoBelow: 120 }), {
    ok: true,
    turboAbove: 600,
    ecoBelow: 120
  })

  // setModeConfig persists one mode's config.
  const cfg = await worker.request('quota.setModeConfig', {
    mode: 'turbo',
    config: { effort: 'xhigh', workers: 3, subagents: false }
  })
  assert.equal(cfg.ok, true)
  assert.deepEqual(cfg.config, { effort: 'xhigh', workers: 3, subagents: false })

  // The stored data survives in host storage.
  const data = host.data().storage as Record<string, unknown>
  assert.deepEqual(data.thresholds, { turboAbove: 600, ecoBelow: 120 })

  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})