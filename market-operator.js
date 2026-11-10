'use strict';
// Operator controls for JUNJA LAND's FICTIONAL, GAME-MONEY-ONLY markets.
// No external exchange APIs, deposits, wallet adjustment or real financial assets.
const {STOCKS:STOCK_LIST,MARKET_KEY:STOCK_KEY}=require('./j-stock-core');
const {STOCKS:COIN_LIST,MARKET_KEY:COIN_KEY}=require('./j-coin-core');
const CONTROL_KEY='jmarket:operator:settings:v1';
const AUDIT_KEY='jmarket:operator:audit:v1';
const COIN_CAMPAIGN='jcoin:temporary:moon-jjc-20261103-v1';
const SCHEDULE_PREFIX='jmarket:operator:schedule:v1:';
const SCHEDULE_STEP_MS=5*60000;
const SCHEDULE_DURATIONS=Object.freeze([30,60,120]);
const CONFIG={stock:{list:STOCK_LIST,key:STOCK_KEY,min:100n,max:100000000n,low:-3000,high:3000},coin:{list:COIN_LIST,key:COIN_KEY,min:100n,max:1000000000000n,low:-9500,high:20000}};
function error(message,code='INVALID_MARKET_CHANGE'){return Object.assign(new Error(message),{code});}
function percentBp(input){
 const m=/^([+-]?)(\d{1,3})(?:\.(\d{1,2}))?$/.exec(String(input??''));
 if(!m)throw error('시세 변동률은 소수점 두 자리까지 입력하세요.');
 const bp=(m[1]==='-'?-1:1)*(Number(m[2])*100+Number((m[3]||'').padEnd(2,'0')));
 if(!Number.isSafeInteger(bp)||bp===0)throw error('0%는 시세를 변경하지 않습니다.');
 return bp;
}
function createMarketControl({db,now=Date.now}){
 function read(key,fallback=null){
  const row=db.prepare('SELECT value FROM game_state WHERE key=?').get(key);
  if(!row)return fallback;
  try{return JSON.parse(row.value)}catch{throw error('운영자 시장 상태 데이터가 손상되었습니다.');}
 }
 function write(key,value){
  db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(key,JSON.stringify(value),now());
 }
 function settings(){return read(CONTROL_KEY,{stock:{},coin:{}});}
 // Scheduled events use the same durable game_state snapshot as other market prices.
 // No background worker/timer: progress is deterministically caught up inside
 // the existing market's BEGIN IMMEDIATE transaction whenever a price is read.
 function scheduleState(type){
  if(!CONFIG[type])throw error('알 수 없는 가상 시장입니다.');
  const state=read(SCHEDULE_PREFIX+type,{});
  if(!state||typeof state!=='object'||Array.isArray(state))throw error('예약 이벤트 정보가 손상됐습니다.');
  return state;
 }
 function scheduledProtected(type){
  return new Set(Object.entries(scheduleState(type)).filter(([,e])=>e?.status==='RUNNING').map(([id])=>id));
 }
 function scheduledDue(type){
  const stamp=now();
  return Object.values(scheduleState(type)).some(e=>e?.status==='RUNNING'&&
   stamp>=e.startedAt+(e.step+1)*SCHEDULE_STEP_MS);
 }
 function progressScheduled(type,market){
  const events=scheduleState(type),stamp=now();
  let changed=false;
  for(const [symbol,event] of Object.entries(events)){
   if(event?.status!=='RUNNING')continue;
   const elapsed=Math.max(0,stamp-event.startedAt);
   const step=Math.min(event.totalSteps,Math.floor(elapsed/SCHEDULE_STEP_MS));
   if(step<=event.step)continue;
   const quote=market.stocks?.[symbol];
   if(!quote)throw error('이벤트 종목의 시장 가격을 찾을 수 없습니다.');
   const start=BigInt(event.startPrice),target=BigInt(event.targetPrice),total=BigInt(event.totalSteps);
   const old=BigInt(quote.price),remaining=BigInt(event.totalSteps-step),done=BigInt(step);
   const price=(start*remaining+target*done+total/2n)/total;
   const config=CONFIG[type];
   if(price<config.min||price>config.max)throw error('예약 이벤트의 가격이 안전 범위를 벗어납니다.');
   quote.price=String(price);
   quote.changeBp=old?Number((price-old)*10000n/old):0;
   quote.event='운영자 예약 시세 · '+event.durationMinutes+'분 ('+step+'/'+event.totalSteps+')';
   quote.history=(Array.isArray(quote.history)?quote.history:[]).concat([Number(price)]).slice(-49);
   event.step=step;event.lastAppliedAt=stamp;
   if(step===event.totalSteps){
    event.status='COMPLETED';event.completedAt=stamp;
    quote.event='운영자 예약 시세 완료';
   }
   changed=true;
  }
  if(changed)write(SCHEDULE_PREFIX+type,events);
  return changed;
 }
 function volatilityFor(type,symbol){
  const val=settings()?.[type]?.[symbol];
  return [50,100,200].includes(val)?val:100;
 }
 function list(){
  const prefs=settings(),logs=read(AUDIT_KEY,[]);
  const markets=Object.fromEntries(Object.entries(CONFIG).map(([type,config])=>{
   const market=read(config.key);
   return [type,config.list.map(item=>{
    const q=market?.stocks?.[item.id];
    return {id:item.id,name:item.name,sector:item.sector,icon:item.icon,
     price:q?.price??String(item.base),changeBp:q?.changeBp??0,event:q?.event??null,
     volatilityPct:[50,100,200].includes(prefs?.[type]?.[item.id])?prefs[type][item.id]:100,
     marketInitialized:!!q};
   })];
  }));
  return {ok:true,kind:'FICTIONAL_GAME_ONLY',serverNow:now(),schedules:{stock:scheduleState('stock'),coin:scheduleState('coin')},
   limits:{stock:{minPercent:-30,maxPercent:30},coin:{minPercent:-95,maxPercent:200}},
   markets,history:Array.isArray(logs)?logs.slice(0,30):[]};
 }
 function apply({actorId,type,symbol,mode,deltaPercent=null,volatilityPct=null,expectedPrice=null,durationMinutes=null,targetEventId=null,requestId}){
  const config=CONFIG[type];
  if(!config)throw error('주식 또는 코인 시장을 선택하세요.');
  const asset=config.list.find(x=>x.id===symbol);
  if(!asset)throw error('유효하지 않은 가상 종목입니다.');
  if(!['price','volatility','schedule','cancel'].includes(mode))throw error('시세 반영·변동폭·예약 이벤트·취소 중 선택하세요.');
  if(!Number.isSafeInteger(actorId)||actorId<1)throw error('운영자 권한을 확인하지 못했습니다.');
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{12,80}$/.test(requestId))throw error('운영 요청번호가 올바르지 않습니다.');
  const bp=mode==='price'||mode==='schedule'?percentBp(deltaPercent):null;
  if((mode==='price'||mode==='schedule')&&(bp<config.low||bp>config.high))throw error(type==='stock'?'주식은 한 번에 ±30%까지만 변경할 수 있습니다.':'코인은 한 번에 -95%~+200%까지 변경할 수 있습니다.');
  if((mode==='price'||mode==='schedule')&&(typeof expectedPrice!=='string'||!/^[1-9]\d{0,15}$/.test(expectedPrice)))throw error('변경 전 가격 확인이 필요합니다.');
  if(mode==='volatility'&&![50,100,200].includes(volatilityPct))throw error('자동 변동폭은 50%·100%·200% 중 선택하세요.');
  if(mode==='schedule'&&!SCHEDULE_DURATIONS.includes(durationMinutes))throw error('예약 기간은 30분·60분·120분만 가능합니다.');
  if(mode==='cancel'&&(typeof targetEventId!=='string'||!/^[A-Za-z0-9_-]{12,80}$/.test(targetEventId)))throw error('취소할 이벤트를 선택하세요.');
  const input={actorId,type,symbol,mode,deltaPercent:['price','schedule'].includes(mode)?String(deltaPercent):null,volatilityPct:mode==='volatility'?volatilityPct:null,expectedPrice:['price','schedule'].includes(mode)?expectedPrice:null,durationMinutes:mode==='schedule'?durationMinutes:null,targetEventId:mode==='cancel'?targetEventId:null};
  const requestKey='jmarket:operator:req:'+actorId+':'+requestId;
  db.exec('BEGIN IMMEDIATE');
  try{
   const seen=read(requestKey);
   if(seen){
    if(JSON.stringify(seen.input)!==JSON.stringify(input))throw error('이미 다른 시장 변경에 사용한 요청번호입니다.');
    db.exec('COMMIT');return {...seen.result,duplicate:true};
   }
   const market=read(config.key);
   if(!market?.stocks?.[symbol])throw error('시장 정보를 먼저 새로고침해 주세요.');
   const quote=market.stocks[symbol],old=BigInt(quote.price);
   if((mode==='price'||mode==='schedule')&&old.toString()!==expectedPrice)throw error('조회한 이후 시세가 변경됐습니다. 최신 가격을 조회한 뒤 다시 적용하세요.','STALE_MARKET_PRICE');
   if(['price','schedule'].includes(mode)&&type==='coin'&&['JJC','MOON'].includes(symbol)){
    const campaign=read(COIN_CAMPAIGN);
    if(campaign&&!campaign.complete)throw error('기존 2시간 시세 이벤트가 진행 중인 종목입니다. 이벤트 종료 후 조정하세요.');
   }
   const events=scheduleState(type);
   const running=events[symbol]?.status==='RUNNING';
   if(['price','schedule'].includes(mode)&&running)throw error('이 종목의 예약 시세 이벤트가 진행 중입니다. 먼저 취소하거나 종료까지 확인하세요.');
   let next=old,newVol=volatilityFor(type,symbol);
   let schedule=null;
   if(mode==='price'){
    next=(old*BigInt(10000+bp)+5000n)/10000n;
    if(next<config.min||next>config.max)throw error('조정 후 가격이 해당 종목의 허용 범위를 벗어납니다.');
    if(next===old)throw error('조정률이 너무 작아 실제 가격이 달라지지 않습니다.');
    quote.price=String(next);
    quote.changeBp=Number((next-old)*10000n/old);
    quote.event='운영자 가상 시세 이벤트';
    quote.history=(Array.isArray(quote.history)?quote.history:[]).concat([Number(next)]).slice(-49);
    write(config.key,market);
   }else if(mode==='schedule'){
    next=(old*BigInt(10000+bp)+5000n)/10000n;
    if(next<config.min||next>config.max)throw error('예약 종료 목표가격이 종목 허용 한도를 벗어납니다.');
    if(next===old)throw error('조정률이 너무 작아 예약 목표가격이 같아집니다.');
    schedule={id:requestId,actorId,type,symbol,mode:'schedule',status:'RUNNING',
     startedAt:now(),endsAt:now()+durationMinutes*60000,
     durationMinutes,totalSteps:durationMinutes/5,step:0,
     targetPercent:String(deltaPercent),startPrice:String(old),targetPrice:String(next)};
    events[symbol]=schedule;
    write(SCHEDULE_PREFIX+type,events);
   }else if(mode==='cancel'){
    if(!running||events[symbol].id!==targetEventId)throw error('이미 종료되었거나 변경된 예약 이벤트입니다.');
    events[symbol].status='CANCELED';
    events[symbol].canceledAt=now();
    events[symbol].canceledBy=actorId;
    schedule=events[symbol];
    write(SCHEDULE_PREFIX+type,events);
   }else{
    newVol=volatilityPct;
    const data=settings();
    if(!data[type]||typeof data[type]!=='object')data[type]={};
    data[type][symbol]=newVol;
    write(CONTROL_KEY,data);
   }
   const history=read(AUDIT_KEY,[]);
   const result={ok:true,type,symbol,name:asset.name,mode,actorId,previousPrice:String(old),
    price:String(next),changeBp:mode==='price'?Number((next-old)*10000n/old):null,
    volatilityPct:newVol,at:now(),requestId,schedule};
   write(AUDIT_KEY,[result,...(Array.isArray(history)?history:[])].slice(0,100));
   write(requestKey,{input,result});
   db.exec('COMMIT');return {...result,duplicate:false};
  }catch(e){try{db.exec('ROLLBACK')}catch{}throw e;}
 }
 return {list,apply,volatilityFor,scheduledProtected,scheduledDue,progressScheduled};
}
module.exports={createMarketControl,percentBp,CONTROL_KEY,AUDIT_KEY,SCHEDULE_PREFIX,SCHEDULE_STEP_MS};
