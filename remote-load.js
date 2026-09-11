'use strict';
const { Client } = require('pg');
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
    const r=await c.query('SELECT payload FROM junja_club_state WHERE id=1');
    process.stdout.write(r.rows[0]?JSON.stringify(r.rows[0].payload):'null');
  }catch(e){
    console.error(e.message);
    process.stdout.write('null');
  }finally{try{await c.end();}catch{}}
})();
