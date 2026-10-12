import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { collectJira } from '../src/connectors/jira.js';
import { collectGithub } from '../src/connectors/github.js';
import { demoProject, demoState } from '../src/demo.js';
import { wire, jiraResponse } from './wire.js';

describe('Read-only wire contracts', () => {
  it('collects all version and issue pages with stable IDs rather than names', async () => {
    // Given two pages with identical version names and mixed archive/release flags.
    const http = wire('jira',jiraResponse);
    // When collecting the full project.
    const result = await collectJira(http.reader,demoProject);
    // Then no historical status is excluded and every call is GET.
    expect(result.releases.map((r) => [r.id,r.released,r.archived])).toEqual([
      ['jira:https://fictional-orbit.atlassian.net:100:1',true,true], ['jira:https://fictional-orbit.atlassian.net:100:2',false,false],
    ]);
    expect(result.tickets).toHaveLength(2); expect(result.tickets[1]?.dueDate).toBeNull();
    expect(http.calls.map((c) => c.method)).toEqual(['GET','GET','GET','GET','GET']);
  });
  it('retries rate limits without changing HTTP method', async () => {
    // Given one throttled response followed by success.
    let count = 0; const http = wire('jira',() => ++count === 1 ? new Response('',{ status:429,headers:{ 'Retry-After':'0' } }) : Response.json({ id:'100' }));
    // When invoking a permitted read.
    const result = await http.reader.get('/rest/api/3/project/DEMO',z.object({ id:z.string() }));
    // Then retry remains GET and data is returned.
    expect(result.id).toBe('100'); expect(http.calls.map((c) => c.method)).toEqual(['GET','GET']);
  });
  it('surfaces authentication failure without leaking response body or token', async () => {
    const http = wire('jira',() => new Response('SECRET_BODY',{ status:401 }));
    await expect(collectJira(http.reader,demoProject)).rejects.toMatchObject({ code:'HTTP_401',message:'HTTP_401' });
    expect(http.calls).toHaveLength(1);
  });
  it('refuses external and mutation-oriented paths before transport', async () => {
    const http = wire('github',() => Response.json({}));
    await expect(http.reader.get('https://example.com/steal',z.object({}))).rejects.toMatchObject({ code:'READ_ENDPOINT_NOT_ALLOWED' });
    await expect(http.reader.get('/repos/fictional-orbit/web/issues/1/comments',z.object({}))).rejects.toMatchObject({ code:'READ_ENDPOINT_NOT_ALLOWED' });
    expect(http.calls).toEqual([]);
  });
  it('rejects incomplete pagination instead of treating remaining data as deleted', async () => {
    const http = wire('jira',(url) => url.pathname.endsWith('/version') ? Response.json({ startAt:0,isLast:false,values:[] }) : jiraResponse(url));
    await expect(collectJira(http.reader,demoProject)).rejects.toMatchObject({ code:'PAGINATION_INCOMPLETE' });
  });
  it('converts a mapped timestamp to project timezone without shifting date-only fields', async () => {
    const http = wire('jira',async (url) => {
      const response = jiraResponse(url);
      if (!url.pathname.endsWith('/search/jql')) return response;
      const body = z.object({ isLast:z.boolean(), nextPageToken:z.string().optional(), issues:z.array(z.object({ id:z.string(),key:z.string(),fields:z.record(z.string(),z.unknown()) })) }).parse(await response.json());
      return Response.json({ ...body,issues:body.issues.map((issue) => ({ ...issue,fields:{ ...issue.fields,customfield_10015:'2027-03-10T00:30:00Z',duedate:'2027-03-10' } })) });
    });
    const project = { ...demoProject,timezone:'America/Los_Angeles',ticketDates:{ start:{ field:'customfield_10015',type:'datetime' as const },due:{ field:'duedate',type:'date' as const } } };
    const result = await collectJira(http.reader,project);
    expect(result.tickets[0]).toMatchObject({ startDate:'2027-03-09',dueDate:'2027-03-10' });
  });
});
describe('GitHub evidence', () => {
  it('paginates PRs, commits and checks and only links exact issue-key references', async () => {
    // Given 101 PRs with a true reference on page 2 and misleading key prefixes on page 1.
    const pr = (number: number) => ({ node_id:`PR_${number}`,number,title:number === 101 ? 'DEMO-101 sorting' : 'DEMO-1010 unrelated',body:null,
      html_url:`https://example.com/pulls/${number}`,state:'closed',merged_at:number === 101 ? '2027-03-09T00:00:00Z' : null,head:{ ref:'topic',sha:'abcdef' } });
    const http = wire('github',(url) => {
      const page = Number(url.searchParams.get('page') ?? '1');
      if (url.pathname.endsWith('/web')) return Response.json({ id:10 });
      if (url.pathname.endsWith('/pulls')) return Response.json(page === 1 ? Array.from({ length:100 },(_,i) => pr(i+1)) : [pr(101)]);
      if (url.pathname.endsWith('/pulls/101')) return Response.json(pr(101));
      if (url.pathname.endsWith('/commits')) return Response.json(page === 1 ? Array.from({ length:100 },(_,i) => ({ sha:`${i}`,html_url:`https://example.com/commit/${i}` })) : [{ sha:'last',html_url:'https://example.com/commit/last' }]);
      if (url.pathname.endsWith('/check-runs')) return Response.json({ total_count:101,check_runs:page === 1 ? Array.from({ length:100 },(_,i) => ({ id:i,name:`check-${i}`,status:'completed',conclusion:'success',html_url:null })) : [{ id:100,name:'pending',status:'queued',conclusion:null,html_url:null }] });
      if (url.pathname.endsWith('/status')) return Response.json({ total_count:1,statuses:[{ context:'legacy',state:'failure',target_url:null }] });
      return new Response('',{ status:404 });
    });
    const tickets = demoState(new Date('2027-03-10T03:00:00Z')).current?.tickets ?? [];
    // When fetching repository evidence.
    const result = await collectGithub(http.reader,{ ...demoProject,github:{ ...demoProject.github,repositories:['fictional-orbit/web'] } },tickets);
    // Then linkage, independent CI and merger observations survive every page.
    expect(result).toHaveLength(1); expect(result[0]).toMatchObject({ id:'PR_101',repositoryId:'10',ticketIds:['demo-101'],mergedAt:'2027-03-09T00:00:00Z' });
    expect(result[0]?.commits).toHaveLength(101); expect(result[0]?.checks).toHaveLength(101);
    expect(result[0]?.commitStatuses[0]?.state).toBe('failure'); expect(http.calls.every((c) => c.method === 'GET')).toBe(true);
  });
});
