import { expect, test } from 'claude-code/testing'

import {
  ENGINE_ROW,
  EVERY_SURFACE,
  HOUR,
  MINUTE,
  boot,
  call,
  mountRow,
  prompt,
  reply,
  result,
  stampOf,
  start,
  styleOf,
} from './fakes'

const BOTH = { options: { show: 'both' } } as const

for (const surface of EVERY_SURFACE) {
  test(`a row appended is stamped with the time it was appended, on the ${surface}`, async ($, on) => {
    const { clock } = boot(on)
    await start($)

    await $.session.append(prompt('u-1'))
    await clock.advance(3 * MINUTE)
    await $.session.append(reply('a-1'))

    const first = await mountRow($, 'UserMessage', 'u-1', { surface })
    const second = await mountRow($, 'AssistantMessage', 'a-1', { surface })

    expect(await stampOf(first)).toBe('09:12')
    expect(await stampOf(second)).toBe('09:15')
    // The engine's own row stays whole beside the stamp.
    expect((await first.find({ type: 'Text', text: ENGINE_ROW }))?.text).toBe(
      ENGINE_ROW,
    )
    await first.unmount()
    await second.unmount()
  })

  test(
    `the age ticks while the row is on screen, on the ${surface}`,
    BOTH,
    async ($, on) => {
      const { clock, draws } = boot(on)
      await start($)
      await $.session.append(prompt('u-1'))
      await clock.settle()
      const ui = await mountRow($, 'UserMessage', 'u-1', { surface })
      expect(await stampOf(ui)).toBe('09:12 · now')
      const drawn = draws.count

      // The timer runs every 15 seconds but a minute tick moves once a minute.
      await clock.advance(45_000)
      expect(await stampOf(ui)).toBe('09:12 · now')
      expect(draws.count).toBe(drawn)

      await clock.advance(15_000)
      expect(await stampOf(ui)).toBe('09:12 · 1m ago')
      expect(draws.count).toBe(drawn + 1)

      await clock.advance(10 * MINUTE)
      expect(await stampOf(ui)).toBe('09:12 · 11m ago')
      await ui.unmount()
    },
  )
}

test(
  'a row reads the hour tick once it is an hour old',
  BOTH,
  async ($, on) => {
    const { clock, draws } = boot(on)
    await start($)
    await $.session.append(prompt('u-1'))
    await clock.settle()
    const ui = await mountRow($, 'UserMessage', 'u-1')

    await clock.advance(59 * MINUTE)
    expect(await stampOf(ui)).toBe('09:12 · 59m ago')
    await clock.advance(MINUTE)
    expect(await stampOf(ui)).toBe('09:12 · 1h ago')

    // From here only the hour moves it: a minute tick draws nothing.
    const drawn = draws.count
    await clock.advance(10 * MINUTE)
    expect(draws.count).toBe(drawn)
    expect(await stampOf(ui)).toBe('09:12 · 1h ago')

    // At 11:00 the row is 1h48m old; at 12:00, 2h48m.
    await clock.advance(38 * MINUTE)
    expect(draws.count).toBe(drawn + 1)
    expect(await stampOf(ui)).toBe('09:12 · 1h ago')
    await clock.advance(HOUR)
    expect(await stampOf(ui)).toBe('09:12 · 2h ago')
    await ui.unmount()
  },
)

test(
  'a row off screen reads no tick, and is right again when it comes back',
  BOTH,
  async ($, on) => {
    const { clock, draws } = boot(on)
    await start($)
    await $.session.append(prompt('u-1'))
    await clock.settle()
    const ui = await mountRow($, 'UserMessage', 'u-1', {
      props: { onScreen: null },
    })
    const drawn = draws.count

    await clock.advance(5 * MINUTE)
    expect(draws.count).toBe(drawn)
    expect(await stampOf(ui)).toBe('09:12 · now')

    await ui.redraw({
      text: 'hello',
      origin: { kind: 'composer' },
      isExpanded: false,
      onScreen: { first: 0, last: 3, of: 4 },
    })
    expect(await stampOf(ui)).toBe('09:12 · 5m ago')
    await ui.unmount()
  },
)

test('a stamp with no age reads no tick at all', async ($, on) => {
  const { clock, draws } = boot(on)
  await start($)
  await $.session.append(prompt('u-1'))
  await clock.settle()
  const ui = await mountRow($, 'UserMessage', 'u-1')
  const drawn = draws.count

  await clock.advance(30 * MINUTE)

  expect(draws.count).toBe(drawn)
  expect(await stampOf(ui)).toBe('09:12')
  await ui.unmount()
})

test(
  'a main screen row shows the clock only, since printed rows cannot tick',
  BOTH,
  async ($, on) => {
    const { clock, draws } = boot(on)
    await start($)
    await $.session.append(prompt('u-1'))
    await clock.settle()
    const ui = await mountRow($, 'UserMessage', 'u-1', { isFullscreen: false })
    const drawn = draws.count

    await clock.advance(5 * MINUTE)

    expect(await stampOf(ui)).toBe('09:12')
    expect(draws.count).toBe(drawn)
    await ui.unmount()
  },
)

test('rows the screen cannot show are not stamped, and a thinking row has no stamp', async ($, on) => {
  const { clock } = boot(on)
  await start($)

  await $.session.append(reply('t-1', [{ type: 'thinking', thinking: 'hm' }]))
  await $.session.append({
    ...prompt('r-1'),
    door: 'hook-context',
    origin: { kind: 'composer' },
  })
  await clock.settle()
  const thought = await mountRow($, 'AssistantMessage', 't-1')
  const reminder = await mountRow($, 'UserMessage', 'r-1')
  // Neither was recorded, so each is first seen when drawn: approximate.
  await clock.settle()

  expect(await stampOf(thought)).toBe('09:12')
  expect(await stampOf(reminder)).toBe('09:12')
  expect(await styleOf(thought)).toMatchObject({ italic: true })
  expect(await styleOf(reminder)).toMatchObject({ italic: true })
  await thought.unmount()
  await reminder.unmount()
})

test('a tool call and its result are stamped by the call id and its end', async ($, on) => {
  const { clock } = boot(on)
  await start($)
  await $.session.append(call('c-1', 'toolu_1'))
  await clock.advance(MINUTE)
  await $.session.append(result('r-1', 'toolu_1'))

  const use = await mountRow($, 'ToolUse', 'toolu_1')
  const done = await mountRow($, 'ToolResult', 'toolu_1')

  expect(await stampOf(use)).toBe('09:12')
  expect(await stampOf(done)).toBe('09:13')
  await use.unmount()
  await done.unmount()
})
