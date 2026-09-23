// Synthetic HWP records for format semantics, independent of any user's documents.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    const result = await page.evaluate(() => {
      function bytes(size, fill) { const a = new Uint8Array(size);if (fill) fill(new DataView(a.buffer));return a; }
      function rec(tag, level, payload) { return [...bytes(4, v => v.setUint32(0, tag | level << 10 | payload.length << 20, true)), ...payload]; }
      function utf16(text) { return bytes(text.length * 2, v => { for (let i=0;i<text.length;i++) v.setUint16(i*2,text.charCodeAt(i),true); }); }
      function shape(head) { return bytes(34, v => {v.setUint32(0,(head<<23)|12,true);v.setInt32(24,120,true);v.setUint16(30,1,true);}); }
      function para(level, shapeId, text, y = 0) {
        const seg = bytes(36, v => { [0,y,1200,1200,1000,0,0,12000,0].forEach((n,i)=>v.setInt32(i*4,n,true)); });
        return [...rec(66,level,bytes(22,v=>v.setUint16(8,shapeId,true))), ...rec(67,level+1,utf16(text)), ...rec(69,level+1,seg)];
      }
      const numbering = bytes(100,v=>v.setUint16(98,1,true)); // seven empty numbering formats
      const bullet = bytes(14,v=>v.setUint16(12,45,true));
      const border = bytes(36,v=>{v.setUint16(0,64,true);v.setUint8(26,1);v.setUint8(27,1);v.setUint32(28,0xff,true);});
      const docInfo = new Uint8Array([...rec(23,0,numbering),...rec(24,0,bullet),...rec(25,0,shape(3)),...rec(25,0,shape(0)),...rec(20,0,border)]);
      const ctrl = bytes(24,v=>{v.setUint32(0,0x74626c20,true);v.setUint32(4,1,true);v.setUint32(16,12000,true);v.setUint32(20,3000,true);});
      const cell = bytes(34,v=>{v.setUint16(0,1,true);v.setUint16(12,1,true);v.setUint16(14,1,true);v.setInt32(16,12000,true);v.setInt32(20,3000,true);v.setUint16(32,1,true);});
      const body = new Uint8Array([
        ...para(0,0,''),
        ...para(0,1,'A\u{F0854}B\u{F0855}C\u0018',2000),
        ...rec(66,0,bytes(22,v=>v.setUint16(8,1,true))),
        ...rec(71,1,ctrl), ...rec(77,2,bytes(8,v=>{v.setUint16(4,1,true);v.setUint16(6,1,true);})),
        ...rec(72,2,cell),...para(3,1,'CELL'),
      ]);
      const cfb = HWPLIB.CFB.utils.cfb_new();
      for (const [name,data] of Object.entries({FileHeader:bytes(256),DocInfo:docInfo,'BodyText/Section0':body})) HWPLIB.CFB.utils.cfb_add(cfb,name,data);
      const root = document.createElement('div');document.body.appendChild(root);
      const info = HWPViewer.Hwp.render('',root,document,{cont:cfb,streams:{DocInfo:docInfo,'Root Entry/BodyText/Section0':body}});
      HWPViewer.Layout.layoutSection(root.querySelector('.hx-section'),info);
      const result = { marker:root.querySelector('.hx-marker')?.textContent, text:root.textContent,
        diagonal:root.querySelector('.hx-cell-diagonal path')?.getAttribute('d'),
        missingFont:HWPViewer.Typography.faceInstalled('CodexDefinitelyMissingFont_78b9'),
        serifFont:HWPViewer.Typography.faceInstalled('serif') };
      root.remove();return result;
    });
    assert.equal(result.marker,'- ');
    assert(result.text.includes('A『B』C-'),result.text);
    assert.equal(result.diagonal,'M0 0L100 100');
    assert.equal(result.missingFont,false);
    assert.equal(result.serifFont,true);
    console.log('PASS independent bullet IDs, stored-line markers, HNC brackets, hyphen controls, diagonal cell border and font presence');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
