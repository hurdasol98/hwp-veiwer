// HWP table 69/70 fixtures: independent source geometry, not document-specific tuning.
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
  try {
    const page = await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    await page.evaluate(() => {
      const check=(ok,message)=>{if(!ok)throw Error(message);};
      const bytes=(n,fill)=>{const b=new Uint8Array(n);if(fill)fill(new DataView(b.buffer));return b;};
      const utf=s=>bytes(s.length*2,v=>{for(let i=0;i<s.length;i++)v.setUint16(i*2,s.charCodeAt(i),true);});
      const rec=(tag,level,b)=>[...bytes(4,v=>v.setUint32(0,tag|level<<10|b.length<<20,true)),...b];
      const para=(level,text)=>[...rec(66,level,bytes(22)),...rec(67,level+1,utf(text))];
      function render({flow=0,inline=false,halign=0,side=0,x=0,y=0,vref=2,href=3,short=false,cellHeight=3000}={}) {
        const ctrl=bytes(short?24:46,v=>{
          v.setUint32(0,0x74626c20,true);
          v.setUint32(4,Number(inline)|(flow<<21)|(halign<<10)|(side<<24)|(vref<<3)|(href<<8),true);
          v.setInt32(8,y,true);v.setInt32(12,x,true);v.setUint32(16,6000,true);v.setUint32(20,cellHeight,true);
          if(!short){v.setInt32(24,7,true);[150,300,450,600].forEach((n,i)=>v.setUint16(28+2*i,n,true));}
        });
        const cell=bytes(34,v=>{v.setUint16(0,1,true);v.setUint16(12,1,true);v.setUint16(14,1,true);v.setInt32(16,6000,true);v.setInt32(20,cellHeight,true);});
        const pg=rec(73,1,bytes(40,v=>[30000,30000,1500,1500,1500,1500,0,0,0,0].forEach((n,i)=>v.setUint32(i*4,n,true))));
        const body=new Uint8Array([...rec(66,0,bytes(22)),...pg,...rec(67,1,utf('BEFORE')),
          ...para(0,''),...rec(71,1,ctrl),...rec(77,2,bytes(8,v=>{v.setUint16(4,1,true);v.setUint16(6,1,true);})),
          ...rec(72,2,cell),...para(3,'OBJECT'),...para(0,'AFTER')]);
        const c=HWPLIB.CFB.utils.cfb_new();const entries={FileHeader:bytes(256),DocInfo:new Uint8Array(),'BodyText/Section0':body};
        for(const [name,data]of Object.entries(entries))HWPLIB.CFB.utils.cfb_add(c,name,data);
        const root=document.createElement('div');root.style.cssText='position:relative;width:400px';document.body.appendChild(root);
        const info=HWPViewer.Hwp.render('',root,document,{cont:c,streams:entries});
        HWPViewer.Layout.layoutSection(root.querySelector('.hx-section'),info);
        return {root,info,table:root.querySelector('table')};
      }
      for(let flow=0;flow<6;flow++) {
        const {root,table}=render({flow});const css=getComputedStyle(table);
        if(flow<3){check(css.cssFloat==='left','wrap '+flow+' must surround');check(css.margin==='6px 4px 8px 2px','source LRTB margins '+css.margin);}
        if(flow===3){check(css.cssFloat==='none'&&css.clear==='both','top/bottom reserves a full line');
          const after=[...root.querySelectorAll('.hx-p')].find(p=>p.textContent==='AFTER');check(after.getBoundingClientRect().top>=table.getBoundingClientRect().bottom,'following text must follow block');}
        if(flow>=4){check(css.cssFloat==='none'&&css.position==='absolute','overlay is not a float');check((+css.zIndex<0)===(flow===4),'behind/front layer');}
        check(root.querySelectorAll('.hx-pagecard').length===1,'small fixture page count');root.remove();
      }
      for(let flow=0;flow<6;flow++) {
        const {root,table}=render({flow,inline:true});check(!table.hasAttribute('data-object-overlay')&&getComputedStyle(table).cssFloat==='none','inline overrides wrap '+flow);root.remove();
      }
      for(const [halign,side,expected] of [[0,1,'right'],[2,2,'left'],[2,0,'right'],[1,0,'left']]) {
        const {root,table}=render({halign,side});check(table.style.cssFloat===expected,'text side/alignment');root.remove();
      }
      {const {root,table}=render({short:true});check(table.style.margin==='0px','short record fallback without invented margin');root.remove();}
      for(const flow of [4,5]) {
        const {root,info,table}=render({flow,x:-750,y:750,vref:0,href:0,cellHeight:60000});
        const card=root.querySelector('.hx-pagecard'),r=table.getBoundingClientRect(),c=card.getBoundingClientRect();
        check(Math.abs(r.left-c.left+10)<0.01&&Math.abs(r.top-c.top-10)<0.01,'signed paper offsets');
        check(root.querySelectorAll('.hx-pagecard').length===1,'oversized overlay cannot add flow pages');
        // Repeated layout must not count the already-positioned overlay's scroll extent.
        HWPViewer.Layout.layoutSection(root.querySelector('.hx-section'),info);
        check(root.querySelectorAll('.hx-pagecard').length===1,'repeat layout preserves overlay page count');
        check(root.textContent.includes('BEFORE')&&root.textContent.includes('AFTER'),'overlay preserves text');root.remove();
      }
      const {root,table}=render({flow:5,x:750,y:1500,vref:1,href:1});
      const r=table.getBoundingClientRect(),c=root.querySelector('.hx-pagecard').getBoundingClientRect();
      check(Math.abs(r.left-c.left-30)<0.01&&Math.abs(r.top-c.top-40)<0.01,'body frame offsets include source margins once');
      root.remove();
      // Source margins reduce usable width; no object is shifted past the body edge.
      {const {root,table}=render({flow:3,inline:true});
        table.style.width='1000px';
        const r=table.getBoundingClientRect(),parent=table.parentElement.getBoundingClientRect();
        check(r.right+4<=parent.right+0.02,'outside margins fit inside available width');root.remove();}
      // Every table fragment must reserve its own outside margins when choosing row boundaries.
      {
        const root=document.createElement('div');root.className='hx-section';document.body.appendChild(root);
        const card=document.createElement('div');card.className='hx-pagecard';root.appendChild(card);
        const unit=document.createElement('div');unit.className='hx-p';unit.style.cssText='display:flow-root;min-height:0';card.appendChild(unit);
        const table=document.createElement('table');table.style.cssText='margin:10px 0;border-spacing:0';table.dataset.split='2';unit.appendChild(table);
        for(let i=0;i<4;i++){const row=table.insertRow();row.style.height='35px';row.insertCell().textContent='ROW'+i;}
        HWPViewer.Layout.layoutSection(root,{pageInfo:{w:300,h:130,ml:10,mr:10,mt:10,mb:10},U2PX:1});
        const cards=[...root.querySelectorAll('.hx-pagecard')];check(cards.length===2,'margined table two pages');
        check(cards.every(c=>c.querySelectorAll('tr').length===2),'margins cannot be ignored to fit a third row');
        check(root.textContent==='ROW0ROW1ROW2ROW3','split retains row order');root.remove();
      }
      // Child paper coordinates must not inherit the parent's later movement.
      for(const href of [0,3]) {
        const {root,info,table}=render({flow:5,x:6000,y:6750,vref:0,href:0});
        const nested=document.createElement('div');nested.textContent='NESTED';
        nested.dataset.objectOverlay=JSON.stringify({flow:5,x:750,y:1500,href,vref:href===0?0:2});
        nested.style.cssText='position:absolute;left:0;top:0;width:10px;height:10px';
        table.rows[0].cells[0].appendChild(nested);
        HWPViewer.Layout.layoutSection(root.querySelector('.hx-section'),info);
        const cr=root.querySelector('.hx-pagecard').getBoundingClientRect();
        const nr=nested.getBoundingClientRect(),pr=nested.parentElement.getBoundingClientRect();
        check(Math.abs(nr.left-(href===0?cr.left:pr.left)-10)<0.01&&
          Math.abs(nr.top-(href===0?cr.top:pr.top)-20)<0.01,'nested overlay source frame '+href+' actual '+[nr.left-cr.left,nr.top-cr.top]+' parent '+[pr.left-cr.left,pr.top-cr.top]+' css '+nested.style.cssText);
        root.remove();
      }
    });
    assert.deepEqual(errors,[]);
    console.log('PASS six HWP wrapping modes, source margins, inline priority, text-side flags, signed overlay frames, flow exclusion and repeated pagination');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
