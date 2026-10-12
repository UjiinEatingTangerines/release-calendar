import { z } from 'zod';

// Shared schemas also run under the browser's CSP, which forbids dynamic code generation.
z.config({ jitless: true });

export const dateSchema = z.iso.date().brand<'LocalDate'>();
export type LocalDate = z.infer<typeof dateSchema>;
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const timezoneSchema = z.string().refine((zone) => {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; }
  catch (error) { if (error instanceof RangeError) return false; throw error; }
}, 'Invalid IANA timezone');

export function dateInZone(instant: Date, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return dateSchema.parse(`${value('year')}-${value('month')}-${value('day')}`);
}
export function addDays(date: LocalDate, amount: number): LocalDate {
  const instant = new Date(`${date}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + amount);
  return dateSchema.parse(instant.toISOString().slice(0, 10));
}
export function weekday(date: LocalDate): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}
export function offsetDate(date: LocalDate, rule: { readonly days: number; readonly basis: 'calendar' | 'weekdays' }): LocalDate {
  let result = date;
  let remaining = Math.abs(rule.days);
  while (remaining > 0) {
    result = addDays(result, Math.sign(rule.days));
    if (rule.basis === 'calendar' || weekday(result) < 5) remaining--;
  }
  return result;
}
export function monthDays(input: string): readonly LocalDate[] {
  const month = monthSchema.parse(input);
  const first = dateSchema.parse(`${month}-01`);
  let last = first;
  while (addDays(last, 1).startsWith(month)) last = addDays(last, 1);
  const end = addDays(last, 6 - weekday(last));
  const days: LocalDate[] = [];
  for (let date = addDays(first, -weekday(first)); date <= end; date = addDays(date, 1)) days.push(date);
  return days;
}
