'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const exactWallet=require('../exact-wallet');
const {createJCredit,LOAN_BP,RATE_BP}=require('../j-credit');
const {createRoyalMarket}=require('../royal-market');
const {createJBank}=require('../j-bank-core');
const sqlite=new DatabaseSync(':memory:');
sqlite.exec([
 'CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,is_disabled INTEGER DEFAULT 0,rank_level INTEGER DEFAULT 0,balance INTEGER,balance_exact TEXT,balance_base TEXT)',
 'CREATE TABLE game_state(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER)',
 'CREATE TABLE ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,amount INTEGER,balance_after INTEGER,amount_exact TEXT,balance_after_exact TEXT,type TEXT,memo TEXT,created_at INTEGER)',
 'CREATE TABLE user_inventory(user_id INTEGER,item_id TEXT,purchase_price INTEGER,purchased_at INTEGER,PRIMARY KEY(user_id,item_id))',
 'CREATE TABLE user_loadout(user_id INTEGER PRIMARY KEY,character TEXT,costume TEXT,frame TEXT,title TEXT,pet TEXT)',
 'CREATE TABLE room_escrow(room_id TEXT NOT NULL,user_id INTEGER NOT NULL,amount INTEGER,amount_exact TEXT,game TEXT,created_at INTEGER,PRIMARY KEY(room_id,user_id))'
].join(';')+';');
const db={exec:sql=>sqlite.exec(sql),prepare:sql=>{
 const statement=sqlite.prepare(sql);statement.setReadBigInts(true);
 return statement;
}};
let day='2026-11-04',time=Date.parse('2026-11-04T09:00:00Z');
const now=()=>time,kstDate=()=>day;
const item={id:'jewel_test',name:'테스트 명품',price:'10000000000000000',category:'jewel',collection:'royalboutique'};
const market=createRoyalMarket({db,exactWallet,now,items:[item]});
const bank=createJBank({db,exactWallet,now,kstDate,levels:[{name:'평민',cost:'0'},{name:'상인',cost:'10000000'}]});
const credit=createJCredit({db,exactWallet,now,kstDate,items:[item],royalMarket:market});
bank.setCredit(credit);
function user(id,initial=0n){
 const m=exactWallet.mirror(initial);
 db.prepare('INSERT INTO users(id,nickname,balance,balance_exact,balance_base) VALUES(?,?,?,?,?)').run(id,'credit_tester'+id,m,String(initial),String(m));
}
const select=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id);
const balance=id=>exactWallet.read(select(id));
const fund=(id,v)=>{const m=exactWallet.mirror(v);db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?').run(m,String(v),String(m),id)};
const put=(k,v)=>db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(k,JSON.stringify(v),time);
const get=k=>JSON.parse(db.prepare('SELECT value FROM game_state WHERE key=?').get(k).value);
const req=n=>'asset_credit_test_req_'+n;
assert.equal(RATE_BP,20n);assert.equal(LOAN_BP,5000n);
user(1,200000000n);
put('jbank:account:1',{principal:'0',interest:'0',asOf:day,savingsPrincipal:'5000000',savingsInterest:'0',
 installment:{id:'installment1',days:7,amount:'1000000',rateBP:8,payments:[{slot:0,at:time}],openedAt:time,maturesAt:time+7*86400000}});
put('jstock:market:v1',{stocks:{A:{price:'100000'}}});
put('jcoin:market:v1',{stocks:{JJC:{price:'1000000'}}});
put('jstock:portfolio:1',{holdings:{A:{qty:'5',cost:'200000'}},realized:'0',returned:'0'});
put('jcoin:portfolio:1',{holdings:{JJC:{qty:'20000',cost:'1000000'}},realized:'0',returned:'0'});
const a=credit.status(1);
assert.equal(a.assets.cash,'200000000');
assert.equal(a.assets.savings,'5000000');
assert.equal(a.assets.installment,'1000000');
assert.equal(a.assets.stocks,'500000');
assert.equal(a.assets.coins,'2000000');
assert.equal(a.creditLimit,String(208500000n/2n));
assert.equal(a.canBorrow,true,'credit must be possible while existing installment remains');
assert.equal(bank.status(1).canBorrow,true,'rank loans now allow an existing installment');
assert.equal(bank.status(1).borrowBlockedReason,'');
const borrowed=credit.borrow(1,'100000000',req('borrow'));
assert.equal(borrowed.status.outstanding,'100000000');
assert.equal(balance(1),300000000n);
assert.equal(bank.owed(1),100000000n,'outstanding credit locks other debt and rank transfers');
assert.equal(bank.status(1).canBorrow,false);
assert.match(bank.status(1).borrowBlockedReason,/신용대출/);
assert.throws(()=>credit.borrow(1,'1000000',req('borrow2')),/완납/);
const duplicate=credit.borrow(1,'100000000',req('borrow'));
assert.equal(duplicate.duplicate,true);
assert.equal(balance(1),300000000n,'duplicate request never credits wallet twice');
day='2026-11-05';time+=86400000;
assert.equal(credit.status(1).interest,'200000');
const repaid=credit.repay(1,'200000',req('interest'));
assert.equal(repaid.status.principal,'100000000');
assert.equal(repaid.status.interest,'0');
assert.equal(balance(1),299800000n);
credit.repay(1,'all',req('full'));
assert.equal(bank.owed(1),0n);
assert.equal(credit.status(1).canBorrow,true,'credit unlocks after settlement');
assert.equal(bank.status(1).canBorrow,true,'after credit repayment, existing installment does not lock rank loans');
// Partial stock liquidation: sell only shares needed after 7-day default.
day='2026-11-04';time=Date.parse('2026-11-04T09:00:00Z');
user(2,100000000n);
put('jstock:portfolio:2',{holdings:{A:{qty:'2000',cost:'100000000'}},realized:'0',returned:'0'});
const partial=credit.borrow(2,'100000000',req('partialstart'));
assert.equal(partial.status.outstanding,'100000000');
fund(2,0n);time+=8*86400000;day='2026-11-12';
const e=credit.enforce(2);
assert.equal(e.processed,true);
assert.equal(e.sales[0].type,'jcredit_sale_jstock');
assert.equal(credit.owed(2),0n,'stock forced sale covers whole debt');
const stockLeft=BigInt(get('jstock:portfolio:2').holdings.A.qty);
assert(stockLeft>0n&&stockLeft<2000n,'only part of the shares sold');
assert.equal(credit.enforce(2).processed,false,'no repeat liquidation after repayment');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE type='jcredit_borrow' AND user_id=2").get().n,1n);
// Luxury forced redemption: 75% sale + provenance + wallet change are atomic.
day='2026-11-04';time=Date.parse('2026-11-04T09:00:00Z');
user(3,0n);
const originalAt=time;
db.prepare('INSERT INTO user_inventory(user_id,item_id,purchase_price,purchased_at) VALUES(?,?,?,?)').run(3,item.id,0,originalAt);
const certificate=market.certificate(3,item.id);
assert.ok(certificate?.serial);
const pre=credit.status(3);
assert.equal(pre.assets.luxury,'7500000000000000');
const large='1000000000000000';
credit.borrow(3,large,req('luxury'));
fund(3,0n);time+=8*86400000;day='2026-11-12';
const sold=credit.enforce(3);
assert.equal(sold.processed,true);
assert.equal(sold.sales.some(x=>x.type==='jcredit_sale_luxury'),true);
assert.equal(credit.owed(3),0n);
assert.equal(db.prepare('SELECT item_id FROM user_inventory WHERE user_id=3').get(),undefined);
assert.equal(get('royal:certificate:serial:'+certificate.serial).status,'BANK_REDEEMED');
assert.equal(market.market(3).owned.length,0,'collector inventory updated');
assert(balance(3)>0n,'excess liquidation proceeds return to the user');
assert.equal(credit.enforce(3).processed,false,'no double redemption');
assert.throws(()=>credit.borrow(3,'10000000000000000',req('invalid')),/50%|한도/);
// Locked auction lot contributes no loan value.
user(4,0n);
db.prepare('INSERT INTO user_inventory(user_id,item_id,purchase_price,purchased_at) VALUES(?,?,?,?)').run(4,item.id,0,time);
market.list(4,item.id,'10000000000000000');
assert.equal(credit.status(4).assets.luxury,'0','active auction listing not eligible as credit collateral');
assert.equal(credit.status(4).canBorrow,false);
console.log('JCREDIT_OK: valuation, 50% cap, installment coexistence, one-loan policy, daily 0.2%, idempotence, partial stocks, 75% luxury redemption, provenance, auction exclusion');
