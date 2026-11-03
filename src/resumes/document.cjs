// Shared by preview and downloaded HTML; all profile text is escaped.
function resumeBody(pkg, facts) {
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const subjects=[...new Set(facts.map(f=>f.subject))];
 const sections=subjects.map(subject=>`<section><h2>${esc(subject==='candidate'?'Профиль':subject)}${pkg.titles[subject]?' — '+esc(pkg.titles[subject]):''}</h2><ul>${facts.filter(f=>f.subject===subject).map(f=>'<li>'+esc(f.text)+'</li>').join('')}</ul></section>`).join('');
 return '<h1>'+esc(pkg.candidate)+'</h1><p>'+esc(pkg.vacancy.title)+'</p>'+sections;
}
function resumeDocument(pkg, facts, resumeBody) {
 return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;"><title>Резюме</title><style>body{font:12pt Arial,sans-serif;max-width:800px;margin:32px auto;padding:0 20px;color:#172433}h1{font-size:24pt}h2{font-size:15pt}li{margin:8px 0}section{break-inside:avoid}@media print{body{margin:0;max-width:none}}</style>'+resumeBody(pkg,facts)+'</html>';
}
module.exports={resumeBody,resumeDocument};
