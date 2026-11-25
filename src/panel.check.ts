// `orca plugin check` renders the panel once per scenario, each with the worker on a fresh
// host. Seed what the worker reads so check shows more than the first state.
import { defineCheck } from 'orca/testing'

export default defineCheck({
  fresh: {},
  configured: {
    storage: {
      thresholds: { turboAbove: 500, ecoBelow: 150 },
      modeConfigs: {
        turbo: { effort: 'high', workers: 4, subagents: true },
        balance: { effort: 'medium', workers: 2, subagents: true },
        eco: { effort: 'low', workers: 1, subagents: false }
      }
    }
  }
})