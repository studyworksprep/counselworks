import { z } from "zod";

/** Date-only inputs retain their calendar date; timed due_at values remain instants. */
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");
export function offsetDate(value: string, days: number) {
  const date = new Date(`${dateOnly.parse(value)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

import { firmTodayIso, parseIsoDate } from "./recurrence";
import { zonedWallClockToUtcMs } from "../booking/slots";
export function calendarDayBounds(nowMs:number,timezone:string) {
  const today=firmTodayIso(nowMs,timezone);
  const start=zonedWallClockToUtcMs(parseIsoDate(today),0,timezone);
  const end=zonedWallClockToUtcMs(parseIsoDate(offsetDate(today,1)),0,timezone);
  return {today,start:new Date(start).toISOString(),end:new Date(end).toISOString()};
}

/** Today plus the following six firm-local calendar days, with an exclusive
 * midnight boundary. DST weeks need not contain exactly 168 hours. */
export function workflowWeekBounds(nowMs: number, timezone: string) {
  const bounds = calendarDayBounds(nowMs, timezone);
  const end = zonedWallClockToUtcMs(parseIsoDate(offsetDate(bounds.today, 7)), 0, timezone);
  return { start: bounds.start, end: new Date(end).toISOString() };
}
