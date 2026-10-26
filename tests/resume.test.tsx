import { expect, test } from 'claude-code/testing'

import {
  DAY,
  EVERY_SURFACE,
  HOUR,
  MINUTE,
  NOW,
  SESSION,
  TRANSCRIPT,
  begin,
  boot,
  call,
  mountRow,
  prompt,
  stampOf,
  start,
  styleOf,
  transcript,
} from './fakes'

const BOTH = { options: { show: 'both' } } as const
const AGO = (ms: number) => NOW - ms

// A resumed conversation: a prompt two days back, a reply with a tool call, its result.
const HISTORY = transcript([
  { uuid: 'u-1', at: AGO(2 * DAY + HOUR), type: 'user' },
  {
    uuid: 'a-1',
    at: AGO(2 * DAY),
    type: 'assistant',
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: {} }],
  },
  {
    uuid: 'u-2',
    at: AGO(2 * DAY - 5 * MINUTE),
    type: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }],
  },
  { uuid: 'a-2', at: AGO(3 * HOUR), type: 'assistant' },
])

for (const source of ['resume', 'fork', 'compact'] as const) {
  for (const surface of EVERY_SURFACE) {
    test(
      `a ${source} stamps its rows from the transcript, on the ${surface}`,
      BOTH,
      async ($, on) => {
        const { clock } = boot(on, { files: { [TRANSCRIPT]: HISTORY } })
        await start($)
        await begin($, source)
        await clock.settle()

        const rows = [
          ['UserMessage', 'u-1'],
          ['ToolUse', 'toolu_1'],
          ['ToolResult', 'toolu_1'],
          ['AssistantMessage', 'a-2'],
        ] as const
        const shown = []
        for (const [component, id] of rows) {
          const ui = await mountRow($, component, id, { surface })
          shown.push(await stampOf(ui))
          await ui.unmount()
        }

        expect(shown).toEqual([
          // Two days back: the date is due, and it drops first only when the room is short.
          'Oct 24 08:12 · 2d ago',
          'Oct 24 09:12 · 2d ago',
          // Five minutes short of two days.
          'Oct 24 09:17 · 1d ago',
          '06:12 · 3h ago',
        ])
      },
    )
  }
}

test('rows drawn while the transcript is being read wait, then are stamped', async ($, on) => {
  const { clock } = boot(on, { files: { [TRANSCRIPT]: HISTORY } })
  await start($)
  await begin($, 'resume')

  const ui = await mountRow($, 'AssistantMessage', 'a-2')
  // Not stamped, and not guessed at either: the transcript has not been read.
  expect(await stampOf(ui)).toBeUndefined()

  await clock.settle()
  expect(await stampOf(ui)).toBe('06:12')
  await ui.unmount()
})

test('a startup or a clear reads no transcript and holds no rows back', async ($, on) => {
  const { clock, reads } = boot(on, { files: { [TRANSCRIPT]: HISTORY } })
  await start($)
  await begin($, 'startup')
  await clock.settle()
  await begin($, 'clear', 'session-2')
  await clock.settle()

  expect(reads).toEqual([])
})

test('a transcript over 4 MiB is not read, and its rows are left to the first-seen guess', async ($, on) => {
  const big = 'x'.repeat(4 * 1024 * 1024 + 1)
  const { clock, reads, logs } = boot(on, { files: { [TRANSCRIPT]: big } })
  await start($)
  await begin($, 'resume')
  await clock.settle()

  const ui = await mountRow($, 'AssistantMessage', 'a-2')
  expect(await stampOf(ui)).toBeUndefined()
  await clock.settle()

  expect(reads).toEqual([])
  expect(await stampOf(ui)).toBe('09:12')
  expect(await styleOf(ui)).toMatchObject({ italic: true })
  expect(logs.some(line => line.includes('over the 4 MiB'))).toBe(true)
  await ui.unmount()
})

test('a transcript that cannot be read does not hold the rows back', async ($, on) => {
  const { clock, logs } = boot(on)
  await start($)
  await begin($, 'resume')
  await clock.settle()

  const ui = await mountRow($, 'UserMessage', 'u-1')
  await clock.settle()

  expect(await stampOf(ui)).toBe('09:12')
  expect(await styleOf(ui)).toMatchObject({ italic: true })
  expect(logs.some(line => line.includes('could not read'))).toBe(true)
  await ui.unmount()
})

test(
  'a session with no transcript path restores from the store alone',
  BOTH,
  async ($, on) => {
    const { clock } = boot(on, {
      store: { [`times:${SESSION}`]: { 'u-1': AGO(HOUR) } },
    })
    await start($)
    await $.classic.SessionStart({
      source: 'resume',
      session_id: SESSION,
      transcript_path: '',
    })
    await clock.settle()

    const ui = await mountRow($, 'UserMessage', 'u-1')
    expect(await stampOf(ui)).toBe('08:12 · 1h ago')
    await ui.unmount()
  },
)

test("the times saved for the session outrank the transcript's", async ($, on) => {
  const { clock } = boot(on, {
    files: { [TRANSCRIPT]: HISTORY },
    store: { [`times:${SESSION}`]: { 'a-2': AGO(2 * HOUR) } },
  })
  await start($)
  await begin($, 'resume')
  await clock.settle()

  const saved = await mountRow($, 'AssistantMessage', 'a-2')
  const read = await mountRow($, 'UserMessage', 'u-1')

  expect(await stampOf(saved)).toBe('07:12')
  expect(await stampOf(read)).toBe('Oct 24 08:12')
  await saved.unmount()
  await read.unmount()
})

test("a time recorded live is not replaced by the transcript's", async ($, on) => {
  const { clock } = boot(on, { files: { [TRANSCRIPT]: HISTORY } })
  await start($)
  await $.session.append(prompt('a-2'))
  await begin($, 'compact')
  await clock.settle()

  const ui = await mountRow($, 'UserMessage', 'a-2')
  expect(await stampOf(ui)).toBe('09:12')
  await ui.unmount()
})

test('what is recorded is saved for the session a moment later', async ($, on) => {
  const { clock, saved, stored } = boot(on)
  await start($)
  await begin($)
  await $.session.append(prompt('u-1'))
  await clock.advance(500)
  await $.session.append(call('c-1', 'toolu_1'))

  // Nothing is written on every row: the saves wait and go together.
  expect(saved.has(`times:${SESSION}`)).toBe(false)
  await clock.advance(2000)

  expect(stored(`times:${SESSION}`)).toEqual({
    'u-1': NOW,
    'c-1': NOW + 500,
    toolu_1: NOW + 500,
  })
})

test('only the newest sessions are kept in the store', async ($, on) => {
  const old = Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map(n => [`times:old-${n}`, { x: n }]),
  )
  const { clock, saved } = boot(on, { store: { ...old, other: 'kept' } })
  await start($)
  await begin($)
  await $.session.append(prompt('u-1'))
  await clock.advance(2000)

  const keys = [...saved.keys()]

  expect(keys).toContain(`times:${SESSION}`)
  expect(keys).toContain('other')
  expect(keys.filter(key => key.startsWith('times:'))).toHaveLength(5)
  expect(keys).not.toContain('times:old-1')
  expect(keys).toContain('times:old-6')
})

test('times recorded before the session is known are saved with the next ones', async ($, on) => {
  const { clock, stored } = boot(on)
  await start($)
  await $.session.append(prompt('u-1'))
  await clock.advance(2000)

  await begin($)
  await $.session.append(prompt('u-2'))
  await clock.advance(2000)

  expect(stored(`times:${SESSION}`)).toEqual({ 'u-1': NOW, 'u-2': NOW + 2000 })
})
