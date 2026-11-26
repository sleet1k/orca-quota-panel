# Quota Panel

English | [Русский](README.ru.md) | [简体中文](README.zh.md)

A right-sidebar panel for [Orca](https://orca.com) that keeps an eye on your free
[OpenRouter](https://openrouter.ai) daily request limit so you don't burn it too early.

![OpenRouter Quota panel in English](assets/preview-en.png)

## What it does

- **Remaining requests (rpd)** — shows `remaining / limit` for the current UTC day with a
  remaining-quota progress bar, threshold ticks, and a live countdown to the 00:00 UTC reset
  (hover to see the reset time in **your local timezone**).
- **Three modes + Auto** — **Turbo**, **Balance**, and **Eco**, plus **Auto** which picks a mode
  from your remaining quota thresholds. The header also shows the current version badge (`v1.1.0`).
- **Settings modal (mode thresholds)** — click the gear icon in the header to edit the Turbo (`>`),
  Eco (`<`), and Balance (`min – max`) boundaries. Adjacent bounds stay linked and validated
  (`min < max`), and save buttons activate only when there are unsaved changes.
- **API key with PIN reveal** — paste your OpenRouter key in the collapsible **API key** section
  (or use `key.txt`). Keys are encrypted at rest (AES-256-GCM, machine-local derived key) and stay
  hidden until revealed with a local PIN (stored only as a SHA-256 hash), with one-click copy and
  automatic hiding after 30 s or on section collapse.
- **Skill config (`config.json`)** — compact 2×2 numeric form (`cronMinutes`, `maxWorkers`,
  `perWorkerRpm`, `rpmCap`) plus `defaultEffort`, `timezone`, and `workWindowHours`, with instant
  styled tooltips. Saving creates or updates a `Quota review` Orca bot automation via the Orca CLI.
- **Bundled `quota-aware-planning` skill** — one-click install to all Orca bots
  (`~/.orca/bots/*/skills`) and the OpenCode global mirror (preserving existing config, key, and
  mode files), with an `Installed` badge and one-click uninstall.
- **Logs** — collapsible persistent log viewer with per-level coloring (`info` / `warn` / `error`),
  Copy and Clear buttons, and auto-scroll.
- **Three languages** — English, Russian, and Chinese, auto-detected from your locale with a
  compact dropdown switcher in the header (persisted across restarts).

## Install

In Orca: **Settings → Plugins → Add Plugin → From Git URL**, then paste this repository's URL:

```
https://github.com/sleet1k/orca-quota-panel.git
```

Orca asks for approval the first time (the plugin runs a small worker and stores its own data), then
the **Quota Panel** appears in the right sidebar.

## Data & privacy

- The API key is encrypted at rest (AES-256-GCM with a machine-local derived key) in the plugin's
  own storage, exported to `key.txt` for the bash skill, and is **never** committed.
- Key reveal is protected by a local PIN (only its SHA-256 hash is stored); a revealed key is
  read-only and automatically hides after 30 seconds or when collapsing the section.
- Thresholds, language choice, automation ID, and recent logs live in the plugin's storage and
  survive restarts.

## Develop

```sh
orca plugin validate .        # validate the manifest and assets
orca plugin check .           # render the panel once per scenario
orca plugin dev watch .       # load this folder into Orca with live reload (Ctrl-C unloads)
```

The panel is a single `src/panel.html` (HTML/CSS/JS, no build step). The worker is `src/worker.ts`;
`src/protocol.ts` types the request contract between them, and `skill/quota-aware-planning/` holds
the bundled skill. Orca transpiles the worker on load.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE).
