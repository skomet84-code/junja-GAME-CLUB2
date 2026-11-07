'use strict';
// Server-side nontransferable premium appearance selection.
// Only active, provider-verified paid entitlements can be selected.
// This module does not import or edit J-GOLD, ranks, loan collateral, wagers or user inventories.
const {PRODUCTS}=require('./premium-purchase-core');
const CATALOG=new Map(PRODUCTS.map(x=>[x.id,x]));
const error=(code,message)=>Object.assign(new Error(message),{code});
function createPremiumAppearanceStore({pool,verifyUser,now=Date.now}={}){
 if(!pool||typeof pool.query!=='function'||typeof pool.connect!=='function')
  throw error('BAD_STORAGE','A PostgreSQL pool is required.');
 async function authenticate(uid){
  if(!Number.isSafeInteger(uid)||uid<=0||typeof verifyUser!=='function'||await verifyUser(uid)!==true)
   throw error('USER_UNAVAILABLE','Active authenticated user required.');
 }
 function validateSku(id,kind){
  if(id===null)return null;
  const item=CATALOG.get(id);
  if(!item||item.kind!==kind)throw error('BAD_APPEARANCE','Unknown or wrong-category cosmetic SKU.');
  return id;
 }
 async function setAppearance({userId,galleryThemeId=null,profileFrameId=null}={}){
  await authenticate(userId);
  const theme=validateSku(galleryThemeId,'gallery_theme');
  const frame=validateSku(profileFrameId,'profile_frame');
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   const ids=[...new Set([theme,frame].filter(Boolean))].sort();
   // Align with purchase/refund transaction-scoped locks to avoid choosing revoked items.
   for(const id of ids)await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0::bigint))',['premium:'+userId+':'+id]);
   for(const id of ids){
    const owned=(await c.query("SELECT 1 FROM premium_store_entitlements WHERE user_id=$1 AND product_id=$2 AND status='ACTIVE'",[userId,id])).rowCount>0;
    if(!owned)throw error('NOT_OWNED','Cannot select an item that this member has not purchased.');
   }
   await c.query('INSERT INTO premium_store_appearance(user_id,gallery_theme_id,profile_frame_id,updated_ms) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET gallery_theme_id=EXCLUDED.gallery_theme_id,profile_frame_id=EXCLUDED.profile_frame_id,updated_ms=EXCLUDED.updated_ms',[userId,theme,frame,now()]);
   await c.query('COMMIT');
   return {galleryThemeId:theme||'default',profileFrameId:frame||'default'};
  }catch(e){try{await c.query('ROLLBACK');}catch{}throw e;}
  finally{c.release();}
 }
 async function getAppearance(uid){
  await authenticate(uid);
  const row=(await pool.query("SELECT a.gallery_theme_id,a.profile_frame_id, t.status AS theme_status, f.status AS frame_status FROM premium_store_appearance a LEFT JOIN premium_store_entitlements t ON t.user_id=a.user_id AND t.product_id=a.gallery_theme_id LEFT JOIN premium_store_entitlements f ON f.user_id=a.user_id AND f.product_id=a.profile_frame_id WHERE a.user_id=$1",[uid])).rows[0];
  const theme=row?.theme_status==='ACTIVE'?row.gallery_theme_id:'default';
  const frame=row?.frame_status==='ACTIVE'?row.profile_frame_id:'default';
  return {galleryThemeId:theme,profileFrameId:frame};
 }
 return Object.freeze({setAppearance,getAppearance});
}
module.exports={createPremiumAppearanceStore};
