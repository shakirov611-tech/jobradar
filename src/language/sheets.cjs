// Self-contained for execution inside n8n. Read-back verifies actual mapped values.
function verifyLanguageRows(expected,actual) {
  for(const row of expected) {
    const matches=actual.filter(x=>String(x.vacancy_id)===row.vacancy_id);
    if(matches.length!==1)throw Error('JR_LANGUAGE_READBACK_ID');
    for(const key of ['language_analysis','language_fit'])if(matches[0][key]!==row[key])throw Error('JR_LANGUAGE_READBACK_VALUE');
  }
  return true;
}
function configureLanguageSheets(workflow) {
  const write=workflow.nodes.find(n=>n.name==='Append or update row in sheet');
  write.parameters.options={...write.parameters.options,handlingExtraData:'error'};
  for(const id of ['language_analysis','language_fit'])if(!write.parameters.columns.schema.some(x=>x.id===id))write.parameters.columns.schema.push({id,displayName:id,required:false,defaultMatch:false,display:true,type:'string',canBeUsedToMatch:false,removed:false});
  const read=structuredClone(workflow.nodes.find(n=>n.name==='Read existing vacancies'));
  read.id='language-readback';read.name='Read language result';read.position=[1700,300];
  const verify={id:'language-verify',name:'Verify language result',type:'n8n-nodes-base.code',typeVersion:2,position:[1900,300],parameters:{jsCode:`(${verifyLanguageRows.toString()})($('Code in JavaScript').first().json.rows,$input.all().map(x=>x.json));return [{json:{verified:true}}];`}};
  workflow.nodes.push(read,verify);
  const edge=node=>({main:[[{node,type:'main',index:0}]]});
  workflow.connections[write.name]=edge(read.name);workflow.connections[read.name]=edge(verify.name);workflow.connections[verify.name]=edge('Collection result');
  return workflow;
}
module.exports={verifyLanguageRows,configureLanguageSheets};
