'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {auditCasinoSettlements,rouletteExpected}=require('../casino-settlement-audit');
const db=new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT);
CREATE TABLE ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,amount INTEGER,balance_after INTEGER,amount_exact TEXT,balance_after_exact TEXT,type TEXT,memo TEXT,created_at INTEGER);
INSERT INTO users VALUES(1,'준자'),(2,'햅피');
`);
const add=db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)');
function put(userId,type,amount,after,memo,createdAt=1000){
 const cap=v=>v>9000000000000000000n?9000000000000000000n:v<-9000000000000000000n?-9000000000000000000n:v;
 add.run(userId,cap(amount),cap(after),String(amount),String(after),type,memo,createdAt);
}
const all=()=>auditCasinoSettlements(db,{limit:80});
assert.equal(rouletteExpected('유럽식 룰렛 2개 · 4000G | black:-:1000G, red:-:3000G',1),6000n);
assert.equal(rouletteExpected('유럽식 룰렛 1개 · 1000G | black:-:1000G',2),2000n);
assert.equal(rouletteExpected('유럽식 룰렛 1개 · 1000G | black:-:1000G',0),0n);
assert.equal(rouletteExpected('유럽식 룰렛 1개 · 1000G | straight:0:1000G',0),36000n);
assert.equal(rouletteExpected('유럽식 룰렛 1개 · 1000G | split:1/2:1000G',2),18000n);
assert.equal(rouletteExpected('유럽식 룰렛 1개 · 1000G | corner:1/2/4/5:1000G',5),9000n);
assert.equal(rouletteExpected('유럽식 룰렛 1개 · 1000G | street:1:1000G',1),null); // old/malformed no result range
assert.equal(rouletteExpected('유럽식 룰렛 1개 · 1000G | sixline:1-6:1000G',5),6000n);
// Match blackjack-style black bet with exact debit + payout.
put(1,'roulette_bet',-1000n,999000n,'유럽식 룰렛 1개 · 1,000G | black:-:1000G');
put(1,'roulette_win',2000n,1001000n,'룰렛 2 BLACK · 지급 2,000G');
// A losing roulette round has no win ledger; the status must be uncertain, NOT "unpaid".
put(1,'roulette_bet',-3000n,998000n,'유럽식 룰렛 1개 · 3,000G | red:-:3000G',2000);
// A red win with wrong payout must be caught.
put(1,'roulette_bet',-1000n,997000n,'유럽식 룰렛 1개 · 1,000G | red:-:1000G',3000);
put(1,'roulette_win',3000n,1000000n,'룰렛 1 RED · 지급 3,000G',3000);
// Balance-after mismatch independent of payout correctness.
put(1,'roulette_bet',-1000n,999000n,'유럽식 룰렛 1개 · 1,000G | black:-:1000G',4000);
put(1,'roulette_win',2000n,900000n,'룰렛 4 BLACK · 지급 2,000G',4000);
// Bigwheel standard 2x matched.
put(2,'bigwheel_bet',-5000n,995000n,'빅휠 ×2 베팅 5,000G',5000);
put(2,'bigwheel_win',10000n,1005000n,'빅휠 ×2 적중 x2',5000);
// Bigwheel paid 3x for 5x should flag.
put(2,'bigwheel_bet',-5000n,995000n,'빅휠 ×5 베팅 5,000G',6000);
put(2,'bigwheel_win',15000n,1010000n,'빅휠 ×5 적중 x5',6000);
// Free-win unpaired is expected, not an alleged error.
put(2,'bigwheel_win',1000000n,1020000n,'빅휠 JUNJA 잭팟 x100',7000);
// Very large wallet exact data (no JS float).
const rich=100000000000000000000n;
put(1,'roulette_bet',-1000n,rich-1000n,'유럽식 룰렛 1개 · 1,000G | black:-:1000G',8000);
put(1,'roulette_win',2000n,rich+1000n,'룰렛 26 BLACK · 지급 2,000G',8000);
const result=all(),records=result.events;
assert.equal(result.kind,'READ_ONLY_LEDGER_REVIEW');
assert.equal(result.scannedRows,14);
assert.equal(records.length,8); // six roulette/bigwheel bet rounds plus free win
const richWin=records.find(x=>x.createdAt===8000);
assert.equal(richWin.status,'matched');assert.equal(richWin.afterG,String(rich+1000n));
assert.equal(richWin.payoutG,'2000');
assert.equal(records.find(x=>x.createdAt===2000).status,'unknown');
assert(!records.find(x=>x.createdAt===2000).issues.length);
const corrupted=records.find(x=>x.createdAt===3000);
assert.equal(corrupted.status,'mismatch');
assert(corrupted.issues.includes('ROULETTE_PAYOUT_MISMATCH'));
assert(corrupted.issues.includes('PAYOUT_MEMO_MISMATCH')===false,'memo says same paid amount, rules are what mismatch');
const badBalance=records.find(x=>x.createdAt===4000);
assert(badBalance.issues.includes('PAYOUT_BALANCE_MISMATCH'));
const badBig=records.find(x=>x.createdAt===6000);
assert(badBig.issues.includes('BIGWHEEL_PAYOUT_MISMATCH'));
const free=records.find(x=>x.createdAt===7000);
assert.equal(free.status,'unpaired');assert.deepEqual(free.issues,[]);
assert.equal(result.totals.mismatch,3);
assert.equal(result.totals.unknown,1);
assert.equal(result.totals.unpaired,1);
assert.equal(result.totals.matched,3);
const u1=auditCasinoSettlements(db,{userId:1,game:'roulette',limit:80});
assert(u1.events.every(x=>x.userId===1&&x.game==='roulette'));
assert.equal(u1.events.length,5);
const wheel=auditCasinoSettlements(db,{game:'bigwheel',limit:80});
assert.equal(wheel.events.length,3);
assert.equal(wheel.totals.unpaired,1);
const one=auditCasinoSettlements(db,{limit:2});
assert.equal(one.shown,2);
assert(Number.isSafeInteger(one.nextBeforeId));
const older=auditCasinoSettlements(db,{limit:80,beforeId:one.nextBeforeId});
assert(older.events.every(e=>e.id<one.nextBeforeId));
assert.throws(()=>auditCasinoSettlements(db,{game:'poker'}),/게임 필터/);
assert.throws(()=>auditCasinoSettlements(db,{limit:10000}),/조회 개수/);
assert.throws(()=>auditCasinoSettlements(db,{userId:-3}),/회원/);
db.exec('PRAGMA query_only=ON');
assert.equal(all().events.length,records.length,'The auditor must work in true SQLite query_only mode.');
db.close();
console.log('CASINO_SETTLEMENT_AUDIT_OK: paired exact-G, black/red payout, bigwheel x5, truthful unknown, free spins, filters, pagination, zero DB writes');
