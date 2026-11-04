function languageSummary(analysis,fit) {
  if(!analysis)return ['Язык команды неизвестен'];
  const name=code=>{try{return new Intl.DisplayNames(['ru'],{type:'language'}).of(code);}catch{return code;}};
  const lines=[];
  if(analysis.posting_language)lines.push('Язык публикации: '+name(analysis.posting_language));
  if(!analysis.team_languages.length)lines.push('Язык команды неизвестен');
  for(const t of analysis.team_languages)lines.push('Язык команды: '+name(t.language)+(t.basis==='explicit'?' — подтверждено текстом вакансии':' — предположение, уточнить'));
  for(const r of analysis.required_languages)lines.push((r.mandatory?'Требуется ':'Желательно / уточнить: ')+name(r.language)+(r.level?' '+r.level:'')+(r.scope==='customer'?' для общения с клиентами':''));
  if(fit?.requirements==='meets')lines.push('Языковые требования соответствуют профилю');
  if(fit?.requirements==='mismatch')lines.push('Указанный в профиле уровень ниже обязательного требования');
  if(['needs_review','pending','failed'].includes(analysis.language_analysis_status)||fit?.needs_review)lines.push('Требуется уточнение');
  return lines;
}
module.exports={languageSummary};
