const DAY_MAP: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
};

const CST_OFFSET_HOURS = -6;

function parseTime(timeStr: string): { hours: number; minutes: number } | null {
  // "14:00", "2pm", "2:30pm", "14", "9:00"
  const normalized = timeStr.trim().toLowerCase();

  const match12 = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match12) {
    let hours = parseInt(match12[1]);
    const minutes = match12[2] ? parseInt(match12[2]) : 0;
    const period = match12[3];
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    if (hours > 23 || minutes > 59) return null;
    return { hours, minutes };
  }

  const match24 = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1]);
    const minutes = parseInt(match24[2]);
    if (hours > 23 || minutes > 59) return null;
    return { hours, minutes };
  }

  // Just an hour number like "14" or "9"
  const matchHour = normalized.match(/^(\d{1,2})$/);
  if (matchHour) {
    const hours = parseInt(matchHour[1]);
    if (hours > 23) return null;
    return { hours, minutes: 0 };
  }

  return null;
}

function getNextDayOfWeek(dayOfWeek: number, now: Date): Date {
  const result = new Date(now);
  const currentDay = result.getDay();
  let daysToAdd = dayOfWeek - currentDay;
  if (daysToAdd <= 0) daysToAdd += 7; // always next week if today or past
  result.setDate(result.getDate() + daysToAdd);
  return result;
}

function buildCSTDate(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number
): Date {
  // Build date in CST (UTC-6), return as UTC
  const utcHours = hours - CST_OFFSET_HOURS; // subtract negative offset = add 6
  return new Date(Date.UTC(year, month, day, utcHours, minutes, 0));
}

/**
 * Parse Spanish natural language date/time into a UTC Date.
 * All times are interpreted as CST (UTC-6).
 *
 * Supported formats:
 * - "2026-03-28 10:00" → exact ISO-ish
 * - "hoy 18:00" → today at 18:00 CST
 * - "manana 10:00" or "mañana 10:00" → tomorrow at 10:00 CST
 * - "viernes 14:00" → next Friday at 14:00 CST
 * - "viernes 2pm" → next Friday at 14:00 CST
 * - "10:00" → today if in future, tomorrow if past
 *
 * Returns null if input cannot be parsed.
 */
export function parseSpanishDate(input: string): Date | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text) return null;

  const now = new Date();
  // Current time in CST for comparison
  const nowCST = new Date(now.getTime() + CST_OFFSET_HOURS * 3600000);

  // Pattern 1: ISO-like "2026-03-28 10:00"
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(.+)$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1]);
    const month = parseInt(isoMatch[2]) - 1;
    const day = parseInt(isoMatch[3]);
    const time = parseTime(isoMatch[4]);
    if (!time) return null;
    const result = buildCSTDate(year, month, day, time.hours, time.minutes);
    return result > now ? result : null; // reject past dates
  }

  // Pattern 2: "hoy <time>"
  if (text.startsWith('hoy')) {
    const timePart = text.replace(/^hoy\s*/, '').trim();
    const time = parseTime(timePart || '09:00');
    if (!time) return null;
    const result = buildCSTDate(
      nowCST.getFullYear(),
      nowCST.getMonth(),
      nowCST.getDate(),
      time.hours,
      time.minutes
    );
    return result > now ? result : null;
  }

  // Pattern 3: "manana/mañana <time>"
  if (text.startsWith('manana') || text.startsWith('mañana')) {
    const timePart = text.replace(/^(manana|mañana)\s*/, '').trim();
    const time = parseTime(timePart || '09:00');
    if (!time) return null;
    const tomorrow = new Date(nowCST);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return buildCSTDate(
      tomorrow.getFullYear(),
      tomorrow.getMonth(),
      tomorrow.getDate(),
      time.hours,
      time.minutes
    );
  }

  // Pattern 4: Day name + time ("viernes 14:00", "lunes 9am")
  for (const [dayName, dayNum] of Object.entries(DAY_MAP)) {
    if (text.startsWith(dayName)) {
      const timePart = text.replace(new RegExp(`^${dayName}\\s*`), '').trim();
      const time = parseTime(timePart || '09:00');
      if (!time) return null;
      const targetDate = getNextDayOfWeek(dayNum, nowCST);
      return buildCSTDate(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate(),
        time.hours,
        time.minutes
      );
    }
  }

  // Pattern 5: Time only ("10:00", "2pm")
  const time = parseTime(text);
  if (time) {
    // Today if in future, tomorrow if past
    let result = buildCSTDate(
      nowCST.getFullYear(),
      nowCST.getMonth(),
      nowCST.getDate(),
      time.hours,
      time.minutes
    );
    if (result <= now) {
      // Tomorrow
      const tomorrow = new Date(nowCST);
      tomorrow.setDate(tomorrow.getDate() + 1);
      result = buildCSTDate(
        tomorrow.getFullYear(),
        tomorrow.getMonth(),
        tomorrow.getDate(),
        time.hours,
        time.minutes
      );
    }
    return result;
  }

  return null;
}
