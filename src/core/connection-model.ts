import { z } from 'zod';
import { projectSchema } from './project.js';

export const editableProjectSchema = z.object({
  ...projectSchema.shape,
  jira: projectSchema.shape.jira.omit({ emailEnv: true, tokenEnv: true }),
  github: projectSchema.shape.github.omit({ tokenEnv: true }),
});
export const credentialsInputSchema = z.object({
  jiraEmail: z.email().max(320).optional(), jiraToken: z.string().min(1).max(8192).optional(),
  githubToken: z.string().min(1).max(8192).optional(),
});
export const connectionInputSchema = z.object({ revision: z.string().max(100), originalId: z.string().optional(),
  project: editableProjectSchema, credentials: credentialsInputSchema.default({}) });
export const removalSchema = z.object({ revision: z.string().max(100), id: z.string().min(1) });
export const settingsViewSchema = z.object({ revision: z.string(), csrf: z.string(),
  projects: z.array(z.object({ project: editableProjectSchema, saved: z.object({ jiraEmail: z.boolean(), jiraToken: z.boolean(), githubToken: z.boolean() }) })) });
const check = z.object({ ok: z.boolean(), code: z.string() });
export const probeResultSchema = z.object({ jira: check, github: check });
export type ConnectionInput = z.infer<typeof connectionInputSchema>;
export type SettingsView = z.infer<typeof settingsViewSchema>;
export type EditableProject = z.infer<typeof editableProjectSchema>;
export type ProbeResult = z.infer<typeof probeResultSchema>;
