'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const exactWallet=require('../exact-wallet');
const {createRoyalEconomy,ROYAL_ITEMS}=require('../royal-economy');
// Mirror persistent-db's BigInt-safe reads: native node:sqlite throws for >2^53 otherwise.
const native=new DatabaseSync(':memory:');
const normalize=value=>{
 if(typeof value==='bigint')return value<=BigInt(Number.MAX_SAFE_INTEGER)&&value>=-BigInt(Number.MAX_SAFE_INTEGER)?Number(value):String(value);
 if(value&&typeof value==='object'){for(const k of Object.keys(value))value[k]=normalize(value[k]);}
 return value;
};
const db={
 exec(sql){return native.exec(sql)},
 prepare(sql){
  const stmt=native.prepare(sql);stmt.setReadBigInts(true);
  return {run(...a){return stmt.run(...a)},get(...a){return normalize(stmt.get(...a))},all(...a){return stmt.all(...a).map(normalize)}};
 }
};
db.exec(`
CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT NOT NULL,balance INTEGER,balance_exact TEXT,balance_base TEXT,is_disabled INTEGER DEFAULT 0);
CREATE TABLE user_inventory(user_id INTEGER NOT NULL,item_id TEXT NOT NULL,purchase_price INTEGER,purchased_at INTEGER,PRIMARY KEY(user_id,item_id));
CREATE TABLE user_loadout(user_id INTEGER PRIMARY KEY,character TEXT,costume TEXT,frame TEXT,title TEXT,pet TEXT,table_skin TEXT,card_back TEXT,bubble_pack TEXT);
CREATE TABLE game_state(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);
CREATE TABLE ledger(id INTEGER PRIMARY KEY,user_id INTEGER,amount INTEGER,balance_after INTEGER,amount_exact TEXT,balance_after_exact TEXT,type TEXT,memo TEXT,created_at INTEGER);
`);
const start=Date.parse('2026-11-03T12:00:00+09:00'),huge='10000000000000000000000';
for(let id=1;id<=5;id++)db.prepare('INSERT INTO users(id,nickname,balance,balance_exact,balance_base) VALUES(?,?,?,?,?)').run(id,'member'+id,100,huge,'100');
const royal=createRoyalEconomy({db,exactWallet,now:()=>start,getAssets:()=>({bank:{savings:{total:'100'},installment:{principal:'10'},outstanding:'20'},stock:{marketValue:'30'},coin:{marketValue:'40'}})});
assert.equal(ROYAL_ITEMS.length,11);
const item=ROYAL_ITEMS[9];assert.equal(item.stock,3);
const p1=royal.buy(1,item.id);
assert.equal(p1.inscription.ownerNickname,'member1');
assert.equal(p1.balance,String(BigInt(huge)-BigInt(item.price)));
assert.equal(royal.catalog(1).items.find(x=>x.id===item.id).remaining,2);
assert.throws(()=>royal.buy(1,item.id),/이미 영구 소장/);
assert.equal(db.prepare('SELECT count(*) AS n FROM ledger').get().n,1);
royal.buy(2,item.id);royal.buy(3,item.id);
assert.equal(royal.catalog(4).items.find(x=>x.id===item.id).soldOut,true);
assert.throws(()=>royal.buy(4,item.id),/재고/);
assert.equal(db.prepare('SELECT count(*) AS n FROM ledger').get().n,3);
const row=db.prepare('SELECT amount_exact,balance_after_exact FROM ledger WHERE user_id=1').get();
assert.equal(row.amount_exact,String(-BigInt(item.price)));
assert.equal(row.balance_after_exact,p1.balance);
const dash=royal.dashboard();
assert.equal(dash.today.royalBurned,String(3n*BigInt(item.price)));
assert.equal(dash.today.confirmedBurned,dash.today.royalBurned);
assert.equal(dash.registered,5);
assert.equal(BigInt(dash.wallet),5n*BigInt(huge)-3n*BigInt(item.price));
assert.equal(dash.savings,'500');
assert.equal(dash.topWealth.length,5);
db.prepare("UPDATE users SET balance=100,balance_exact='100',balance_base='100' WHERE id=5").run();
assert.throws(()=>royal.buy(5,ROYAL_ITEMS[0].id),/잔액/);
assert.equal(db.prepare('SELECT count(*) AS n FROM user_inventory WHERE user_id=5').get().n,0);

const collector=royal.catalog(1).collector;
assert.equal(royal.catalog(1).nickname,'member1');
assert.equal(collector.ownedCount,1);
assert.equal(collector.spent,String(BigInt(item.price)));
assert.equal(collector.tier,'LEGEND');
assert.deepEqual(collector.showcase.map(x=>x.id),[item.id]);
const beforePin=db.prepare('SELECT balance_exact FROM users WHERE id=1').get().balance_exact;
assert.deepEqual(royal.updateShowcase(1,[item.id]).showcase.map(x=>x.id),[item.id]);
assert.deepEqual(royal.updateShowcase(1,[]).showcase,[],'clearing showcase must remain empty');
assert.deepEqual(royal.catalog(1).collector.showcase,[],'empty selection persists after fresh catalog');
assert.throws(()=>royal.updateShowcase(1,[item.id,item.id]),/최대 3개/);
assert.throws(()=>royal.updateShowcase(1,[ROYAL_ITEMS[0].id]),/구매한 명품/);
assert.equal(db.prepare('SELECT balance_exact FROM users WHERE id=1').get().balance_exact,beforePin,'showcase must not spend money');
royal.updateShowcase(1,[item.id]);
console.log('ROYAL ECONOMY TESTS OK');
