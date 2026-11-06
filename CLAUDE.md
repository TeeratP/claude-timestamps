# claude-timestamps

Claude Code mod (plugin): shows a clock time and a relative age (`09:12 · 5m ago`) on transcript rows — prompts, replies, tool calls and results.

## Task tracking
- Repo: `TeeratP/claude-timestamps` (public).
- Project board: #8 "claude-timestamps" (owner `TeeratP`, project ID `PVT_kwHOAcCsLc4BoxrR`).
- Status field `PVTSSF_lAHOAcCsLc4BoxrRzhnQLGg` options: Backlog `42fb6ee6` · Ready `31e856fe` · In progress `76a6288c` · In review `01b8e7d8` · Done `f6636c93`.
- Issue titles: plain task name, no prefix.

## Gates (run all before merging)
```
claude plugin validate .
claude plugin test .
npx -y -p typescript@5.6 tsc -p .
```

## Rules
- All user-facing strings live in `hooks/strings.ts`.
- `hooks/register.tsx` is wiring only, with literal matchers.
- Prettier: `--no-semi --single-quote --arrow-parens avoid --trailing-comma all`.
