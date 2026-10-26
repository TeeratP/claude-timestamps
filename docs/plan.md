# claude-timestamps: plan (Claude Code 2.1.310)

D = plugin-authoring `types/claude-code.d.ts`; R = `reference.md` beside it (in the bundled-skills folder of the running build).

## Goal
Show when each row happened on every transcript row: prompts, replies, tool calls, tool results, tool groups and command output. A row shows a clock time plus a relative age, e.g. `09:12 · 5m ago`. Everything is configurable in `/config`.

## Feasibility (from the design pass)
- **Wrapping rows.** `ui.render` hooks on UserMessage, AssistantMessage, ToolUse, ToolResult, ToolGroup and CommandOutput can wrap `await next(e)` (D:4100-4110, D:9836).
  - Rows are identified by `e.requestId`, the message id. ToolUse and ToolResult rows also carry `tool_use_id`.
  - Props carry no time.
- **True times.** The mod records its own time with `$.clock.now()`:
  - in `session.append`, keyed by the row `uuid` and by the block's tool_use ids;
  - in `tool.call`, at start and end.
  
  On resume, fork or compact (`classic.SessionStart`, source in `transcript_path`), the mod parses the transcript JSONL for `uuid → timestamp` (files of 4 MiB or less). The time table is persisted in `$.store` under `times:<sessionId>`.
- **Unknown rows.** The render hook schedules `$.clock.after(0, …)` to record the first time it saw the row, and shows it in italic (and `subtle` instead of `dim`), so the mark costs no cell. Rows first seen while a resume is loading show no stamp.
- **Refresh.** Rows redraw when a `$.state` member they read changes. Three tick atoms (`tickMin`, `tickHour`, `tickDay`) are written by one 15 s timer, each only when its bucket changes. A row reads the tick matching its age, and reads none while it is off screen.
- **Terminal main screen** (`viewport.isFullscreen === false`). Printed scrollback is static (inferred), so:
  - rows show the clock only;
  - an AbovePrompt band shows `you 09:12 · 5m ago   claude 09:14 · 3m ago`.
- **Biggest open point.** It is unverified that `requestId` equals the `session.append` uuid. Ship a debug log that pairs them for the live check. If they differ, match by order and text.

## Layout
- **Placement.** With 70 or more columns, the stamp goes in a left column, before the body:
  - a Row Box: the stamp first, at a fixed width, `flexShrink 0` and `marginRight 1`; the body after it, `flexGrow 1` and `flexShrink 1`, so wrapped body lines stay aligned after the stamp column (a hanging indent);
  - the stamp width is that of the widest stamp the format makes on a row of its own day (`HH:mm`: 5 cells, the body at column 6, one space after the stamp), so those rows' bodies start at the same column; a row that carries a date (`showDate` other than `always`) widens its own column. min(22, 25% of the columns) only limits it;
  - the stamp Box takes the top margin and padding of the drawing `next(e)` returns, so it sits on the first line of text. The engine's own drawing comes back as an opaque `{ type: 'engine', ref }` (D:10174-10184) that hides them, so a per-component table of the blank rows measured live stands in for it (terminal only);
  - the date drops first when space runs short, then the age;
  - a ToolGroup drawn unfolded (`isExpanded`) is not stamped: its calls are ToolUse rows with stamps of their own.

  Below 70 columns, and on mobile, the stamp is one dim line above the row. `right` puts the same column after the body (`marginLeft 1`).
- **Overflow.** Nothing may overflow; use `truncate-end`. Never use absolute positioning, and never rewrite `props.text`.

## Settings (userConfig, titles `Title (default: X)`; text defaults quoted)
| key | type | options | default | title |
|---|---|---|---|---|
| style | choice | time, time+seconds, 12h, 12h+seconds, date+time, iso, custom | time | Time style (default: time) |
| pattern | text | YYYY MM MMM DD ddd HH H hh h mm ss a | HH:mm | Custom pattern (default: "HH:mm") |
| showDate | choice | other-day, 12h, 24h, 7d, always, never | other-day | Show date (default: other-day) |
| show | choice | time, age, both | time | Show (default: time) |
| rows | choice | all, conversation, prompts, no-tools | all | Stamped rows (default: all) |
| placement | choice | auto, left, right, above | auto | Placement (default: auto) |
| color | choice | dim, subtle, time-of-day, fixed, off | dim | Colour (default: dim) |
| fixedColor | text | ThemeKey, named colour, #rrggbb | inactive | Fixed colour (default: "inactive") |
| dayBands | text | 2 or 4 start hours | 6,12,18,22 | Day bands (default: "6,12,18,22") |
| band | choice | off, auto, on | off | Last-activity band (default: off) |

- **Time-of-day colours** are theme keys, so they follow light and dark themes. Each is drawn with `dimColor`.
  - Four bands: morning `warning`, afternoon `success`, evening `claude`, night `merged`.
  - Two bands: day `warning`, night `merged`.
- **No Settings pane.** `/config` edits every field and hot-reloads.

## Files
- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/hooks.json`
- `hooks/register.tsx`: wiring only.
- `hooks/times.ts`: the times family atom, store sync, transcript parse.
- `hooks/ticks.ts`
- `hooks/format.ts`: pure.
- `hooks/stamp.tsx`
- `hooks/band.tsx`
- `hooks/strings.ts`
- `hooks/atoms.ts`
- `types/index.d.ts`

## Tests
- `format`
- `live`: append, then mount; ages tick.
- `tool`
- `fallback`
- `resume`
- `layout`: 120 and 50 columns, mobile, constant width.
- `options`
- `band`

Run each on terminal and desktop.

## Risks
- requestId vs uuid.
- Static scrollback.
- Transcripts over 4 MiB.
- Fork uuids.
- Subagent rows.
- Narrower wrap width.
- Colour support by surface.
- Timezone and DST in the sandbox.
- ToolGroup ids.
