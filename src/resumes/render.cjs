const {validateSelection}=require('./package.cjs');
const {resumeBody,resumeDocument}=require('./document.cjs');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function controls(pkg, validateSelection, resumeBody, resumeDocument) {
 const status=document.querySelector('#status');
 const key='jobradar-resume-draft-v1-'+pkg.packageId;
 const draftStatus=document.querySelector('#draft-status');
 function draft(){return {schemaVersion:1,packageId:pkg.packageId,profileHash:pkg.profileHash,vacancyHash:pkg.vacancyHash,selection:selection()};}
 function restore(value){
  if(!value||value.schemaVersion!==1||value.packageId!==pkg.packageId||value.profileHash!==pkg.profileHash||value.vacancyHash!==pkg.vacancyHash)throw Error('mismatch');
  validateSelection(pkg,value.selection,true);
  for(const input of document.querySelectorAll('input[data-fact]'))input.checked=value.selection.factIds.includes(input.dataset.fact);
  document.querySelector('#approve').checked=false;
 }
 function save(){try{localStorage.setItem(key,JSON.stringify(draft()));draftStatus.textContent='Черновик сохранён в этом браузере. Для переноса скачайте JSON.';}catch{draftStatus.textContent='Автосохранение недоступно. Скачайте черновик JSON перед закрытием.';}}
 function selection() {
  const factIds=[...document.querySelectorAll('input[data-fact]:checked')].map(x=>x.dataset.fact);
  return {packageId:pkg.packageId,factIds,approvedFactIds:factIds.filter(id=>!pkg.facts.find(f=>f.id===id).approved)};
 }
 function update() {
  const s=selection();
  document.querySelector('#count').textContent=`Выбрано ${s.factIds.length} из ${pkg.facts.filter(f=>!f.blocked).length} доступных фактов`;
  document.querySelector('#preview').innerHTML=resumeBody(pkg,validateSelection(pkg,s,true));
  for(const row of document.querySelectorAll('[data-row]'))row.querySelector('.decision').textContent=s.factIds.includes(row.dataset.row)?'Включено':'Не включено';
 }
 function download(text,name,type) {
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 document.querySelector('#export').addEventListener('click',()=>{
  try {
   if(!document.querySelector('#approve').checked)throw Error('Подтвердите проверку выбранных фактов.');
   const s=selection(),facts=validateSelection(pkg,s);
   const html=resumeDocument(pkg,facts,resumeBody);
   download(html,'jobradar-resume-'+pkg.packageId.slice(0,12)+'.html','text/html');
   status.textContent='Резюме скачано. Откройте HTML и используйте Печать → Сохранить как PDF. Ничего не отправлено работодателю.';
  }catch(e){status.textContent=e.message.startsWith('JR_')?'Выберите хотя бы один доступный факт и проверьте подтверждение.':e.message;}
 });
 document.querySelector('#manifest').addEventListener('click',()=>{
  try {
   if(!document.querySelector('#approve').checked)throw Error('Подтвердите проверку выбранных фактов.');
   const s=selection();validateSelection(pkg,s);
   download(JSON.stringify({schemaVersion:1,packageId:pkg.packageId,profileHash:pkg.profileHash,vacancyHash:pkg.vacancyHash,reviewedAt:new Date().toISOString(),selection:s},null,2),'jobradar-resume-review-'+pkg.packageId.slice(0,12)+'.json','application/json');
   status.textContent='Запись проверки скачана отдельно от резюме.';
  }catch{status.textContent='Проверьте выбор фактов и подтвердите проверку.';}
 });
 for(const input of document.querySelectorAll('input[data-fact]'))input.addEventListener('change',()=>{document.querySelector('#approve').checked=false;update();save();});
 document.querySelector('#save-draft').addEventListener('click',()=>download(JSON.stringify(draft(),null,2),'jobradar-resume-draft-'+pkg.packageId.slice(0,12)+'.json','application/json'));
 document.querySelector('#load-draft').addEventListener('change',async event=>{
  try{const file=event.target.files[0];if(!file)return;if(file.size>500000)throw Error('large');restore(JSON.parse(await file.text()));update();save();status.textContent='Черновик восстановлен. Проверьте резюме и подтвердите экспорт заново.';}
  catch{status.textContent='Этот черновик не подходит к профилю/вакансии или повреждён. Текущий выбор сохранён.';}
  event.target.value='';
 });
 try{const saved=localStorage.getItem(key);if(saved){restore(JSON.parse(saved));draftStatus.textContent='Черновик восстановлен из этого браузера. Перед экспортом подтвердите проверку.';}}catch{draftStatus.textContent='Не удалось восстановить черновик. Можно импортировать сохранённый JSON.';}
 update();
}
function renderPackage(pkg) {
 const rows=pkg.facts.map(f=>`<article data-row="${escape(f.id)}"><label><input type="checkbox" data-fact="${escape(f.id)}" ${f.blocked?'disabled':f.approved?'checked':''}>${escape(f.subject)} · ${escape(f.field)}</label><p>${escape(f.text)}</p><strong class="decision"></strong><p>${f.blocked?'Недоступно: заменённый, спорный или скрытый факт.':f.approved?'Ранее подтверждено.':'Выбор этого пункта означает ваше подтверждение для данного резюме.'}</p><details><summary>Источник и исходная формулировка</summary>${f.sourceRefs.map(s=>`<p>${escape(s.source_id)} ${escape(s.locator)}: ${escape(s.excerpt)}</p>`).join('')}${f.confirmation?'<p>Уточнение пользователя: '+escape(f.confirmation.confirmed_statement||f.confirmation.quote)+'</p>':''}</details></article>`).join('');
 const data=JSON.stringify(pkg).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"><title>JobRadar — подготовка резюме</title><style>body{font:16px system-ui;background:#f5f7fa;color:#182d42;max-width:960px;margin:30px auto;padding:0 20px}article,header,#preview{background:white;border:1px solid #d5dce5;border-radius:12px;padding:20px;margin:16px 0}button{padding:12px;margin:8px}p{white-space:pre-wrap}details{margin:12px 0}label{display:block}footer{position:sticky;bottom:0;background:#e6edf7;padding:14px}</style><header><h1>Подготовка резюме</h1><h2>${escape(pkg.vacancy.title)} · ${escape(pkg.vacancy.company)}</h2><p>${escape(pkg.candidate)}</p><p>Факты расположены по совпадению слов с вакансией — это не оценка соответствия. Формулировки не переписаны. Отметьте нужные сведения; неподтверждённые требуют вашего выбора. Названия ролей: ${escape(Object.entries(pkg.titles).map(([s,t])=>s+' — '+t).join('; '))}.</p><p>Это локальный черновик. Выбор сохраняется в этом браузере при доступном хранилище; для переноса скачайте черновик JSON. Исходный профиль не изменяется.</p><details><summary>Описание вакансии (до 12 000 символов)</summary><p>${escape(pkg.vacancy.description||'Описание отсутствует. Проверьте оригинал вакансии.')}</p></details></header><h2>Предпросмотр резюме</h2><div id="preview" aria-live="polite"></div><p id="draft-status" role="status"></p><button id="save-draft">Скачать черновик JSON</button><label>Загрузить черновик<input id="load-draft" type="file" accept="application/json,.json"></label><h2>Состав резюме и отличия от базы</h2>${rows}<footer><p id="count"></p><label><input id="approve" type="checkbox">Я проверил выбранные факты, контакты и названия ролей</label><button id="export">Скачать резюме HTML</button><button id="manifest">Скачать запись проверки</button><p id="status" role="status"></p></footer><script>(${controls.toString()})(${data},${validateSelection.toString()},${resumeBody.toString()},${resumeDocument.toString()});</script></html>`;
}
module.exports={renderPackage};
