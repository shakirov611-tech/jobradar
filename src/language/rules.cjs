const defaults = require('../../config/language-analysis.json');
const {emptyAnalysis,languageCode} = require('./contract.cjs');
const escape = s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function contains(text, word) { return new RegExp('(?<![\\p{L}])'+escape(word)+'(?![\\p{L}])','iu').test(text); }
function analyzeRules(input, config=defaults) {
  const out=emptyAnalysis();
  if(languageCode(input.posting_hint)) {out.posting_language=input.posting_hint;out.posting_evidence={field:'posting_hint',quote:input.posting_hint};}
  else {
    const votes=Object.entries(config.posting_markers).map(([code,words])=>({code,n:words.filter(w=>contains(input.description,w)).length})).sort((a,b)=>b.n-a.n);
    if(votes[0]?.n>=3&&votes[0].n-(votes[1]?.n||0)>=2){out.posting_language=votes[0].code;out.posting_evidence={field:'description',quote:input.description.slice(0,300)};}
  }
  for(const field of ['title','description']) for(const raw of input[field].split(/[.;!?\n]|\b(?:but|however)\b/iu)) {
    const text=raw.trim();
    if(!text||text.length>500||/\b(?:not|no|without)\b|не требуется|не является|не общается|не работаем/iu.test(text))continue;
    if(/\b(?:company|organization|another team|other teams)\b|компани|другой команд/iu.test(text)&&!/\b(?:our|this) team\b|наша команда/iu.test(text))continue;
    const teamScope=/\b(?:our team (?:works|communicates) in|(?:our|the) (?:working|team) language|(?:we are |our team is )a .{1,90}[- ]speaking team|internal (?:communication|meetings).{0,30}(?:in|language))\b|рабочи[йе] язы[кк][и]? (?:нашей )?команды|наша команда (?:общается|работает) на/iu.test(text);
    const customer=/\b(?:customer|client)s?\b|клиент/iu.test(text);
    const optional=/\b(?:preferred|optional|nice to have|bonus|plus|advantage|desirable)\b|желательн|будет плюсом/iu.test(text);
    const required=/\b(?:required|mandatory|must|fluent|fluency|proficient|proficiency|essential)\b|требуется|обязательн|необходим|свободн/iu.test(text);
    const alternative=/\b(?:or|either)\b|\bлибо\b|\sили\s/iu.test(text);
    const ev={field,quote:text};
    for(const [code,aliases] of Object.entries(config.aliases)) {
      const alias=aliases.find(a=>contains(text,a));if(!alias)continue;
      if(teamScope&&!customer&&!optional&&!out.team_languages.some(x=>x.language===code))out.team_languages.push({language:code,basis:'explicit',confidence:'high',evidence:ev});
      if((required||optional)&&!teamScope&&!out.required_languages.some(x=>x.language===code&&x.scope===(customer?'customer':'role'))) {
        // Level must be adjacent to this language, never borrowed from a second language in the clause.
        const level=text.match(new RegExp(escape(alias)+'\\s*(?:at\\s+|level\\s+|[:(-]\\s*)?(A1|A2|B1|B2|C1|C2)(?![A-Za-z0-9])','i'))?.[1]?.toUpperCase()||null;
        out.required_languages.push({language:code,level,mandatory:required&&!optional&&!alternative,scope:customer?'customer':'role',confidence:alternative?'low':'high',evidence:ev});
      }
    }
  }
  return out;
}
module.exports={analyzeRules};
