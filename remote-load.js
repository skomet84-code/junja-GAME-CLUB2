'use strict';
const { Client } = require('pg');

function n(v){const x=Number(v);return Number.isSafeInteger(x)?x:v;}

(async()=>{
  const url=String(process.env.DATABASE_URL||'').trim();
  if(!url){process.stdout.write('null');return;}
  const ssl=/sslmode=require|neon\.tech/i.test(url)?{rejectUnauthorized:false}:undefined;
  const c=new Client({connectionString:url,ssl,connectionTimeoutMillis:15000});
  try{
    await c.connect();
    await c.query(`CREATE TABLE IF NOT EXISTS junja_club_state (
      id INTEGER PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at BIGINT NOT NULL
    )`);
    await c.query(`CREATE TABLE IF NOT EXISTS junja_club_ledger (
      id BIGINT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      amount BIGINT NOT NULL,
      balance_after BIGINT NOT NULL,
      type TEXT NOT NULL,
      memo TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )`);
    const state=await c.query('SELECT payload FROM junja_club_state WHERE id=1');
    if(!state.rows[0]){process.stdout.write('null');return;}
    const payload=state.rows[0].payload;
    payload.tables=payload.tables||{};
    const legacyLedger=Array.isArray(payload.tables.ledger)?payload.tables.ledger:[];
    const lr=await c.query('SELECT id,user_id,amount,balance_after,type,memo,created_at FROM junja_club_ledger ORDER BY id');
    const external=lr.rows.map(r=>({
      id:n(r.id),user_id:n(r.user_id),amount:n(r.amount),balance_after:n(r.balance_after),
      type:r.type,memo:r.memo,created_at:n(r.created_at)
    }));
    const ids=new Set(external.map(r=>String(r.id)));
    const missingLegacy=legacyLedger.filter(r=>!ids.has(String(r.id)));
    payload.tables.ledger=external.concat(missingLegacy).sort((a,b)=>Number(a.id)-Number(b.id));
    payload.__remoteLedgerMaxId=external.length?Number(external[external.length-1].id):0;
    process.stdout.write(JSON.stringify(payload));
  }catch(e){
    console.error(e.message);
    process.stdout.write('null');
  }finally{try{await c.end();}catch{}}
})();
