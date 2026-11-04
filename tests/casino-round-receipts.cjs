'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {attachRoundEvidence,decodeRoundEvidence,listRoundReceipts}=require('../casino-round-receipts');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'junja-v7-rounds-'));
const file=path.join(folder,'club.db');
let db=new DatabaseSync(file);
db.exec(`
CREATE TABLE ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,amount INTEGER NOT NULL,balance_after INTEGER NOT NULL,amount_exact TEXT,balance_after_exact TEXT,type TEXT NOT NULL,memo TEXT NOT NULL,created_at INTEGER NOT NULL);
`);
const write=(userId,amount,after,type,memo,t=1234)=>{
 const v=BigInt(amount),bal=BigInt(after),mirror=n=>n>9000000000000000000n?9000000000000000000n:n;
 return db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)')
  .run(userId,mirror(v),mirror(bal),String(v),String(bal),type,memo,t).lastInsertRowid;
};
const roulette=(number,won,returned,balance,betKind='black')=>({
 game:'roulette',wagerG:'1000',spentG:'1000',payoutG:String(returned),balanceG:String(balance),free:false,won,
 outcome:{number,color:number===0?'green':[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(number)?'red':'black'},
 bets:[{kind:betKind,target:null,amount:'1000',mult:2,won,returned:String(returned)}]
});
const wheel=(key,mult,payoutG,balanceG,free=false,selection='x5')=>({
 game:'bigwheel',wagerG:'10000',spentG:free?'0':'10000',
 payoutG:String(payoutG),balanceG:String(balanceG),free,won:BigInt(payoutG)>0n,
 selection,outcome:{index:key==='junja'?0:key==='x5'?14:2,key,label:key==='junja'?'JUNJA':'×'+mult,multiplier:mult}
});
try{
 assert.throws(()=>attachRoundEvidence('memo',{game:'unknown'}),/Unknown round/);
 assert.equal(decodeRoundEvidence('ordinary old memo'),null);
 const rich=100000000000000000000n;
 const winning=roulette(2,true,2000,rich+1000n);
 const blackId=write(1,-1000n,rich-1000n,'roulette_bet',attachRoundEvidence('유럽식 룰렛 1개 · 1,000G | black:-:1000G',winning),1000);
 write(1,2000n,rich+1000n,'roulette_win','룰렛 2 BLACK · 지급 2,000G',1000);
 const losing=roulette(1,false,0,rich-1000n);
 const loseId=write(1,-1000n,rich-1000n,'roulette_bet',attachRoundEvidence('유럽식 룰렛 1개 · 1,000G | black:-:1000G',losing),2000);
 const missing=roulette(2,true,2000,rich+1000n);
 const missingId=write(1,-1000n,rich-1000n,'roulette_bet',attachRoundEvidence('유럽식 룰렛 1개 · 1,000G | black:-:1000G',missing),3000);
 const gameWheel=wheel('x5',5,50000n,rich+40000n);
 const wheelId=write(1,-10000n,rich-10000n,'bigwheel_bet',attachRoundEvidence('빅휠 ×5 베팅 10,000G',gameWheel),4000);
 write(1,50000n,rich+40000n,'bigwheel_win','빅휠 ×5 적중 x5',4000);
 const freeLoss=wheel('x2',2,0n,rich,true,'x5');
 const freeLoseId=write(1,0n,rich,'bigwheel_receipt',attachRoundEvidence('빅휠 무료권 낙첨',freeLoss),5000);
 const freeWin=wheel('junja',100,1000000n,rich+1000000n,true,'x2');
 const freeWinId=write(1,1000000n,rich+1000000n,'bigwheel_win',attachRoundEvidence('빅휠 JUNJA 잭팟 x100',freeWin),6000);
 const other=roulette(2,true,2000,rich+1000n);
 write(2,-1000n,rich-1000n,'roulette_bet',attachRoundEvidence('private',other),7000);
 write(2,2000n,rich+1000n,'roulette_win','private win',7000);
 let r=listRoundReceipts(db,{userId:1,limit:20});
 assert.equal(r.kind,'LEDGER_BACKED_ROUND_RECEIPTS');
 assert.equal(r.rows.length,6);
 assert(r.rows.every(x=>x.userId===1),'Cannot fetch other players records');
 const byId=new Map(r.rows.map(x=>[x.receiptId,x]));
 assert.equal(byId.get(blackId).status,'verified');
 assert.equal(byId.get(blackId).balanceG,String(rich+1000n));
 assert.equal(byId.get(blackId).outcome.number,2);
 assert.equal(byId.get(loseId).status,'verified','A recorded losing spin is verifiable, unlike pre-v7 ambiguous losses');
 assert.equal(byId.get(missingId).status,'mismatch');
 assert(byId.get(missingId).errors.includes('WIN_LEDGER_MISSING'));
 assert.equal(byId.get(wheelId).status,'verified');
 assert.equal(byId.get(freeLoseId).status,'verified');
 assert.equal(byId.get(freeLoseId).free,true);
 assert.equal(byId.get(freeWinId).status,'verified');
 assert.equal(byId.get(freeWinId).payoutG,'1000000');
 assert.equal(listRoundReceipts(db,{userId:2,receiptId:blackId}).rows.length,0,'No cross-user lookup');
 assert.equal(listRoundReceipts(db,{userId:1,game:'roulette'}).rows.length,3);
 assert.equal(listRoundReceipts(db,{userId:1,game:'bigwheel'}).rows.length,3);
 const page1=listRoundReceipts(db,{userId:1,limit:2});
 assert.equal(page1.rows.length,2);assert(page1.nextBeforeId!==null);
 const page2=listRoundReceipts(db,{userId:1,limit:2,beforeId:page1.nextBeforeId});
 assert.equal(page2.rows.length,2);
 assert(page2.rows.every(x=>x.receiptId<page1.nextBeforeId));
 const badEvidence=roulette(2,false,0,rich-1000n);
 const falseLoseId=write(1,-1000n,rich-1000n,'roulette_bet',attachRoundEvidence('bad outcome',badEvidence),8000);
 assert(listRoundReceipts(db,{userId:1,receiptId:falseLoseId}).rows[0].errors.includes('ROULETTE_RESULT_BET_MISMATCH'));
 const badWheel=wheel('x5',5,0n,rich,false,'x5');
 const wrongWheelId=write(1,-10000n,rich,'bigwheel_bet',attachRoundEvidence('bad payout',badWheel),9000);
 assert(listRoundReceipts(db,{userId:1,receiptId:wrongWheelId}).rows[0].errors.includes('WHEEL_HIT_MISMATCH'));
 assert.throws(()=>listRoundReceipts(db,{userId:0}),/Invalid member/);
 assert.throws(()=>listRoundReceipts(db,{userId:1,limit:500}),/Invalid receipt count/);
 assert.throws(()=>listRoundReceipts(db,{userId:1,game:'holdem'}),/Invalid game filter/);
 db.close();
 db=new DatabaseSync(file);
 db.exec('PRAGMA query_only=ON');
 const afterRestart=listRoundReceipts(db,{userId:1,receiptId:blackId});
 assert.equal(afterRestart.rows[0].status,'verified','Receipts survive local database restart');
 assert.equal(afterRestart.rows[0].reference,'JRR7-L'+blackId);
 console.log('ROUND_RECEIPTS_V7_OK: atomic ledger proof, win/loss, free rounds, missing payout detection, exact 1e20, restart, privacy, pagination');
}finally{db.close();fs.rmSync(folder,{recursive:true,force:true});}
