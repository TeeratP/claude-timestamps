import { expect, test } from 'claude-code/testing'

import {
  EVERY_SURFACE,
  MINUTE,
  boot,
  mountRow,
  prompt,
  reply,
  stampOf,
  start,
} from './fakes'

const BOTH = { options: { show: 'both' } } as const

for (const surface of EVERY_SURFACE) {
  test(`a row the mod never saw appended is stamped, approximately, from when it was first drawn, on the ${surface}`, async ($, on) => {
    const { clock } = boot(on)
    await start($)
    await clock.advance(2 * MINUTE)

    const ui = await mountRow($, 'AssistantMessage', 'never-appended', {
      surface,
    })
    // The draw cannot write, so the first pass has no time to show.
    expect(await stampOf(ui)).toBeUndefined()

    await clock.settle()
    expect(await stampOf(ui)).toBe('~09:14')

    // The first sighting stands: later draws do not move it to now.
    await clock.advance(10 * MINUTE)
    await ui.redraw()
    expect(await stampOf(ui)).toBe('~09:14')
    await ui.unmount()
  })
}

test(
  'the approximate time keeps its age, and its tilde, in a both stamp',
  BOTH,
  async ($, on) => {
    const { clock } = boot(on)
    await start($)
    const ui = await mountRow($, 'AssistantMessage', 'never-appended')
    await clock.settle()

    await clock.advance(5 * MINUTE)

    expect(await stampOf(ui)).toBe('~09:12 · 5m ago')
    await ui.unmount()
  },
)

test('a row appended after it was drawn gets its true time in place of the guess', async ($, on) => {
  const { clock } = boot(on)
  await start($)
  const ui = await mountRow($, 'UserMessage', 'late-1')
  await clock.settle()
  expect(await stampOf(ui)).toBe('~09:12')

  await clock.advance(2 * MINUTE)
  await $.session.append(prompt('late-1'))

  expect(await stampOf(ui)).toBe('09:14')
  await ui.unmount()
})

test('many draws of one unknown row note it once', async ($, on) => {
  const { clock } = boot(on)
  await start($)
  const ui = await mountRow($, 'UserMessage', 'late-2')
  await ui.redraw()
  await ui.redraw()
  await clock.advance(MINUTE)

  expect(await stampOf(ui)).toBe('~09:12')
  await ui.unmount()
})

test('the debug log pairs each drawn row with the uuids appended', async ($, on) => {
  const { clock, logs } = boot(on)
  await start($)
  await $.session.append(prompt('u-1'))
  await $.session.append(reply('a-1'))
  await clock.settle()

  const first = await mountRow($, 'UserMessage', 'u-1')
  await first.redraw()
  const second = await mountRow($, 'AssistantMessage', 'a-1')
  await mountRow($, 'ToolUse', 'u-1')

  const parse = (prefix: string) =>
    logs
      .filter(line => line.startsWith(prefix))
      .map(line => JSON.parse(line.slice(prefix.length)) as unknown)
  expect(parse('append ')).toEqual([
    {
      uuid: 'u-1',
      door: 'prompt',
      type: 'user',
      toolUseIds: [],
      preview: 'hello',
    },
    {
      uuid: 'a-1',
      door: 'response',
      type: 'assistant',
      toolUseIds: [],
      preview: 'hi',
    },
  ])
  // Once per component and id, however often a row is drawn.
  expect(parse('render ')).toEqual([
    { component: 'UserMessage', requestId: 'u-1', preview: 'hello' },
    { component: 'AssistantMessage', requestId: 'a-1', preview: 'hi' },
    { component: 'ToolUse', requestId: 'u-1', preview: 'Bash' },
  ])
  await first.unmount()
  await second.unmount()
})

test('the log names the tool call ids of an appended block', async ($, on) => {
  const { logs } = boot(on)
  await start($)

  await $.session.append(
    reply('a-2', [
      { type: 'tool_use', id: 'toolu_9', name: 'Bash', input: {} },
    ]),
  )

  expect(logs).toContain(
    'append {"uuid":"a-2","door":"response","type":"assistant","toolUseIds":["toolu_9"],"preview":"Bash"}',
  )
})

test('the log quotes only the first words of a row, on one line', async ($, on) => {
  const { logs } = boot(on)
  await start($)

  await $.session.append(
    prompt('u-9', `first\n\nsecond  ${'long '.repeat(30)}`),
  )

  const [line = ''] = logs.filter(one => one.startsWith('append '))
  const { preview } = JSON.parse(line.slice('append '.length)) as {
    preview: string
  }
  expect(preview.startsWith('first second long long')).toBe(true)
  expect(preview.endsWith('…')).toBe(true)
  expect([...preview].length).toBeLessThanOrEqual(40)
})
