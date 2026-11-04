'use strict';
// JUNJA LAND member support and pre-commerce refund INQUIRY workflow.
// Inquiry != financial refund. There is intentionally NO charge, cancel,
// refund, entitlement, loan or wallet mutation anywhere in this module.
const {randomUUID}=require('node:crypto');
const PREFIX='support:case:v1:',COUNTER='support:case:counter:v1',RECENT='support:case:recent:v1';
const CATEGORIES=Object.freeze(['game_settlement','account','premium_preview','refund_inquiry','other']);
const STATES=Object.freeze(['OPEN','REVIEWING','NEEDS_INFO','RESOLVED','CLOSED']);
const validId=id=>Number.isSafeInteger(id)&&id>0;
const ticketKey=id=>PREFIX+String(id).padStart(8,'0');
const userKey=id=>'support:case:user:'+id;
const reqKey=(id,req)=>'support:case:req:'+id+':'+req;
const actionKey=(id,req)=>'support:case:action:'+id+':'+req;
const fail=(m,code='BAD_SUPPORT_REQUEST')=>Object.assign(new Error(m),{code});
function createSupportCenter({db,now=Date.now}){
 if(!db||typeof db.prepare!=='function')throw fail('게임 데이터 연결 오류입니다.');
 function read(key,defaultValue=null){
  const row=db.prepare('SELECT value FROM game_state WHERE key=?').get(key);
  if(!row)return defaultValue;
  try{return JSON.parse(row.value)}catch{throw fail('고객지원 저장 데이터 오류입니다.');}
 }
 function write(key,value){
  db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(key,JSON.stringify(value),now());
 }
 function safeText(x,max,min=1){
  if(typeof x!=='string'||x.length>max*2)throw fail('내용 길이를 확인해주세요.');
  const v=x.trim().replace(/\s+/g,' ').slice(0,max);
  if(v.length<min)throw fail('문의 내용을 더 작성해주세요.');
  return v;
 }
 function find(id){const row=read(ticketKey(id));return row&&row.id===id?row:null;}
 function userList(userId,{limit=30}={}){
  if(!validId(userId))throw fail('로그인이 필요합니다.');
  if(!Number.isSafeInteger(limit)||limit<1||limit>80)throw fail('조회 개수를 확인해주세요.');
  const ids=read(userKey(userId),[]);
  return {ok:true,items:(Array.isArray(ids)?ids:[]).slice(0,limit).map(find).filter(t=>t&&t.userId===userId).map(view)};
 }
 function view(t){
  return {id:t.id,reference:t.reference,category:t.category,subject:t.subject,message:t.message,
   status:t.status,createdAt:t.createdAt,updatedAt:t.updatedAt,version:t.version,
   adminNote:t.adminNote||'',history:t.history.map(h=>({status:h.status,at:h.at,note:h.note||''}))};
 }
 function create({userId,category,subject,message,requestId}){
  if(!validId(userId))throw fail('로그인이 필요합니다.');
  if(!CATEGORIES.includes(category))throw fail('문의 종류를 선택해주세요.');
  const title=safeText(subject,75,4),body=safeText(message,600,8);
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{12,80}$/.test(requestId))throw fail('문의 요청번호가 올바르지 않습니다.');
  const input={userId,category,subject:title,message:body};
  db.exec('BEGIN IMMEDIATE');
  try{
   const duplicate=read(reqKey(userId,requestId));
   if(duplicate){
    if(JSON.stringify(duplicate.input)!==JSON.stringify(input))throw fail('같은 요청번호가 다른 문의에 사용됐습니다.');
    const t=find(duplicate.id);
    if(!t)throw fail('기존 문의를 찾지 못했습니다.');
    db.exec('COMMIT');return {...view(t),duplicate:true};
   }
   const old=userList(userId,{limit:80}).items;
   if(old.filter(x=>['OPEN','REVIEWING','NEEDS_INFO'].includes(x.status)).length>=3)
    throw fail('진행 중인 문의가 3건입니다. 기존 문의 처리를 확인해주세요.');
   const current=Number(read(COUNTER,0));
   if(!Number.isSafeInteger(current)||current<0||current>=99999999)throw fail('문의 번호 할당 오류입니다.');
   const id=current+1,stamp=now();
   const t={id,reference:'JCS-'+String(id).padStart(8,'0'),userId,category,subject:title,message:body,
    status:'OPEN',createdAt:stamp,updatedAt:stamp,version:1,
    adminNote:'',history:[{status:'OPEN',at:stamp,note:'회원 문의 접수'}]};
   write(COUNTER,id);
   write(ticketKey(id),t);
   write(userKey(userId),[id,...(read(userKey(userId),[])||[])].slice(0,500));
   write(RECENT,[id,...(read(RECENT,[])||[])].slice(0,1000));
   write(reqKey(userId,requestId),{input,id});
   db.exec('COMMIT');
   return {...view(t),duplicate:false};
  }catch(e){try{db.exec('ROLLBACK')}catch{}throw e;}
 }
 function adminList({limit=80,status='all'}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw fail('조회 개수가 올바르지 않습니다.');
  if(status!=='all'&&!STATES.includes(status))throw fail('문의 상태 필터가 올바르지 않습니다.');
  const ids=read(RECENT,[]);
  const results=(Array.isArray(ids)?ids:[]).map(find).filter(t=>t&&(status==='all'||t.status===status)).slice(0,limit);
  const userIds=[...new Set(results.map(x=>x.userId))];
  const lookup=new Map(userIds.map(id=>{
   const row=db.prepare('SELECT nickname FROM users WHERE id=?').get(id);
   return [id,row?.nickname||'탈퇴/미상 회원'];
  }));
  return {ok:true,states:STATES,categories:CATEGORIES,items:results.map(t=>({...view(t),userId:t.userId,nickname:lookup.get(t.userId)}))};
 }
 function update({operatorId,id,status,adminNote,expectedVersion,requestId}){
  if(!validId(operatorId)||!validId(id))throw fail('문의 접근 권한 또는 번호가 올바르지 않습니다.');
  if(!STATES.includes(status)||status==='OPEN')throw fail('허용되지 않은 상태 변경입니다.');
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw fail('문의 버전 확인이 필요합니다.');
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{12,80}$/.test(requestId))throw fail('처리 요청번호가 올바르지 않습니다.');
  const note=adminNote? safeText(adminNote,250):'';
  const input={operatorId,id,status,note,expectedVersion};
  db.exec('BEGIN IMMEDIATE');
  try{
   const previous=read(actionKey(id,requestId));
   if(previous){
    if(JSON.stringify(previous.input)!==JSON.stringify(input))throw fail('같은 요청번호로 다른 처리를 시도했습니다.');
    db.exec('COMMIT');return {...previous.result,duplicate:true};
   }
   const t=find(id);if(!t)throw fail('문의를 찾지 못했습니다.');
   if(t.version!==expectedVersion)throw fail('다른 운영자가 처리한 문의입니다. 다시 조회하세요.','STALE_CASE');
   const original=t.status;
   if(t.status==='CLOSED')throw fail('종결된 문의는 수정할 수 없습니다.');
   t.status=status;t.version++;t.updatedAt=now();t.adminNote=note;
   t.history=[...t.history,{status,from:original,at:t.updatedAt,by:operatorId,note}].slice(-20);
   write(ticketKey(id),t);
   const result={...view(t),userId:t.userId,nickname:db.prepare('SELECT nickname FROM users WHERE id=?').get(t.userId)?.nickname||'미상'};
   write(actionKey(id,requestId),{input,result});
   db.exec('COMMIT');return {...result,duplicate:false};
  }catch(e){try{db.exec('ROLLBACK')}catch{}throw e;}
 }
 return Object.freeze({create,userList,adminList,update,CATEGORIES,STATES});
}
module.exports={createSupportCenter,CATEGORIES,STATES};
