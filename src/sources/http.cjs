// Shared bounded GET transport. Headers and pacing are scoped to one provider.
async function getJson(url,{fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),deadline=Date.now()+30000,headers={},beforeRequest}={}) {
 for(let attempt=0;attempt<2;attempt++) {
  if(beforeRequest)await beforeRequest();
  const remaining=deadline-Date.now();if(remaining<=0)throw new Error('JR_SOURCE_DEADLINE');
  let response;
  try{response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{Accept:'application/json',...headers},signal:AbortSignal.timeout(Math.min(15000,remaining))});}catch{if(attempt===0){await sleep(500);continue;}throw new Error('JR_SOURCE_TRANSPORT');}
  if(response.ok){try{return await response.json();}catch{throw new Error('JR_SOURCE_INVALID_JSON');}}
  if(attempt===0&&[429,500,502,503,504].includes(response.status)){const raw=response.headers?.get?.('retry-after');const delay=raw?(Number.isFinite(Number(raw))?Number(raw)*1000:Date.parse(raw)-Date.now()):500;if(!Number.isFinite(delay)||delay>2000)throw new Error('JR_SOURCE_HTTP_'+response.status);await sleep(Math.max(500,delay));continue;}
  throw new Error('JR_SOURCE_HTTP_'+response.status);
 }
}
module.exports={getJson};
