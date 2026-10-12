import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdir,writeFile } from 'node:fs/promises';

const temporary = createServer(); temporary.listen(0,'127.0.0.1'); await once(temporary,'listening');
const address = temporary.address(); if (!address || typeof address === 'string') throw new Error('No debugging port');
const port = address.port; await new Promise((resolve,reject) => temporary.close((error) => error ? reject(error) : resolve()));
let browser;
await mkdir('artifacts',{ recursive:true });
try {
  browser = await chromium.launch({ channel:process.env.QA_BROWSER_CHANNEL ?? 'chrome',headless:true,args:[`--remote-debugging-port=${port}`] });
  const url = process.env.QA_URL ?? 'http://127.0.0.1:4317';
  const page = await browser.newPage(); await page.goto(url); await page.locator('.calendar').waitFor();
  const scores = [];
  for (const formFactor of ['mobile','desktop']) {
    for (let run = 1; run <= 3; run++) {
      const options = { port,logLevel:'error',output:'json',onlyCategories:['performance','accessibility','best-practices','seo'],
        ...(formFactor === 'desktop' ? { formFactor:'desktop',screenEmulation:{ mobile:false,width:1440,height:900,deviceScaleFactor:1,disabled:false },throttling:{ rttMs:40,throughputKbps:10240,cpuSlowdownMultiplier:1,requestLatencyMs:0,downloadThroughputKbps:0,uploadThroughputKbps:0 } } : {}) };
      const result = await lighthouse(url,options); if (!result) throw new Error('Missing Lighthouse result');
      await writeFile(`artifacts/lighthouse-${formFactor}-${run}.json`,JSON.stringify(result.lhr));
      const score = Object.fromEntries(Object.entries(result.lhr.categories).map(([name,value]) => [name,Math.round(value.score*100)]));
      scores.push({ formFactor,run,...score }); console.log(JSON.stringify(scores.at(-1)));
      const failed = Object.values(result.lhr.audits).filter((audit) => audit.score !== null && audit.score < 1).map((audit) => ({ id:audit.id,title:audit.title,score:audit.score }));
      if (failed.length) console.log(JSON.stringify({ formFactor,run,failed }));
    }
  }
  await writeFile('artifacts/lighthouse-scores.json',JSON.stringify(scores,null,2));
} finally { if (browser) await browser.close(); }
