const {languageInput,rulesAnalysis}=require('../language/analyzer.cjs');
const {languageFit}=require('../language/personalize.cjs');
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
  const a=rulesAnalysis(languageInput('',description));
  return {team:a.team_languages.filter(x=>x.basis==='explicit').map(x=>({language:x.language,evidence:x.evidence.quote})),requirements:a.required_languages.filter(x=>x.mandatory).map(x=>({language:x.language,evidence:x.evidence.quote}))};
}
function matchVacancy({title, location='', role, geography, description, languageAnalysis}, profile) {
  validateProfile(profile);
  const family = roleFamily(title,role), level = seniority(title), analysis=languageAnalysis||rulesAnalysis(languageInput(title,description)), fit=languageFit(analysis,profile), languages={team:analysis.team_languages.filter(x=>x.basis==='explicit').map(x=>({language:x.language,evidence:x.evidence.quote})),requirements:analysis.required_languages.filter(x=>x.mandatory).map(x=>({language:x.language,evidence:x.evidence.quote}))};
  const reasons = [], gaps = [], unknowns = [], exclusions = [];
  const item = (code, text, source='', evidence='') => ({code,text,source,evidence:String(evidence).slice(0,240)});
  const m = profile.matching;
  if (!m) return {policy:'unconfigured',decision:'review',language_fit:fit,dimensions:{professional:{status:'unknown'},language_requirements:fit.requirements,team_language:fit.team_preference,geography:geography.status,overall:'review'},family,seniority:level,languages,reasons,gaps,exclusions,unknowns:[item('profile_missing','Персональный профиль не настроен')]};
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
  if(fit.team_preference==='unknown')unknowns.push(item('team_language_unknown','Язык команды неизвестен'));
  else if(['preferred','inferred_preferred'].includes(fit.team_preference))reasons.push(item('team_language_preferred',fit.team_preference==='preferred'?'Предпочтительный язык команды — подтверждено текстом вакансии':'Вероятно предпочитаемый язык команды; уточнить','description',analysis.team_languages.map(x=>x.evidence.quote).join('; ')));
  else if(fit.team_preference==='other')gaps.push(item('team_language_gap','Указан другой язык команды; проверить комфорт работы','description',analysis.team_languages[0]?.evidence.quote));
  for(const req of fit.requirement_details) {
    const detail=item('language_requirement_'+req.language,'Требуется '+req.language+(req.required_level?' '+req.required_level:'')+' — '+({mismatch:'уровень ниже требования',meets:'соответствует профилю',unknown:'требуется уточнение'}[req.status]),req.evidence.field,req.evidence.quote);
    (req.status==='mismatch'?exclusions:req.status==='meets'?reasons:unknowns).push(detail);
  }
  if(['failed','pending'].includes(analysis.language_analysis_status))unknowns.push(item('language_analysis_incomplete','Языковой анализ требует уточнения; вакансия сохранена'));
  unknowns.push(item('authorization_unknown','Право на работу и форма договора не проверены'));
  unknowns.push(item('experience_unknown','Опыт, навыки, домен, зарплата и занятость ещё не сопоставлены'));
  const decision = exclusions.length ? 'excluded' : gaps.length || fit.needs_review || geography.workMode!=='remote' || level.value==='unknown' ? 'review' : 'priority';
  return {policy:m.policy,decision,language_fit:fit,dimensions:{professional:{family,seniority:level.value,status:'partial'},language_requirements:fit.requirements,team_language:fit.team_preference,geography:geography.status,overall:decision},family,seniority:level,languages,reasons,gaps,unknowns,exclusions};
}
module.exports = {matchVacancy,roleFamily,seniority,languageSignals,decisionLabels};
