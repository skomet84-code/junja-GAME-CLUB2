'use strict';
// Read-only casino settlement evidence viewer for operators.
// Earlier rounds do not always record the landing number; a debit without a win is NOT proof of an unpaid win.
// No player balances, settlement rows, settings, or game state are written by this module.
const GAME_TYPES=Object.freeze(['roulette','bigwheel']);
const {decodeRoundEvidence,evaluateRound}=require('./casino-round-receipts');
const MULTS=Object.freeze({straight:36,split:18,street:12,corner:9,sixline:6,dozen:3,column:3,red:2,black:2,odd:2,even:2,low:2,high:2});
const RED=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const error=(message)=>Object.assign(new Error(message),{code:'BAD_AUDIT_FILTER'});
const intString=x=>{const t=String(x??'');return /^-?\d+$/.test(t)?BigInt(t):null};
const kindOf=type=>type?.startsWith('roulette_')?'roulette':type?.startsWith('bigwheel_')?'bigwheel':null;
const color=n=>n===0?'GREEN':RED.has(n)?'RED':'BLACK';
function rouletteExpected(memo,n){
 const declared=String(memo).match(/^유럽식 룰렛 (\d+)개/);
 if(!declared)return null;
 const re=/(?:^|[,|\s])([a-z]+):([^:,\s]*):(\d+)G/g;
 let count=0,total=0n,m;
 while((m=re.exec(memo))!==null){
  const kind=m[1],target=m[2],value=BigInt(m[3]);
  if(!Object.hasOwn(MULTS,kind))return null;
  const nums=target.split('/').map(Number);
  const a=Number(target);
  let hit=false;
  if(kind==='straight')hit=n===a;
  else if(kind==='split'||kind==='corner')hit=nums.includes(n);
  else if(kind==='street'||kind==='sixline'){
   const range=target.split('-').map(Number);if(range.length!==2||range.some(x=>!Number.isInteger(x)))return null;
   hit=n>=range[0]&&n<=range[1];
  }else if(kind==='dozen')hit=n>=1+(a-1)*12&&n<=a*12;
  else if(kind==='column')hit=n>0&&((n-1)%3)+1===a;
  else if(kind==='red'||kind==='black')hit=color(n)===kind.toUpperCase();
  else if(kind==='odd')hit=n>0&&n%2===1;
  else if(kind==='even')hit=n>0&&n%2===0;
  else if(kind==='low')hit=n>=1&&n<=18;
  else if(kind==='high')hit=n>=19&&n<=36;
  if(hit)total+=value*BigInt(MULTS[kind]);
  count++;
 }
 return count===Number(declared[1])?total:null;
}
function evaluateBet(row,next,db){
 const game=kindOf(row.type),debit=intString(row.amount_text),after=intString(row.balance_text);
 const issues=[],notes=[];let paid='0',status='unknown',payoutRow=null,landing=null;
 if(debit===null||debit>=0n)issues.push('BET_AMOUNT_INVALID');
 if(after===null)issues.push('BET_BALANCE_INVALID');
 if(next&&next.id===row.id+1&&next.user_id===row.user_id&&next.created_at===row.created_at&&next.type===game+'_win'){
  payoutRow=next;const payout=intString(next.amount_text),winAfter=intString(next.balance_text);
  if(payout===null||payout<=0n)issues.push('PAYOUT_AMOUNT_INVALID');
  else paid=payout.toString();
  if(after===null||payout===null||winAfter===null||after+payout!==winAfter)issues.push('PAYOUT_BALANCE_MISMATCH');
  if(game==='roulette'){
   const m=String(next.memo).match(/^룰렛 (\d+) (RED|BLACK|GREEN) · 지급 ([\d,]+)G/);
   if(m){
    const n=Number(m[1]);landing=String(n)+' '+m[2];
    if(n<0||n>36||m[2]!==color(n))issues.push('ROULETTE_COLOR_MISMATCH');
    const expected=rouletteExpected(row.memo,n);
    if(expected!==null&&payout!==null&&payout!==expected)issues.push('ROULETTE_PAYOUT_MISMATCH');
    if(payout!==null&&intString(m[3].replace(/,/g,''))!==payout)issues.push('PAYOUT_MEMO_MISMATCH');
    if(expected===null)notes.push('과거 베팅 메모로는 전체 배당 재구성이 불가능합니다.');
   }else notes.push('당첨 결과 메모가 표준 형식이 아니어서 번호 검증은 제외했습니다.');
  }else{
   const m=String(next.memo).match(/(?:적중|잭팟)\s+x(\d+)/);
   if(m&&debit!==null&&payout!==null&&payout!==-debit*BigInt(m[1]))issues.push('BIGWHEEL_PAYOUT_MISMATCH');
   if(m)landing='×'+m[1];
   else notes.push('빅휠 배당 배수가 메모에 없어 배당 재계산을 생략했습니다.');
  }
  status=issues.length?'mismatch':'matched';
 }else{
  // A losing round legitimately has only a debit. Old ledger lacks the outcome, so NEVER claim an unpaid win.
  notes.push('당첨 지급 기록이 인접하지 않습니다. 낙첨 또는 과거 결과 기록 부족일 수 있어 미지급으로 단정할 수 없습니다.');
 }
 const evidence=decodeRoundEvidence(row.memo);
 if(evidence){
  const verification=evaluateRound(db,row);
  if(verification.status!=='verified'){
   issues.push(...verification.errors);
   notes.push('7차 영수증 결과와 실제 거래원장이 불일치합니다. 확인 후 처리해주세요.');
   status='mismatch';
  }else if(issues.length===0)status='matched';
  paid=evidence.payoutG;
  landing=evidence.game==='roulette'
   ?String(evidence.outcome.number)+' '+String(evidence.outcome.color).toUpperCase()
   :String(evidence.outcome.label||evidence.outcome.key)+' ×'+evidence.outcome.multiplier;
  notes.push('7차 회차 영수증 '+('JRR7-L'+row.id)+' · 결과·잔액 근거 포함');
 }
 if(issues.length)status='mismatch';
 return {
  receiptId:evidence?row.id:null,
  id:row.id,game,userId:row.user_id,nickname:row.nickname,createdAt:row.created_at,
  status,betG:debit===null?null:String(-debit),payoutG:paid,
  afterG:payoutRow?payoutRow.balance_text:row.balance_text,
  landing,ledgerIds:payoutRow?[row.id,payoutRow.id]:[row.id],
  issues,notes
 };
}
function auditCasinoSettlements(db,{userId=null,game='all',limit=40,beforeId=null}={}){
 if(!db||typeof db.prepare!=='function')throw error('조회할 데이터베이스를 찾지 못했습니다.');
 if(!['all',...GAME_TYPES].includes(game))throw error('잘못된 게임 필터입니다.');
 if(!Number.isSafeInteger(limit)||limit<1||limit>80)throw error('조회 개수는 1~80 사이여야 합니다.');
 if(userId!==null&&(!Number.isSafeInteger(userId)||userId<1))throw error('회원을 올바르게 지정해주세요.');
 if(beforeId!==null&&(!Number.isSafeInteger(beforeId)||beforeId<1))throw error('조회 커서가 올바르지 않습니다.');
 // Read ALL types so adjacency is never inferred across unrelated ledger entries.
 // Limit memory and CPU to a bounded recent sample, independent of table size.
 const scanLimit=3500,cutoff=beforeId??Number.MAX_SAFE_INTEGER;
 const rows=userId===null?
  db.prepare('SELECT l.id,l.user_id,u.nickname,l.type,l.memo,l.created_at,COALESCE(l.amount_exact,CAST(l.amount AS TEXT)) AS amount_text,COALESCE(l.balance_after_exact,CAST(l.balance_after AS TEXT)) AS balance_text FROM ledger l JOIN users u ON u.id=l.user_id WHERE l.id<? ORDER BY l.id DESC LIMIT ?').all(cutoff,scanLimit):
  db.prepare('SELECT l.id,l.user_id,u.nickname,l.type,l.memo,l.created_at,COALESCE(l.amount_exact,CAST(l.amount AS TEXT)) AS amount_text,COALESCE(l.balance_after_exact,CAST(l.balance_after AS TEXT)) AS balance_text FROM ledger l JOIN users u ON u.id=l.user_id WHERE l.user_id=? AND l.id<? ORDER BY l.id DESC LIMIT ?').all(userId,cutoff,scanLimit);
 const byId=new Map(rows.map(r=>[r.id,r]));
 const found=new Set,events=[];
 for(const row of rows){
  if(found.has(row.id))continue;
  if(row.type==='roulette_bet'||row.type==='bigwheel_bet'){
   const gameType=kindOf(row.type);const next=byId.get(row.id+1);
   const entry=evaluateBet(row,next,db);
   if(entry.ledgerIds.length===2)found.add(next.id);
   if(game==='all'||game===gameType)events.push(entry);
  }else if(row.type==='roulette_win'||row.type==='bigwheel_win'){
   const g=kindOf(row.type);
   const preceding=byId.get(row.id-1);
   if(!decodeRoundEvidence(row.memo)&&preceding?.type===g+'_bet'&&preceding.user_id===row.user_id&&preceding.created_at===row.created_at)continue;
   if(game!=='all'&&game!==g)continue;
   const receipt=decodeRoundEvidence(row.memo);
   const verification=receipt?evaluateRound(db,row):null;
   events.push({id:row.id,game:g,userId:row.user_id,nickname:row.nickname,createdAt:row.created_at,
    status:verification?(verification.status==='verified'?'matched':'mismatch'):'unpaired',
    receiptId:receipt?row.id:null,betG:receipt?receipt.spentG:null,
    payoutG:row.amount_text,afterG:row.balance_text,landing:receipt?.outcome?.label??null,
    ledgerIds:[row.id],issues:verification?.errors||[],
    notes:[verification?'7차 무료권 영수증 기반 지급 기록입니다.':g==='bigwheel'?'무료 이용권 당첨 또는 베팅 기록이 조회 범위 밖에 있는 지급입니다.':'베팅 기록을 현재 조회 범위에서 찾지 못한 지급입니다.']});
  }else if(row.type==='bigwheel_receipt'){
   const receipt=decodeRoundEvidence(row.memo);
   const checked=receipt?evaluateRound(db,row):null;
   if(game!=='all'&&game!=='bigwheel')continue;
   events.push({id:row.id,game:'bigwheel',userId:row.user_id,nickname:row.nickname,createdAt:row.created_at,
    status:checked?.status==='verified'?'matched':'mismatch',
    receiptId:receipt?row.id:null,betG:'0',payoutG:receipt?.payoutG||'0',
    afterG:row.balance_text,landing:receipt?.outcome?.label??null,ledgerIds:[row.id],
    issues:checked?.errors||['RECEIPT_INVALID'],
    notes:['7차 무료권 낙첨 회차의 결과 기록입니다.']});
  }
 }
 events.sort((a,b)=>b.id-a.id);
 const display=events.slice(0,limit);
 const totals={matched:display.filter(e=>e.status==='matched').length,mismatch:display.filter(e=>e.status==='mismatch').length,unknown:display.filter(e=>e.status==='unknown').length,unpaired:display.filter(e=>e.status==='unpaired').length};
 return {
  kind:'READ_ONLY_LEDGER_REVIEW',game,userId,scannedRows:rows.length,
  truncatedScan:rows.length===scanLimit,shown:display.length,totals,
  nextBeforeId:(events.length>limit||rows.length===scanLimit)&&display.length?display.at(-1).id:null,
  note:'과거 낙첨 회차는 결과 번호가 없으므로 미지급 여부를 자동 확정할 수 없습니다. 불일치는 수동 확인 대상이며 자동 보상·차감은 수행하지 않습니다.',
  events:display
 };
}
module.exports={auditCasinoSettlements,rouletteExpected};
