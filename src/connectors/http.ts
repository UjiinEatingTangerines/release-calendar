import ky, { HTTPError, TimeoutError } from 'ky';
import { z } from 'zod';
import { AppError } from '../core/model.js';

export interface Reader { get<T>(path: string, schema: z.ZodType<T>): Promise<T> }
const jiraPaths = [/^\/rest\/api\/3\/project\/[A-Z0-9_]+$/, /^\/rest\/api\/3\/project\/\d+\/version$/, /^\/rest\/api\/3\/search\/jql$/];
const githubPaths = [/^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/pulls(?:\/\d+(?:\/commits)?)?|\/commits\/[A-Za-z0-9]+\/(?:check-runs|status))?$/];
export class HttpReader implements Reader {
  private readonly client;
  constructor(private readonly connection: { readonly base: string; readonly authorization: string; readonly provider: 'jira' | 'github'; readonly signal?: AbortSignal; readonly fetch?: typeof globalThis.fetch }) {
    this.client = ky.create({ headers: { Authorization: connection.authorization, Accept: 'application/json' },
      timeout: 15000, retry: { limit: 2, methods: ['get'], statusCodes: [429, 502, 503, 504], maxRetryAfter: 10000 },
      redirect: 'error', ...(connection.signal ? { signal: connection.signal } : {}), ...(connection.fetch ? { fetch: connection.fetch } : {}) });
  }
  async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const pathname = path.split('?')[0] ?? '';
    const allowed = this.connection.provider === 'jira' ? jiraPaths : githubPaths;
    if (!allowed.some((pattern) => pattern.test(pathname))) throw new AppError('READ_ENDPOINT_NOT_ALLOWED');
    try {
      const value: unknown = await this.client.get(`${this.connection.base}${path}`).json();
      return schema.parse(value);
    } catch (error) {
      if (error instanceof HTTPError) throw new AppError(`HTTP_${error.response.status}`);
      if (error instanceof TimeoutError) throw new AppError('TIMEOUT');
      if (error instanceof z.ZodError || error instanceof SyntaxError) throw new AppError('PROVIDER_RESPONSE_INVALID');
      if (error instanceof AppError) throw error;
      if (error instanceof Error) throw new AppError('NETWORK_ERROR');
      throw error;
    }
  }
}
