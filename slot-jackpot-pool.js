'use strict';
// The 777 jackpot pool is shared with J-STOCK and J-COIN trading fees.
// All amounts use decimal text/BigInt for the large JUNJA LAND economy.
// Call addTradingFee() from within the trade's existing SQLite transaction.
const KEY='slot_jackpot_pool';
const BASE=1000000000000n; // 1 trillion G, including after each 777 payout.
const MAX_SAFE=BigInt(Number.MAX_SAFE_INTEGER);
function amount(value){
 if(typeof value==='bigint')return value;
 if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<0))throw Error('잭팟 금액은 안전한 정수여야 합니다.');
 const valueText=String(value??'');
 if(!/^\d+$/.test(valueText))throw Error('잭팟 금액이 올바르지 않습니다.');
 return BigInt(valueText);
}
function output(value){
 const n=amount(value);
 return n<=MAX_SAFE?Number(n):String(n);
}
function readPool(db){
 const row=db.prepare('SELECT value FROM game_state WHERE key=?').get(KEY);
 if(!row)return BASE;
 const raw=JSON.parse(row.value);
 const old=amount(raw);
 return old<BASE?BASE:old;
}
function writePool(db,value,time=Date.now()){
 const v=amount(value);
 if(v<BASE)throw Error('잭팟 기본 적립액보다 작게 설정할 수 없습니다.');
 const serialized=JSON.stringify(output(v));
 db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
  .run(KEY,serialized,time);
 return output(v);
}
function addTradingFee(db,fee,time=Date.now()){
 const n=amount(fee);
 if(!n)return readPool(db);
 const next=readPool(db)+n;
 writePool(db,next,time);
 return next;
}
module.exports={KEY,BASE,amount,output,readPool,writePool,addTradingFee};
