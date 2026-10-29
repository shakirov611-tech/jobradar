const {descriptionText} = require('./role-and-geography.cjs');
const {validateProfile} = require('./profile.cjs');
const decisionLabels = {priority:'Сначала посмотреть',review:'Нужно уточнить',excluded:'Есть противоречие'};
function roleFamily(title, role) {
  if (!role.matched) return 'other';
  if (/growth|monetization|монетизац|рост/iu.test(title)) return 'growth';
  if (/product owner|владелец\s+продукт/iu.test(title)) return 'product_owner';
  if (role.reason.includes('delivery')) return 'delivery';
  return 'product';
}
function seniority(title) {
  const rules = [ ['junior', /\b(junior|jr\.?|intern|internship|graduate|entry[- ]level)\b|младш|стаж[её]р/iu], ['executive', /\b(chief|vp|vice president|cpo)\b/iu], ['head', /\b(head|director)\b|директор|руководитель\s+продукт/iu], ['lead', /\b(lead|principal|staff|group product)\b|ведущий/iu], ['senior', /\b(senior|sr\.?)\b|старший/iu], ['middle', /\b(middle|mid[- ]level)\b/iu] ];
  for (const [value, re] of rules) { const m = String(title).match(re); if (m) return {value,evidence:m[0]}; }
  return {value:'unknown',evidence:''};
}
function languageSignals(description) {
  const clauses = descriptionText(description).split(/[.;!?]/);
  const team = [], requirements = [];
  for (const clause of clauses) {
    const c = clause.trim();
    // Negative and ambiguous clauses remain unknown, never become positive evidence.
    if (!c || /\b(?:not|no|without)\b|не требуется|не является/iu.test(c)) continue;
    for (const [code, name] of [['ru','Russian'],['en','English'],['bg','Bulgarian']]) {
      const teamPattern = new RegExp('\\b(?:our team (?:works|communicates) in '+name+'|'+name+' is (?:our|the) (?:working|team) language|(?:we are |our team is )a '+name+'[- ]speaking team)\\b', 'i');
      const requirementPattern = new RegExp('\\b(?:'+name+' (?:is )?(?:required|mandatory)|(?:fluent|fluency|proficient|proficiency) in '+name+'|(?:must|required to) speak '+name+')\\b','i');
      if (teamPattern.test(c) && !team.some(x=>x.language===code)) team.push({language:code,evidence:c.slice(0,240)});
      if (requirementPattern.test(c) && !requirements.some(x=>x.language===code)) requirements.push({language:code,evidence:c.slice(0,240)});
    }
    if (/рабочий язык (?:нашей )?команды\s*[:—-]?\s*русский|наша команда (?:общается|работает) на русском/iu.test(c) && !team.some(x=>x.language==='ru')) team.push({language:'ru',evidence:c.slice(0,240)});
  }
  return {team,requirements};
}
function matchVacancy({title, location='', role, geography, description}, profile) {
  validateProfile(profile);
  const family = roleFamily(title,role), level = seniority(title), languages = languageSignals(description);
  const reasons = [], gaps = [], unknowns = [], exclusions = [];
  const item = (code, text, source='', evidence='') => ({code,text,source,evidence:String(evidence).slice(0,240)});
  const m = profile.matching;
  if (!m) return {policy:'unconfigured',decision:'review',family,seniority:level,languages,reasons,gaps,exclusions,unknowns:[item('profile_missing','Персональный профиль не настроен')]};
  if (!role.matched || ![...m.primaryRoles,...m.secondaryRoles].includes(family)) exclusions.push(item('role_outside_profile','Роль вне выбранных направлений','title',title));
  else if (m.primaryRoles.includes(family)) reasons.push(item('primary_role','Приоритетное направление','title',title));
  else gaps.push(item('secondary_role','Дополнительное направление; проверить задачи роли','title',title));
  if (role.reason.endsWith('needs_review')) gaps.push(item('role_scope','По названию неясны продуктовый фокус или отрасль','title',title));
  if (geography.workMode === 'remote') reasons.push(item('remote_confirmed','Удалённый формат указан',geography.evidence.source,geography.evidence.snippet));
  else if (['onsite','hybrid'].includes(geography.workMode)) exclusions.push(item('office_conflict','Офис или обязательный hybrid противоречит remote-only',geography.evidence.source,geography.evidence.snippet));
  else unknowns.push(item('remote_unknown','Удалённый формат не подтверждён или условия противоречивы'));
  if (geography.status === 'restricted' && geography.reason !== 'onsite_conflicts_with_remote_preference') exclusions.push(item('country_conflict','Обнаружено ограничение географии для BG',geography.countryEvidence?'description':'location',geography.countryEvidence || location));
  else unknowns.push(item('hiring_unknown','Возможность найма из Болгарии требует подтверждения'));
  if (level.value === 'unknown') unknowns.push(item('seniority_unknown','Уровень явно не указан в названии'));
  else if (!m.preferredSeniority.length || m.preferredSeniority.includes(level.value)) reasons.push(item('seniority_preferred','Уровень в названии соответствует предпочтению','title',level.evidence));
  else gaps.push(item('seniority_gap','Уровень в названии вне предпочтений; это не жёсткий отказ','title',level.evidence));
  if (!languages.team.length) unknowns.push(item('team_language_unknown','Язык команды не установлен по явной формулировке'));
  else if (languages.team.some(x=>m.preferredTeamLanguages.includes(x.language))) reasons.push(item('team_language_preferred','Есть явное указание предпочитаемого языка команды','description',languages.team.find(x=>m.preferredTeamLanguages.includes(x.language)).evidence));
  else if (m.preferredTeamLanguages.length) gaps.push(item('team_language_gap','Указан другой язык команды; проверить комфорт работы','description',languages.team[0].evidence));
  for (const requirement of languages.requirements) unknowns.push(item('language_requirement_'+requirement.language,'Проверить соответствие явному языковому требованию','description',requirement.evidence));
  unknowns.push(item('authorization_unknown','Право на работу и форма договора не проверены'));
  unknowns.push(item('experience_unknown','Опыт, навыки, домен, зарплата и занятость ещё не сопоставлены'));
  const decision = exclusions.length ? 'excluded' : gaps.length || geography.workMode!=='remote' || level.value==='unknown' ? 'review' : 'priority';
  return {policy:m.policy,decision,family,seniority:level,languages,reasons,gaps,unknowns,exclusions};
}
module.exports = {matchVacancy,roleFamily,seniority,languageSignals,decisionLabels};
