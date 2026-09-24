const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'msedge',headless:true});
  try {
    const page = await browser.newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    const fixtures = await page.evaluate(() => {
      // Use an actual local font through FontFace.load, without distributing font binaries.
      const NativeFontFace=FontFace;
      window.FontFace=function(name) {
        const face=new NativeFontFace(name,'local("Courier New"), local("Courier"), local("Liberation Mono")');
        if(window.delayFont) {
          const load=face.load.bind(face);
          face.load=()=>new Promise(resolve=>{window.releaseFont=()=>load().then(resolve);});
        }
        return face;
      };
      const enc=s=>new TextEncoder().encode(s);
      const bytes=(n,f)=>{const b=new Uint8Array(n);if(f)f(new DataView(b.buffer));return b;};
      const utf=s=>bytes(s.length*2,v=>{for(let i=0;i<s.length;i++)v.setUint16(2*i,s.charCodeAt(i),true);});
      const rec=(t,l,b)=>[...bytes(4,v=>v.setUint32(0,t|l<<10|b.length<<20,true)),...b];
      const archive=(entries,fileType)=>{const c=HWPLIB.CFB.utils.cfb_new();for(const [n,b] of Object.entries(entries))HWPLIB.CFB.utils.cfb_add(c,n,b);return Array.from(HWPLIB.CFB.write(c,{type:'array',fileType}));};
      const text='iii iii iii iii iii iii iii iii iii iii iii iii iii iii iii iii iii iii iii iii iii iii iii iii END';
      const fixtures={};
      for(const format of ['hwpx','hwp']) {
        const family='ReflowFixture_'+format;
        if(format==='hwpx') {
          const head='<head><fontface lang="LATIN"><font id="0" face="'+family+'"/></fontface><charPr id="0" height="1200"><fontRef latin="0"/></charPr></head>';
          const para='<p><run charPrIDRef="0"><t>'+text+'</t></run></p>';
          const section='<sec><p><run><secPr><pagePr width="20000" height="20000"><margin left="1500" right="1500" top="1500" bottom="1500" header="0" footer="0"/></pagePr></secPr></run></p>'+para.repeat(30)+'</sec>';
          fixtures[format]=archive({'Contents/header.xml':enc(head),'Contents/section0.xml':enc(section)},'zip');
        } else {
          const fh=bytes(256);fh.set(enc('HWP Document File'));fh[35]=5;
          const counts=bytes(32,v=>v.setUint32(8,1,true));
          const font=new Uint8Array([0,...bytes(2,v=>v.setUint16(0,family.length,true)),...utf(family)]);
          const char=bytes(58,v=>{for(let i=0;i<7;i++){v.setUint8(14+i,100);v.setUint8(28+i,100);}v.setInt32(42,1200,true);});
          const info=new Uint8Array([...rec(17,0,counts),...rec(19,0,font),...rec(21,0,char)]);
          const para=[...rec(66,0,bytes(22)),...rec(67,1,utf(text))];
          fixtures[format]=archive({FileHeader:fh,DocInfo:info,'BodyText/Section0':new Uint8Array(Array.from({length:100},()=>para).flat())},'cfb');
        }
      }
      return fixtures;
    });
    const load=async (name,buffer)=>{
      await page.locator('#fileInput').setInputFiles({name,mimeType:'application/octet-stream',buffer:Buffer.from(buffer)});
      await page.waitForFunction(()=>!document.querySelector('#loading').classList.contains('on'));
    };
    for(const format of ['hwpx','hwp']) {
      await load('fixture.'+format,fixtures[format]);
      await page.waitForFunction(()=>document.querySelector('#hxPage .hx-pagecard'));
      const before=await page.evaluate(()=>{
        window.oldCard=document.querySelector('.hx-pagecard');
        return {text:document.querySelector('#hxPage').textContent,pages:document.querySelectorAll('#hxPage .hx-pagecard').length};
      });
      await page.locator('#searchText').fill('END'); await page.locator('#searchRun').click();
      await load('ReflowFixture_'+format+'.ttf',[0]);
      await page.waitForFunction(()=>document.querySelector('#appStatus').textContent.includes('등록됨'));
      assert(!await page.evaluate(()=>window.oldCard.isConnected),'fresh source DOM required');
      assert.equal(await page.locator('#hxPage').textContent(),before.text);
      const after=await page.locator('#hxPage .hx-pagecard').count();
      assert(after>before.pages,format+': actual wider font must increase page count '+before.pages+' -> '+after);
      await page.waitForFunction(()=>CSS.highlights.get('hxCurrent')?.size===1);
      assert.equal(await page.locator('#searchText').inputValue(),'END');
      assert(await page.evaluate(()=>[...CSS.highlights.get('hxCurrent')][0].startContainer.isConnected));
      console.log('PASS '+format+' font metrics repaginate '+before.pages+' -> '+after+' pages, preserve text and rebuild search');
    }
    await page.evaluate(()=>{
      window.renderCount=0;
      window.originalRender=HWPViewer.Hwp.render;
      HWPViewer.Hwp.render=(...args)=>{window.renderCount++;return window.originalRender(...args);};
    });
    await page.selectOption('#zoomSel','1.5');
    await page.locator('#fileInput').setInputFiles(['BatchOne','BatchTwo'].map(name=>({name:name+'.ttf',mimeType:'font/ttf',buffer:Buffer.from([0])})));
    await page.waitForFunction(()=>document.querySelector('#appStatus').textContent==='글꼴 2개 등록됨');
    assert.equal(await page.evaluate(()=>window.renderCount),1);
    assert.equal(await page.locator('#zoomSel').inputValue(),'1.5');
    await page.evaluate(()=>{
      HWPLIB.Viewer=function(container){container.textContent='Legacy';this.distory=()=>{};};
    });
    await page.locator('#btnCompat').click();
    await load('LegacyFont.ttf',[0]);
    await page.waitForFunction(()=>document.querySelector('#fontBadge').title.includes('LegacyFont'));
    assert(await page.locator('#binWrap').isVisible());
    assert.equal(await page.evaluate(()=>window.renderCount),1);
    await page.locator('#btnCompat').click();
    console.log('PASS one render per font batch, zoom retention and legacy mode retention');
    // Reject a layout after parsing, restoring the exact pre-refresh DOM.
    await page.evaluate(()=>{
      window.oldCard=document.querySelector('#hxPage .hx-pagecard');
      window.oldLayout=HWPViewer.Layout;
      HWPViewer.Layout={...window.oldLayout,layoutSection:()=>{throw new Error('Injected layout failure');}};
    });
    await load('AnotherFont.ttf',[0]);
    await page.waitForFunction(()=>document.querySelector('#appStatus').textContent.includes('재배치 실패'));
    assert(await page.evaluate(()=>window.oldCard.isConnected));
    assert(await page.locator('#hxScroll').isVisible());
    await page.evaluate(()=>{HWPViewer.Layout=window.oldLayout;window.delayFont=true;});
    await load('PendingFont.ttf',[0]);
    await page.waitForFunction(()=>window.releaseFont);
    await page.locator('#btnReset').click();
    await page.evaluate(()=>window.releaseFont());
    assert.equal(await page.locator('#hxPage').textContent(),'');
    assert(await page.locator('#drop').isVisible());
    assert.deepEqual(errors,[]);
    console.log('PASS layout rollback and reset during pending font load');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
