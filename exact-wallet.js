'use strict';
// Decimal text is authoritative; int64 mirrors retain compatibility with older SQL.
const LIMIT=9000000000000000000n;
function integer(value){
  if(typeof value==='bigint')return value;
  const text=String(value??0);
  if(!/^-?\d+$/.test(text))throw new Error('게임머니 값이 올바르지 않습니다.');
  return BigInt(text);
}
function mirror(value){const n=integer(value);return n>LIMIT?LIMIT:n<-LIMIT?-LIMIT:n;}
function output(value){const n=integer(value);return n<=BigInt(Number.MAX_SAFE_INTEGER)&&n>=-BigInt(Number.MAX_SAFE_INTEGER)?Number(n):String(n);}
function read(row){
  if(row.balance_exact==null)return integer(row.balance);
  return integer(row.balance_exact)+integer(row.balance)-integer(row.balance_base??row.balance);
}
function change(db,userId,amount,type,memo,now,options={}){
  db.exec('BEGIN IMMEDIATE');
  try{
    const key=options.requestKey?'wallet_request:'+userId+':'+options.requestKey:null;
    if(key){const previous=db.prepare('SELECT value FROM game_state WHERE key=?').get(key);if(previous){const saved=JSON.parse(previous.value);if(saved.amount!==String(integer(amount))||saved.type!==type||saved.memo!==memo)throw new Error('이미 사용한 요청 번호입니다.');db.exec('COMMIT');return saved.balance;}}
    const u=db.prepare('SELECT balance,balance_exact,balance_base FROM users WHERE id=?').get(userId);
    if(!u)throw new Error('사용자를 찾을 수 없습니다.');
    const delta=integer(amount),next=read(u)+delta;
    if(next<0n)throw new Error('게임머니가 부족합니다.');
    db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?').run(mirror(next),String(next),String(mirror(next)),userId);
    db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(userId,mirror(delta),mirror(next),String(delta),String(next),type,memo,now());
    if(options.escrowRoomId)db.prepare('DELETE FROM room_escrow WHERE room_id=? AND user_id=?').run(options.escrowRoomId,userId);
    const balance=output(next);
    if(key)db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?)').run(key,JSON.stringify({balance,amount:String(delta),type,memo}),now());
    db.exec('COMMIT');return balance;
  }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
}
module.exports={integer,mirror,output,read,change};
