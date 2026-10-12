import { HttpReader } from '../src/connectors/http.js';

export function wire(provider: 'jira' | 'github', respond: (url: URL) => Response | Promise<Response>) {
  const calls: { method: string; path: string }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input,init); const url = new URL(request.url);
    calls.push({ method:request.method, path:`${url.pathname}${url.search}` });
    return respond(url);
  };
  return { calls, reader:new HttpReader({ base:provider === 'jira' ? 'https://fictional-orbit.atlassian.net' : 'https://api.github.com', authorization:'Bearer FICTIONAL_TEST_CREDENTIAL', provider, fetch:fetcher }) };
}
export function jiraResponse(url: URL) {
  if (url.pathname.endsWith('/project/DEMO')) return Response.json({ id:'100' });
  if (url.pathname.endsWith('/version')) {
    const second = url.searchParams.get('startAt') === '1';
    return Response.json({ startAt:second ? 1 : 0, isLast:second, values:[{ id:second ? '2' : '1', name:'Same visible name',
      released:!second, archived:!second, startDate:'2027-03-01', releaseDate:second ? '2027-04-01' : '2027-03-14' }] });
  }
  if (url.pathname.endsWith('/search/jql')) {
    const second = url.searchParams.get('nextPageToken') === 'second';
    return Response.json({ isLast:second, ...(second ? {} : { nextPageToken:'second' }), issues:[{
      id:second ? '102' : '101', key:second ? 'DEMO-102' : 'DEMO-101', fields:{ summary:'Fictional issue',
        status:{ name:'In progress',statusCategory:{ key:'indeterminate' } }, assignee:null, fixVersions:[{ id:second ? '2' : '1' }],
        customfield_10015:second ? null : '2027-03-01', duedate:null },
    }] });
  }
  return new Response('',{ status:404 });
}
