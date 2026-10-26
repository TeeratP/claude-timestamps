# timestamps

A Claude Code mod that puts a clock time on every transcript row: your prompts, Claude's replies, tool calls, tool results, tool groups and command output.

```
09:12  > fix the login redirect
09:12  ● I'll start with the redirect handler.
09:13  ● Read(src/auth/redirect.ts)
09:14  ● Done. The redirect now keeps the return path.
```

The stamp sits in a column to the left of the row, dim, on the same line as the row's first line of text, so the text starts at the same column and wrapped lines stay aligned under it. Below 70 columns, and on mobile, it is one dim line above the row. Turn on an age (`Show: both`) and a row reads `09:12 · 5m ago`, ticking as time passes.

## Install

In a terminal session:

```
/plugin marketplace add TeeratP/claude-timestamps
/plugin install timestamps@claude-timestamps
```

Or in one line, `/plugin install timestamps --marketplace TeeratP/claude-timestamps`; from a shell, `claude plugin marketplace add TeeratP/claude-timestamps` then `claude plugin install timestamps@claude-timestamps`. In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `TeeratP/claude-timestamps`, then Add plugin.

The repository is private, so the install works for people who can read it on GitHub and whose machine holds a git credential for github.com (an SSH key, or `gh auth login` then `gh auth setup-git`).

A change in `/config` reloads the mod with the new setting; nothing needs a restart.

## Settings

Every setting is a row in `/config`, under the plugin's name. Defaults are marked.

| Setting | Choices | What it does |
|---|---|---|
| Time style | **time**, time+seconds, 12h, 12h+seconds, date+time, iso, custom | `09:12`, `09:12:05`, `9:12 AM`, `9:12:05 AM`, `Oct 26 09:12`, `2026-10-26T09:12:05`, or your own pattern. |
| Custom pattern | text, default `HH:mm` | The pattern for `custom`. Tokens: `YYYY MM MMM DD ddd HH H hh h mm ss a`; anything else is kept as typed. Every letter that is a token is replaced, so `ddd HH:mm` reads `Mon 09:12`. |
| Show date | **other-day**, 12h, 24h, 7d, always, never | When the `time`, `time+seconds`, `12h` and `12h+seconds` styles add the date (`Oct 26 09:12`): on a row from another day, or older than 12 hours, 24 hours or 7 days, or on every row, or never. `date+time`, `iso` and `custom` read as they are written. |
| Show | **time**, age, both | `time`: the clock time only. `age`: how long ago, e.g. `5m ago`. `both`: `09:12 · 5m ago`. **The age is off by default.** |
| Stamped rows | **all**, conversation, prompts, no-tools | `all`: every row. `conversation`: prompts and replies. `prompts`: your prompts. `no-tools`: everything but tool calls, results and groups. |
| Placement | **auto**, left, right, above | `auto`: the left column from 70 columns, a line above the row below that and on mobile. `left`: a column before the row. `right`: the same column after it. `above`: a line over the row. |
| Colour | **dim**, subtle, time-of-day, fixed, off | `dim`: the theme's dim text. `subtle`: the theme's subtle colour. `time-of-day`: by the hour of the row, dimmed. `fixed`: the Fixed colour. `off`: plain text. |
| Fixed colour | text, default `"inactive"` | For `fixed`: a theme key (`inactive`, `subtle`, `claude`, ...), a colour name such as `cyan`, or `#rrggbb`. |
| Day bands | text, default `"6,12,18,22"` | For `time-of-day`. Four rising start hours (0-23): morning (`warning`), afternoon (`success`), evening (`claude`), night (`merged`). Or two: day (`warning`), night (`merged`), e.g. `7,19`. They are theme keys, so they follow light and dark themes. |
| Last-activity band | **off**, auto, on | A line above the prompt: `you 09:12 · 5m ago   claude 09:14 · 3m ago`. It follows Show, so ages appear with `age` or `both`. `auto`: on the terminal's main screen only. `on`: always. |

A value outside its choices counts as unset, so the default applies. A Fixed colour or Day bands value that does not parse falls back to its default.

### How wide the column is

The stamp column is as wide as the longest stamp the format makes on a row of its own day, plus one cell, so those rows line up: `~09:12` is 6 cells, the text starts at column 7. Twenty-two cells or a quarter of the columns is only a limit, never the size. A date added by Show date (`Oct 24 08:12`) widens the column of the rows that carry it, up to that limit; with `always` the date is on every row and in every column. When the limit is less than the stamp needs, the date drops first, then the age, then the clock is cut with `…`. Under 5 cells a column says nothing, so the stamp goes above the row instead. Nothing is drawn past the edge at 30, 50, 80 or 120 columns.

## How it works

- **True times.** The mod notes the time of each row as the conversation appends it (`session.append`, by the row's uuid and by the ids of the tool calls in it), and of each tool call as it starts and ends (`tool.call`). A tool call's row shows when it started, its result when it ended, and a tool group the start of its first call.
- **Resume, fork, compact.** The times are read back from what the mod saved for the session and, for a resumed, forked or compacted one, from the session transcript (`uuid` to `timestamp`). Rows wait for that read, a moment, rather than show a guess. Saved times are kept for the newest five sessions, 4,000 rows each.
- **Ticking.** One timer writes three ticks (minute, hour, day), each only when it changes. A row reads the tick that matches its age, and none while it is off screen, so a quiet transcript redraws nothing.

## Limits

- **The terminal's main screen is static.** Without fullscreen rendering, the terminal prints each row once into its scrollback and nothing can change it afterwards (inferred from the API, not observed). Rows there show the clock only, never an age. Set Last-activity band to `auto` (or `on`) for a line above the prompt that does tick: `you 09:12 · 5m ago   claude 09:14 · 3m ago`.
- **Transcripts over 4 MiB are not read.** A mod can read a file of 4 MiB or less. For a larger resumed, forked or compacted session, rows that the mod saved earlier keep their times, and older rows are not stamped from the transcript: they show an approximate time instead (below).
- **`~` marks an approximate time.** A row the mod never saw appended (a row from before it was installed, a transcript too big to read, a drawn row whose id does not match an appended one) gets the time it was first drawn, shown as `~09:12`. Treat it as "no earlier than". It is never replaced by a guess while the real time is known.
- **Ages are coarse past an hour.** The tick moves by the minute, the hour and the day, so `1h ago` can read until the next hour boundary and `1d ago` until the next midnight.
- **Row identity is checked live.** A drawn row is matched to its time by its `requestId`. That this equals the uuid the conversation appended the row under is confirmed with the debug log (below); where it does not, those rows show `~` times.
- **Time zone.** Times are the machine's local time as the mod's environment sees it.
- **A row that draws nothing** still gets a stamp (a line above it, or a column beside nothing).
- **One band.** The last-activity band takes the one slot above the prompt; it yields to a survey and replaces another mod's band there.

## Check it live

Run `claude --debug`. The mod logs each row it draws once, `timestamps: render {"component":"AssistantMessage","requestId":"...","preview":"..."}`, and each row appended, `timestamps: append {"uuid":"...","door":"response","type":"assistant","toolUseIds":[],"preview":"..."}`. A drawn row is stamped with its true time when its `requestId` equals an appended `uuid` (or a tool call id); otherwise its stamp starts with `~`.

## Development

```
claude plugin validate .
claude plugin test .
npx -y -p typescript@5.6 tsc -p .
```

`claude --plugin-dir .` loads the mod from this folder. The design is in `docs/plan.md`.
