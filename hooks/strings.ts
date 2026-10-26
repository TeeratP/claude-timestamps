// Every string the person or the debug log reads lives here.
export const S = {
  months: [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ],
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  am: 'AM',
  pm: 'PM',

  // Between the clock and the age: `09:12 · 5m ago`.
  separator: ' · ',
  age: {
    now: 'now',
    minutes: (n: number) => `${n}m ago`,
    hours: (n: number) => `${n}h ago`,
    days: (n: number) => `${n}d ago`,
    years: (n: number) => `${n}y ago`,
  },

  // The last-activity band: `you 09:12 · 5m ago   claude 09:14 · 3m ago`.
  bandYou: 'you',
  bandClaude: 'claude',
  bandGap: '   ',
  bandPart: (who: string, stamp: string) => `${who} ${stamp}`,

  // The pair the live check matches: a drawn row's requestId against an appended row's uuid.
  // `preview` is the row's first words, to match by order and text if the ids differ.
  debugRender: (component: string, requestId: string, preview: string) =>
    `render ${JSON.stringify({ component, requestId, preview })}`,
  debugAppend: (
    uuid: string,
    door: string,
    type: string,
    toolUseIds: readonly string[],
    preview: string,
  ) => `append ${JSON.stringify({ uuid, door, type, toolUseIds, preview })}`,

  // The debug log leads each line with the plugin's name.
  failed: (what: string, reason: string) => `${what}: ${reason}`,
  transcriptTooLarge: (path: string, size: number) =>
    `${path} is ${size} bytes, over the 4 MiB a mod can read; older rows are not stamped`,
  transcriptUnreadable: (path: string) => `could not read ${path}`,
}
