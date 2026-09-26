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
    // Ledger history can grow without bound. Keep it in Postgres and restore
    // only its high-water mark; loading every row into JSON at boot can exceed
    // the 512MB Render instance limit. New writes resume after this ID.
    let remoteLedgerMaxId=0;
    try{
      const lr=await c.query('SELECT COALESCE(MAX(id),0) AS max_id FROM junja_club_ledger');
      remoteLedgerMaxId=Number(lr.rows[0]?.max_id||0);
    }catch{}
    payload.tables.ledger=[];
    payload.__remoteLedgerMaxId=remoteLedgerMaxId;
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