'use strict';
const { Client } = require('pg');

function n(v){const x=Number(v);return Number.isSafeInteger(x)?x:v;}
function sslFor(url){
  return /sslmode=require|neon\.tech/i.test(String(url||'')) ? {rejectUnauthorized:false} : undefined;
}
async function load(url,{init=false,source='target'}={}){
  if(!url) return null;
  const c=new Client({connectionString:url,ssl:sslFor(url),connectionTimeoutMillis:15000});
  try{
    await c.connect();
    if(init){
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
    }
    const state=await c.query('SELECT payload FROM junja_club_state WHERE id=1');
    if(!state.rows[0]) return null;
    const payload=state.rows[0].payload;
    payload.tables=payload.tables||{};
    const legacyLedger=Array.isArray(payload.tables.ledger)?payload.tables.ledger:[];
    let external=[];
    try{
      const lr=await c.query('SELECT id,user_id,amount,balance_after,type,memo,created_at FROM junja_club_ledger ORDER BY id');
      external=lr.rows.map(r=>({
        id:n(r.id),user_id:n(r.user_id),amount:n(r.amount),balance_after:n(r.balance_after),
        type:r.type,memo:r.memo,created_at:n(r.created_at)
      }));
    }catch{}
    const ids=new Set(external.map(r=>String(r.id)));
    const missingLegacy=legacyLedger.filter(r=>!ids.has(String(r.id)));
    payload.tables.ledger=external.concat(missingLegacy).sort((a,b)=>Number(a.id)-Number(b.id));
    payload.__remoteLedgerMaxId=external.length?Number(external[external.length-1].id):0;
    payload.__restoreSource=source;
    return payload;
  }finally{
    try{await c.end();}catch{}
  }
}

(async()=>{
  const target=String(process.env.DATABASE_URL||'').trim();
  const legacy=String(process.env.RESTORE_DATABASE_URL||'').trim();
  try{
    const current=await load(target,{init:true,source:'target'});
    if(current){process.stdout.write(JSON.stringify(current));return;}
    if(legacy && legacy!==target){
      const recovered=await load(legacy,{init:false,source:'legacy'});
      if(recovered){process.stdout.write(JSON.stringify(recovered));return;}
    }
    process.stdout.write('null');
  }catch(e){
    console.error(e.message);
    process.stdout.write('null');
  }
})();