'use strict';
/* Black Room account save service. Uses the existing game_state snapshot table and
 * session authorization; NEVER touches users.balance, wallet, ledger or other games.
 * Writes are revision checked to prevent a second device overwriting newer progress.
 */
const E=require('./public/blackroom/engine.js');
function createBlackroomCloud({requireAuth,readBody,json,gameStateGet,gameStateSet}){
 const prefix='blackroom:ep01:user:';
 const safe=(input)=>{
  if(!input||typeof input!=='object'||Array.isArray(input)||input.v!==E.VERSION)throw Error('지원하지 않는 사건 기록입니다.');
  const s=E.hydrate(input);
  if(s.archive&&!s.door)throw Error('잘못된 사건 접근 순서입니다.');
  for(const id of s.clues){
   const clue=E.CLUES[id];
   if(clue.scene!=='hall'&&!s.door)throw Error('접근하지 않은 장소의 증거가 포함됐습니다.');
   if(clue.gate&&!s[clue.gate])throw Error('해제하지 않은 증거가 포함됐습니다.');
  }
  for(const id of s.links){
   if(!E.LINKS[id].ids.every(c=>s.clues.includes(c)))throw Error('증거 없이 생성된 추론입니다.');
  }
  if(s.solved&&!E.ready(s))throw Error('필수 추론이 없는 결말입니다.');
  return s;
 };
 function current(key){
  const value=gameStateGet(key,null);
  if(value==null)return {revision:0,state:null};
  if(typeof value!=='object'||!Number.isInteger(value.revision)||value.revision<1)
   throw Error('서버 수사 기록이 손상됐습니다. 원본 보존을 위해 덮어쓰기를 중단했습니다.');
  try{return {revision:value.revision,state:safe(value.state)};}
  catch{throw Error('서버 수사 기록 검증 실패. 진행 상태를 임의로 초기화하지 않습니다.');}
 }
 async function handle(req,res,url){
  if(!url.pathname.startsWith('/api/blackroom/'))return false;
  if(url.pathname!=='/api/blackroom/state')return json(res,404,{error:'해당 사건 API가 없습니다.'}),true;
  const user=requireAuth(req,res);
  if(!user)return true;
  const key=prefix+String(user.id);
  if(req.method==='GET'){
   return json(res,200,{ok:true,account:{id:user.id,nickname:user.nickname},...current(key)}),true;
  }
  if(req.method==='PUT'){
   const body=await readBody(req,12000);
   if(!Number.isInteger(body.revision)||body.revision<0) return json(res,400,{error:'저장 버전이 올바르지 않습니다.'}),true;
   let cleaned;
   try{cleaned=safe(body.state);}catch(e){return json(res,400,{error:e.message}),true;}
   const old=current(key);
   if(body.revision!==old.revision)return json(res,409,{error:'다른 기기에서 최신 진행도가 저장됐습니다.',...old}),true;
   const next={revision:old.revision+1,state:cleaned};
   gameStateSet(key,next);
   return json(res,200,{ok:true,revision:next.revision,state:next.state}),true;
  }
  if(req.method==='DELETE'){
   const body=await readBody(req,1000);
   const old=current(key);
   if(body.revision!==old.revision)return json(res,409,{error:'최신 사건 기록을 확인한 뒤 다시 시도해.',...old}),true;
   const next={revision:old.revision+1,state:E.initial()};
   gameStateSet(key,next);
   return json(res,200,{ok:true,...next}),true;
  }
  json(res,405,{error:'허용되지 않은 방식입니다.'},{Allow:'GET, PUT, DELETE'});return true;
 }
 return {handle,safe,current};
}
module.exports=createBlackroomCloud;