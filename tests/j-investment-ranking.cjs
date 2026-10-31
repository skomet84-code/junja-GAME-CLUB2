'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {combinedInvestmentRanking,portfolioProfit}=require('../j-investment-ranking');
const sql=new DatabaseSync(':memory:');
sql.exec(`
CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,is_disabled INTEGER DEFAULT 0);
CREATE TABLE game_state(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);
CREATE TABLE ledger(id INTEGER PRIMARY KEY AUTOINCREMENT);
`);
const db={prepare(query){const stmt=sql.prepare(query);stmt.setReadBigInts(true);return stmt;}};
function user(id,name,disabled=0){sql.prepare('INSERT INTO users(id,nickname,is_disabled) VALUES(?,?,?)').run(id,name,disabled);}
function save(id,market,position){sql.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,0)').run(market+':portfolio:'+id,JSON.stringify(position));}
const stocks=[{id:'A',price:'100'},{id:'B',price:'750'}],coins=[{id:'JJC',price:'1000'},{id:'ROY',price:'500'}];
user(1,'주식전문');
save(1,'jstock',{holdings:{A:{qty:'2',cost:'120'}},realized:'20'}); // 80 unrealized +20 =100
user(2,'코인전문');
save(2,'jcoin',{holdings:{JJC:{qty:'25000',cost:'2000'}},realized:'50'}); // 500+50=550
user(3,'분산투자');
save(3,'jstock',{holdings:{A:{qty:'10',cost:'800'}},realized:'-20'}); // 180
save(3,'jcoin',{holdings:{JJC:{qty:'20000',cost:'1600'}},realized:'100'}); // 500
user(4,'손실투자');
save(4,'jstock',{holdings:{A:{qty:'0',cost:'0'}},realized:'-30'});
save(4,'jcoin',{holdings:{JJC:{qty:'10000',cost:'1020'}},realized:'0'}); // -20
user(5,'비활성유저',1);
save(5,'jstock',{holdings:{A:{qty:'999999999999999',cost:'0'}},realized:'0'});
user(6,'초대형투자');
save(6,'jstock',{holdings:{B:{qty:'10000000000000000',cost:'0'}},realized:'0'});
save(6,'jcoin',{holdings:{ROY:{qty:'12345',cost:'0'}},realized:'0'});
for(let i=10;i<40;i++){
 user(i,'주식만'+i);
 save(i,'jstock',{holdings:{A:{qty:'0',cost:'0'}},realized:'120'});
}
for(let i=40;i<70;i++){
 user(i,'코인만'+i);
 save(i,'jcoin',{holdings:{JJC:{qty:'0',cost:'0'}},realized:'120'});
}
user(70,'합산추월');
save(70,'jstock',{holdings:{A:{qty:'0',cost:'0'}},realized:'90'});
save(70,'jcoin',{holdings:{JJC:{qty:'0',cost:'0'}},realized:'90'});
// A 90/90 investor misses both separate top-10 lists, yet ranks above 120-only investors.
const read=()=>combinedInvestmentRanking({db,stockQuotes:stocks,coinQuotes:coins,limit:100});
const rows=read();
assert.equal(rows[0].nickname,'초대형투자');
assert.equal(rows[1].nickname,'분산투자');
assert.equal(rows[1].stockProfit,'180');
assert.equal(rows[1].coinProfit,'500');
assert.equal(rows[1].profit,'680');
assert.equal(rows[2].nickname,'코인전문');
assert.equal(rows[2].profit,'550');
assert.equal(rows[3].nickname,'합산추월');
assert.equal(rows[3].profit,'180');
assert.equal(rows.find(x=>x.nickname==='주식전문').profit,'100');
assert.equal(rows.find(x=>x.nickname==='손실투자').profit,'-50');
assert.ok(!rows.some(x=>x.nickname==='비활성유저'));
assert.equal(rows.find(x=>x.nickname==='초대형투자').stockProfit,'7500000000000000000');
assert.equal(rows.find(x=>x.nickname==='초대형투자').coinProfit,'617');
assert.equal(read().length,65);
const top4=combinedInvestmentRanking({db,stockQuotes:stocks,coinQuotes:coins,limit:4});
assert.deepEqual(top4.map(x=>x.nickname),['초대형투자','분산투자','코인전문','합산추월']);
assert.equal(portfolioProfit({holdings:{JJC:{qty:'25000',cost:'2000'}},realized:'50'},new Map([['JJC',1000n]]),10000n),'550');
const before=sql.prepare('SELECT count(*) AS n FROM game_state').get().n;
read();read();
assert.equal(sql.prepare('SELECT count(*) AS n FROM game_state').get().n,before,'rankings must remain read-only');
assert.equal(sql.prepare('SELECT count(*) AS n FROM ledger').get().n,0,'rankings must not write ledger');
console.log('JBANK_COMBINED_RANKING_OK: all accounts, large BigInt gains, fractional coin, realized losses, disabled users, no writes, correct top-N');
