'use strict';
// Round evidence is embedded in the already-persisted casino ledger memo. No new unsnapshotted tables.
// This is a SERVER EVENT RECORD, not a cryptographic proof or a claim about pre-v7 rounds.
const PREFIX=' | JRR7:';
const VALID_GAMES=new Set(['roulette','bigwheel']);
const ENTRY_TYPES=new Set(['roulette_bet','bigwheel_bet','bigwheel_win','bigwheel_receipt']);
const VALID_AMT=/^(0|[1-9]\d*)$/;
function fail(message){return Object.assign(new Error(message),{code:'BAD_ROUND_RECEIPT'});}
function moneyString(v){
 const s=typeof v==='bigint'?v.toString():String(v);
 if(!VALID_AMT.test(s)||s.length>100)throw fail('Invalid G amount in evidence.');
 return s;
}
function encodeRoundEvidence(event){
 if(!event||!VALID_GAMES.has(event.game))throw fail('Unknown round game.');
 if(!event.outcome||typeof event.outcome!=='object')throw fail('Missing round outcome.');
 const data={v:7,game:event.game,wagerG:moneyString(event.wagerG),spentG:moneyString(event.spentG),
  payoutG:moneyString(event.payoutG),balanceG:moneyString(event.balanceG),
  outcome:event.outcome,free:event.free===true,won:event.won===true};
 if(BigInt(data.spentG)>BigInt(data.wagerG))throw fail('Stake debited exceeds effective wager.');
 if(event.game==='roulette'){
  if(data.free||!Array.isArray(event.bets)||!event.bets.length||event.bets.length>30)
   throw fail('Roulette requires actual bet lines.');
  const n=Number(event.outcome.number);
  if(!Number.isInteger(n)||n<0||n>36||!['red','black','green'].includes(event.outcome.color))
   throw fail('Invalid roulette pocket.');
  data.bets=event.bets.map(b=>({
   kind:String(b.kind).slice(0,24),
   target:Array.isArray(b.target)?b.target.map(Number):b.target??null,
   amountG:moneyString(b.amount),mult:Number(b.mult),
   won:b.won===true,returnedG:moneyString(b.returned)
  }));
  if(data.bets.some(b=>!Number.isSafeInteger(b.mult)||b.mult<1||b.mult>36))throw fail('Invalid roulette multiplier.');
 }else{
  const out=event.outcome;
  if(!Number.isSafeInteger(out.index)||out.index<0||out.index>255||
   !Number.isSafeInteger(out.multiplier)||out.multiplier<1||out.multiplier>1000||
   typeof out.key!=='string'||out.key.length>40)throw fail('Invalid wheel result.');
  data.selection=String(event.selection??'').slice(0,64);
  data.outcome={index:out.index,key:out.key,multiplier:out.multiplier,label:String(out.label??'').slice(0,64)};
 }
 const encoded=Buffer.from(JSON.stringify(data),'utf8').toString('base64url');
 if(encoded.length>12000)throw fail('Evidence is too large.');
 return encoded;
}
function attachRoundEvidence(memo,event){
 const base=String(memo||'');
 if(base.includes(PREFIX))throw fail('Evidence already attached.');
 return base+PREFIX+encodeRoundEvidence(event);
}
function decodeRoundEvidence(memo){
 if(typeof memo!=='string')return null;
 const i=memo.lastIndexOf(PREFIX);
 if(i<0)return null;
 const encoded=memo.slice(i+PREFIX.length);
 if(!/^[\w-]{20,12000}$/.test(encoded))return null;
 try{
  const x=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
  if(!x||x.v!==7||!VALID_GAMES.has(x.game)||!x.outcome)return null;
  for(const k of ['wagerG','spentG','payoutG','balanceG']){
   if(typeof x[k]!=='string'||!VALID_AMT.test(x[k])||x[k].length>100)return null;
  }
  if(typeof x.free!=='boolean'||typeof x.won!=='boolean')return null;
  if(x.game==='roulette'&&(!Array.isArray(x.bets)||x.bets.length<1||x.bets.length>30))return null;
  return x;
 }catch{return null;}
}
const actual=(row,k)=>row[k]??row[k==='amount_exact'?'amount':'balance_after'];
const asBig=x=>{try{if(!/^-?\d+$/.test(String(x)))return null;return BigInt(String(x));}catch{return null;}};
const ROULETTE_MULT=Object.freeze({straight:36,split:18,street:12,corner:9,sixline:6,dozen:3,column:3,red:2,black:2,odd:2,even:2,low:2,high:2});
const RED_NUMBERS=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function rouletteHit(b,n){
 const a=Number(b.target),numbers=Array.isArray(b.target)?b.target.map(Number):[];
 if(b.kind==='straight')return n===a;
 if(b.kind==='split'||b.kind==='corner')return numbers.includes(n);
 if(b.kind==='street')return a>=1&&a<=12&&n>=a*3-2&&n<=a*3;
 if(b.kind==='sixline')return a>=1&&a<=11&&n>=a*3-2&&n<=(a+1)*3;
 if(b.kind==='dozen')return n>=1+(a-1)*12&&n<=a*12;
 if(b.kind==='column')return n>0&&((n-1)%3)+1===a;
 if(b.kind==='red')return RED_NUMBERS.has(n);
 if(b.kind==='black')return n>0&&!RED_NUMBERS.has(n);
 if(b.kind==='odd')return n>0&&n%2===1;
 if(b.kind==='even')return n>0&&n%2===0;
 if(b.kind==='low')return n>0&&n<=18;
 if(b.kind==='high')return n>=19&&n<=36;
 return null;
}
const WHEEL_MULT=Object.freeze({x2:2,x3:3,x5:5,x10:10,x15:15,junja:100});
function evaluateRound(db,row){
 const event=decodeRoundEvidence(row.memo);
 const base={receiptId:row.id,reference:'JRR7-L'+row.id,game:event?.game??null,
  createdAt:row.created_at,userId:row.user_id};
 if(!event)return {...base,status:'invalid',errors:['EVIDENCE_NOT_DECODABLE']};
 const errors=[],spent=BigInt(event.spentG),wager=BigInt(event.wagerG),
  payout=BigInt(event.payoutG),balance=BigInt(event.balanceG);
 const signed=asBig(row.amount_text),ledgerBalance=asBig(row.balance_text);
 const expectedType=event.game==='roulette'?'roulette_bet':event.free?(payout>0n?'bigwheel_win':'bigwheel_receipt'):'bigwheel_bet';
 if(row.type!==expectedType)errors.push('ENTRY_TYPE_MISMATCH');
 if(spent>wager)errors.push('SPENT_EXCEEDS_WAGER');
 if((event.game==='roulette'||!event.free)&&signed!==-spent)errors.push('BET_DEBIT_MISMATCH');
 if(event.free&&signed!==(payout>0n?payout:0n))errors.push('FREE_ENTRY_AMOUNT_MISMATCH');
 if(event.free&&(spent!==0n||event.game!=='bigwheel'))errors.push('FREE_WAGER_INVALID');
 if(event.game==='roulette'){
  // Match each declared return to wager x multiplier; only a 0G loss can have no winning line.
  let sum=0n,stake=0n;
  const bets=event.bets||[];
  for(const b of bets){
   const v=asBig(b.amountG),ret=asBig(b.returnedG);
   if(v===null||v<1n||ret===null||!Number.isSafeInteger(b.mult)||b.mult<1||b.mult>36){errors.push('BET_LINES_INVALID');break;}
   stake+=v;sum+=ret;
   const hit=rouletteHit(b,Number(event.outcome.number));
   if(hit===null||b.mult!==ROULETTE_MULT[b.kind])errors.push('BET_KIND_INVALID');
   if(hit!==b.won)errors.push('ROULETTE_RESULT_BET_MISMATCH');
   if(ret!==(hit?v*BigInt(b.mult):0n))errors.push('BET_MULTIPLIER_MISMATCH');
  }
  if(stake!==wager||sum!==payout)errors.push('ROULETTE_LINES_SUM_MISMATCH');
  const n=Number(event.outcome.number),c=event.outcome.color;
  if(!Number.isInteger(n)||n<0||n>36||c!==(n===0?'green':[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(n)?'red':'black'))
   errors.push('ROULETTE_RESULT_INVALID');
 }else{
  const key=event.outcome.key,mult=event.outcome.multiplier;
  if(!Object.hasOwn(WHEEL_MULT,key)||WHEEL_MULT[key]!==mult)errors.push('WHEEL_RESULT_INVALID');
  if(event.won!==(key==='junja'||key===event.selection))errors.push('WHEEL_HIT_MISMATCH');
  if(event.won!==(payout>0n))errors.push('WHEEL_WIN_FLAG_MISMATCH');
  if(payout>0n&&payout!==wager*BigInt(event.outcome.multiplier||0))errors.push('WHEEL_PAYOUT_MISMATCH');
 }
 // Evidence is saved on a bet debit for paid games, or the sole receipt/win row for free spins.
 if(event.free){
  if(ledgerBalance!==balance)errors.push('FINAL_BALANCE_MISMATCH');
 }else{
  if(ledgerBalance!==balance-payout)errors.push('DEBIT_BALANCE_MISMATCH');
  const next=db.prepare("SELECT id,user_id,type,created_at,COALESCE(amount_exact,CAST(amount AS TEXT)) AS amount_text,COALESCE(balance_after_exact,CAST(balance_after AS TEXT)) AS balance_text FROM ledger WHERE id=?").get(row.id+1);
  const hasWin=!!(next&&next.user_id===row.user_id&&next.type===event.game+'_win'&&next.created_at===row.created_at);
  if(payout>0n){
   if(!hasWin)errors.push('WIN_LEDGER_MISSING');
   else{
    if(asBig(next.amount_text)!==payout)errors.push('WIN_AMOUNT_MISMATCH');
    if(asBig(next.balance_text)!==balance)errors.push('FINAL_BALANCE_MISMATCH');
   }
  }else if(hasWin)errors.push('UNEXPECTED_WIN_LEDGER');
 }
 return {...base,status:errors.length?'mismatch':'verified',errors,wagerG:event.wagerG,spentG:event.spentG,
  payoutG:event.payoutG,balanceG:event.balanceG,free:event.free,won:event.won,outcome:event.outcome,
  selection:event.selection??null,bets:event.bets??[],checkedAgainstLedger:true};
}
function listRoundReceipts(db,{userId,game='all',limit=20,beforeId=null,receiptId=null}={}){
 if(!db||typeof db.prepare!=='function')throw fail('Missing ledger database.');
 if(!Number.isSafeInteger(userId)||userId<1)throw fail('Invalid member.');
 if(!['all',...VALID_GAMES].includes(game))throw fail('Invalid game filter.');
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw fail('Invalid receipt count.');
 if(beforeId!==null&&(!Number.isSafeInteger(beforeId)||beforeId<1))throw fail('Invalid page cursor.');
 if(receiptId!==null&&(!Number.isSafeInteger(receiptId)||receiptId<1))throw fail('Invalid receipt ID.');
 const src="SELECT id,user_id,type,memo,created_at,COALESCE(amount_exact,CAST(amount AS TEXT)) AS amount_text,COALESCE(balance_after_exact,CAST(balance_after AS TEXT)) AS balance_text FROM ledger";
 const clause="user_id=? AND type IN ('roulette_bet','bigwheel_bet','bigwheel_win','bigwheel_receipt') AND memo LIKE '% | JRR7:%'";
 const rows=receiptId===null
  ?db.prepare(src+' WHERE '+clause+' AND id<? ORDER BY id DESC LIMIT ?').all(userId,beforeId??Number.MAX_SAFE_INTEGER,limit+1)
  :db.prepare(src+' WHERE '+clause+' AND id=? LIMIT 1').all(userId,receiptId);
 const entries=rows.slice(0,limit).map(row=>evaluateRound(db,row)).filter(x=>game==='all'||x.game===game);
 return {
  version:7,kind:'LEDGER_BACKED_ROUND_RECEIPTS',rows:entries,
  nextBeforeId:receiptId===null&&rows.length>limit?rows[limit-1].id:null,
  note:'영수증은 기록 도입 이후 새 회차에만 발행됩니다. 과거 미기록 회차는 영수증으로 소급 판정하지 않습니다.'
 };
}
module.exports={attachRoundEvidence,decodeRoundEvidence,listRoundReceipts,evaluateRound};
