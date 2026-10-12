import ky from 'ky';
import { z } from 'zod';
import { dateSchema } from '../src/core/dates.js';
import { releaseSchema, ticketSchema, pullSchema } from '../src/core/model.js';

export const eventSchema = z.object({ id: z.string(), releaseId: z.string(), title: z.string(), kind: z.enum(['development', 'freeze', 'qa', 'release', 'ticket']),
  start: dateSchema, end: dateSchema, source: z.enum(['jira','rule']), sourceDetail: z.string(), url: z.string() });
const statusSchema = z.object({ project: z.string(), projectName: z.string(), timezone: z.string(), today: dateSchema,
  dataAsOf: z.string().nullable(), githubAsOf: z.string().nullable(), firstObservedAt: z.string().nullable(),
  lastAttemptAt: z.string().nullable(), warnings: z.array(z.string()), stale: z.boolean(), registeredFuturePlans: z.number() });
const calendarSchema = statusSchema.extend({ month: z.string(), days: z.array(dateSchema), events: z.array(eventSchema), releases: z.array(releaseSchema), undated: z.array(releaseSchema) });
const detailSchema = statusSchema.extend({ release: releaseSchema, tickets: z.array(ticketSchema), unscheduledTickets: z.array(ticketSchema),
  pulls: z.array(pullSchema), events: z.array(eventSchema), history: z.array(z.object({ observedAt: z.string(), release: releaseSchema.nullable(), ticketIds: z.array(z.string()) })) });
const projectListSchema = z.object({ mode: z.enum(['demo','live']), projects: z.array(z.object({ id: z.string(), name: z.string(), timezone: z.string() })) });
const client = ky.create({ timeout: 30000, retry: 0 });
async function read<T>(path: string, schema: z.ZodType<T>) { return schema.parse(await client.get(path).json<unknown>()); }
export const api = {
  projects: () => read('/api/projects', projectListSchema),
  calendar: (project: string, month: string) => read(`/api/calendar?${new URLSearchParams({ project, month })}`, calendarSchema),
  detail: (project: string, id: string) => read(`/api/release?${new URLSearchParams({ project, id })}`, detailSchema),
  refresh: async (project: string) => statusSchema.parse(await client.post(`/api/refresh?${new URLSearchParams({ project })}`, { headers: { 'X-Release-Calendar': 'local' } }).json<unknown>()),
};
export type CalendarView = z.infer<typeof calendarSchema>;
export type DetailView = z.infer<typeof detailSchema>;
export type ProjectsView = z.infer<typeof projectListSchema>;
