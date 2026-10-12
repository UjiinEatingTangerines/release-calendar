import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/storage.js';
import { syncProject } from '../src/sync.js';
import { demoProject, demoState } from '../src/demo.js';
import { wire, jiraResponse } from './wire.js';

describe('Atomic observations and partial failures', () => {
  let directory = '';
  const project = { ...demoProject,github:{ ...demoProject.github,repositories:[] } };
  const clients = () => ({ jira:() => wire('jira',jiraResponse).reader,github:() => wire('github',() => Response.json([])).reader });
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(),'release-calendar-test-')); });
  afterEach(async () => { await rm(directory,{ recursive:true,force:true }); });
  it('deduplicates unchanged reruns and retains changed membership and dates', async () => {
    // Given a successful collection and an identical rerun.
    const store = new Store(directory,project);
    await syncProject(project,store,{ clients:clients(),now:new Date('2027-03-10T00:00:00Z') });
    const repeat = await syncProject(project,store,{ clients:clients(),now:new Date('2027-03-11T00:00:00Z') });
    expect(repeat.history).toHaveLength(1);
    // When the provider changes a version date.
    const changed = wire('jira',async (url) => {
      const response = jiraResponse(url); const text = await response.text();
      return new Response(text.replaceAll('2027-03-14','2027-03-15'),{ headers:{ 'Content-Type':'application/json' } });
    });
    const result = await syncProject(project,store,{ clients:{ ...clients(),jira:() => changed.reader },now:new Date('2027-03-12T00:00:00Z') });
    // Then both actual observations exist, and historical state was not overwritten.
    expect(result.history.map((s) => s.releases[0]?.releaseDate)).toEqual(['2027-03-14','2027-03-15']);
    expect(result.firstObservedAt).toBe('2027-03-10T00:00:00.000Z');
    expect((await stat(store.path)).mode & 0o777).toBe(0o600);
  });
  it('retains all previous data when a later Jira page fails', async () => {
    const store = new Store(directory,project);
    const original = await syncProject(project,store,{ clients:clients(),now:new Date('2027-03-10T00:00:00Z') });
    const broken = wire('jira',(url) => url.searchParams.get('nextPageToken') ? new Response('',{ status:401 }) : jiraResponse(url));
    const result = await syncProject(project,store,{ clients:{ ...clients(),jira:() => broken.reader },now:new Date('2027-03-11T00:00:00Z') });
    expect(result.current).toEqual(original.current); expect(result.history).toEqual(original.history);
    expect(result.problems).toEqual([{ provider:'jira',code:'HTTP_401' }]);
  });
  it('records a GitHub partial failure separately from successful Jira refresh', async () => {
    const store = new Store(directory,demoProject);
    const failing = wire('github',() => new Response('',{ status:403 }));
    const result = await syncProject(demoProject,store,{ clients:{ ...clients(),github:() => failing.reader },now:new Date('2027-03-10T00:00:00Z') });
    expect(result.current?.releases).toHaveLength(2); expect(result.current?.githubObservedAt).toBeNull();
    expect(result.problems).toEqual([{ provider:'github',code:'HTTP_403' }]);
  });
  it('keeps configurations in separate cache namespaces', async () => {
    const first = new Store(directory,project), second = new Store(directory,{ ...project,timezone:'UTC' });
    await syncProject(project,first,{ clients:clients(),now:new Date('2027-03-10T00:00:00Z') });
    expect((await second.read()).current).toBeNull();
  });
  it('retains previous GitHub evidence when a refresh fails', async () => {
    const store = new Store(directory,demoProject);
    await store.update(async (previous) => ({ ...demoState(new Date('2027-03-10T00:00:00Z')),configHash:previous.configHash }));
    const failing = wire('github',() => new Response('',{ status:401 }));
    const result = await syncProject(demoProject,store,{ clients:{ ...clients(),github:() => failing.reader },now:new Date('2027-03-11T00:00:00Z') });
    expect(result.current?.pulls[0]?.id).toBe('fictional-pr-17');
    expect(result.current?.githubObservedAt).toBe('2027-03-10T00:00:00.000Z');
    expect(result.current?.observedAt).toBe('2027-03-11T00:00:00.000Z');
  });
  it('rejects competing writers while a transaction owns the lock', async () => {
    const store = new Store(directory,project);
    let release: () => void = () => { throw new Error('Transaction not started'); };
    const held = new Promise<void>((resolve) => { release = resolve; });
    let signal: () => void = () => { throw new Error('Signal not ready'); };
    const entered = new Promise<void>((resolve) => { signal = resolve; });
    const first = store.update(async (state) => { signal(); await held; return state; });
    await entered;
    try { await expect(store.update(async (state) => state)).rejects.toMatchObject({ code:'SYNC_ALREADY_RUNNING' }); }
    finally { release(); await first; }
  });
  it('preserves changed ticket membership even when version dates are unchanged', async () => {
    const store = new Store(directory,project);
    await syncProject(project,store,{ clients:clients(),now:new Date('2027-03-10T00:00:00Z') });
    const removed = wire('jira',(url) => url.pathname.endsWith('/search/jql') ? Response.json({ isLast:true,issues:[] }) : jiraResponse(url));
    const result = await syncProject(project,store,{ clients:{ ...clients(),jira:() => removed.reader },now:new Date('2027-03-11T00:00:00Z') });
    expect(result.history.map((s) => s.tickets.length)).toEqual([2,0]);
  });
});
