const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 try {
  const page=await browser.newPage();
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  const result=await page.evaluate(()=>{
   const enc=s=>new TextEncoder().encode(s);
   const seg=(pos,y)=>'<lineseg textpos="'+pos+'" vertpos="'+y+'" vertsize="1500" spacing="0" horzsize="22000"/>';
   const render=(content)=>{const root=document.createElement('div');document.body.append(root);const info=HWPViewer.Hwpx.render({'Contents/header.xml':enc('<head/>'),'Contents/section0.xml':enc('<sec>'+content+'</sec>')},root,document);return {root,info};};
   const field='<ctrl><fieldBegin type="HYPERLINK"><parameters><stringParam>hidden-command</stringParam></parameters></fieldBegin></ctrl>';
   const end='<ctrl><fieldEnd/></ctrl>';
   const cases=[
    ['<run><t>A😀</t>'+field+'<t>BC</t>'+end+'<t>D</t></run>',21],
    ['<run><t>A<tab/>B</t></run>',9],
    ['<run><t>A</t>'+field+'<t>BCD</t>'+end+'<t>Z</t></run>',10],
    ['<run><t>A</t>'+field+field+'<t>B</t>'+end+end+'<t>C</t></run>',34],
   ].map(([runs,pos])=>{const {root}=render('<p>'+runs+'<linesegarray>'+seg(0,0)+seg(pos,1500)+'</linesegarray></p>');return [...root.querySelectorAll('.hx-seg > div')].map(e=>e.textContent);});
   const source='W'.repeat(60);
   const {root,info}=render('<p><run><secPr><pagePr width="24000" height="30000"><margin left="1000" right="1000" top="1000" bottom="1000" header="0" footer="0"/></pagePr></secPr><t>'+source+'NEXT</t></run><linesegarray>'+seg(0,0)+seg(source.length,1500)+'</linesegarray></p>');
   HWPViewer.Layout.layoutSection(root.querySelector('.hx-section'),info);
   const lines=[...root.querySelectorAll('.hx-seg > div')];
   const r=document.createRange();r.selectNodeContents(lines[0]);
   const bounds=lines[0].getBoundingClientRect();
   return {cases,text:root.textContent,reflow:lines[0].dataset.reflow,
    contained:[...r.getClientRects()].every(r=>r.right<=bounds.right+1&&r.left>=bounds.left-1),
    overlap:lines[0].getBoundingClientRect().bottom>lines[1].getBoundingClientRect().top+1,
    transformed:!!lines[0].style.transform};
  });
  assert.deepEqual(result.cases,[['A😀BC','D'],['A\t','B'],['AB','CDZ'],['AB','C']]);
  assert.equal(result.text,'W'.repeat(60)+'NEXT');
  assert.equal(result.reflow,'1');assert(result.contained);assert(!result.overlap);assert(!result.transformed);
  console.log('PASS HWPX field delimiters, nested fields, UTF-16 offsets, tabs and hidden parameter exclusion');
  console.log('PASS overflowing body text wraps without scaling, text loss or overlap');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
