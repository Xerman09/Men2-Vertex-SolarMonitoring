/**
 * Client-safe Asia/Manila time helpers.
 * The history API buckets days in Manila time, so every "today" / "now" decision on the
 * client must use the same zone instead of the browser's local clock.
 */
const manilaFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function getManilaNowParts(now: Date = new Date()): { dateStr: string; hourFloat: number } {
  const map: Record<string, string> = {};
  for (const part of manilaFormatter.formatToParts(now)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  const hour = parseInt(map.hour, 10) || 0;
  const minute = parseInt(map.minute, 10) || 0;
  return {
    dateStr: `${map.year}-${map.month}-${map.day}`,
    hourFloat: hour + minute / 60,
  };
}

export function getManilaToday(now: Date = new Date()): string {
  return getManilaNowParts(now).dateStr;
}
