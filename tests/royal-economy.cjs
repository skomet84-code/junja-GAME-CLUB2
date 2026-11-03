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
assert.equal(ROYAL_ITEMS.length,49);
assert(ROYAL_ITEMS.every(item=>BigInt(item.price)>=10n**16n),'all boutique prices must start at 1경');
assert.equal(new Set(ROYAL_ITEMS.map(x=>x.id)).size,49,'no duplicate catalog items');
assert.equal(ROYAL_ITEMS.filter(x=>x.brand&&x.photoFile).length,12,'licensed brand vehicle photos');
assert.deepEqual([...new Set(ROYAL_ITEMS.filter(x=>x.brand).map(x=>x.brand))].sort(),['aston-martin','bentley','rolls-royce']);
assert(ROYAL_ITEMS.filter(x=>x.category==='car').length>=5);
assert(ROYAL_ITEMS.filter(x=>x.category==='yacht').length>=2);
assert(ROYAL_ITEMS.filter(x=>x.category==='jet').length>=2);
assert(ROYAL_ITEMS.filter(x=>x.category==='watch').length>=2);
assert(ROYAL_ITEMS.filter(x=>x.displayOnly).every(x=>!['costume','title','frame','pet'].includes(x.category)),'no display pieces in avatar loadout columns');
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

// Gallery reads only certified royal ownership; never return wallet or credentials.
const publicMuseum=royal.gallery(1);
assert.equal(publicMuseum.nickname,'member1');
assert.equal(publicMuseum.public,true);
assert.equal(publicMuseum.items.length,1);
assert.equal(publicMuseum.items[0].id,item.id);
assert.equal(publicMuseum.items[0].inscription.ownerNickname,'member1');
assert.equal(publicMuseum.items[0].collectionNo,1,'first owned collectible has private collection number 001');
assert.equal(publicMuseum.items[0].acquiredAt,start);
assert.equal(publicMuseum.collector.ownedCatalogValue,item.price,'catalog worth sums only actual owned objects');
assert.equal(publicMuseum.collector.rooms.reduce((sum,x)=>sum+x.total,0),ROYAL_ITEMS.length,'no missing collection category');
assert.equal(publicMuseum.collector.rooms.reduce((sum,x)=>sum+x.owned,0),1,'rooms count real purchases only');
assert.equal(publicMuseum.collector.brandSets.length,3);
assert.equal(publicMuseum.collector.brandSets.reduce((sum,x)=>sum+x.total,0),12);
assert.equal(publicMuseum.collector.showcase[0].id,item.id);
assert.equal(Object.hasOwn(publicMuseum,'balance'),false);
assert.equal(Object.hasOwn(publicMuseum,'username'),false);
assert.equal(royal.gallery(4).items.length,0);
assert.equal(royal.gallery(999),null);
db.prepare('UPDATE users SET is_disabled=1 WHERE id=4').run();
assert.equal(royal.gallery(4),null);
assert.equal(db.prepare('SELECT balance_exact FROM users WHERE id=1').get().balance_exact,beforePin,
  'public museum views must never modify wallet balances');
// Exhibition-only supercars must spend exact money but never become an avatar category.
const newCar=ROYAL_ITEMS.find(x=>x.id==='car_royalboutique_royal_gt');
const beforeCar=BigInt(db.prepare('SELECT balance_exact FROM users WHERE id=3').get().balance_exact);
const beforeCarLoad=db.prepare('SELECT * FROM user_loadout WHERE user_id=3').get();
const purchasedCar=royal.buy(3,newCar.id);
assert.equal(purchasedCar.balance,String(beforeCar-BigInt(newCar.price)));
assert.equal(royal.catalog(3).items.find(x=>x.id===newCar.id).owned,true);
assert.equal(royal.catalog(3).items.find(x=>x.id===newCar.id).displayOnly,true);
const afterCarLoad=db.prepare('SELECT title,frame,costume,pet FROM user_loadout WHERE user_id=3').get();
for(const cat of ['title','frame','costume','pet'])assert.equal(afterCarLoad[cat],beforeCarLoad?.[cat]??null,'display purchase cannot equip '+cat);
assert(royal.gallery(3).items.some(x=>x.id===newCar.id&&x.art==='car-gold'&&x.displayOnly),'gallery must include owned illustrated supercar');
const carMuseum=royal.gallery(3);
assert.equal(carMuseum.items.length,2,'real owner has phoenix and car, not generic catalog');
assert.deepEqual(carMuseum.items.map(x=>x.collectionNo).sort((a,b)=>a-b),[1,2],'personal sequential numbered holdings');
assert.equal(carMuseum.collector.rooms.find(x=>x.id==='motors').owned,1);
assert.equal(carMuseum.collector.rooms.find(x=>x.id==='heritage').owned,1);
assert.equal(carMuseum.collector.ownedCatalogValue,String(BigInt(item.price)+BigInt(newCar.price)));
assert.equal(royal.catalog(3).items.find(x=>x.id===newCar.id).collectionNo,carMuseum.items.find(x=>x.id===newCar.id).collectionNo,'self and public certificate numbers match');
assert.equal(royal.gallery(3).collector.ownedCatalogValue,royal.catalog(3).collector.ownedCatalogValue,'public collection worth must not inspect private wallet');

assert.deepEqual(royal.updateShowcase(3,[newCar.id]).showcase.map(x=>x.id),[newCar.id]);
assert.throws(()=>royal.buy(3,newCar.id),/이미 영구 소장/);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE user_id=3 AND type='royal_boutique_purchase'").get().n,2,'one legacy item plus one car, with no duplicate charge');
console.log('ROYAL ECONOMY TESTS OK');
