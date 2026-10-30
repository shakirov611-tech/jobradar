const {decisionLabels} = require('../matching/personal-match.cjs');
const {validateAnswers,validateLabels} = require('../matching/review.cjs');
const escape = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeLink(row) {try {const u=new URL(row.original_url);if(u.protocol==='https:'&&!u.username&&!u.password)return `<a href="${escape(u.href)}" target="_blank" rel="noopener noreferrer">Оригинал вакансии</a>`;}catch{}return '';}
// Embedded in the offline report; no network, no application submission.
function reviewControls(snapshot,checkAnswers,initialLabels) {
  const key='jobradar-review-'+snapshot.snapshotId;
  const status=document.querySelector('#save-status');
  const controls=[...document.querySelectorAll('article')];
  function exportValue() {
    return {schemaVersion:2,snapshotId:snapshot.snapshotId,profileFingerprint:snapshot.profileFingerprint,policy:snapshot.policy,answers:controls.flatMap((el,i)=>{
      const radio=el.querySelector('input:checked');
      const reason=el.querySelector('textarea').value.slice(0,500);
      const assessment=Object.fromEntries([...el.querySelectorAll('[data-assessment]')].filter(s=>s.value).map(s=>[s.dataset.assessment,s.value]));
      return radio||reason||Object.keys(assessment).length?[{vacancy_id:snapshot.items[i].vacancy_id,contentHash:snapshot.items[i].contentHash,label:radio?.value||null,reason,assessment}]:[];
    })};
  }
  function update() {
    const value=exportValue();document.querySelector('#progress').textContent='Оценено: '+value.answers.filter(a=>a.label).length+' из '+snapshot.items.length;
    try {localStorage.setItem(key,JSON.stringify(value));status.textContent='Черновик сохранён в этом браузере. Для переноса скачайте оценки.';}
    catch {status.textContent='Автосохранение недоступно. Скачайте оценки перед закрытием страницы.';}
  }
  function restore(value) {
    checkAnswers(snapshot,value);
    controls.forEach((el,i)=>{
      const a=value.answers.find(x=>x.vacancy_id===snapshot.items[i].vacancy_id);
      for(const r of el.querySelectorAll('input'))r.checked=a?.label===r.value;
      el.querySelector('textarea').value=a?.reason||'';
      for(const select of el.querySelectorAll('[data-assessment]'))select.value=a?.assessment?.[select.dataset.assessment]||'';
    });
  }
  let message='';
  try {if(initialLabels)restore(initialLabels);else {const saved=localStorage.getItem(key);if(saved)restore(JSON.parse(saved));}}catch{message='Сохранённые оценки не удалось загрузить. Используйте скачанный JSON.';}
  for(const el of controls)el.addEventListener('input',update);
  document.querySelector('#export').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify(exportValue(),null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='jobradar-labels-'+snapshot.snapshotId.slice(0,12)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  document.querySelector('#import').addEventListener('change',async event=>{
    try {const file=event.target.files[0];if(!file)return;if(file.size>100000)throw Error('large');restore(JSON.parse(await file.text()));update();document.querySelector('#import-status').textContent='Оценки загружены.';}
    catch {document.querySelector('#import-status').textContent='Файл не подходит к этой выборке или повреждён. Текущие оценки сохранены.';}
    event.target.value='';
  });
  update();if(message)status.textContent=message;
}
function renderReview(snapshot,{labels}={}) {
  if(labels)validateLabels(snapshot,labels);
  const failures=snapshot.sourceResults.filter(x=>x.status==='failed');
  const sourceNote=`<p>Успешных источников: ${snapshot.sourceResults.filter(x=>x.status==='passed').length}. Ошибок: ${failures.length}.${failures.length?' Неполная выборка: '+failures.map(x=>escape(x.company)+' ('+escape(x.error)+')').join(', '):''}</p>`;
  const select=(key,label,options)=>`<label>${label}<select data-assessment="${key}"><option value="">Не оценено</option>${options.map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select></label>`;
  const fitOptions=[['suitable','Да'],['unsuitable','Нет'],['uncertain','Нужно уточнить']];
  const dimensions=select('roleInterest','Роль интересна?',fitOptions)+select('conditions','Условия подходят?',fitOptions)+select('description','Описание удалось прочитать?',[['readable','Да'],['unreadable','Нет']]);
  const cards=snapshot.items.map((row,i)=>`<article><h2>${i+1}. ${escape(row.title)}</h2><p>${escape(row.company)} · ${escape(row.location)}</p><p>Снимок: ${escape(snapshot.observedAt)}. Проверьте актуальность по оригиналу.</p><details class="job-text" open><summary>Описание вакансии${row.reviewTextTruncated?' (фрагмент)':''}</summary><p class="description" tabindex="0">${escape(row.reviewText||'Описание не получено. Попробуйте оригинал; если текста нет, отметьте это ниже.')}</p>${row.reviewTextTruncated?'<p>Показаны первые 12000 символов. Остальные условия могут быть в оригинале.</p>':''}</details>${safeLink(row)}<p class="hint">Если оригинал открывает только форму отклика, прочитайте сохранённое описание выше. Интерес к роли и доступность работы из вашей страны — разные оценки.</p><fieldset><legend>Ваша оценка вакансии ${i+1}</legend><label><input type="radio" name="label-${i}" value="suitable">Подходит</label><label><input type="radio" name="label-${i}" value="unsuitable">Не подходит</label><label><input type="radio" name="label-${i}" value="uncertain">Уточнить</label><div class="dimensions">${dimensions}</div><p class="hint">Уточнения необязательны. Они сохраняются даже без общей оценки; отсутствие описания не означает, что роль не подходит.</p><label>Причина (необязательно)<textarea maxlength="500" rows="2"></textarea></label></fieldset><details class="model-decision"><summary>Решение алгоритма — открыть после своей оценки</summary><p>${escape(decisionLabels[row.matching.decision])}</p>${['reasons','gaps','unknowns','exclusions'].map(k=>row.matching[k].map(x=>`<p>${escape(x.text)} <small>${escape(x.evidence)}</small></p>`).join('')).join('')}</details></article>`).join('');
  const data={snapshotId:snapshot.snapshotId,profileFingerprint:snapshot.profileFingerprint,policy:snapshot.policy,items:snapshot.items.map(x=>({vacancy_id:x.vacancy_id,contentHash:x.contentHash}))};
  const embed=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const safeData=embed(data);
  const originalNote=labels?'<p>Открыт сохранённый снимок: вакансии и решения алгоритма не пересчитаны. Оценки загружены из выбранного файла.</p>':'';
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"><title>JobRadar — проверка подбора</title><style>body{font:16px system-ui;max-width:920px;margin:30px auto;padding:0 18px;background:#f6f8fb;color:#173047}article{background:white;border:1px solid #dce3ec;padding:20px;margin:20px 0;border-radius:12px}label{display:inline-block;margin:10px}textarea{display:block;max-width:100%;width:600px}button{padding:10px}details{margin:14px 0}.description{white-space:pre-wrap;max-height:400px;overflow:auto;line-height:1.6}small,.hint{color:#596575}.hint{font-size:14px}.dimensions{display:flex;flex-wrap:wrap;gap:8px}.dimensions label{display:flex;flex-direction:column;gap:8px;flex:1;min-width:180px}select{padding:8px;max-width:100%}fieldset{border:1px solid #dce3ec}header{background:#e7eef8;padding:20px}</style><header><h1>Проверка подбора: ${snapshot.items.length} вакансий</h1>${sourceNote}${originalNote}<p>Оцените полезность для себя: подходит, не подходит или нужно уточнить. Причина помогает исправить правила. Включены разные компании и группы, в том числе исключённые вакансии для поиска ошибок отсева. Это контрольная выборка, не оценка всего рынка.</p><p>Страна: ${escape(snapshot.profile.country)}. Приоритеты: ${escape(snapshot.profile.matching?.primaryRoles.join(', ')||'не настроены')}. Уровни: ${escape(snapshot.profile.matching?.preferredSeniority.join(', ')||'не заданы')}. Предпочтительный язык команды: ${escape(snapshot.profile.matching?.preferredTeamLanguages.join(', ')||'не задан')}. Remote обязателен.</p><p>Отмечайте до просмотра решения алгоритма. Отсутствие описания или истёкшая вакансия — повод выбрать «Уточнить» и указать причину.</p><p id="progress"></p><p id="save-status" role="status"></p><button id="export">Скачать оценки JSON</button><label>Загрузить сохранённые оценки<input id="import" type="file" accept="application/json,.json"></label><p id="import-status" role="status"></p></header>${cards}<script>(${reviewControls.toString()})(${safeData},${validateAnswers.toString()},${embed(labels||null)});</script></html>`;
}
module.exports={renderReview};
