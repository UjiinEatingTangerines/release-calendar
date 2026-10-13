import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { appInputSchema, providerSchema, selectionSchema } from './model.js';
import { editableProjectSchema } from '../core/connection-model.js';
import { AppError } from '../core/model.js';
import type { Runtime } from '../runtime.js';

export function oauthRoutes(runtime: Runtime) {
  const route = new Hono(), oauth = runtime.oauth;
  route.get('/', async c => c.json(await oauth.view()));
  route.post('/configure', async c => { const input = appInputSchema.parse(await c.req.json()); await oauth.configure(input.provider, input); return c.json(await oauth.view()); });
  route.post('/start', async c => { const { provider, grantId } = z.object({ provider: providerSchema, grantId: z.uuid().optional() }).parse(await c.req.json()); return c.json(await oauth.start(provider, grantId)); });
  route.get('/status', c => c.json(oauth.status(z.uuid().parse(c.req.query('id')))));
  route.post('/cancel', async c => { const { id } = z.object({ id: z.uuid() }).parse(await c.req.json()); oauth.cancel(id); return c.json({ ok: true }); });
  route.post('/forget', async c => { const { id } = z.object({ id: z.uuid() }).parse(await c.req.json()); await oauth.forget(id); return c.json(await oauth.view()); });
  route.get('/sites', async c => c.json(await oauth.sites(z.uuid().parse(c.req.query('grant')))));
  route.get('/projects', async c => c.json(await oauth.projects(z.uuid().parse(c.req.query('grant')), z.uuid().parse(c.req.query('site')))));
  route.get('/repositories', async c => c.json(await oauth.repositories(z.uuid().parse(c.req.query('grant')))));
  route.post('/select', async c => {
    const input = selectionSchema.parse(await c.req.json());
    const site = (await oauth.sites(input.jiraGrant)).find(s => s.id === input.cloudId);
    if (!site || !(await oauth.projects(input.jiraGrant, input.cloudId)).some(p => p.key === input.projectKey)) throw new AppError('OAUTH_SELECTION_INVALID');
    if (input.repositories.length) {
      if (!input.githubGrant) throw new AppError('OAUTH_SELECTION_INVALID');
      const available = await oauth.repositories(input.githubGrant);
      if (input.repositories.some(name => !available.some(r => r.full_name === name))) throw new AppError('OAUTH_SELECTION_INVALID');
    }
    const id = `project-${randomUUID().slice(0, 8)}`;
    await runtime.connections.save({ revision: input.revision, credentials: {}, project: editableProjectSchema.parse({ id, name: input.name, timezone: input.timezone,
      jira: { site: site.url, cloudId: site.id, projectKey: input.projectKey, oauthGrant: input.jiraGrant },
      github: { repositories: input.repositories, ...(input.githubGrant && input.repositories.length ? { oauthGrant: input.githubGrant } : {}) }, ticketDates: { due: { field: 'duedate', type: 'date' } },
    }) });
    return c.json({ id });
  });
  return route;
}
