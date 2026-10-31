'use strict';
// Optional public KOSPI market reference for fictional J-STOCK.
// No financial orders or external user data are transmitted. Failure always falls back to simulation.
const TICKERS=Object.freeze([
 {id:'A',code:'005930',name:'삼성전자'},
 {id:'B',code:'005380',name:'현대차'},
 {id:'C',code:'352820',name:'하이브'},
 {id:'D',code:'068270',name:'셀트리온'},
 {id:'E',code:'015760',name:'한국전력'},
 {id:'F',code:'329180',name:'HD현대중공업'},
 {id:'G',code:'207940',name:'삼성바이오로직스'},
 {id:'H',code:'003490',name:'대한항공'},
 {id:'I',code:'454910',name:'두산로보틱스'},
 {id:'J',code:'012450',name:'한화에어로스페이스'}
]);
const SOURCE='네이버 증권 공개 국내주식 시세 (비공식 인터페이스)';
const API='https://polling.finance.naver.com/api/realtime/domestic/stock/';
function parseQuoteResponse(json,at=Date.now()){
 if(!json||!Array.isArray(json.datas))throw Error('참고 시세 형식이 변경되었습니다.');
 const stocks={};
 for(const item of json.datas){
  const match=TICKERS.find(x=>x.code===String(item?.itemCode));
  if(!match||item?.stockExchangeType?.code!=='KS')continue;
  const pct=Number(item.fluctuationsRatioRaw??item.fluctuationsRatio);
  const tradedAt=Date.parse(item.localTradedAt||'');
  if(!Number.isFinite(pct)||Math.abs(pct)>30.01||!Number.isFinite(tradedAt)||tradedAt>at+3600000||at-tradedAt>7*86400000)continue;
  stocks[match.id]={name:match.name,code:match.code,changeBp:Math.round(pct*100),tradedAt};
 }
 if(Object.keys(stocks).length<5)throw Error('참고 종목 시세 수신이 불충분합니다.');
 return {source:SOURCE,fetchedAt:at,stocks};
}
function isReferenceFresh(q,at=Date.now()){
 if(!q||!Number.isFinite(q.tradedAt))return false;
 // Do not replay Friday's close into all weekend game ticks or use old prices.
 const day=new Date(at+9*3600000).getUTCDay();
 return day!==0&&day!==6&&at>=q.tradedAt&&at-q.tradedAt<=24*3600000;
}
function createKospiReference({fetchImpl=globalThis.fetch,now=Date.now}={}){
 let snapshot=null,inflight=null,lastAttempt=0;
 async function refresh(force=false){
  if(inflight)return inflight;
  if(!force&&now()-lastAttempt<20*60*1000)return snapshot;
  lastAttempt=now();
  inflight=(async()=>{
   try{
    if(typeof fetchImpl!=='function')return snapshot;
    const response=await fetchImpl(API+TICKERS.map(x=>x.code).join(','),{
     method:'GET',headers:{'Accept':'application/json'},signal:AbortSignal.timeout(6000)
    });
    if(!response.ok)throw Error('참고 시세 HTTP '+response.status);
    const data=await response.json(),parsed=parseQuoteResponse(data,now());
    snapshot=parsed;
   }catch(error){
    // Failure of a third-party quote service must never block user login or stock trading.
    if(process.env.JSTOCK_DEBUG_REFERENCE==='1')console.warn('[J-STOCK] reference unavailable:',String(error?.message||error));
   }finally{inflight=null;}
   return snapshot;
  })();
  return inflight;
 }
 function get(){return snapshot;}
 function start(){
  void refresh(true);
  const timer=setInterval(()=>void refresh(),30*60*1000);
  if(typeof timer.unref==='function')timer.unref();
  return timer;
 }
 return {get,refresh,start};
}
module.exports={createKospiReference,parseQuoteResponse,isReferenceFresh,TICKERS,SOURCE};
