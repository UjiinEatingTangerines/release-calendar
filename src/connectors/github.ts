import { z } from 'zod';
import type { Project } from '../config.js';
import { AppError, type Pull, type Ticket, webUrlSchema } from '../core/model.js';
import type { Reader } from './http.js';

const prSchema = z.object({ node_id: z.string(), number: z.number(), title: z.string(), body: z.string().nullable(),
  html_url: webUrlSchema, state: z.string(), merged_at: z.string().nullable(), head: z.object({ ref: z.string(), sha: z.string().regex(/^[a-f0-9]+$/) }) });
const commitSchema = z.object({ sha: z.string(), html_url: webUrlSchema });
const checkSchema = z.object({ id: z.number(), name: z.string(), status: z.string(), conclusion: z.string().nullable(), html_url: webUrlSchema.nullable() });
const statusSchema = z.object({ context: z.string(), state: z.string(), target_url: webUrlSchema.nullable() });

async function allPages<T>(reader: Reader, path: string, schema: z.ZodType<T>): Promise<T[]> {
  const values: T[] = [];
  const seen = new Set<string>();
  for (let page = 1; ; page++) {
    const items = await reader.get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, z.array(schema));
    const fingerprint = JSON.stringify(items);
    if (items.length && seen.has(fingerprint)) throw new AppError('PAGINATION_LOOP');
    seen.add(fingerprint); values.push(...items);
    if (items.length < 100) return values;
  }
}
export async function collectGithub(reader: Reader, project: Project, tickets: readonly Ticket[]): Promise<Pull[]> {
  const result: Pull[] = [];
  for (const repository of project.github.repositories) {
    const path = `/repos/${repository}`;
    const repo = await reader.get(path, z.object({ id: z.number() }));
    const prs = await allPages(reader, `${path}/pulls?state=all&sort=created&direction=asc`, prSchema);
    for (const pr of prs) {
      const evidence: string[] = [];
      const linked = tickets.filter((ticket) => {
        const escaped = ticket.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`);
        const fields = [{ field: 'title', text: pr.title }, { field: 'body', text: pr.body ?? '' }, { field: 'branch', text: pr.head.ref }];
        const matches = fields.filter((f) => pattern.test(f.text));
        evidence.push(...matches.map((m) => `Exact issue key ${ticket.key} in PR ${m.field}; explicit reference, not semantic similarity`));
        return matches.length > 0;
      });
      if (!linked.length) continue;
      const detail = await reader.get(`${path}/pulls/${pr.number}`, prSchema);
      const commits = await allPages(reader, `${path}/pulls/${pr.number}/commits`, commitSchema);
      const checks: Pull['checks'] = [];
      for (let page = 1; ; page++) {
        const response = await reader.get(`${path}/commits/${detail.head.sha}/check-runs?filter=latest&per_page=100&page=${page}`,
          z.object({ total_count: z.number(), check_runs: z.array(checkSchema) }));
        if (response.check_runs.some((c) => checks.some((existing) => existing.id === c.id))) throw new AppError('PAGINATION_LOOP');
        checks.push(...response.check_runs.map((c) => ({ id: c.id, name: c.name, status: c.status, conclusion: c.conclusion, url: c.html_url })));
        if (checks.length >= response.total_count) break;
        if (!response.check_runs.length) throw new AppError('PAGINATION_INCOMPLETE');
      }
      const statuses: Pull['commitStatuses'] = [];
      for (let page = 1; ; page++) {
        const response = await reader.get(`${path}/commits/${detail.head.sha}/status?per_page=100&page=${page}`,
          z.object({ total_count: z.number(), statuses: z.array(statusSchema) }));
        if (response.statuses.some((s) => statuses.some((existing) => existing.context === s.context))) throw new AppError('PAGINATION_LOOP');
        statuses.push(...response.statuses.map((s) => ({ context: s.context, state: s.state, url: s.target_url })));
        if (statuses.length >= response.total_count) break;
        if (!response.statuses.length) throw new AppError('PAGINATION_INCOMPLETE');
      }
      result.push({ id: detail.node_id, repositoryId: String(repo.id), repository, number: detail.number, title: detail.title,
        url: detail.html_url, state: detail.state, mergedAt: detail.merged_at, headSha: detail.head.sha,
        ticketIds: linked.map((t) => t.id), evidence, commits: commits.map((c) => ({ sha: c.sha, url: c.html_url })),
        checks: checks.sort((a,b) => a.id - b.id), commitStatuses: statuses.sort((a,b) => a.context.localeCompare(b.context)),
      });
    }
  }
  return result.sort((a,b) => a.id.localeCompare(b.id));
}
