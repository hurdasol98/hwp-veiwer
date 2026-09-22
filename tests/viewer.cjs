/* Optional development test. The viewer itself needs neither Node nor Playwright.
   node tests/viewer.cjs --sample "document.hwpx" [--sample "another.hwpx"]
   PLAYWRIGHT_MODULE may point to an existing Playwright installation. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const args = process.argv.slice(2);
const samples = args.flatMap((arg, i) => arg === '--sample' ? [path.resolve(args[i+1])] : []);
const baselineIndex = args.indexOf('--baseline');
const baseline = baselineIndex < 0 ? null : path.resolve(args[baselineIndex+1]);
const modules = [...html.matchAll(/<script\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g)];
assert.equal(modules.length, 9);
for (const [,name,code] of modules) new vm.Script(code, {filename:name});
new vm.Script(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'));
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8')).start_url, './index.html');
assert(!/<script[^>]+src=/.test(html), 'Runtime JavaScript must remain embedded');
console.log('PASS inline module syntax and standalone structure');
if (!samples.length) { console.log('SKIP browser tests: supply --sample paths'); process.exit(0); }
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function open(page, url, file) {
  await page.goto(url);
  await page.locator('#fileInput').setInputFiles(file);
  await page.waitForFunction(() => document.querySelectorAll('.hx-pagecard').length || document.querySelector('#errbox').offsetHeight);
  assert.equal(await page.locator('#errbox').isVisible(), false, await page.locator('#errbox').textContent());
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}
async function snapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#hxPage');
    const extract = window.HWPViewer?.extractText || window.hxExtractText;
    return {pages:root.querySelectorAll('.hx-pagecard').length, tables:root.querySelectorAll('table').length,
      rows:root.querySelectorAll('tr').length, text:extract(root)};
  });
}
async function offlineTest(browser) {
  // Only serve fixed app-shell files, never local documents.
  const server=http.createServer((req,res) => {
    const name=req.url==='/'?'index.html':req.url.slice(1);
    if(!['index.html','sw.js','manifest.webmanifest'].includes(name)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type', name==='sw.js'?'application/javascript':name.endsWith('webmanifest')?'application/manifest+json':'text/html');
    res.end(fs.readFileSync(path.join(root,name)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const context=await browser.newContext();
  try {
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port+'/');
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const cached=await page.evaluate(async()=>{const keys=await caches.keys();const c=await caches.open(keys[0]);return (await c.keys()).map(r=>new URL(r.url).pathname);});
    assert.deepEqual(cached.sort(),['/index.html','/manifest.webmanifest']);
    await context.setOffline(true);await page.reload();assert(await page.locator('#btnOpen').isVisible());
    console.log('PASS app-shell-only cache and offline reload');
  } finally {await context.close();await new Promise(resolve=>server.close(resolve));}
}
(async()=>{
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'msedge',headless:true});
  try {
    for(const file of samples) {
      const page=await browser.newPage({viewport:{width:1648,height:1200}}), errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      let before;
      if(baseline){await open(page,pathToFileURL(baseline).href,file);before=await snapshot(page);}
      await open(page,pathToFileURL(path.join(root,'index.html')).href,file);
      const current=await snapshot(page);assert(current.pages>0);assert(current.text.length>0);
      if(before) assert.deepEqual(current,before,'Document content/page structure changed');
      const measured=[];
      for(const value of ['0.75','1','1.5','2','fitw','1','2']) {
        await page.selectOption('#zoomSel',value);await page.waitForTimeout(150);
        measured.push(await page.evaluate(()=>{
          const line=[...document.querySelectorAll('.hx-seg > div')].find(e=>e.textContent.includes('인천 관내'));
          if(!line)return null;
          const rect=line.getBoundingClientRect(), zoom=rect.width/line.offsetWidth;
          const range=document.createRange();range.selectNodeContents(line);
          return {textWidth:range.getBoundingClientRect().width/zoom, forcedWrap:!!line.querySelector('.hx-fitwrap')};
        }));
      }
      const lines=measured.filter(Boolean);
      for(const m of lines) assert.equal(m.forcedWrap,false,'Source text must not be auto-compressed');
      if(lines.length) assert(Math.max(...lines.map(m=>m.textWidth))-Math.min(...lines.map(m=>m.textWidth))<1);
      // Trigger print preparation twice: fitting must be repeatable.
      await page.evaluate(()=>{window.dispatchEvent(new Event('beforeprint'));window.dispatchEvent(new Event('beforeprint'));});
      assert.deepEqual(await snapshot(page),current);
      const query=current.text.replace(/\s+/g,' ').trim().slice(0,2);
      await page.locator('#searchText').fill(query);await page.waitForTimeout(350);
      assert.match(await page.locator('#searchCount').textContent(),/\d/);
      await page.reload();await page.evaluate(()=>{window.Worker=function(){throw Error('Test: Worker unavailable')};});
      await page.locator('#fileInput').setInputFiles(file);await page.waitForFunction(()=>document.querySelectorAll('.hx-pagecard').length);
      assert.deepEqual(await snapshot(page),current);
      // Late asynchronous decoding must not resurrect a cancelled document.
      await page.reload();await page.evaluate(()=>{const original=HWPViewer.Distribution.prepare;HWPViewer.Distribution.prepare=async f=>{await new Promise(r=>setTimeout(r,300));return original(f)};});
      await page.locator('#fileInput').setInputFiles(file);await page.locator('#cancelLoad').click();await page.waitForTimeout(650);
      assert.equal(await page.locator('.hx-pagecard').count(),0);
      assert.deepEqual(errors,[]);
      console.log('PASS',path.basename(file),JSON.stringify({pages:current.pages,tables:current.tables,rows:current.rows}), 'zoom/search/print preparation/fallback/cancel');
      await page.close();
    }
    await offlineTest(browser);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
