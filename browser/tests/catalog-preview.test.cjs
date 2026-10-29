const {test}=require('node:test');const assert=require('node:assert/strict');const {chromium}=require('playwright');
const {normalizeFeed}=require('../../src/sources/catalog.cjs');const {renderCatalog}=require('../../src/reports/catalog-preview.cjs');
test('catalog HTML filters raw/role/geography views without running upstream markup',async t=>{
 const source={provider:'greenhouse',board:'fixture',company:'Fixture',enabled:true};const profile=require('../../config/search-profile.json');
 const n=normalizeFeed(source,{jobs:[{id:1,title:'Product Manager <script>window.pwned=true</script>',location:{name:'United States'}},{id:2,title:'Product Owner',location:{name:'Bulgaria'}},{id:3,title:'Chef',location:{name:'EMEA'}}]},'2026-10-29T12:00:00.000Z',profile);
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.setContent(renderCatalog({observedAt:'2026-10-29T12:00:00.000Z',total:3,rows:n.rows,catalog:n.catalog,sources:[]}));
 assert.equal(await page.locator('#visible').textContent(),'Показано: 2');assert.equal(await page.evaluate(()=>window.pwned),undefined);
 await page.getByLabel('Роли').selectOption('all');assert.equal(await page.locator('#visible').textContent(),'Показано: 3');
 await page.getByLabel('География').selectOption('review');assert.equal(await page.locator('#visible').textContent(),'Показано: 1');
 await page.getByLabel('Роли').selectOption('yes');assert.equal(await page.locator('#visible').textContent(),'Показано: 0');
 await page.getByLabel('География').selectOption('all');await page.getByLabel('Поиск').fill('Bulgaria');assert.equal(await page.locator('#visible').textContent(),'Показано: 1');
});
