const {test}=require('node:test');const assert=require('node:assert/strict');const {chromium}=require('playwright');
const {collectSources}=require('../../src/sources/catalog.cjs');const {renderCatalog}=require('../../src/reports/catalog-preview.cjs');
const profile=require('../../config/search-profile.json');
test('language evidence is visible and unknown language does not disappear from the catalog',async t=>{
 const source={provider:'greenhouse',board:'fixture',company:'Fixture',enabled:true};
 const c=await collectSources([source],profile,{loadFeed:async()=>({jobs:[{id:1,title:'Senior Product Manager',location:{name:'Remote'},content:'Our team communicates in Russian. English C1 is required.'},{id:2,title:'Senior Product Manager',location:{name:'Remote'},content:'We build the platform.'}]})});
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.setContent(renderCatalog(c));
 assert.equal(await page.locator('#jobs tr:not([hidden])').count(),2);
 assert.match(await page.locator('#jobs').innerText(),/подтверждено текстом вакансии/);assert.match(await page.locator('#jobs').innerText(),/английский C1/i);assert.match(await page.locator('#jobs').innerText(),/Язык команды неизвестен/);
 await page.locator('#fit').selectOption('review');assert.equal(await page.locator('#jobs tr:not([hidden])').count(),1);assert.match(await page.locator('#jobs tr:not([hidden])').innerText(),/Язык команды неизвестен/);
});
