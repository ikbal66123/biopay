# Vendored skills

| Skill | Source | Commit | License | Notes |
|---|---|---|---|---|
| `ui-ux-pro-max` | github.com/nextlevelbuilder/ui-ux-pro-max-skill | v2.15.0 | MIT | Script paths point at the repo root; tests omitted. |
| `frontend-design` | github.com/anthropics/skills, `skills/frontend-design` (also listed on claudeskills.org) | `2c5958e` | Apache-2.0 (`LICENSE.txt`) | Unchanged. |
| `web-design-guidelines` | github.com/vercel-labs/agent-skills, `skills/web-design-guidelines` | `1a2c79d` | MIT | Unchanged. Fetches the latest rules from raw.githubusercontent.com on each review. |
| `taste-skill` | github.com/Leonxlnx/taste-skill (tasteskill.dev), `skills/taste-skill` | `9b4bf93` | MIT (`LICENSE`) | `SKILL.md`, `references/`, `library/` only. `assets/` (38 MB) and `scripts/` are omitted; see the note at the top of its `SKILL.md`. |
| `playwright-cli` | github.com/microsoft/playwright-cli, installed with `playwright-cli install --skills` from `@playwright/cli@0.1.23` | 0.1.23 | Apache-2.0 | `.playwright/cli.config.json` points it at the preinstalled Chromium. |

designmd.ai could not be reached from the build environment and has no installable package, so its output format is followed directly: see `DESIGN.md` at the repository root.

## Installing the playwright-cli command

The skill needs the CLI on the PATH:

```bash
npm install -g @playwright/cli@0.1.23
```

It refuses `file://` URLs, so serve the folder first (`python3 -m http.server 8765`) and open `http://127.0.0.1:8765/tao-group-os.html`.
