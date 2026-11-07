'use strict';
// Payment-provider-agnostic premium decoration entitlements.
// NOT wired into HTTP, casinos, game-money wallets, auctions, or live PG payments.
const {randomUUID}=require('node:crypto');

const PRODUCTS=Object.freeze([
 {id:'imperial_watch_room',name:'황실의 시간',priceKrw:9900,kind:'gallery_theme'},
 {id:'royal_motor_lounge',name:'로얄 모터 라운지',priceKrw:19900,kind:'gallery_theme'},
 {id:'signature_identity',name:'갓준자 시그니처',priceKrw:4900,kind:'profile_frame'},
 {id:'marina_suite',name:'마리나 스위트',priceKrw:14900,kind:'gallery_theme'},
 {id:'sky_royal_room',name:'스카이 로얄',priceKrw:14900,kind:'gallery_theme'},
 {id:'private_palace',name:'프라이빗 팰리스',priceKrw:24900,kind:'gallery_theme'}
 ].map(x=>Object.freeze({...x,transferable:false,gameplayBenefit:false})));
const BY_ID=new Map(PRODUCTS.map(p=>[p.id,p]));
const invalid=(code,message)=>Object.assign(new Error(message),{code});
function createPremiumPurchaseCore({db,enabled=false,verifyPayment,verifyRefund,now=Date.now}={}){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw invalid('INVALID_DB','SQLite-compatible db is required.');
 if(typeof now!=='function')throw invalid('INVALID_CLOCK','Clock must be a function.');
 db.exec(`
 CREATE TABLE IF NOT EXISTS premium_purchase_orders (
   order_id TEXT PRIMARY KEY,
   user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
   request_id TEXT NOT NULL,
   product_id TEXT NOT NULL,
   amount_krw INTEGER NOT NULL CHECK(amount_krw>0),
   status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','REFUNDED')),
   provider_payment_key TEXT UNIQUE,
   created_at INTEGER NOT NULL,
   paid_at INTEGER,
   refunded_at INTEGER,
   UNIQUE(user_id,request_id)
 );
 CREATE INDEX IF NOT EXISTS premium_orders_by_user ON premium_purchase_orders(user_id,created_at);
 CREATE TABLE IF NOT EXISTS premium_entitlements (
   user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
   product_id TEXT NOT NULL,
   status TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
   source_order_id TEXT NOT NULL REFERENCES premium_purchase_orders(order_id),
   granted_at INTEGER NOT NULL,
   revoked_at INTEGER,
   PRIMARY KEY(user_id,product_id)
 );
 `);
 const selectUser=db.prepare('SELECT id,is_disabled FROM users WHERE id=?');
 const selectOrder=db.prepare('SELECT * FROM premium_purchase_orders WHERE order_id=?');
 const selectRequest=db.prepare('SELECT * FROM premium_purchase_orders WHERE user_id=? AND request_id=?');
 const selectActive=db.prepare("SELECT 1 FROM premium_entitlements WHERE user_id=? AND product_id=? AND status='ACTIVE'");
 const selectPending=db.prepare("SELECT * FROM premium_purchase_orders WHERE user_id=? AND product_id=? AND status='PENDING' ORDER BY created_at ASC LIMIT 1");
 const insertOrder=db.prepare('INSERT INTO premium_purchase_orders(order_id,user_id,request_id,product_id,amount_krw,created_at) VALUES(?,?,?,?,?,?)');
 const grant=db.prepare(`INSERT INTO premium_entitlements(user_id,product_id,status,source_order_id,granted_at,revoked_at)
 VALUES(?,?,'ACTIVE',?,?,NULL)
 ON CONFLICT(user_id,product_id) DO UPDATE SET status='ACTIVE',source_order_id=excluded.source_order_id,granted_at=excluded.granted_at,revoked_at=NULL
 WHERE premium_entitlements.status='REVOKED'`);
 const markPaid=db.prepare("UPDATE premium_purchase_orders SET status='PAID',provider_payment_key=?,paid_at=? WHERE order_id=? AND status='PENDING'");
 const markRefund=db.prepare("UPDATE premium_purchase_orders SET status='REFUNDED',refunded_at=? WHERE order_id=? AND status='PAID'");
 const revoke=db.prepare("UPDATE premium_entitlements SET status='REVOKED',revoked_at=? WHERE user_id=? AND product_id=? AND source_order_id=? AND status='ACTIVE'");
 const selectOwned=db.prepare("SELECT product_id,source_order_id,granted_at FROM premium_entitlements WHERE user_id=? AND status='ACTIVE' ORDER BY granted_at DESC");
 const selectHistory=db.prepare('SELECT order_id,product_id,amount_krw,status,created_at,paid_at,refunded_at FROM premium_purchase_orders WHERE user_id=? ORDER BY created_at DESC');
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}}
 function ensureEnabled(){if(enabled!==true)throw invalid('PAYMENTS_DISABLED','Premium orders are disabled until legal and PG approval.');}
 function userId(value){if(!Number.isSafeInteger(value)||value<=0)throw invalid('BAD_USER','Invalid user ID.');return value;}
 function sku(id){const product=BY_ID.get(id);if(!product)throw invalid('BAD_PRODUCT','Unknown premium item.');return product;}
 function publicOrder(row){return {orderId:row.order_id,productId:row.product_id,amountKrw:row.amount_krw,status:row.status};}
 function createOrder({userId:uid,productId,requestId}={}){
  ensureEnabled();uid=userId(uid);const product=sku(productId);
  if(typeof requestId!=='string'||!/^[-_a-zA-Z0-9]{12,96}$/.test(requestId))throw invalid('BAD_REQUEST','Invalid idempotency key.');
  return transaction(()=>{
   const user=selectUser.get(uid);if(!user||user.is_disabled)throw invalid('USER_UNAVAILABLE','User unavailable.');
   const old=selectRequest.get(uid,requestId);
   if(old){if(old.product_id!==productId)throw invalid('REQUEST_CONFLICT','Idempotency key reused for a different product.');return publicOrder(old);}
   if(selectActive.get(uid,productId))throw invalid('ALREADY_OWNED','Already owns this non-transferable item.');
   const pending=selectPending.get(uid,productId);if(pending)return publicOrder(pending);
   const orderId='JP-'+randomUUID();insertOrder.run(orderId,uid,requestId,product.id,product.priceKrw,now());
   return publicOrder(selectOrder.get(orderId));
  });
 }
 function requireVerified(result,order,paymentKey,status){
  if(!result||result.status!==status||result.orderId!==order.order_id||result.paymentKey!==paymentKey||
     result.amountKrw!==order.amount_krw||result.currency!=='KRW')throw invalid('PROVIDER_MISMATCH','Unverified or inconsistent PG response.');
 }
 async function fulfillApprovedOrder({orderId,paymentKey}={}){
  ensureEnabled();if(typeof verifyPayment!=='function')throw invalid('PROVIDER_UNAVAILABLE','No PG approval verifier configured.');
  if(typeof orderId!=='string'||typeof paymentKey!=='string'||paymentKey.length<6)throw invalid('BAD_PAYMENT','Invalid order/payment key.');
  const requested=selectOrder.get(orderId);if(!requested)throw invalid('ORDER_NOT_FOUND','Order not found.');
  if(requested.status==='REFUNDED')throw invalid('ORDER_REFUNDED','Refunded order cannot be fulfilled.');
  if(requested.status==='PAID'){
   if(requested.provider_payment_key!==paymentKey)throw invalid('PAYMENT_CONFLICT','Conflicting payment key.');
   return {order:publicOrder(requested),alreadyApplied:true};
  }
  // Only independently verified PG responses may authorize a decoration grant.
  const verified=await verifyPayment({orderId,paymentKey,expectedAmountKrw:requested.amount_krw});
  requireVerified(verified,requested,paymentKey,'APPROVED');
  return transaction(()=>{
   const fresh=selectOrder.get(orderId);
   if(fresh.status==='PAID'){
    if(fresh.provider_payment_key!==paymentKey)throw invalid('PAYMENT_CONFLICT','Conflicting payment key.');
    return {order:publicOrder(fresh),alreadyApplied:true};
   }
   if(fresh.status!=='PENDING')throw invalid('ORDER_CHANGED','Order is not pending.');
   if(selectActive.get(fresh.user_id,fresh.product_id))throw invalid('ALREADY_OWNED','Item owned; manual payment reconciliation required.');
   const stamp=now();
   if(markPaid.run(paymentKey,stamp,orderId).changes!==1)throw invalid('ORDER_CHANGED','Order update failed.');
   if(grant.run(fresh.user_id,fresh.product_id,orderId,stamp).changes!==1)throw invalid('GRANT_FAILED','Entitlement insert failed.');
   return {order:publicOrder(selectOrder.get(orderId)),alreadyApplied:false};
  });
 }
 async function applyVerifiedRefund({orderId}={}){
  ensureEnabled();if(typeof verifyRefund!=='function')throw invalid('PROVIDER_UNAVAILABLE','No PG refund verifier configured.');
  const original=selectOrder.get(orderId);if(!original)throw invalid('ORDER_NOT_FOUND','Order not found.');
  if(original.status==='REFUNDED')return {order:publicOrder(original),alreadyApplied:true};
  if(original.status!=='PAID')throw invalid('NOT_PAID','Only paid orders can be refunded.');
  const verified=await verifyRefund({orderId,paymentKey:original.provider_payment_key,expectedAmountKrw:original.amount_krw});
  requireVerified(verified,original,original.provider_payment_key,'REFUNDED');
  return transaction(()=>{
   const fresh=selectOrder.get(orderId);
   if(fresh.status==='REFUNDED')return {order:publicOrder(fresh),alreadyApplied:true};
   if(fresh.status!=='PAID'||fresh.provider_payment_key!==original.provider_payment_key)throw invalid('ORDER_CHANGED','Order changed.');
   const stamp=now();if(markRefund.run(stamp,orderId).changes!==1)throw invalid('ORDER_CHANGED','Refund update failed.');
   revoke.run(stamp,fresh.user_id,fresh.product_id,orderId);
   return {order:publicOrder(selectOrder.get(orderId)),alreadyApplied:false};
  });
 }
 function getOwned(uid){uid=userId(uid);return selectOwned.all(uid).map(row=>({...sku(row.product_id),sourceOrderId:row.source_order_id,grantedAt:row.granted_at}));}
 function getOrders(uid){uid=userId(uid);return selectHistory.all(uid).map(x=>({orderId:x.order_id,productId:x.product_id,amountKrw:x.amount_krw,status:x.status,createdAt:x.created_at,paidAt:x.paid_at,refundedAt:x.refunded_at}));}
 return Object.freeze({getCatalog:()=>PRODUCTS.map(x=>({...x})),createOrder,fulfillApprovedOrder,applyVerifiedRefund,getOwned,getOrders});
}
module.exports={PRODUCTS,createPremiumPurchaseCore};
