import { z } from 'zod';
import type { Project } from '../config.js';
import { dateInZone, dateSchema } from '../core/dates.js';
import { AppError, issueIdSchema, releaseIdSchema, type Release, type Ticket } from '../core/model.js';
import type { Reader } from './http.js';

const version = z.object({ id: z.string().regex(/^\d+$/), name: z.string(), released: z.boolean(), archived: z.boolean(), startDate: dateSchema.optional(), releaseDate: dateSchema.optional() });
const versionPage = z.object({ values: z.array(version), isLast: z.boolean(), startAt: z.number(), total: z.number().optional() });
const issue = z.object({ id: z.string(), key: z.string(), fields: z.object({
  summary: z.string(), status: z.object({ name: z.string(), statusCategory: z.object({ key: z.string() }) }),
  assignee: z.object({ displayName: z.string() }).nullable(), fixVersions: z.array(z.object({ id: z.string() })),
}).catchall(z.unknown()) });
const issuePage = z.object({ issues: z.array(issue), isLast: z.boolean(), nextPageToken: z.string().optional() });

export async function collectJira(reader: Reader, project: Project): Promise<{ releases: Release[]; tickets: Ticket[] }> {
  const site = project.jira.site.replace(/\/$/, '');
  const identity = await reader.get(`/rest/api/3/project/${project.jira.projectKey}`, z.object({ id: z.string().regex(/^\d+$/) }));
  const id = (versionId: string) => releaseIdSchema.parse(`jira:${site}:${identity.id}:${versionId}`);
  const releases: Release[] = [];
  let startAt = 0;
  const versionIds = new Set<string>();
  while (true) {
    const page = await reader.get(`/rest/api/3/project/${identity.id}/version?startAt=${startAt}&maxResults=100`, versionPage);
    if (page.startAt !== startAt || (!page.isLast && page.values.length === 0)) throw new AppError('PAGINATION_INCOMPLETE');
    for (const v of page.values) {
      if (versionIds.has(v.id)) throw new AppError('PAGINATION_CHANGED_RETRY');
      versionIds.add(v.id);
      if (project.releaseNameIncludes && !v.name.includes(project.releaseNameIncludes)) continue;
      releases.push({ id: id(v.id), versionId: v.id, projectId: identity.id, name: v.name, startDate: v.startDate ?? null,
        releaseDate: v.releaseDate ?? null, released: v.released, archived: v.archived,
        url: `${site}/plugins/servlet/project-config/${project.jira.projectKey}/versions/${v.id}` });
    }
    if (page.isLast) break;
    startAt += page.values.length;
  }
  const tickets: Ticket[] = [];
  if (!releases.length) return { releases, tickets };
  const versionFilter = project.releaseNameIncludes ? `fixVersion in (${releases.map(r => r.versionId).join(',')})` : 'fixVersion IS NOT EMPTY';
  const tokens = new Set<string>();
  const issueIds = new Set<string>();
  let token: string | undefined;
  const fields = ['summary', 'status', 'assignee', 'fixVersions', project.ticketDates.start?.field, project.ticketDates.due?.field].filter((v) => v !== undefined);
  while (true) {
    const params = new URLSearchParams({ jql: `project = ${identity.id} AND ${versionFilter} ORDER BY id ASC`, maxResults: '100', fields: fields.join(',') });
    if (token) params.set('nextPageToken', token);
    const page = await reader.get(`/rest/api/3/search/jql?${params}`, issuePage);
    for (const item of page.issues) {
      if (issueIds.has(item.id)) throw new AppError('PAGINATION_CHANGED_RETRY');
      issueIds.add(item.id);
      const mapped = (mapping: Project['ticketDates']['start']) => {
        if (!mapping) return null;
        const raw = item.fields[mapping.field];
        if (raw === null || raw === undefined || raw === '') return null;
        if (mapping.type === 'date') return dateSchema.parse(raw);
        const instant = z.string().refine((value) => /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) && Number.isFinite(Date.parse(value))).parse(raw);
        return dateInZone(new Date(instant), project.timezone);
      };
      tickets.push({ id: issueIdSchema.parse(`jira:${site}:${item.id}`), key: item.key, title: item.fields.summary,
        status: item.fields.status.name, done: item.fields.status.statusCategory.key === 'done', assignee: item.fields.assignee?.displayName ?? null,
        startDate: mapped(project.ticketDates.start), dueDate: mapped(project.ticketDates.due),
        dateSources: [project.ticketDates.start?.field, project.ticketDates.due?.field].filter((v) => v !== undefined),
        releaseIds: item.fields.fixVersions.map((v) => id(v.id)), url: `${site}/browse/${encodeURIComponent(item.key)}` });
    }
    if (page.isLast === true) break;
    if (!page.nextPageToken) {
      if (page.isLast === false) throw new AppError('PAGINATION_INCOMPLETE');
      break;
    }
    if (tokens.has(page.nextPageToken)) throw new AppError('PAGINATION_LOOP');
    tokens.add(page.nextPageToken); token = page.nextPageToken;
  }
  return { releases: releases.sort((a,b) => a.id.localeCompare(b.id)), tickets: tickets.sort((a,b) => a.id.localeCompare(b.id)) };
}
