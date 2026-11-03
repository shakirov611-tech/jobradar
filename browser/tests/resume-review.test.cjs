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
test('draft reload/import is package-bound, atomic and resets approval; preview equals export body',async t=>{
 const http=require('node:http');
 const p={schema:'jobradar-candidate-facts-draft',schema_version:1,subject:'Fixture Person',sources:[{id:'S1'}],facts:[{id:'a',subject:'candidate',field:'skill',value:'SQL',status:'confirmed',approved_for_generation:true,confirmation:{quote:'yes'},source_refs:[{source_id:'S1',excerpt:'SQL'}]}]};
 const pkg=buildPackage(p,{vacancy_id:'fixture',title:'Product Manager'});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(renderPackage(pkg));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('[data-fact="a"]').uncheck();await page.reload();assert.equal(await page.locator('[data-fact="a"]').isChecked(),false);assert.ok(!(await page.locator('#preview').textContent()).includes('SQL'));
 await page.locator('[data-fact="a"]').check();await page.locator('#approve').check();let pending=page.waitForEvent('download');await page.locator('#save-draft').click();const draft=JSON.parse(fs.readFileSync(await (await pending).path(),'utf8'));assert.equal(draft.selection.factIds[0],'a');
 await page.reload();assert.equal(await page.locator('#approve').isChecked(),false);assert.equal(await page.locator('[data-fact="a"]').isChecked(),true);
 const invalid={...draft,profileHash:'changed'};await page.locator('#load-draft').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('не подходит'));assert.equal(await page.locator('[data-fact="a"]').isChecked(),true);
 await page.locator('[data-fact="a"]').uncheck();await page.locator('#load-draft').setInputFiles({name:'draft.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(draft))});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('восстановлен'));assert.equal(await page.locator('[data-fact="a"]').isChecked(),true);assert.equal(await page.locator('#approve').isChecked(),false);
 const body=await page.locator('#preview').innerHTML();await page.locator('#approve').check();pending=page.waitForEvent('download');await page.locator('#export').click();const html=fs.readFileSync(await (await pending).path(),'utf8');assert.ok(html.includes(body));
});
