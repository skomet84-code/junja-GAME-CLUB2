'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),wallet=require('../exact-wallet'),{createJBank}=require('../j-bank-core');
const server=fs.readFileSync('server.js','utf8'),s=server.slice(server.indexOf('const SOCIAL_RANKS = ['),server.indexOf('\n];',server.indexOf('const SOCIAL_RANKS = ['))+3);
const ranks=vm.runInNewContext(s+'\nSOCIAL_RANKS;');
const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,rank_level INTEGER,is_disabled INTEGER DEFAULT 0,balance INTEGER,balance_exact TEXT,balance_base TEXT);CREATE TABLE game_state(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);CREATE TABLE room_escrow(room_id TEXT NOT NULL,user_id INTEGER NOT NULL,amount INTEGER,amount_exact TEXT,game TEXT,created_at INTEGER,PRIMARY KEY(room_id,user_id));CREATE TABLE ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,amount INTEGER,balance_after INTEGER,amount_exact TEXT,balance_after_exact TEXT,type TEXT,memo TEXT,created_at INTEGER)');
const db={exec:x=>sqlite.exec(x),prepare:x=>{const st=sqlite.prepare(x);st.setReadBigInts(true);return st}};
let t=1792900000000,day='2026-10-25';const bank=createJBank({db,exactWallet:wallet,levels:ranks,now:()=>t,kstDate:()=>day});
const user=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id),cash=id=>wallet.read(user(id)),balance=n=>{const m=wallet.mirror(n);return [m,String(n),String(m)]};
db.prepare('INSERT INTO users(id,rank_level,balance,balance_exact,balance_base) VALUES(?,?,?,?,?)').run(1,2,...balance(0n));
bank.borrow(1,'100000000','overdue_test_request_1234');
assert.equal(bank.enforceOverdue(1).processed,false);
t+=8*86400000;day='2026-11-02';
const forced=bank.enforceOverdue(1);assert.equal(forced.processed,true);assert.equal(bank.enforceOverdue(1).processed,false,'idempotent');
assert.equal(BigInt(bank.status(1).outstanding),0n,'cash + rank sale pays 7-day debt');
assert.ok(Number(user(1).rank_level)<=2,'rank collateral only sold if necessary');
db.prepare('INSERT INTO users(id,rank_level,balance,balance_exact,balance_base) VALUES(?,?,?,?,?)').run(2,0,...balance(0n));
bank.borrow(2,'5000000','rehab_test_request_12345');
const k=user(2);db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?').run(...balance(0n),2);
assert.equal(bank.status(2).canRehabilitate,true,'personal rehabilitation eligible on loan day without 7-day wait');
const pendingTicket='jpl:v1:ticket:S1:2:pending_rehab_ticket';
db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?)').run(pendingTicket,JSON.stringify({
 userId:2,seasonId:'S1',id:'pending_rehab_ticket',status:'OPEN',paid:'0',stake:'1000',
 legs:[{matchId:'JPL-001',pick:'H',odds100:200}],potential:'2000'
}),t);

const applied=bank.rehabilitation(2,'개인회생','rehab_final_request_123');
assert.equal(applied.newWallet,'100000000000');assert.equal(cash(2),100000000000n);
assert.equal(JSON.parse(db.prepare('SELECT value FROM game_state WHERE key=?').get(pendingTicket).value).status,'FORFEITED','personal rehabilitation forfeits all unsettled football tickets');
assert.equal(BigInt(bank.status(2).outstanding),0n);assert.equal(Number(user(2).rank_level),0);
assert.throws(()=>bank.rehabilitation(2,'개인회생','rehab_second_request_123'),/탕감 대상|1회/);
// Cross-asset liquidation: cash, savings, installment, stock and fractional coin.
// Missing market data must ROLLBACK, never zero a portfolio without a quote.
db.prepare('INSERT INTO users(id,rank_level,balance,balance_exact,balance_base) VALUES(?,?,?,?,?)').run(3,0,...balance(20000n));
const account={principal:'210000',interest:'0',asOf:day,openedAt:t-8*86400000,number:1,totalRepaid:'0',savingsPrincipal:'25000',savingsInterest:'0',savingsAt:t,savingsLockedUntil:0,installment:{id:'test_installment',days:7,rateBP:8,amount:'6000',openedAt:t-86400000,maturesAt:t+6*86400000,payments:[{slot:0,at:t-86400000}]}};
const put=(key,value)=>db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?)').run(key,JSON.stringify(value),t);
const get=key=>JSON.parse(db.prepare('SELECT value FROM game_state WHERE key=?').get(key).value);
put('jbank:account:3',account);
put('jstock:portfolio:3',{holdings:{A:{qty:'7',cost:'50000'}},returned:'0',realized:'0'});
put('jcoin:portfolio:3',{holdings:{BTC:{qty:'30000',cost:'20000'}},returned:'0',realized:'0'});
put('jstock:market:v1',{stocks:{A:{price:'10000'}}});
assert.throws(()=>bank.enforceOverdue(3),/jcoin 강제 매각 시장가격/,'missing quote must not destroy held coin');
assert.equal(get('jstock:portfolio:3').holdings.A.qty,'7','stock rollback when coin quote missing');
assert.equal(cash(3),20000n,'cash rollback when later market fails');
put('jcoin:market:v1',{stocks:{BTC:{price:'10000'}}});
const sold=bank.enforceOverdue(3);
assert.equal(sold.processed,true);assert.equal(sold.sales.some(x=>x.type==='jbank_overdue_savings'),true);
assert.equal(sold.sales.some(x=>x.type==='jbank_overdue_installment'),true);
assert.equal(sold.sales.some(x=>x.type==='jbank_overdue_jstock'),true);
assert.equal(sold.sales.some(x=>x.type==='jbank_overdue_jcoin'),true);
assert.equal(get('jstock:portfolio:3').holdings.A.qty,'0');assert.equal(get('jcoin:portfolio:3').holdings.BTC.qty,'0');
assert.equal(get('jbank:account:3').installment,null);
assert.equal(cash(3),0n);assert.ok(BigInt(bank.status(3).outstanding)>0n);
assert.equal(bank.enforceOverdue(3).processed,false,'no second stock or coin sale');
assert.equal(bank.status(3).canRehabilitate,true);
bank.rehabilitation(3,'개인회생','rehab_cross_asset_1234');
assert.equal(db.prepare("SELECT 1 FROM game_state WHERE key='jstock:portfolio:3'").get(),undefined);
assert.equal(db.prepare("SELECT 1 FROM game_state WHERE key='jcoin:portfolio:3'").get(),undefined);
assert.equal(cash(3),100000000000n);
// Credit-only debt qualifies immediately. Active luxury auctions and bids block finalization.
db.prepare('INSERT INTO users(id,rank_level,balance,balance_exact,balance_base) VALUES(?,?,?,?,?)').run(4,0,...balance(0n));
put('jcredit:account:4',{principal:'3000000',interest:'100000',asOf:day,openedAt:t,number:1});
bank.setCredit({
 owed:id=>{const row=db.prepare('SELECT value FROM game_state WHERE key=?').get('jcredit:account:'+id);const a=row?JSON.parse(row.value):{};return BigInt(a.principal||0)+BigInt(a.interest||0);},
 status:id=>({outstanding:bank.baseOwed(id).toString()}),enforce:()=>({processed:false})
});
assert.equal(bank.status(4).canRehabilitate,true,'credit-only immediate eligibility');
put('jpl:v1:ticket:S1:4:rehabopen_123456',{id:'rehabopen_123456',userId:4,status:'OPEN',stake:'1000000',potential:'2000000',paid:'0'});
put('royal:auction:lot:test',{status:'OPEN',sellerId:4,bidderId:3});
assert.equal(bank.status(4).canRehabilitate,false,'open auction locks immediate rehabilitation');
assert.throws(()=>bank.rehabilitation(4,'개인회생','rehab_blocked_bid_123'),/경매/);
db.prepare("DELETE FROM game_state WHERE key='royal:auction:lot:test'").run();
const creditRehab=bank.rehabilitation(4,'개인회생','rehab_credit_only_123');
assert.equal(get('jpl:v1:ticket:S1:4:rehabopen_123456').status,'FORFEITED','open football wagers must be forfeited when all assets reset');
assert.equal(creditRehab.creditDebtForgiven,'3100000');
assert.equal(bank.status(4).creditOutstanding,'0');
assert.equal(cash(4),100000000000n);
assert.equal(bank.status(4).canRehabilitate,false);
console.log('JBANK_OVERDUE_OK: 7-day forced liquidation preserved; same-day one-time rank/credit rehabilitation');
