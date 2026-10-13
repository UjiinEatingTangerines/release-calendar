import ky from 'ky';
import { z } from 'zod';
import { AppError } from '../core/model.js';
import { mcpOrigin, mcpRead } from './mcp.js';
import type { Provider, Client, Grant } from './model.js';
const tokenSchema = z.object({ access_token: z.string().min(1), token_type: z.string().transform(v => v.toLowerCase()).pipe(z.literal('bearer')).optional(), expires_in: z.number().positive().optional(), refresh_token: z.string().min(1).optional() });
const tokenURLs = { jira: 'https://auth.atlassian.com/oauth/token', github: 'https://github.com/login/oauth/access_token' } as const;
export class OAuthTransport {
  private readonly http;
  constructor(private readonly fetcher?: typeof globalThis.fetch) { this.http = ky.create({ timeout: 15000, retry: 0, redirect: 'error', ...(fetcher ? { fetch: fetcher } : {}) }); }
  async registerJira(callback: string): Promise<Client> {
    try {
      const value = await this.http.post(`${mcpOrigin}/v1/register`, { json: { client_name: 'Release Calendar', redirect_uris: [callback], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' } }).json();
      const client = z.object({ client_id: z.string().min(1), client_secret: z.string().optional() }).parse(value);
      return { clientId: client.client_id, clientSecret: client.client_secret ?? '', kind: 'mcp' };
    } catch { throw new AppError('OAUTH_REGISTRATION_FAILED'); }
  }
  async mcp(token: string, name: string, args: Record<string, unknown>) { return mcpRead(token, name, args, this.fetcher); }
  async token(provider: Provider, client: Client, values: Readonly<Record<string, string>>) {
    try {
      // Public-client tokens stay bound to the MCP resource; REST credentials use their original provider endpoints.
      const mcp = provider === 'jira' && client.kind === 'mcp';
      const response = await this.http.post(mcp ? `${mcpOrigin}/v1/token` : tokenURLs[provider], {
        ...(mcp ? { body: new URLSearchParams({ client_id: client.clientId, resource: `${mcpOrigin}/v2/mcp`, ...values }) } : { json: { client_id: client.clientId, client_secret: client.clientSecret, ...values } }),
        headers: { Accept: 'application/json' },
      }).json<unknown>();
      const token = tokenSchema.safeParse(response);
      if (!token.success || (provider === 'jira' && client.kind !== 'mcp' && !token.data.expires_in) || (provider === 'github' && !token.data.token_type)) throw new AppError('OAUTH_REAUTHORIZE');
      return { accessToken: token.data.access_token, ...(token.data.refresh_token ? { refreshToken: token.data.refresh_token } : {}), ...(token.data.expires_in ? { expiresAt: Date.now() + token.data.expires_in * 1000 } : {}) };
    } catch (error) { if (error instanceof AppError) throw error; if (error instanceof Error) throw new AppError('OAUTH_TOKEN_FAILED'); throw error; }
  }
  async get<T>(provider: Provider, path: string, token: string, schema: z.ZodType<T>) {
    const allowed = provider === 'jira'
      ? [/^\/oauth\/token\/accessible-resources$/, /^\/ex\/jira\/[0-9a-f-]+\/rest\/api\/3\/project\/search$/]
      : [/^\/user\/installations$/, /^\/user\/installations\/\d+\/repositories$/];
    if (!allowed.some(rule => rule.test(path.split('?')[0] ?? ''))) throw new AppError('READ_ENDPOINT_NOT_ALLOWED');
    try { return schema.parse(await this.http.get(`${provider === 'jira' ? 'https://api.atlassian.com' : 'https://api.github.com'}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }).json<unknown>()); }
    catch (error) { if (error instanceof Error) throw new AppError('OAUTH_DISCOVERY_FAILED'); throw error; }
  }
}
export function expired(grant: Grant) { return grant.expiresAt !== undefined && grant.expiresAt <= Date.now() + 60000; }
