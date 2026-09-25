// Small synthetic layout fixtures. No personal documents or installed Korean fonts required.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    const results = await page.evaluate(() => {
      const results = [];
      function check(ok, label) { if (!ok) throw new Error(label); }
      function near(a, b, label) { check(Math.abs(a - b) < 0.1, label + ': ' + a + ' vs ' + b); }
      const root = document.createElement('div');
      root.style.cssText = 'position:absolute;left:0;top:0';
      document.body.appendChild(root);
      const seg = document.createElement('div');
      seg.className = 'hx-seg';
      const line = document.createElement('div');
      line.style.cssText = 'width:200px;white-space:pre;font:20px monospace';
      const span = document.createElement('span');
      span.textContent = 'ABCDEFGHIJKLMNOPQR';
      line.appendChild(span);seg.appendChild(line);root.appendChild(seg);
      for (const align of ['left', 'center', 'right']) {
        line.style.textAlign = align;
        for (const fontSize of [20, 16, 24, 16]) {
          line.style.fontSize = fontSize + 'px';
          for (const zoom of [0.75, 1, 1.5, 2]) {
            root.style.zoom = zoom;
            const before = span.getBoundingClientRect();
            HWPViewer.Layout.fitLines(root);HWPViewer.Layout.fitLines(root);
            const after = span.getBoundingClientRect();
            near(after.left, before.left, align + ' position');
            near(after.width, before.width, align + ' width');
          }
        }
      }
      line.style.position = 'relative';
      span.style.cssText = 'position:absolute;left:20px;top:0;white-space:pre';
      const tab = span.cloneNode(true);tab.style.left = '80px';line.appendChild(tab);
      HWPViewer.Layout.fitLines(root);
      check(span.style.left === '20px' && tab.style.left === '80px', 'tab positions');
      check(!root.querySelector('.hx-fitwrap') && !span.style.transform && !tab.style.transform, 'no automatic compression');
      root.remove();
      results.push('PASS source alignment, tab positions, font changes and 75–200% zoom');

      const info = { pageInfo: { w: 600, h: 150, ml: 10, mr: 10, mt: 25, mb: 25 }, U2PX: 1, U2MM: 25.4 / 96 };
      function section() {
        const root = document.createElement('div');root.className = 'hx-section';
        root.style.cssText = 'position:absolute;left:0;top:0';
        const card = document.createElement('div');card.className = 'hx-pagecard';root.appendChild(card);
        document.body.appendChild(root);return { root, card };
      }
      function paragraph(parent, height, text) {
        const p = document.createElement('div');p.className = 'hx-p';
        p.style.cssText = 'height:' + height + 'px;margin:0;font-size:12px';
        p.textContent = text;parent.appendChild(p);return p;
      }
      for (const secondHeight of [60, 61]) {
        const { root, card } = section();
        paragraph(card, 70, 'FIRST');paragraph(card, secondHeight, 'SECOND');
        HWPViewer.Layout.layoutSection(root, info);
        check(root.querySelectorAll('.hx-pagecard').length === 2, 'paginate ' + secondHeight);
        check(root.textContent === 'FIRSTSECOND', 'page text/order retained');
        check([...root.querySelectorAll('*')].every(el => !el.style.zoom && !el.style.transform), 'no page scaling');
        check([...root.querySelectorAll('.hx-p')].every(el => getComputedStyle(el).fontSize === '12px'), 'font size retained');
        root.remove();
      }
      {
        const { root, card } = section();
        paragraph(card, 40, 'FIRST');const second = paragraph(card, 40, 'SECOND');second.style.marginTop = '30px';
        HWPViewer.Layout.layoutSection(root, info);
        check(second.style.marginTop === '30px', 'do not reclaim intentional paragraph spacing');
        check(root.querySelectorAll('.hx-pagecard').length === 2, 'space causes pagination');root.remove();
      }
      {
        const { root, card } = section();
        paragraph(card, 250, 'OVERSIZED');
        HWPViewer.Layout.layoutSection(root, info);HWPViewer.Layout.fitLines(root);
        check(root.querySelectorAll('.hx-pagecard').length === 1, 'no empty pages for indivisible content');
        check(card.classList.contains('hx-tall'), 'oversized content may continue in print');
        check(card.offsetHeight >= 300, 'oversized content not compressed');root.remove();
      }
      results.push('PASS measured pagination, source spacing and indivisible overflow');

      function tableCase(rows, noSplit = false, repeatHeader = false) {
        const s = section(), wrap = document.createElement('div'), table = document.createElement('table');
        wrap.className = 'hx-p';table.style.cssText = 'width:200px;border-collapse:collapse;margin:0';
        table.dataset.split = noSplit ? '0' : '2';table.dataset.rephdr = repeatHeader ? '1' : '0';
        for (let i = 0; i < rows.length; i++) {
          const tr = table.insertRow();const cell = tr.insertCell();cell.textContent = 'ROW' + i;
          cell.style.cssText = 'padding:0;height:' + rows[i] + 'px;font-size:12px';
        }
        wrap.appendChild(table);s.card.appendChild(wrap);return { ...s, table };
      }
      for (const noSplit of [false, true]) {
        const { root, table } = tableCase([45, 45, 45], noSplit);
        HWPViewer.Layout.layoutSection(root, info);
        check(root.querySelectorAll('.hx-pagecard').length === (noSplit ? 1 : 2), 'table splitting flag');
        check(root.textContent === 'ROW0ROW1ROW2', 'table text/order retained');root.remove();
      }
      {
        const { root, table } = tableCase([40, 40, 40]);table.rows[0].cells[0].rowSpan = 2;
        table.rows[1].insertCell().textContent = 'MERGED';
        HWPViewer.Layout.layoutSection(root, info);
        const merged = root.querySelector('[rowspan="2"]');
        check(merged.closest('table').rows.length >= 2, 'do not cut through merged rows');
        check(root.textContent.includes('MERGED'), 'merged content retained');root.remove();
      }
      {
        const { root } = tableCase([20, 40, 40, 40, 40], false, true);
        HWPViewer.Layout.layoutSection(root, info);
        check(root.querySelectorAll('.hx-pagecard').length === 2, 'short table pagination');
        check([...root.querySelectorAll('table')].every(t => t.rows[0].textContent === 'ROW0'), 'repeat source header without 20-row threshold');
        root.remove();
      }
      {
        const { root } = tableCase([80, 40, 40], false, true);
        HWPViewer.Layout.layoutSection(root, info);
        check(root.querySelectorAll('.hx-pagecard').length === 2, 'oversized heading group must not keep spawning pages');
        check([...root.querySelectorAll('table')].every(t => t.rows.length === 2), 'no heading-only page');
        check(root.textContent === 'ROW0ROW1ROW0ROW2', 'oversized heading and content retained');root.remove();
      }
      {
        const { root, table } = tableCase([20]);const td = table.rows[0].cells[0];
        table.style.width = '40px';table.style.tableLayout = 'fixed';td.style.padding = '0 20px';
        td.textContent = '';const p = paragraph(td, 20, 'TEXT');p.className = 'hx-seg';
        const line = document.createElement('div');line.textContent = 'X';line.style.paddingLeft = '50px';p.appendChild(line);
        HWPViewer.Layout.layoutSection(root, info);
        check(td.style.paddingLeft === '20px' && td.style.paddingRight === '20px', 'source cell padding');
        check(line.style.paddingLeft === '50px', 'source indentation');root.remove();
      }
      {
        const { root, table } = tableCase([40, 40, 40]);
        const wrapper = table.parentElement;
        wrapper.dataset.fy0 = '0';wrapper.dataset.sourceEnd = '10';
        const following = paragraph(wrapper.parentElement, 20, 'AFTER');
        following.dataset.y0 = '20';following.dataset.sourceEnd = '35';
        HWPViewer.Layout.layoutSection(root, info);
        check(!root.querySelector('[data-source-page]'), 'table anchor height is not the complete table extent');
        check(root.querySelectorAll('.hx-pagecard').length === 2, 'table with short source anchor must paginate');
        const lastTable = [...root.querySelectorAll('table')].at(-1);
        check(following.getBoundingClientRect().top >= lastTable.getBoundingClientRect().bottom - 1, 'following paragraph cannot overlap table');
        root.remove();
      }
      {
        const { root, table } = tableCase([20]);
        table.style.width = '100px';table.style.tableLayout = 'fixed';
        const cell = table.rows[0].cells[0];cell.textContent = '';
        const para = document.createElement('div');para.className = 'hx-seg';
        const line = document.createElement('div');line.style.cssText = 'height:14px;line-height:14px;white-space:pre;font-size:16px';
        line.textContent = 'A long cell title that must wrap inside its own cell';
        para.appendChild(line);cell.appendChild(para);
        HWPViewer.Layout.layoutSection(root, info);
        const range = document.createRange();range.selectNodeContents(line);
        check(range.getBoundingClientRect().right <= cell.getBoundingClientRect().right + 1, 'long cell text wraps rather than overlaps');
        check(line.offsetHeight > 14, 'wrapped text contributes to row height');root.remove();
      }
      {
        const { root, table } = tableCase([30, 30]);
        table.parentElement.style.minHeight = '130px';
        table.parentElement.dataset.sourceLineHeight = '130';
        HWPViewer.Layout.layoutSection(root, info);
        check(table.parentElement.offsetHeight <= 100, 'unsplit anchor minimum must not survive overflow repair');
        check(!root.querySelector('.hx-tall'), 'stale minimum cannot create an extra print page');root.remove();
      }
      results.push('PASS table splitting, merged rows, repeat headers, padding and indentation');

      const enc = text => new TextEncoder().encode(text);
      for (const spacing of [0, 1500, 4500]) {
        const xml = '<sec><p><run><secPr><pagePr width="22500" height="9000"><margin left="750" right="750" top="750" bottom="750" header="0" footer="0"/></pagePr></secPr><t>TITLE</t></run><linesegarray><lineseg textpos="0" vertpos="0" vertsize="1500" spacing="0"/></linesegarray></p>' +
          '<p><run><tbl rowCnt="1" colCnt="1" pageBreak="TABLE"><sz width="15000" height="6000"/><pos treatAsChar="1"/><tr><tc><cellAddr rowAddr="0" colAddr="0"/><cellSpan rowSpan="1" colSpan="1"/><cellSz width="15000" height="4500"/><subList><p><run><t>CONSENT</t></run></p></subList></tc></tr></tbl></run><linesegarray><lineseg textpos="0" vertpos="1500" vertsize="6000" spacing="'+spacing+'"/></linesegarray></p></sec>';
        const out = document.createElement('div');document.body.appendChild(out);
        const parsed = HWPViewer.Hwpx.render({'Contents/header.xml':enc('<head/>'),'Contents/section0.xml':enc(xml)},out,document);
        const root = out.querySelector('.hx-section');
        HWPViewer.Layout.layoutSection(root,parsed);
        check(root.querySelectorAll('.hx-pagecard').length === 1, 'following spacing must not push an inline table onto another page: '+spacing);
        check(root.textContent === 'TITLECONSENT', 'keep title and table content');
        near(parseFloat(root.querySelector('table').parentElement.style.minHeight),80,'inline minimum uses content height');
        out.remove();
      }
      results.push('PASS inline table content height excludes trailing spacing');
      const xml = '<sec><p><run><secPr><pagePr width="45000" height="11250"><margin left="750" right="750" top="1500" bottom="750" header="375" footer="1125"/></pagePr></secPr><t>BODY</t></run></p></sec>';
      const out = document.createElement('div');
      const hwpxInfo = HWPViewer.Hwpx.render({ 'Contents/header.xml': enc('<head/>'), 'Contents/section0.xml': enc(xml) }, out, document);
      check(hwpxInfo.pageInfo.headerHeight === 375 && hwpxInfo.pageInfo.footerHeight === 1125, 'parse HWPX header/footer areas');
      function record(tag, level, payload) {
        const out = new Uint8Array(payload.length + 4);new DataView(out.buffer).setUint32(0, tag | (level << 10) | (payload.length << 20), true);out.set(payload, 4);return out;
      }
      const def = new Uint8Array(40), dv = new DataView(def.buffer);
      [45000, 11250, 750, 750, 1500, 750, 375, 1125, 0, 0].forEach((value, i) => dv.setUint32(i * 4, value, true));
      const body = new Uint8Array([...record(66, 0, new Uint8Array(22)), ...record(73, 1, def), ...record(67, 1, new Uint8Array([65, 0]))]);
      const cfb = HWPLIB.CFB.utils.cfb_new();
      for (const [name, bytes] of Object.entries({ FileHeader: new Uint8Array(256), DocInfo: new Uint8Array(0), 'BodyText/Section0': body })) HWPLIB.CFB.utils.cfb_add(cfb, name, bytes);
      const hwpInfo = HWPViewer.Hwp.render('', document.createElement('div'), document, { cont: cfb, streams: { DocInfo: new Uint8Array(0), 'BodyText/Section0': body } });
      check(hwpInfo.pageInfo.headerHeight === 375 && hwpInfo.pageInfo.footerHeight === 1125, 'parse HWP header/footer areas');
      for (const sourceInfo of [hwpxInfo, hwpInfo]) {
        const { root, card } = section();paragraph(card, 20, 'BODY');
        for (const name of ['hx-headersrc', 'hx-footersrc']) { const el = document.createElement('div');el.className = name;el.style.display = 'none';el.textContent = name;root.appendChild(el); }
        HWPViewer.Layout.layoutSection(root, sourceInfo);
        near(parseFloat(root.querySelector('.hx-runhead').style.top), 20, 'source top paper margin');
        near(parseFloat(root.querySelector('.hx-runfoot').style.top), 125, 'source body bottom');root.remove();
      }
      results.push('PASS parsed HWP/HWPX margins and running header/footer positions');

      // Both parsers must interpret the same stored starts, including a reset
      // smaller than the old 120pt HWPX threshold and overlapping line boxes.
      for (const starts of [[1000, 2000, 500], [1000, 2000, 3000]]) {
        const xmlParas = starts.map((y, i) => '<p><run><t>' + String.fromCharCode(65+i) + '</t></run><linesegarray><lineseg textpos="0" vertpos="' + y + '" vertsize="1000" spacing="500"/></linesegarray></p>').join('');
        const hxRoot = document.createElement('div');
        HWPViewer.Hwpx.render({ 'Contents/header.xml': enc('<head/>'), 'Contents/section0.xml': enc('<sec>' + xmlParas + '</sec>') }, hxRoot, document);
        const bytes = starts.flatMap((y, i) => {
          const seg = new Uint8Array(36), view = new DataView(seg.buffer);
          [0, y, 1000, 1000, 800, 500, 0, 20000, 0].forEach((n,j) => view.setInt32(j*4,n,true));
          return [...record(66,0,new Uint8Array(22)), ...record(67,1,new Uint8Array([65+i,0])), ...record(69,1,seg)];
        });
        const hRoot = document.createElement('div');
        HWPViewer.Hwp.render('', hRoot, document, { cont: cfb, streams: { DocInfo: new Uint8Array(0), [cfb.FullPaths.find(p => p.endsWith('/BodyText/Section0'))]: new Uint8Array(bytes) } });
        const expectedPages = starts[2] < starts[1] ? 2 : 1;
        for (const rendered of [hxRoot, hRoot]) {
          document.body.appendChild(rendered);
          const sec = rendered.querySelector('.hx-section');
          HWPViewer.Layout.layoutSection(sec, { ...info, pageInfo: sec._pageInfo, U2PX: 1/75 });
          check(sec.querySelectorAll('.hx-pagecard').length === expectedPages, 'same page reset rule ' + (rendered === hxRoot ? 'HWPX' : 'HWP') + ' starts=' + starts + ' actual=' + sec.querySelectorAll('.hx-pagecard').length);
          check([...sec.querySelectorAll('.hx-pagecard')].every(c => c.dataset.sourcePage === '1'), 'source geometry selected');
          const paras = [...sec.querySelectorAll('.hx-seg')];
          const positions = paras.map(p => p.style.top);
          for (const zoom of [0.75, 1, 2]) {
            sec.style.zoom = zoom;
            paras.forEach(p => p.style.fontSize = '80px');
            HWPViewer.Layout.layoutSection(sec, { ...info, pageInfo: sec._pageInfo, U2PX: 1/75 });
            HWPViewer.Layout.fitLines(sec);
            check(paras.every((p,i) => p.style.top === positions[i]), 'font/zoom cannot move source paragraphs');
            check(sec.querySelectorAll('.hx-pagecard').length === expectedPages, 'font/zoom cannot repaginate source pages');
          }
          rendered.remove();
        }
      }
      {
        const { root, card } = section();
        const p = paragraph(card, 250, 'OVERFLOW');p.dataset.y0 = '10';p.dataset.sourceEnd = '200';
        HWPViewer.Layout.layoutSection(root, info);
        check(root.querySelectorAll('.hx-pagecard').length === 1, 'stored page is not repaginated by measured overflow');
        check(!card.dataset.sourcePage && p.style.position !== 'absolute', 'overflowing source metadata cannot disable flow layout');
        root.remove();
      }
      {
        const { root, card } = section();
        const p = paragraph(card, 20, '');p.className = 'hx-p hx-seg';
        p.dataset.y0 = '10';p.dataset.sourceEnd = '65';
        for (const y of [10, 30, 55]) {
          const line = document.createElement('div');line.dataset.lineY = y;
          line.style.height = '10px';line.textContent = 'LINE';p.appendChild(line);
        }
        HWPViewer.Layout.layoutSection(root, info);
        [...p.children].forEach((line,i) => near(parseFloat(line.style.top), [0,20,45][i]*96/72, 'line uses stored y, not accumulated height'));
        root.remove();
      }
      results.push('PASS shared HWP/HWPX page resets and source geometry independent of fonts/zoom');


      // Real file-open/print path: an explicit source page break.
      const doc = '<sec><p><run><secPr><pagePr width="45000" height="11250"><margin left="750" right="750" top="1875" bottom="1875" header="0" footer="0"/></pagePr></secPr><t>FIRST</t></run><linesegarray><lineseg textpos="0" vertpos="0" vertsize="5250" spacing="0"/></linesegarray></p><p pageBreak="1"><run><t>SECOND</t></run><linesegarray><lineseg textpos="0" vertpos="0" vertsize="4500" spacing="0"/></linesegarray></p></sec>';
      const zip = HWPLIB.CFB.utils.cfb_new();
      HWPLIB.CFB.utils.cfb_add(zip, 'Contents/header.xml', enc('<head/>'));
      HWPLIB.CFB.utils.cfb_add(zip, 'Contents/section0.xml', enc(doc));
      return { results, bytes: Array.from(HWPLIB.CFB.write(zip, { type: 'array', fileType: 'zip' })) };
    });
    results.results.forEach(line => console.log(line));
    await page.locator('#fileInput').setInputFiles({ name: 'layout.hwpx', mimeType: 'application/zip', buffer: Buffer.from(results.bytes) });
    await page.waitForFunction(() => document.querySelectorAll('#hxPage .hx-pagecard').length === 2);
    const before = await page.locator('#hxPage').textContent();
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    assert.equal(await page.locator('#hxPage').textContent(), before);
    assert(before.includes('FIRST') && before.includes('SECOND'));
    assert.equal(await page.locator('#hxPage .hx-pagecard').count(), 2);
    const pdf = await page.pdf({ preferCSSPageSize: true });
    assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 2, 'two printed pages, no extra empty page');
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    assert.equal(await page.locator('#hxPage').textContent(), before);
    assert.deepEqual(errors, []);
    console.log('PASS file upload, print-media text retention, two-page PDF and return to screen');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
