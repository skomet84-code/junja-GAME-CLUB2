'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {Pool}=require('pg');
const {createPremiumPgStore}=require('../premium-pg-core');
const {createPremiumAppearanceStore}=require('../premium-appearance-store');
const url=process.env.TEST_DATABASE_URL;
if(!url||!/127\.0\.0\.1|localhost/.test(url))throw Error('Ephemeral local PostgreSQL test instance required.');
const code=id=>e=>e?.code===id;
(async()=>{
 const pool=new Pool({connectionString:url,max:6});
 try{
  await pool.query(fs.readFileSync(path.join(__dirname,'../premium-pg-schema.sql'),'utf8'));
  await pool.query('TRUNCATE premium_store_appearance,premium_store_events,premium_store_entitlements,premium_store_orders RESTART IDENTITY CASCADE');
  const verifyUser=async id=>id===1||id===2;
  const pg=createPremiumPgStore({pool,enabled:true,verifyUser,verifyPayment:async p=>({status:'APPROVED',orderId:p.orderId,paymentKey:p.paymentKey,currency:'KRW',amountKrw:p.expectedAmountKrw}),verifyRefund:async p=>({status:'REFUNDED',orderId:p.orderId,paymentKey:p.paymentKey,currency:'KRW',amountKrw:p.expectedAmountKrw})});
  const a=createPremiumAppearanceStore({pool,verifyUser});
  assert.deepEqual(await a.getAppearance(1),{galleryThemeId:'default',profileFrameId:'default'});
  await assert.rejects(a.setAppearance({userId:2,galleryThemeId:'imperial_watch_room'}),code('NOT_OWNED'));
  await assert.rejects(a.setAppearance({userId:1,galleryThemeId:'signature_identity'}),code('BAD_APPEARANCE'));
  await assert.rejects(a.setAppearance({userId:999,galleryThemeId:'imperial_watch_room'}),code('USER_UNAVAILABLE'));
  async function purchase(id,productId,key){
   const order=await pg.createOrder({userId:id,productId,requestId:'request-'+key});
   await pg.fulfillApprovedOrder({orderId:order.orderId,paymentKey:'payment-'+key});
   return order;
  }
  const theme=await purchase(1,'imperial_watch_room','theme1234567');
  const frame=await purchase(1,'signature_identity','frame1234567');
  assert.deepEqual(await a.setAppearance({userId:1,galleryThemeId:'imperial_watch_room',profileFrameId:'signature_identity'}),{galleryThemeId:'imperial_watch_room',profileFrameId:'signature_identity'});
  assert.deepEqual(await a.getAppearance(1),{galleryThemeId:'imperial_watch_room',profileFrameId:'signature_identity'});
  await assert.rejects(a.setAppearance({userId:2,galleryThemeId:'imperial_watch_room'}),code('NOT_OWNED'));
  await pg.applyVerifiedRefund({orderId:theme.orderId});
  assert.deepEqual(await a.getAppearance(1),{galleryThemeId:'default',profileFrameId:'signature_identity'},'Refunded theme disappears automatically');
  await pg.applyVerifiedRefund({orderId:frame.orderId});
  assert.deepEqual(await a.getAppearance(1),{galleryThemeId:'default',profileFrameId:'default'},'Refunded profile badge disappears automatically');
  await assert.rejects(a.setAppearance({userId:1,galleryThemeId:'imperial_watch_room'}),code('NOT_OWNED'));
  assert.deepEqual(await a.setAppearance({userId:1}),{galleryThemeId:'default',profileFrameId:'default'});
  const fields=(await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map(x=>x.table_name);
  assert(!fields.includes('ledger')&&!fields.includes('users')&&!fields.includes('game_state'));
  console.log('PREMIUM_APPEARANCE_OK: verified-owner selections, no gifting, refund-safe fallback, isolated cosmetics');
 }finally{await pool.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
