import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  EVERY_SURFACE,
  MINUTE,
  NOW,
  TRANSCRIPT,
  begin,
  boot,
  call,
  mountBand,
  mountRow,
  prompt,
  reply,
  result,
  stampOf,
  start,
  styleOf,
  transcript,
} from './fakes'
import { layout, overflow } from './render'
import type { Tree } from './render'

const ON_MAIN_SCREEN = { options: { band: 'auto', show: 'both' } } as const
const ALWAYS = { options: { band: 'on', show: 'both' } } as const

// The text of the band, or undefined where the engine draws its own (the test's stands in).
async function bandOf(ui: Awaited<ReturnType<typeof mountBand>>) {
  const texts = await ui.findAll({ type: 'Text' })

  return texts.find(one => one.props.wrap === 'truncate-end')?.text
}

// A conversation: a prompt at 09:12, Claude's reply at 09:14.
async function talk($: Engine, on: On) {
  const { clock } = boot(on)
  await start($)
  await $.session.append(prompt('u-1'))
  await clock.advance(2 * MINUTE)
  await $.session.append(reply('a-1'))
  await clock.advance(MINUTE)

  return clock
}

test('the band is off by default', async ($, on) => {
  await talk($, on)

  const ui = await mountBand($)

  expect(await bandOf(ui)).toBeUndefined()
  expect(await ui.drawn()).toMatchObject({ children: ['engine row'] })
  await ui.unmount()
})

for (const surface of EVERY_SURFACE) {
  test(
    `the band says when you and Claude last spoke, with ages, on the ${surface}`,
    ALWAYS,
    async ($, on) => {
      await talk($, on)

      const ui = await mountBand($, { surface })

      expect(await bandOf(ui)).toBe(
        'you 09:12 · 3m ago   claude 09:14 · 1m ago',
      )
      await ui.unmount()
    },
  )
}

test(
  'the band follows the show setting: the clocks alone by default',
  { options: { band: 'on' } },
  async ($, on) => {
    await talk($, on)

    const ui = await mountBand($)

    expect(await bandOf(ui)).toBe('you 09:12   claude 09:14')
    await ui.unmount()
  },
)

test("the band's ages tick by the minute", ON_MAIN_SCREEN, async ($, on) => {
  const clock = await talk($, on)
  const ui = await mountBand($)
  expect(await bandOf(ui)).toBe('you 09:12 · 3m ago   claude 09:14 · 1m ago')

  await clock.advance(MINUTE)
  expect(await bandOf(ui)).toBe('you 09:12 · 4m ago   claude 09:14 · 2m ago')

  await clock.advance(10 * MINUTE)
  expect(await bandOf(ui)).toBe('you 09:12 · 14m ago   claude 09:14 · 12m ago')
  await ui.unmount()
})

test(
  'a new prompt or reply changes the band at once',
  ON_MAIN_SCREEN,
  async ($, on) => {
    const clock = await talk($, on)
    const ui = await mountBand($)

    await $.session.append(prompt('u-2'))
    expect(await bandOf(ui)).toBe('you 09:15 · now   claude 09:14 · 1m ago')

    await clock.advance(MINUTE)
    await $.session.append(call('c-1', 'toolu_1'))
    expect(await bandOf(ui)).toBe('you 09:15 · 1m ago   claude 09:16 · now')
    await ui.unmount()
  },
)

test(
  'a tool result and a reminder are neither of you nor Claude',
  ON_MAIN_SCREEN,
  async ($, on) => {
    const clock = await talk($, on)
    const ui = await mountBand($)
    const before = await bandOf(ui)

    await clock.advance(MINUTE)
    await $.session.append(result('r-1', 'toolu_1'))
    await $.session.append({ ...prompt('r-2'), door: 'hook-context' })
    await $.session.append(reply('t-1', [{ type: 'thinking', thinking: 'hm' }]))

    expect(before).toBe('you 09:12 · 3m ago   claude 09:14 · 1m ago')
    expect(await bandOf(ui)).toBe('you 09:12 · 4m ago   claude 09:14 · 2m ago')
    await ui.unmount()
  },
)

test(
  "a subagent's rows are not the main conversation's",
  ON_MAIN_SCREEN,
  async ($, on) => {
    const clock = await talk($, on)
    const ui = await mountBand($)

    await clock.advance(MINUTE)
    await $.session.append({ ...reply('s-1'), agentId: 'agent-1' })

    expect(await bandOf(ui)).toBe('you 09:12 · 4m ago   claude 09:14 · 2m ago')
    await ui.unmount()
  },
)

test(
  "auto shows the band on the terminal's main screen only",
  { options: { band: 'auto' } },
  async ($, on) => {
    await talk($, on)

    const main = await mountBand($, { isFullscreen: false })
    const full = await mountBand($, { isFullscreen: true })
    const desktop = await mountBand($, { surface: 'desktop' })
    const unknown = await mountBand($, {
      surface: 'terminal',
      isFullscreen: undefined,
    })

    expect(await bandOf(main)).toBe('you 09:12   claude 09:14')
    expect(await bandOf(full)).toBeUndefined()
    expect(await bandOf(desktop)).toBeUndefined()
    expect(await bandOf(unknown)).toBe('you 09:12   claude 09:14')
    for (const ui of [main, full, desktop, unknown]) await ui.unmount()
  },
)

test(
  'on shows the band in the fullscreen terminal too, and off never does',
  { options: { band: 'on' } },
  async ($, on) => {
    await talk($, on)

    const full = await mountBand($, { isFullscreen: true })
    const desktop = await mountBand($, { surface: 'desktop' })

    expect(await bandOf(full)).toBe('you 09:12   claude 09:14')
    expect(await bandOf(desktop)).toBe('you 09:12   claude 09:14')
    await full.unmount()
    await desktop.unmount()
  },
)

test(
  'off never shows the band',
  { options: { band: 'off' } },
  async ($, on) => {
    await talk($, on)

    const ui = await mountBand($, { isFullscreen: false })

    expect(await bandOf(ui)).toBeUndefined()
    await ui.unmount()
  },
)

test(
  'the band yields to a survey',
  { options: { band: 'on' } },
  async ($, on) => {
    await talk($, on)

    const ui = await mountBand($, { props: { hasSurvey: true } })

    expect(await bandOf(ui)).toBeUndefined()
    await ui.unmount()
  },
)

test(
  'the band says nothing before there is anything to say',
  { options: { band: 'on' } },
  async ($, on) => {
    boot(on)
    await start($)

    const ui = await mountBand($)

    expect(await bandOf(ui)).toBeUndefined()
    await ui.unmount()
  },
)

test(
  'a band with only one side says that side',
  { options: { band: 'on', show: 'both' } },
  async ($, on) => {
    const { clock } = boot(on)
    await start($)
    await $.session.append(prompt('u-1'))
    await clock.advance(MINUTE)

    const ui = await mountBand($)

    expect(await bandOf(ui)).toBe('you 09:12 · 1m ago')
    await ui.unmount()
  },
)

test(
  'the band follows the clock style and the colour',
  { options: { band: 'on', style: '12h', color: 'time-of-day' } },
  async ($, on) => {
    await talk($, on)

    const ui = await mountBand($)

    expect(await bandOf(ui)).toBe('you 9:12 AM   claude 9:14 AM')
    expect(await styleOf(ui)).toMatchObject({
      color: 'warning',
      dimColor: true,
    })
    await ui.unmount()
  },
)

test(
  "a resumed session's band is read from its transcript",
  { options: { band: 'on', show: 'both' } },
  async ($, on) => {
    const { clock } = boot(on, {
      files: {
        [TRANSCRIPT]: transcript([
          { uuid: 'u-1', at: NOW - 60 * MINUTE, type: 'user' },
          { uuid: 'a-1', at: NOW - 59 * MINUTE, type: 'assistant' },
          {
            uuid: 'r-1',
            at: NOW - 30 * MINUTE,
            type: 'user',
            content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }],
          },
          { uuid: 'm-1', at: NOW - 20 * MINUTE, type: 'user', isMeta: true },
          { uuid: 'a-2', at: NOW - 10 * MINUTE, type: 'assistant' },
        ]),
      },
    })
    await start($)
    await begin($, 'resume')
    await clock.settle()

    const ui = await mountBand($)

    expect(await bandOf(ui)).toBe('you 08:12 · 1h ago   claude 09:02 · 10m ago')
    await ui.unmount()
  },
)

for (const width of [120, 80, 50, 30, 20, 8]) {
  test(
    `the band fits ${width} columns: the age goes first, then you, then it is cut`,
    ON_MAIN_SCREEN,
    async ($, on) => {
      await talk($, on)

      const ui = await mountBand($, { props: { bodyColumns: width } })
      const tree = (await ui.drawn()) as Tree

      expect(overflow(layout(tree, width), width)).toEqual([])
      const text = (await bandOf(ui)) ?? ''
      if (width >= 43)
        expect(text).toBe('you 09:12 · 3m ago   claude 09:14 · 1m ago')
      if (width >= 24 && width < 43)
        expect(text).toBe('you 09:12   claude 09:14')
      if (width >= 21 && width < 24) expect(text).toBe('claude 09:14 · 1m ago')
      await ui.unmount()
    },
  )
}

test(
  'the band cuts what cannot fit, never wider than its room',
  ON_MAIN_SCREEN,
  async ($, on) => {
    await talk($, on)

    const ui = await mountBand($, { props: { bodyColumns: 8 } })

    expect(await bandOf(ui)).toBe('claude …')
    await ui.unmount()
  },
)

test(
  'on the main screen a row shows the clock only, while the band shows the ages',
  ON_MAIN_SCREEN,
  async ($, on) => {
    const clock = await talk($, on)
    const row = await mountRow($, 'UserMessage', 'u-1', { isFullscreen: false })
    const band = await mountBand($)

    await clock.advance(5 * MINUTE)

    expect(await stampOf(row)).toBe('09:12')
    expect(await bandOf(band)).toBe(
      'you 09:12 · 8m ago   claude 09:14 · 6m ago',
    )
    await row.unmount()
    await band.unmount()
  },
)
