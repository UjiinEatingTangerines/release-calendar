import { execFileSync } from 'node:child_process';

const paths = execFileSync('git',['diff','--cached','--name-only','--diff-filter=ACM','-z'],{ encoding:'utf8' }).split('\0').filter(Boolean);
const secret = /(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-proj-[A-Za-z0-9_-]{20,})/;
const local = /(?:^|\/)(?:\.env(?:\.|$)|config\.local\.json|credentials\.json|desktop-build|artifacts|cache|snapshots|node_modules|\.release-calendar)(?:\/|$)/;
const findings = [];
for (const path of paths) {
  if (local.test(path)) findings.push({ path,reason:'Local/private path staged' });
  const content = execFileSync('git',['show',`:${path}`],{ encoding:'utf8',maxBuffer:8*1024*1024 });
  if (secret.test(content)) findings.push({ path,reason:'Credential pattern' });
  if (/\/Users\/|\/home\/[a-z][a-z0-9_-]+\//i.test(content)) findings.push({ path,reason:'Personal absolute path' });
}
console.log(JSON.stringify({ stagedFiles:paths.length,findings },null,2));
if (findings.length) process.exitCode = 1;
