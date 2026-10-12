import { z } from 'zod';
import type { Project } from '../config.js';
import type { ProbeResult } from '../core/connection-model.js';
import { AppError } from '../core/model.js';
import { connectors, type Connectors } from '../sync.js';

export type Probe = (project: Project, secret: (name: string) => string) => Promise<ProbeResult>;
export async function probeReaders(project: Project, clients: Connectors): Promise<ProbeResult> {
  const run = async (operation: () => Promise<void>) => {
    try { await operation(); return { ok: true, code: 'READ_ACCESS_CONFIRMED' }; }
    catch (error) { if (!(error instanceof Error)) throw error; return { ok: false, code: error instanceof AppError ? error.code : 'PROVIDER_RESPONSE_INVALID' }; }
  };
  const [jira, github] = await Promise.all([
    run(async () => {
      const reader = clients.jira();
      const p = await reader.get(`/rest/api/3/project/${project.jira.projectKey}`, z.object({ id: z.string().regex(/^\d+$/) }));
      await reader.get(`/rest/api/3/project/${p.id}/version?maxResults=1&startAt=0`, z.object({ values: z.array(z.unknown()) }));
      await reader.get(`/rest/api/3/search/jql?${new URLSearchParams({ jql: `project = ${p.id} AND fixVersion IS NOT EMPTY`, maxResults: '1', fields: 'id' })}`, z.object({ issues: z.array(z.unknown()) }));
    }),
    project.github.repositories.length ? run(async () => {
      const reader = clients.github();
      for (const repo of project.github.repositories) {
        await reader.get(`/repos/${repo}`, z.object({ id: z.number() }));
        await reader.get(`/repos/${repo}/pulls?state=all&per_page=1&page=1`, z.array(z.unknown()));
      }
    }) : Promise.resolve({ ok: true, code: 'NOT_CONFIGURED' }),
  ]);
  return { jira, github };
}
export const probeConnections: Probe = (project, secret) => probeReaders(project, connectors(project, secret));
