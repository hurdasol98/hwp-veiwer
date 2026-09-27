// Shared document semantics: independent synthetic HWP/HWPX fixtures, no user files.
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
  try {
    const page = await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    const fixtures = await page.evaluate(() => {
      const check=(ok,message)=>{if(!ok)throw Error(message);};
      const bytes=(n,fill)=>{const b=new Uint8Array(n);if(fill)fill(new DataView(b.buffer));return b;};
      const enc=s=>new TextEncoder().encode(s);
      const utf=s=>bytes(s.length*2,v=>{for(let i=0;i<s.length;i++)v.setUint16(i*2,s.charCodeAt(i),true);});
      const rec=(tag,level,b)=>[...bytes(4,v=>v.setUint32(0,tag|level<<10|b.length<<20,true)),...b];
      const archive=(entries)=>{const c=HWPLIB.CFB.utils.cfb_new();for(const [n,b]of Object.entries(entries))HWPLIB.CFB.utils.cfb_add(c,n,b);return c;};
      const fh=bytes(256);fh.set(enc('HWP Document File'));fh[35]=5;
      const seg=y=>rec(69,1,bytes(36,v=>[0,y,1000,1000,800,0,0,15000,0].forEach((x,i)=>v.setInt32(i*4,x,true))));
      const para=(text,flags=0,y=null)=>[...rec(66,0,bytes(22,v=>v.setUint8(11,flags))),...rec(67,1,utf(text)),...(y===null?[]:seg(y))];
      const pageDef=rec(73,1,bytes(40,v=>[30000,45000,1500,3000,1500,1500,1500,1500,750,3].forEach((x,i)=>v.setUint32(i*4,x,true))));
      const running=(id,apply,text)=>[...rec(71,1,bytes(8,v=>{v.setUint32(0,id,true);v.setUint32(4,apply,true);})),...rec(72,2,bytes(8)),...rec(66,3,bytes(22)),...rec(67,4,utf(text))];
      const renderHwp=(body,docInfo=new Uint8Array(),others={})=>{
        const entries={FileHeader:fh,DocInfo:docInfo,'BodyText/Section0':new Uint8Array(body),...others};
        const c=archive(entries),root=document.createElement('div');document.body.appendChild(root);
        try { const info=HWPViewer.Hwp.render('',root,document,{cont:c,streams:entries});return {root,info,entries}; }
        catch(error){root.remove();throw error;}
      };
      for(const y of [null,0,2000]) {
        const {root}=renderHwp([...para('A',4,y),...para('B',4,y)]);
        check(root.querySelectorAll('.hx-pagecard').length===2,'HWP explicit page break without y decrease '+y);root.remove();
      }
      for(const flag of [0,1,2]) {
        const {root}=renderHwp([...para('A'),...para('B',flag)]);
        check(root.querySelectorAll('.hx-pagecard').length===1,'section/column-definition flag is not an explicit page break');root.remove();
      }
      const body=[...rec(66,0,bytes(22)),...pageDef,...rec(67,1,utf('BODY')),
        ...running(0x68656164,2,'ODD HEADER'),...running(0x68656164,1,'EVEN HEADER'),
        ...running(0x666f6f74,0,'FOOTER')];
      const hwp=renderHwp(body);
      const pg='<pagePr width="30000" height="45000" landscape="NARROWLY" gutterType="LEFT_RIGHT"><margin left="1500" right="3000" top="1500" bottom="1500" header="1500" footer="1500" gutter="750"/></pagePr>';
      const hxRunning='<ctrl><header applyPageType="ODD"><subList><p><run><t>ODD HEADER</t></run></p></subList></header><header applyPageType="EVEN"><subList><p><run><t>EVEN HEADER</t></run></p></subList></header><footer applyPageType="BOTH"><subList><p><run><t>FOOTER</t></run></p></subList></footer></ctrl>';
      const xml='<sec><p><run><secPr>'+pg+'</secPr>'+hxRunning+'<t>BODY</t></run></p></sec>';
      const files={'Contents/header.xml':enc('<head/>'),'Contents/section0.xml':enc(xml)};
      const hxRoot=document.createElement('div');document.body.appendChild(hxRoot);
      const hxInfo=HWPViewer.Hwpx.render(files,hxRoot,document);
      for(const key of ['w','h','ml','mr','mt','mb','headerHeight','footerHeight','binding'])check(hwp.info.pageInfo[key]===hxInfo.pageInfo[key],'HWP/HWPX paper '+key);
      check(hxInfo.pageInfo.w===45000&&hxInfo.pageInfo.h===30000,'landscape swaps source dimensions');
      for(const {root,info} of [hwp,{root:hxRoot,info:hxInfo}]) {
        const sec=root.querySelector('.hx-section');
        HWPViewer.Layout.layoutSection(sec,{...info,pageOffset:1});
        const card=sec.querySelector('.hx-pagecard');
        check(card.style.paddingLeft==='40px'&&card.style.paddingRight==='30px','even physical-page margins');
        check(card.querySelector('.hx-runhead').textContent==='EVEN HEADER','even header selection');
        check(card.querySelector('.hx-runfoot').textContent==='FOOTER','both footer');root.remove();
      }
      // A definition becomes active at its owning paragraph, never retroactively.
      const scopedHwp=renderHwp([...para('A'),...running(0x68656164,0,'FIRST'),...para('B',4),...running(0x68656164,0,'SECOND')]);
      const header=text=>'<ctrl><header applyPageType="BOTH"><subList><p><run><t>'+text+'</t></run></p></subList></header></ctrl>';
      const scopedXml='<sec><p><run>'+header('FIRST')+'<t>A</t></run></p><p pageBreak="1"><run>'+header('SECOND')+'<t>B</t></run></p></sec>';
      const scopedRoot=document.createElement('div');document.body.appendChild(scopedRoot);
      const scopedInfo=HWPViewer.Hwpx.render({'Contents/header.xml':enc('<head/>'),'Contents/section0.xml':enc(scopedXml)},scopedRoot,document);
      for(const {root,info}of [scopedHwp,{root:scopedRoot,info:scopedInfo}]){
        HWPViewer.Layout.layoutSection(root.querySelector('.hx-section'),info);
        check([...root.querySelectorAll('.hx-runhead')].map(h=>h.textContent).join(',')==='FIRST,SECOND','running definition must not apply before its anchor');root.remove();
      }
      // Overflow-generated pages also advance physical parity before running content.
      const root=document.createElement('div');root.className='hx-section';document.body.appendChild(root);
      const card=document.createElement('div');card.className='hx-pagecard';root.appendChild(card);
      for(let i=0;i<3;i++){const p=document.createElement('div');p.className='hx-p';p.style.cssText='height:80px;margin:0';p.textContent='BODY'+i;card.appendChild(p);}
      for(const [apply,text]of [[1,'EVEN'],[2,'ODD']]){const p=document.createElement('div');p.className='hx-headersrc';p.dataset.apply=apply;p.style.display='none';p.textContent=text;root.appendChild(p);}
      HWPViewer.Layout.layoutSection(root,{pageInfo:{w:300,h:150,ml:20,mr:40,mt:25,mb:25,binding:1},U2PX:1,pageOffset:1});
      const cards=[...root.querySelectorAll('.hx-pagecard')];check(cards.length===3,'flow creates three sheets');
      check(cards.map(c=>c.querySelector('.hx-runhead').textContent).join(',')==='EVEN,ODD,EVEN','continuation parity');
      check(cards.map(c=>c.style.paddingLeft).join(',')==='40px,20px,40px','continuation margin parity');root.remove();
      for(const attr of ['pageBreak','columnBreak']){
        const out=document.createElement('div');
        HWPViewer.Hwpx.render({'Contents/header.xml':enc('<head/>'),'Contents/section0.xml':enc('<sec><p '+attr+'="true"><run><t>A</t></run></p><p '+attr+'="true"><run><t>B</t></run></p></sec>')},out,document);
        check(out.querySelectorAll('.hx-pagecard').length===2,'XML boolean '+attr+' and no leading blank page');
      }
      // When every line moves, header activation must follow content, not an empty wrapper.
      const overflow=document.createElement('div');overflow.className='hx-section';document.body.appendChild(overflow);
      const overflowCard=document.createElement('div');overflowCard.className='hx-pagecard';overflow.appendChild(overflowCard);
      const first=document.createElement('div');first.className='hx-p';first.textContent='A';first.style.cssText='height:90px;margin:0';overflowCard.appendChild(first);
      const second=document.createElement('div');second.className='hx-p hx-seg';second.style.margin='0';overflowCard.appendChild(second);
      for(const text of ['B','C']){const line=document.createElement('div');line.style.cssText='height:20px;line-height:20px';line.textContent=text;second.appendChild(line);}
      const source=document.createElement('div');source.className='hx-headersrc';source.style.display='none';source.textContent='SECOND';
      source._runningAnchor=HWPViewer.Layout.contentAnchor(second);overflow.appendChild(source);
      HWPViewer.Layout.layoutSection(overflow,{pageInfo:{w:300,h:150,ml:20,mr:20,mt:25,mb:25},U2PX:1});
      const overflowCards=[...overflow.querySelectorAll('.hx-pagecard')];
      check(overflowCards.length===2&&!overflowCards[0].querySelector('.hx-runhead')&&overflowCards[1].querySelector('.hx-runhead')?.textContent==='SECOND','activation follows first moved content line');overflow.remove();
      const damaged=[new Uint8Array([1]),bytes(4,v=>v.setUint32(0,67|(0xfff<<20),true)),new Uint8Array([...bytes(4,v=>v.setUint32(0,67|(10<<20),true)),1,2])];
      for(const data of damaged)for(const stream of ['BodyText/Section0','DocInfo']) {
        let error;try{renderHwp(stream==='DocInfo'?para('A'):data,stream==='DocInfo'?data:new Uint8Array());}catch(e){error=e;}
        check(error?.code==='HWP_RECORD_CORRUPT'&&error.message.includes(stream),'reject truncated '+stream);
      }
      // A corrupt later section must not leave an apparently valid first section.
      const c=archive({FileHeader:fh,DocInfo:new Uint8Array(),'BodyText/Section0':new Uint8Array(para('A')),'BodyText/Section1':damaged[0]});
      const out=document.createElement('div');let error;
      try{HWPViewer.Hwp.render('',out,document,{cont:c,streams:{DocInfo:new Uint8Array(),'BodyText/Section0':new Uint8Array(para('A')),'BodyText/Section1':damaged[0]}});}catch(e){error=e;}
      check(error?.code==='HWP_RECORD_CORRUPT'&&!out.childNodes.length,'validate all sections before rendering');
      const serialize=(entries,type)=>Array.from(HWPLIB.CFB.write(archive(entries),{type:'array',fileType:type}));
      return {hwpx:serialize({...files,'Contents/section1.xml':enc(xml)},'zip'),
        hwp:serialize({...hwp.entries,'BodyText/Section1':new Uint8Array(body)},'cfb'),
        damaged:serialize({FileHeader:fh,DocInfo:new Uint8Array(),'BodyText/Section0':new Uint8Array([...para('A'),...damaged[2]])},'cfb')};
    });
    console.log('PASS shared breaks, landscape, duplex margins, odd/even running content and strict record boundaries');
    for(const format of ['hwpx','hwp']) {
      await page.locator('#fileInput').setInputFiles({name:'model.'+format,mimeType:'application/octet-stream',buffer:Buffer.from(fixtures[format])});
      await page.waitForFunction(()=>document.querySelectorAll('#hxPage .hx-pagecard').length===2);
      await page.selectOption('#zoomSel','1');
      const snapshot=()=>page.locator('#hxPage .hx-pagecard').evaluateAll(cards=>cards.map(c=>({left:getComputedStyle(c).paddingLeft,right:getComputedStyle(c).paddingRight,header:c.querySelector('.hx-runhead').textContent,text:c.textContent})));
      const screen=await snapshot();assert.deepEqual(screen.map(x=>x.header),['ODD HEADER','EVEN HEADER']);
      assert.deepEqual(screen.map(x=>[x.left,x.right]),[['30px','40px'],['40px','30px']]);
      await page.emulateMedia({media:'print'});await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
      assert.deepEqual(await snapshot(),screen,'print shares resolved page margins and headers');
      const pdf=await page.pdf({preferCSSPageSize:true});const content=pdf.toString('latin1');
      assert.equal((content.match(/\/Type\s*\/Page\b/g)||[]).length,2);
      const box=content.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);assert(box);assert(Math.abs(Number(box[1])-450)<1&&Math.abs(Number(box[2])-300)<1,'landscape PDF media box');
      await page.emulateMedia({media:'screen'});await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
      await page.evaluate(()=>{
        window.modelOldCard=document.querySelector('.hx-pagecard');
        const Native=FontFace;
        window.FontFace=function(name){return new Native(name,'local("Courier New"),local("Courier"),local("Liberation Mono")');};
      });
      await page.locator('#fileInput').setInputFiles({name:'ModelRefresh_'+format+'.ttf',mimeType:'font/ttf',buffer:Buffer.from([0])});
      await page.waitForFunction(()=>!window.modelOldCard.isConnected);
      assert.deepEqual(await snapshot(),screen,'font refresh preserves global parity and running content');
      console.log('PASS '+format+' multi-section global parity and landscape screen/PDF');
    }
    await page.evaluate(()=>{window.legacyCalls=0;HWPLIB.Viewer=function(){window.legacyCalls++;};});
    await page.locator('#fileInput').setInputFiles({name:'damaged.hwp',mimeType:'application/octet-stream',buffer:Buffer.from(fixtures.damaged)});
    await page.waitForFunction(()=>document.querySelector('#errbox').offsetHeight>0);
    assert.match(await page.locator('#errmsg').textContent(),/손상/);assert.equal(await page.evaluate(()=>window.legacyCalls),0);
    assert.equal(await page.locator('#hxPage .hx-pagecard').count(),0);assert.deepEqual(errors,[]);
    console.log('PASS corrupt file fails visibly, clears old view and never falls back to legacy');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
