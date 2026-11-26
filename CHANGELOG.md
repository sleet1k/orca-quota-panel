# Changelog

All notable changes to the OpenRouter Quota Panel are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-27

A large UX and capability release.

### Added
- Settings modal (gear in the header) for mode thresholds, replacing the old inline section.
- Collapsible sections (API key, Skill config, Skill install, Logs) with click-to-toggle headers.
- API key reveal protected by a local PIN (only a SHA-256 hash is stored); the key is shown read-only with copy and auto-hides after 30 s or on section collapse.
- Encrypted key storage at rest (AES-256-GCM, machine-local derived key); `key.txt` is now only an export for the bash skill.
- Logs: per-level coloring (error / warn / info), Copy and Clear buttons, and auto-scroll to the newest line.
- Instant styled tooltips for sections, inputs and info icons (replacing the slow native `title`).
- Skill install now targets **all** bots (`~/.orca/bots/*/skills`) plus the OpenCode global mirror, exporting `key.txt` to each; uninstall removes from all.
- A real Orca bot-automation ("Quota review") created from `cronMinutes` via the Orca CLI, surviving plugin restarts.
- Collapsible "Skill config" with a compact 2×2 numeric grid, localized labels (EN/RU/ZH), and per-field hints.
- Version badge in the header (left, next to the title).
- `CHANGELOG.md` documenting releases in Keep a Changelog format.

### Changed
- The progress bar now shows the **remaining** share of the quota (not the used share); threshold ticks are on the remaining scale.
- Save buttons (thresholds, skill config) are highlighted only when there are unsaved changes.
- Removed the duplicated per-mode effort/worker settings; those live only in the skill config. Adjacent threshold bounds stay linked without gaps.
- Updated `README.md`, `README.ru.md`, and `README.zh.md` for v1.1.0 and refreshed dark-theme screenshots (`assets/preview-{en,ru,zh}.png`) to match the real Orca UI.
- Plugin version bumped to 1.1.0.

### Fixed
- `setSkillConfig` no longer fails with ENOENT when the skill folder is missing (it creates it first).
- "Install skill" / "Uninstall skill" buttons now appear and refresh correctly.
- Reveal-key and copy no longer use `window.prompt` / `alert` / the blocked Clipboard API (inline forms + `execCommand` fallback).
- The work-window placeholder no longer shows `undefined`.

## [1.0.0] - 2026-11-25

First public release.

### Added
- OpenRouter free-tier daily request (RPD) monitor with a live countdown to the 00:00 UTC reset.
- Auto / Turbo / Balance / Eco modes with editable thresholds.
- Editable per-mode metadata (effort / workers / subagents) as hints for agents.
- Self-contained API key (stored by the plugin, with a `key.txt` fallback).
- Interface in English, Russian and Chinese.
- Public documentation and screenshots; MIT license.

[1.1.0]: https://github.com/sleet1k/orca-quota-panel/releases/tag/v1.1.0
[1.0.0]: https://github.com/sleet1k/orca-quota-panel/releases/tag/v1.0.0
