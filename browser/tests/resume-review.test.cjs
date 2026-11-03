const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {chromium}=require('playwright');
const {buildPackage}=require('../../src/resumes/package.cjs');const {renderPackage}=require('../../src/resumes/render.cjs');
test('resume requires review, resets approval after changes and exports only selected facts',async t=>{
 const fact=(id,value,status)=>({id,subject:'candidate',field:'skill',value,status,approved_for_generation:status==='confirmed',confirmation:status==='confirmed'?{quote:'yes'}:null,source_refs:[{source_id:'S1',excerpt:value}]});
 const p={schema:'jobradar-candidate-facts-draft',schema_version:1,subject:'Fixture Person',sources:[{id:'S1'}],facts:[fact('a','SQL','confirmed'),fact('b','Discovery','imported'),fact('c','Co-founder','superseded')]};
 const pkg=buildPackage(p,{vacancy_id:'fixture',title:'Product Manager',description:'</script><script>window.pwned=true</script>'});
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.setContent(renderPackage(pkg));
 assert.equal(await page.evaluate(()=>window.pwned),undefined);
 assert.equal(await page.locator('[data-fact="c"]').isDisabled(),true);
 await page.getByRole('button',{name:'Скачать резюме HTML',exact:true}).click();assert.match(await page.locator('#status').textContent(),/Подтвердите/);
 await page.locator('#approve').check();await page.locator('[data-fact="b"]').check();assert.equal(await page.locator('#approve').isChecked(),false);
 await page.locator('#approve').check();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать резюме HTML',exact:true}).click();const download=await pending;const html=fs.readFileSync(await download.path(),'utf8');
 assert.match(html,/SQL/);assert.match(html,/Discovery/);assert.ok(!html.includes('Co-founder'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('sourceRefs'));
 const manifestPending=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать запись проверки',exact:true}).click();const manifest=JSON.parse(fs.readFileSync(await (await manifestPending).path(),'utf8'));assert.equal(manifest.packageId,pkg.packageId);assert.deepEqual(manifest.selection.approvedFactIds,['b']);
});
