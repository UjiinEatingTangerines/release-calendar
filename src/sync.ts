import type { Project } from './config.js';
import { secret } from './config.js';
import { HttpReader, type Reader } from './connectors/http.js';
import { collectJira } from './connectors/jira.js';
import { collectGithub } from './connectors/github.js';
import { AppError, type Problem, type State } from './core/model.js';
import { recordSnapshot, type Store } from './storage.js';

export type Connectors = { readonly jira: () => Reader; readonly github: () => Reader };
export function connectors(project: Project): Connectors {
  return {
    jira: () => new HttpReader({ base: project.jira.cloudId ? `https://api.atlassian.com/ex/jira/${project.jira.cloudId}` : project.jira.site.replace(/\/$/, ''),
      authorization: `Basic ${Buffer.from(`${secret(project.jira.emailEnv)}:${secret(project.jira.tokenEnv)}`).toString('base64')}`, provider: 'jira' }),
    github: () => new HttpReader({ base: 'https://api.github.com', authorization: `Bearer ${secret(project.github.tokenEnv)}`, provider: 'github' }),
  };
}
export async function syncProject(project: Project, store: Store, input: { readonly clients: Connectors; readonly now: Date }): Promise<State> {
  return store.update(async (previous) => {
    const observedAt = input.now.toISOString();
    const problems: Problem[] = [];
    let jira;
    try { jira = await collectJira(input.clients.jira(), project); }
    catch (error) {
      if (!(error instanceof Error)) throw error;
      return { ...previous, lastAttemptAt: observedAt, problems: [{ provider: 'jira', code: error instanceof AppError ? error.code : 'RESPONSE_INVALID' }] };
    }
    let pulls = previous.current?.pulls ?? [];
    let githubObservedAt = previous.current?.githubObservedAt ?? null;
    try {
      pulls = project.github.repositories.length ? await collectGithub(input.clients.github(), project, jira.tickets) : [];
      githubObservedAt = observedAt;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      problems.push({ provider: 'github', code: error instanceof AppError ? error.code : 'RESPONSE_INVALID' });
    }
    return { ...recordSnapshot(previous, { ...jira, pulls, observedAt, githubObservedAt }), lastAttemptAt: observedAt, problems };
  });
}
