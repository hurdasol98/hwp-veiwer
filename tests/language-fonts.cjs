const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'msedge',headless:true});
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    const results = await page.evaluate(() => {
      const languages=['hangul','latin','hanja','japanese','other','symbol','user'];
      const names=languages.map(s=>'MissingFixture_'+s);
      const source='가AB漢あ☆';
      const enc=s=>new TextEncoder().encode(s);
      const bytes=(size,fn)=>{const b=new Uint8Array(size);if(fn)fn(new DataView(b.buffer));return b;};
      const utf=s=>bytes(s.length*2,v=>{for(let i=0;i<s.length;i++)v.setUint16(i*2,s.charCodeAt(i),true);});
      const rec=(tag,level,b)=>[...bytes(4,v=>v.setUint32(0,tag|level<<10|b.length<<20,true)),...b];
      const refs=languages.map(l=>l+'="0"').join(' ');
      const head='<head>'+languages.map((l,i)=>'<fontface lang="'+l.toUpperCase()+'"><font id="0" face="'+names[i]+'"/></fontface>').join('')+'<charPr id="0" height="1200"><fontRef '+refs+'/><spacing hangul="0" latin="20"/><relSz hangul="100" latin="75"/></charPr></head>';
      const xml='<sec><p><run charPrIDRef="0"><t>'+source+'</t></run><linesegarray><lineseg textpos="0" vertpos="0" vertsize="1600" spacing="0"/></linesegarray></p></sec>';
      const hx=document.createElement('div');document.body.appendChild(hx);
      const hi=HWPViewer.Hwpx.render({'Contents/header.xml':enc(head),'Contents/section0.xml':enc(xml)},hx,document);
      HWPViewer.Layout.layoutSection(hx.querySelector('.hx-section'),hi);
      const counts=bytes(32,v=>{for(let i=1;i<=7;i++)v.setUint32(i*4,1,true);});
      const char=bytes(58,v=>{for(let i=0;i<7;i++){v.setUint8(14+i,100);v.setUint8(28+i,i===1?75:100);}v.setInt8(22,20);v.setInt32(42,1200,true);});
      const info=new Uint8Array([...rec(17,0,counts),...names.flatMap(n=>rec(19,0,new Uint8Array([0,...bytes(2,v=>v.setUint16(0,n.length,true)),...utf(n)]))),...rec(21,0,char)]);
      const body=new Uint8Array([...rec(66,0,bytes(22)),...rec(67,1,utf(source)),...rec(69,1,bytes(36,v=>{[0,0,1600,1600,1200,0,0,30000,0].forEach((n,i)=>v.setInt32(i*4,n,true));}))]);
      const cont=HWPLIB.CFB.utils.cfb_new();
      for(const [name,data] of Object.entries({FileHeader:bytes(256),DocInfo:info,'BodyText/Section0':body}))HWPLIB.CFB.utils.cfb_add(cont,name,data);
      const h=document.createElement('div');document.body.appendChild(h);
      const bi=HWPViewer.Hwp.render('',h,document,{cont,streams:{DocInfo:info,'Root Entry/BodyText/Section0':body}});
      HWPViewer.Layout.layoutSection(h.querySelector('.hx-section'),bi);
      const zip=HWPLIB.CFB.utils.cfb_new();
      HWPLIB.CFB.utils.cfb_add(zip,'Contents/header.xml',enc(head));
      HWPLIB.CFB.utils.cfb_add(zip,'Contents/section0.xml',enc(xml));
      window.languageFixtureBytes=Array.from(HWPLIB.CFB.write(zip,{type:'array',fileType:'zip'}));
      return [hx,h].map(root=>{
        const before=root.textContent;
        HWPViewer.Typography.applyLanguageStyles(root); // must be idempotent
        return {text:root.textContent,before,runs:[...root.querySelectorAll('[data-hx-language]')].map(s=>({lang:s.dataset.hxLanguage,text:s.textContent,font:s.dataset.hxFont,size:s.style.fontSize,spacing:s.style.letterSpacing}))};
      });
    });
    assert.deepEqual(results[0],results[1],'HWP/HWPX language styles must agree');
    for(const r of results){
      assert.equal(r.text,'가AB漢あ☆');assert.equal(r.before,r.text);
      assert.deepEqual(r.runs.map(x=>x.lang),['0','1','2','3','5']);
      assert.equal(r.runs[1].font,'MissingFixture_latin');
      assert.equal(r.runs[1].size,'9pt');assert.equal(r.runs[1].spacing,'0.2em');
      assert.equal(r.runs[0].size,'12pt');assert.equal(r.runs[2].font,'MissingFixture_hanja');
    }
    const buffer=Buffer.from(await page.evaluate(()=>window.languageFixtureBytes));
    await page.locator('#fileInput').setInputFiles({name:'languages.hwpx',mimeType:'application/zip',buffer});
    await page.waitForFunction(()=>document.querySelector('#hxPage [data-hx-language]'));
    assert.match(await page.locator('#badge').textContent(),/글꼴 5종 대체/);
    assert.match(await page.locator('#badge').getAttribute('title'),/MissingFixture_latin/);
    console.log('PASS missing-language-font badge');
    console.log('PASS matching HWP/HWPX language-local fonts, relative sizes, spacing, text retention and idempotence');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
