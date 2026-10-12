import { z } from 'zod';
import { timezoneSchema } from './dates.js';

const envName = z.string().regex(/^[A-Z][A-Z0-9_]*$/);
const offset = z.object({ days: z.number().int().min(-366).max(0), basis: z.enum(['calendar', 'weekdays']) });
const mapping = z.object({ field: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/), type: z.enum(['date', 'datetime']) });
export const projectSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/), name: z.string().min(1), timezone: timezoneSchema,
  jira: z.object({
    site: z.url().refine((value) => /^https:\/\/[a-z0-9-]+\.atlassian\.net\/?$/.test(value)),
    projectKey: z.string().regex(/^[A-Z][A-Z0-9_]*$/), emailEnv: envName, tokenEnv: envName,
    cloudId: z.uuid().optional(),
  }),
  github: z.object({ repositories: z.array(z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)), tokenEnv: envName }),
  ticketDates: z.object({ start: mapping.optional(), due: mapping.optional() }).default({}),
  releaseNameIncludes: z.string().optional(),
  rules: z.object({ featureFreeze: offset.optional(), qa: offset.optional() }).default({}),
  guidance: z.object({ development: z.string(), frozen: z.string(), qa: z.string(), release: z.string() }).default({
    development: '포함 티켓과 개별 기한을 확인하고 작업하세요.', frozen: '새 기능은 다음 릴리스 대상으로 검토하고 수정 범위를 확인하세요.',
    qa: '신규 기능은 다음 릴리스 대상으로 검토하고 QA 확인과 결함 수정을 우선하세요.', release: '원본에서 릴리스 상태와 배포 증거를 확인하세요.',
  }),
  staleAfterHours: z.number().positive().max(8760).default(24),
}).superRefine((project, ctx) => {
  const { featureFreeze, qa } = project.rules;
  if (featureFreeze && qa && featureFreeze.basis === qa.basis && featureFreeze.days > qa.days)
    ctx.addIssue({ code: 'custom', message: 'Feature freeze must precede QA' });
});
export const configSchema = z.object({ projects: z.array(projectSchema).min(1) }).superRefine((value, ctx) => {
  if (new Set(value.projects.map((p) => p.id)).size !== value.projects.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate project aliases' });
});
export type Project = z.infer<typeof projectSchema>;
export type Config = z.infer<typeof configSchema>;
