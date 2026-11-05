'use strict';
// JUNJA PRIVATE MOTOR STUDIO — authenticated design DRAFTS, not ownership.
// Isolated game_state keys. No game wallets, premium entitlements, payments,
// auctions, loans, ranks or purchase/refund functionality.
const crypto=require('node:crypto');
const PREFIX='premium:motor-design:v1:';
const PAINTS=Object.freeze(['platinum','onyx','champagne']);
const MODEL='sovereign_gt_concept';
const fail=(code,message)=>Object.assign(new Error(message),{code});
const validUser=id=>Number.isSafeInteger(id)&&id>0;
const tokenPattern=/^[a-zA-Z0-9_-]{24}$/;
function createMotorDesignStudio({db,now=Date.now}={}){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw fail('BAD_DB','Motor studio database is unavailable.');
 const select=db.prepare('SELECT value FROM game_state WHERE key=?');
 const upsert=db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at');
 const selectUser=db.prepare('SELECT id,nickname,is_disabled FROM users WHERE id=?');
 const defaultDesign=()=>({paint:'platinum',doorsOpen:false,lightsOn:false,rotation:-.44,pitch:.22,zoom:9.1});
 function value(key){
  const row=select.get(key);if(!row)return null;
  let data;try{data=JSON.parse(row.value)}catch{throw fail('CORRUPT_DESIGN','저장된 디자인 데이터를 읽을 수 없습니다.');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw fail('CORRUPT_DESIGN','저장된 디자인이 올바르지 않습니다.');
  return data;
 }
 function getUser(userId){
  if(!validUser(userId))throw fail('BAD_USER','로그인이 필요합니다.');
  const user=selectUser.get(userId);
  if(!user||user.is_disabled)throw fail('BAD_USER','이용할 수 없는 계정입니다.');
  return user;
 }
 function read(userId){
  getUser(userId);
  const saved=value(PREFIX+userId);
  if(!saved)return {ok:true,model:MODEL,version:0,design:defaultDesign(),published:false,shareToken:null,updatedAt:null,owned:false,purchased:false,label:'디자인 시안 · 미소유'};
  return publicView(saved,true);
 }
 function publicView(data,owner=false){
  return {ok:true,model:MODEL,version:data.version,design:{...data.design},published:!!data.published,
   shareToken:owner&&data.published?data.shareToken:null,
   updatedAt:data.updatedAt,
   owned:false,purchased:false,label:'디자인 시안 · 미소유'};
 }
 function safeDesign(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw fail('BAD_DESIGN','디자인 정보를 확인해주세요.');
  if(typeof raw.paint!=='string'||!PAINTS.includes(raw.paint))throw fail('BAD_DESIGN','허용하지 않는 도장 색상입니다.');
  if(typeof raw.doorsOpen!=='boolean'||typeof raw.lightsOn!=='boolean')throw fail('BAD_DESIGN','차량 효과 값이 올바르지 않습니다.');
  for(const key of ['rotation','pitch','zoom'])if(typeof raw[key]!=='number'||!Number.isFinite(raw[key]))throw fail('BAD_DESIGN','카메라 설정이 올바르지 않습니다.');
  if(raw.rotation<-20||raw.rotation>20||raw.pitch<-.1||raw.pitch>1.13||raw.zoom<5.6||raw.zoom>15.4)throw fail('BAD_DESIGN','카메라 조작 범위를 확인해주세요.');
  return {paint:raw.paint,doorsOpen:raw.doorsOpen,lightsOn:raw.lightsOn,rotation:Math.round(raw.rotation*1000)/1000,
   pitch:Math.round(raw.pitch*1000)/1000,zoom:Math.round(raw.zoom*1000)/1000};
 }
 function safeRequestId(id){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{12,96}$/.test(id))throw fail('BAD_REQUEST','요청번호를 확인해주세요.');
  return id;
 }
 function save({userId,design,published=false,rotateShare=false,expectedVersion,requestId}={}){
  getUser(userId);
  if(typeof published!=='boolean'||typeof rotateShare!=='boolean')throw fail('BAD_REQUEST','공개 설정을 확인해주세요.');
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0)throw fail('BAD_VERSION','변경 버전이 올바르지 않습니다.');
  safeRequestId(requestId);
  const normalized=safeDesign(design);
  if(Object.keys(design).some(key=>!Object.hasOwn(normalized,key)))throw fail('BAD_DESIGN','알 수 없는 디자인 값이 포함돼 있습니다.');
  const fingerprint=JSON.stringify({design:normalized,published,rotateShare,expectedVersion});
  db.exec('BEGIN IMMEDIATE');
  try{
   const prev=value(PREFIX+userId);
   // Duplicate POST retries remain idempotent even if the browser lost a reply.
   if(prev?.lastRequestId===requestId){
    if(prev.lastFingerprint!==fingerprint)throw fail('REQUEST_CONFLICT','동일 요청번호에 다른 내용이 전달됐습니다.');
    db.exec('COMMIT');return {...publicView(prev,true),duplicate:true};
   }
   const oldVersion=prev?.version||0;
   if(oldVersion!==expectedVersion)throw fail('STALE_DESIGN','다른 창에서 디자인이 변경됐습니다. 최신 상태를 불러와주세요.');
   const shareToken=published?(!prev?.published||rotateShare||!tokenPattern.test(prev.shareToken||'')?
    crypto.randomBytes(18).toString('base64url'):prev.shareToken):null;
   const state={version:oldVersion+1,design:normalized,published,shareToken,
    updatedAt:now(),lastRequestId:requestId,lastFingerprint:fingerprint};
   upsert.run(PREFIX+userId,JSON.stringify(state),now());
   db.exec('COMMIT');
   return {...publicView(state,true),duplicate:false};
  }catch(e){try{db.exec('ROLLBACK')}catch{}throw e;}
 }
 function shared({token}={}){
  if(typeof token!=='string'||!tokenPattern.test(token))throw fail('NOT_FOUND','이 디자인 공유 링크를 찾을 수 없습니다.');
  // Only opt-in designs are eligible. The token is an unguessable URL secret
  // (144 bits) and is not a sequential member number.
  const rows=db.prepare("SELECT key,value FROM game_state WHERE key LIKE 'premium:motor-design:v1:%'").all();
  for(const row of rows){
   let data;
   try{data=JSON.parse(row.value)}catch{continue}
   if(!data?.published||typeof data.shareToken!=='string')continue;
   // Prevent timing-dependent prefix matching. Both are fixed-length tokens.
   if(data.shareToken.length!==token.length||!crypto.timingSafeEqual(Buffer.from(data.shareToken),Buffer.from(token)))continue;
   const id=Number(row.key.slice(PREFIX.length)),user=validUser(id)?selectUser.get(id):null;
   if(!user||user.is_disabled)break;
   return {...publicView(data,false),designerNickname:String(user.nickname||'회원').slice(0,36)};
  }
  throw fail('NOT_FOUND','공개 중인 디자인 시안을 찾을 수 없습니다.');
 }
 return Object.freeze({read,save,shared});
}
module.exports={createMotorDesignStudio};
