'use strict';
// Independent PostgreSQL premium-decoration purchase core. NOT connected to live HTTP or any gambling wallet.
const {randomUUID}=require('node:crypto');
const {PRODUCTS}=require('./premium-purchase-core');
const catalog=new Map(PRODUCTS.map(x=>[x.id,x]));
const error=(code,message)=>Object.assign(new Error(message),{code});
const goodId=id=>Number.isSafeInteger(id)&&id>0;
const orderView=o=>({orderId:o.order_id,productId:o.product_id,amountKrw:o.amount_krw,status:o.status});
function createPremiumPgStore({pool,enabled=false,verifyUser,verifyPayment,verifyRefund,verifyAdmin,now=Date.now}={}){
 if(!pool||typeof pool.query!=='function'||typeof pool.connect!=='function')throw error('BAD_STORAGE','PostgreSQL pool required.');
 const requireEnabled=()=>{if(enabled!==true)throw error('PAYMENTS_DISABLED','Commerce is disabled pending approval.');};
 const sku=id=>{const p=catalog.get(id);if(!p)throw error('BAD_PRODUCT','Unknown cosmetic item.');return p;};
 async function eligible(id){
  if(!goodId(id)||typeof verifyUser!=='function'||await verifyUser(id)!==true)throw error('USER_UNAVAILABLE','Verified active user required.');
  return id;
 }
 async function transaction(fn){
  const c=await pool.connect();
  try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}
  catch(e){try{await c.query('ROLLBACK');}catch{}throw e;}
  finally{c.release();}
 }
 async function lock(c,userId,productId){
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0::bigint))',['premium:'+userId+':'+productId]);
 }
 function checked(reply,order,paymentKey,status){
  if(!reply||reply.status!==status||reply.orderId!==order.order_id||reply.paymentKey!==paymentKey||
    reply.currency!=='KRW'||!Number.isSafeInteger(reply.amountKrw)||reply.amountKrw!==order.amount_krw)
    throw error('PROVIDER_MISMATCH','PG response does not match authorized amount, payment, order and currency.');
 }
 async function createOrder({userId,productId,requestId}={}){
  requireEnabled();const uid=await eligible(userId),p=sku(productId);
  if(typeof requestId!=='string'||!/^[-_a-zA-Z0-9]{12,96}$/.test(requestId))throw error('BAD_REQUEST','Invalid idempotency key.');
  return transaction(async c=>{
   await lock(c,uid,productId);
   const old=(await c.query('SELECT * FROM premium_store_orders WHERE user_id=$1 AND request_id=$2',[uid,requestId])).rows[0];
   if(old){if(old.product_id!==productId)throw error('REQUEST_CONFLICT','Idempotency key reused.');return orderView(old);}
   if((await c.query("SELECT 1 FROM premium_store_entitlements WHERE user_id=$1 AND product_id=$2 AND status='ACTIVE'",[uid,productId])).rowCount)
    throw error('ALREADY_OWNED','Item already owned.');
   const pending=(await c.query("SELECT * FROM premium_store_orders WHERE user_id=$1 AND product_id=$2 AND status='PENDING' ORDER BY created_ms LIMIT 1",[uid,productId])).rows[0];
   if(pending)return orderView(pending);
   const id='JP-'+randomUUID(),stamp=now();
   const row=(await c.query("INSERT INTO premium_store_orders(order_id,user_id,request_id,product_id,amount_krw,status,created_ms) VALUES($1,$2,$3,$4,$5,'PENDING',$6) RETURNING *",
    [id,uid,requestId,p.id,p.priceKrw,stamp])).rows[0];
   await c.query("INSERT INTO premium_store_events(order_id,user_id,event_type,created_ms) VALUES($1,$2,'ORDER_CREATED',$3)",[id,uid,stamp]);
   return orderView(row);
  });
 }
 async function fulfillApprovedOrder({orderId,paymentKey}={}){
  requireEnabled();
  if(typeof verifyPayment!=='function')throw error('PROVIDER_UNAVAILABLE','No approved PG verifier.');
  if(typeof orderId!=='string'||orderId.length<6||typeof paymentKey!=='string'||paymentKey.length<6)throw error('BAD_PAYMENT','Invalid reference.');
  const before=(await pool.query('SELECT * FROM premium_store_orders WHERE order_id=$1',[orderId])).rows[0];
  if(!before)throw error('ORDER_NOT_FOUND','Order missing.');
  if(before.status==='REFUNDED')throw error('ORDER_REFUNDED','Refunded order.');
  if(before.status==='PAID'){
   if(before.provider_payment_key!==paymentKey)throw error('PAYMENT_CONFLICT','Different payment key.');
   return {order:orderView(before),alreadyApplied:true};
  }
  const reply=await verifyPayment({orderId,paymentKey,expectedAmountKrw:before.amount_krw});
  checked(reply,before,paymentKey,'APPROVED');
  return transaction(async c=>{
   const curr=(await c.query('SELECT * FROM premium_store_orders WHERE order_id=$1 FOR UPDATE',[orderId])).rows[0];
   if(curr.status==='PAID'){
    if(curr.provider_payment_key!==paymentKey)throw error('PAYMENT_CONFLICT','Different payment key.');
    return {order:orderView(curr),alreadyApplied:true};
   }
   if(curr.status!=='PENDING')throw error('ORDER_CHANGED','Order changed.');
   await lock(c,curr.user_id,curr.product_id);
   if((await c.query("SELECT 1 FROM premium_store_entitlements WHERE user_id=$1 AND product_id=$2 AND status='ACTIVE'",[curr.user_id,curr.product_id])).rowCount)
    throw error('ALREADY_OWNED_RECONCILE','Paid but already owned. Reconciliation required.');
   const stamp=now();
   await c.query("UPDATE premium_store_orders SET status='PAID',provider_payment_key=$1,paid_ms=$2 WHERE order_id=$3",[paymentKey,stamp,orderId]);
   await c.query("INSERT INTO premium_store_entitlements(user_id,product_id,source_order_id,status,granted_ms,revoked_ms) VALUES($1,$2,$3,'ACTIVE',$4,NULL) ON CONFLICT (user_id,product_id) DO UPDATE SET source_order_id=EXCLUDED.source_order_id,status='ACTIVE',granted_ms=EXCLUDED.granted_ms,revoked_ms=NULL WHERE premium_store_entitlements.status='REVOKED'",[curr.user_id,curr.product_id,orderId,stamp]);
   await c.query("INSERT INTO premium_store_events(order_id,user_id,event_type,created_ms) VALUES($1,$2,'PAYMENT_APPROVED',$3)",[orderId,curr.user_id,stamp]);
   return {order:{...orderView(curr),status:'PAID'},alreadyApplied:false};
  });
 }
 async function applyVerifiedRefund({orderId}={}){
  requireEnabled();if(typeof verifyRefund!=='function')throw error('PROVIDER_UNAVAILABLE','No verified refund provider.');
  if(typeof orderId!=='string')throw error('BAD_REQUEST','Invalid order.');
  const before=(await pool.query('SELECT * FROM premium_store_orders WHERE order_id=$1',[orderId])).rows[0];
  if(!before)throw error('ORDER_NOT_FOUND','Order missing.');
  if(before.status==='REFUNDED')return {order:orderView(before),alreadyApplied:true};
  if(before.status!=='PAID')throw error('NOT_PAID','Pending cannot refund.');
  const reply=await verifyRefund({orderId,paymentKey:before.provider_payment_key,expectedAmountKrw:before.amount_krw});
  checked(reply,before,before.provider_payment_key,'REFUNDED');
  return transaction(async c=>{
   const curr=(await c.query('SELECT * FROM premium_store_orders WHERE order_id=$1 FOR UPDATE',[orderId])).rows[0];
   if(curr.status==='REFUNDED')return {order:orderView(curr),alreadyApplied:true};
   if(curr.status!=='PAID'||curr.provider_payment_key!==before.provider_payment_key)throw error('ORDER_CHANGED','Order changed.');
   await lock(c,curr.user_id,curr.product_id);
   const stamp=now();
   await c.query("UPDATE premium_store_orders SET status='REFUNDED',refunded_ms=$1 WHERE order_id=$2",[stamp,orderId]);
   await c.query("UPDATE premium_store_entitlements SET status='REVOKED',revoked_ms=$1 WHERE user_id=$2 AND product_id=$3 AND source_order_id=$4 AND status='ACTIVE'",[stamp,curr.user_id,curr.product_id,orderId]);
   await c.query("INSERT INTO premium_store_events(order_id,user_id,event_type,created_ms) VALUES($1,$2,'REFUND_CONFIRMED',$3)",[orderId,curr.user_id,stamp]);
   return {order:{...orderView(curr),status:'REFUNDED'},alreadyApplied:false};
  });
 }
 async function getOwned(uid){
  await eligible(uid);
  const rows=(await pool.query("SELECT product_id,source_order_id,granted_ms FROM premium_store_entitlements WHERE user_id=$1 AND status='ACTIVE' ORDER BY granted_ms DESC",[uid])).rows;
  return rows.map(r=>({...sku(r.product_id),sourceOrderId:r.source_order_id,grantedMs:Number(r.granted_ms)}));
 }
 async function getOrders(uid){
  await eligible(uid);
  const rows=(await pool.query('SELECT * FROM premium_store_orders WHERE user_id=$1 ORDER BY created_ms DESC LIMIT 200',[uid])).rows;
  return rows.map(orderView);
 }
 async function getAdminAudit(proof){
  if(typeof verifyAdmin!=='function'||await verifyAdmin(proof)!==true)throw error('ADMIN_FORBIDDEN','Verified admin required.');
  const totals=(await pool.query("SELECT COUNT(*) FILTER (WHERE status='PAID') AS paid_count, COUNT(*) FILTER (WHERE status='REFUNDED') AS refund_count,COUNT(*) FILTER (WHERE status='PENDING') AS pending_count, COALESCE(SUM(amount_krw) FILTER (WHERE status='PAID'),0)::TEXT AS net_collected_krw FROM premium_store_orders")).rows[0];
  const alerts=(await pool.query("SELECT o.order_id,o.product_id,o.status,o.created_ms, CASE WHEN o.status='PENDING' THEN 'PENDING_RECONCILE' WHEN o.status='PAID' THEN 'MISSING_ENTITLEMENT' ELSE 'REFUND_NOT_REVOKED' END AS issue FROM premium_store_orders o LEFT JOIN premium_store_entitlements e ON e.user_id=o.user_id AND e.product_id=o.product_id WHERE (o.status='PENDING' AND o.created_ms<$1) OR (o.status='PAID' AND (e.source_order_id IS DISTINCT FROM o.order_id OR e.status IS DISTINCT FROM 'ACTIVE')) OR (o.status='REFUNDED' AND e.source_order_id=o.order_id AND e.status='ACTIVE') ORDER BY o.created_ms LIMIT 100",[now()-86400000])).rows;
  return {paidCount:Number(totals.paid_count),refundCount:Number(totals.refund_count),pendingCount:Number(totals.pending_count),netCollectedKrw:totals.net_collected_krw,alerts:alerts.map(x=>({orderId:x.order_id,productId:x.product_id,status:x.status,issue:x.issue,createdMs:Number(x.created_ms)}))};
 }
 return Object.freeze({getCatalog:()=>PRODUCTS.map(x=>({...x})),createOrder,fulfillApprovedOrder,applyVerifiedRefund,getOwned,getOrders,getAdminAudit});
}
module.exports={createPremiumPgStore};
