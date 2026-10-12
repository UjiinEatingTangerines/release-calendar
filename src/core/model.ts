import { z } from 'zod';
import { dateSchema } from './dates.js';

export const releaseIdSchema = z.string().min(1).brand<'ReleaseId'>();
export const issueIdSchema = z.string().min(1).brand<'IssueId'>();
export const webUrlSchema = z.url().refine((value) => new URL(value).protocol === 'https:', 'HTTPS links only');
export const releaseSchema = z.object({
  id: releaseIdSchema, versionId: z.string(), projectId: z.string(), name: z.string(),
  startDate: dateSchema.nullable(), releaseDate: dateSchema.nullable(),
  released: z.boolean(), archived: z.boolean(), url: webUrlSchema,
}).readonly();
export const ticketSchema = z.object({
  id: issueIdSchema, key: z.string(), title: z.string(), status: z.string(), done: z.boolean(),
  assignee: z.string().nullable(), startDate: dateSchema.nullable(), dueDate: dateSchema.nullable(),
  dateSources: z.array(z.string()), releaseIds: z.array(releaseIdSchema), url: webUrlSchema,
}).readonly();
export const pullSchema = z.object({
  id: z.string(), repositoryId: z.string(), repository: z.string(), number: z.number(),
  title: z.string(), url: webUrlSchema, state: z.string(), mergedAt: z.string().nullable(),
  headSha: z.string(), ticketIds: z.array(issueIdSchema), evidence: z.array(z.string()),
  commits: z.array(z.object({ sha: z.string(), url: webUrlSchema })),
  checks: z.array(z.object({ id: z.number(), name: z.string(), status: z.string(), conclusion: z.string().nullable(), url: webUrlSchema.nullable() })),
  commitStatuses: z.array(z.object({ context: z.string(), state: z.string(), url: webUrlSchema.nullable() })),
}).readonly();
export const snapshotSchema = z.object({
  observedAt: z.iso.datetime(), releases: z.array(releaseSchema), tickets: z.array(ticketSchema), pulls: z.array(pullSchema),
  githubObservedAt: z.iso.datetime().nullable(),
}).readonly();
export const problemSchema = z.object({ provider: z.enum(['jira', 'github', 'local']), code: z.string() }).readonly();
export const stateSchema = z.object({
  schemaVersion: z.literal(1), configHash: z.string(), current: snapshotSchema.nullable(),
  history: z.array(snapshotSchema), firstObservedAt: z.iso.datetime().nullable(),
  lastAttemptAt: z.iso.datetime().nullable(), problems: z.array(problemSchema),
}).readonly();
export type Release = z.infer<typeof releaseSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type Pull = z.infer<typeof pullSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type State = z.infer<typeof stateSchema>;
export type Problem = z.infer<typeof problemSchema>;
export class AppError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'AppError'; }
}
