'use strict';
// JUNJA PRIVATE EXCHANGE — virtual collectible ownership, exact BigInt settlement,
// 24-hour auctions with escrow, bank buyback and immutable-style provenance journal.
const crypto=require('node:crypto');
const GYEONG=10n**16n,AUCTION_MS=24*3600*1000;
const MARKET_FEE_PCT=8n,BANK_BUYBACK_PCT=75n;
function createRoyalMarket({db,exactWallet,now,items}){
 const catalog=new Map(items.map(x=>[x.id,x]));
 const getKey=k=>db.prepare('SELECT value FROM game_state WHERE key=?').get(k)?.value;
 const put=(k,v,t=now())=>db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
  .run(k,JSON.stringify(v),t);
 const remove=k=>db.prepare('DELETE FROM game_state WHERE key=?').run(k);
 const parse=(v,otherwise=null)=>{try{return v==null?otherwise:JSON.parse(v)}catch{return otherwise}};
 const user=id=>db.prepare('SELECT id,nickname,is_disabled,balance,balance_exact,balance_base FROM users WHERE id=?').get(id);
 const owning=(id,itemId)=>db.prepare('SELECT item_id,purchased_at FROM user_inventory WHERE user_id=? AND item_id=?').get(id,itemId);
 const holderKey=(uid,id)=>'royal:certificate:holder:'+uid+':'+id;
 const certKey=serial=>'royal:certificate:serial:'+serial;
 const inscriptionKey=(uid,id)=>'royal:inscription:'+uid+':'+id;
 const showcaseKey=uid=>'royal:showcase:'+uid;
 const lotKey=id=>'royal:auction:lot:'+id;
 const goodUser=id=>{const u=user(id);if(!u||u.is_disabled)throw Error('정상 이용 중인 회원만 거래할 수 있어.');return u};
 const itemBy=id=>{const item=catalog.get(String(id||''));if(!item)throw Error('등록된 로얄 소장품이 아니야.');return item};
 const valueOf=v=>exactWallet.integer(v);
 function wallet(id,delta,type,memo,at=now()){
  const u=user(id);if(!u)throw Error('거래 회원이 존재하지 않아.');
  const n=exactWallet.read(u)+delta;
  if(n<0n)throw Error('게임머니 잔액이 부족해.');
  const mirror=exactWallet.mirror(n),dMirror=exactWallet.mirror(delta);
  db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?').run(mirror,String(n),String(mirror),id);
  db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)')
   .run(id,dMirror,mirror,String(delta),String(n),type,memo,at);
  return String(n);
 }
 const serialFor=(uid,itemId,at)=>'JLC-'+crypto.createHash('sha256').update(String(itemId)+'|'+uid+'|'+at).digest('hex').slice(0,16).toUpperCase();
 // Existing collector items are minted lazily from their actual ownership row.
 // A transfer moves the holder pointer; the serial ID never changes.
 function certificate(uid,itemId){
  if(!owning(uid,itemId)||!catalog.has(itemId))return null;
  const pointer=parse(getKey(holderKey(uid,itemId)));
  const receipt=parse(getKey(inscriptionKey(uid,itemId)),{});
  const inventory=owning(uid,itemId);
  const originalAt=Number(receipt.purchasedAt||inventory.purchased_at||0);
  const serial=pointer||serialFor(uid,itemId,originalAt);
  const saved=parse(getKey(certKey(serial)));
  if(saved)return saved.currentOwnerId===uid?scrub(saved):null;
  const u=user(uid);
  return scrub({
   serial,itemId,itemName:itemBy(itemId).name,
   issuedAt:originalAt,issuedPrice:String(receipt.paid||catalog.get(itemId).price),
   originalOwnerId:uid,originalOwner:u?.nickname||'컬렉터',
   currentOwnerId:uid,currentOwner:u?.nickname||'컬렉터',
   status:'ACTIVE',transfers:0,history:[{type:'FIRST_ACQUISITION',at:originalAt,to:u?.nickname||'컬렉터',price:String(receipt.paid||catalog.get(itemId).price)}]
  });
 }
 // No internal user IDs are exposed on public collector certificates.
 function scrub(c){if(!c)return null;const {originalOwnerId,currentOwnerId,...safe}=c;return safe;}
 // Newly purchased objects receive a fresh, irreversible acquisition serial.
 // This prevents a bank-redeemed item repurchased in the same millisecond from
 // inheriting the previous owner's revoked provenance record.
 function issueCertificate(uid,itemId){
  if(!owning(uid,itemId))throw Error('소장품 구매가 확정되지 않았어.');
  if(parse(getKey(holderKey(uid,itemId))))throw Error('이미 소유권 증명서가 발급됐어.');
  const item=itemBy(itemId),u=goodUser(uid);
  const receipt=parse(getKey(inscriptionKey(uid,itemId)),{});
  const t=Number(receipt.purchasedAt||owning(uid,itemId).purchased_at||now());
  let serial;
  do{serial='JLC-'+crypto.randomBytes(8).toString('hex').toUpperCase()}while(getKey(certKey(serial)));
  const cert={serial,itemId,itemName:item.name,issuedAt:t,issuedPrice:String(receipt.paid||item.price),
   originalOwnerId:uid,originalOwner:u.nickname,currentOwnerId:uid,currentOwner:u.nickname,
   status:'ACTIVE',transfers:0,history:[{type:'FIRST_ACQUISITION',at:t,to:u.nickname,price:String(receipt.paid||item.price)}]};
  put(certKey(serial),cert,t);
  put(holderKey(uid,itemId),serial,t);
  return scrub(cert);
 }
 function ensureCertificate(uid,itemId){
  const receipt=parse(getKey(inscriptionKey(uid,itemId)),{});
  const inventory=owning(uid,itemId);
  if(!inventory)throw Error('해당 소장품의 소유자가 아니야.');
  const serial=parse(getKey(holderKey(uid,itemId)))||serialFor(uid,itemId,Number(receipt.purchasedAt||inventory.purchased_at||0));
  let cert=parse(getKey(certKey(serial)));
  if(!cert){
   const u=user(uid),name=u?.nickname||'컬렉터',at=Number(receipt.purchasedAt||inventory.purchased_at||now());
   cert={serial,itemId,itemName:itemBy(itemId).name,issuedAt:at,issuedPrice:String(receipt.paid||itemBy(itemId).price),
    originalOwnerId:uid,originalOwner:name,currentOwnerId:uid,currentOwner:name,status:'ACTIVE',transfers:0,
    history:[{type:'FIRST_ACQUISITION',at,to:name,price:String(receipt.paid||itemBy(itemId).price)}]};
   put(certKey(serial),cert);
  }
  if(cert.currentOwnerId!==uid||cert.status!=='ACTIVE')throw Error('소유권 증명서와 실제 보유정보가 일치하지 않아.');
  put(holderKey(uid,itemId),serial);
  return cert;
 }
 const auctionRows=()=>db.prepare("SELECT key,value FROM game_state WHERE key LIKE 'royal:auction:lot:%'").all()
  .map(x=>parse(x.value)).filter(Boolean);
 const activeFor=(uid,itemId)=>auctionRows().find(x=>x.status==='OPEN'&&x.sellerId===uid&&x.itemId===itemId)||null;
 function detachShowcase(uid,itemId){
  const raw=getKey(showcaseKey(uid)),chosen=parse(raw);
  if(Array.isArray(chosen)&&chosen.includes(itemId))put(showcaseKey(uid),chosen.filter(id=>id!==itemId));
  for(const col of ['title','frame','costume','pet'])
   db.prepare('UPDATE user_loadout SET '+col+'=NULL WHERE user_id=? AND '+col+'=?').run(uid,itemId);
 }
 function bankOffer(itemId){
  const item=itemBy(itemId);
  return String(valueOf(item.price)*BANK_BUYBACK_PCT/100n);
 }
 // Shared atomic redemption path: called from normal bank sell and from
 // overdue asset-credit collection inside its already-open SQL transaction.
 function bankSellInTransaction(uid,itemId){
  const item=itemBy(itemId);
   goodUser(uid);
   if(!owning(uid,item.id))throw Error('본인이 소장한 물품만 은행에 매각할 수 있어.');
   if(activeFor(uid,item.id))throw Error('경매 진행 중인 작품이야. 먼저 경매를 취소해줘.');
   const cert=ensureCertificate(uid,item.id),amount=valueOf(bankOffer(item.id)),t=now();
   db.prepare('DELETE FROM user_inventory WHERE user_id=? AND item_id=?').run(uid,item.id);
   detachShowcase(uid,item.id);
   remove(inscriptionKey(uid,item.id));remove(holderKey(uid,item.id));
   cert.status='BANK_REDEEMED';
   cert.currentOwnerId=null;cert.currentOwner='J-BANK';
   cert.history.push({type:'BANK_REDEMPTION',at:t,from:user(uid)?.nickname||'컬렉터',to:'J-BANK',price:String(amount)});
   put(certKey(cert.serial),cert,t);
   const balance=wallet(uid,amount,'royal_bank_buyback','J-BANK 명품 즉시 매입 · '+item.name,t);
   return {ok:true,itemId:item.id,name:item.name,received:String(amount),balance,serial:cert.serial};
 }
 function bankSell(uid,itemId){
  db.exec('BEGIN IMMEDIATE');
  try{
   const result=bankSellInTransaction(uid,itemId);
   db.exec('COMMIT');return result;
  }catch(err){try{db.exec('ROLLBACK')}catch{}throw err}
 }
 function list(uid,itemId,opening){
  const item=itemBy(itemId),start=valueOf(opening),base=valueOf(item.price);
  if(start<GYEONG||start>base*3n)throw Error('경매 시작가는 최소 1경, 최대 정가의 3배로 설정해줘.');
  db.exec('BEGIN IMMEDIATE');
  try{
   const seller=goodUser(uid);
   if(!owning(uid,item.id))throw Error('소장 중인 명품만 경매에 등록할 수 있어.');
   if(activeFor(uid,item.id))throw Error('이 명품은 이미 경매에 등록되어 있어.');
   const active=auctionRows().filter(x=>x.status==='OPEN');
   if(active.length>=150)throw Error('경매장이 가득 찼어.');
   if(active.filter(x=>x.sellerId===uid).length>=10)throw Error('회원당 경매 등록은 최대 10건이야.');
   const cert=ensureCertificate(uid,item.id);
   const t=now(),id=crypto.randomBytes(8).toString('hex');
   const lot={id,itemId:item.id,sellerId:uid,sellerName:seller.nickname,serial:cert.serial,
    start:String(start),currentBid:null,bidderId:null,bidderName:null,
    createdAt:t,expiresAt:t+AUCTION_MS,status:'OPEN',winnerName:null,finalPrice:null,settledAt:null};
   put(lotKey(id),lot,t);
   db.exec('COMMIT');
   return lotPublic(lot);
  }catch(err){try{db.exec('ROLLBACK')}catch{}throw err}
 }
 function lotPublic(lot){
  const item=catalog.get(lot.itemId),bid=lot.currentBid==null?null:valueOf(lot.currentBid);
  const minimum=bid==null?valueOf(lot.start):bid+(bid+19n)/20n;
  return {
   id:lot.id,itemId:lot.itemId,itemName:item?.name||'로얄 명품',category:item?.category||'art',
   art:item?.art||'gem',brand:item?.brand||null,visualSlot:item?.visualSlot??null,
   stock:item?.stock??null,rarity:item?.rarity||'prestige',
   serial:lot.serial,sellerName:lot.sellerName,start:lot.start,currentBid:lot.currentBid,
   minimumBid:String(minimum),bidderName:lot.bidderName,createdAt:lot.createdAt,
   expiresAt:lot.expiresAt,status:lot.status,winnerName:lot.winnerName,
   finalPrice:lot.finalPrice,settledAt:lot.settledAt
  };
 }
 function bid(uid,id,amount){
  const wanted=valueOf(amount),k=lotKey(String(id||''));
  db.exec('BEGIN IMMEDIATE');
  try{
   const buyer=goodUser(uid),lot=parse(getKey(k));
   if(!lot||lot.status!=='OPEN')throw Error('진행 중인 경매가 아니야.');
   if(now()>=lot.expiresAt)throw Error('입찰 시간이 종료됐어.');
   if(lot.sellerId===uid)throw Error('본인 물품에는 입찰할 수 없어.');
   if(owning(uid,lot.itemId))throw Error('이미 소장 중인 상품에는 중복 입찰할 수 없어.');
   if(lot.bidderId===uid)throw Error('이미 최고 입찰자야. 다른 입찰이 올라오면 다시 참여해줘.');
   if(!owning(lot.sellerId,lot.itemId))throw Error('출품자의 소유권을 확인할 수 없어.');
   const prior=lot.bidderId,priorAmount=lot.currentBid==null?0n:valueOf(lot.currentBid);
   const minimum=prior?priorAmount+(priorAmount+19n)/20n:valueOf(lot.start);
   if(wanted<minimum)throw Error('입찰 금액은 '+minimum.toString()+' G 이상이어야 해.');
   if(wanted>valueOf(itemBy(lot.itemId).price)*10n)throw Error('경매 입찰 한도는 원래 상품가격의 10배야.');
   const t=now();
   wallet(uid,-wanted,'royal_auction_bid','경매 입찰금 보관 · '+lot.itemId,t);
   if(prior)wallet(prior,priorAmount,'royal_auction_outbid_refund','경매 최고가 갱신 · 입찰금 반환 · '+lot.itemId,t);
   lot.currentBid=String(wanted);lot.bidderId=uid;lot.bidderName=buyer.nickname;
   put(k,lot,t);
   db.exec('COMMIT');
   return {ok:true,lot:lotPublic(lot),escrow:String(wanted)};
  }catch(err){try{db.exec('ROLLBACK')}catch{}throw err}
 }
 function cancel(uid,id){
  const k=lotKey(String(id||''));
  db.exec('BEGIN IMMEDIATE');
  try{
   goodUser(uid);
   const lot=parse(getKey(k));
   if(!lot||lot.status!=='OPEN')throw Error('취소할 수 있는 경매가 아니야.');
   if(lot.sellerId!==uid)throw Error('출품자만 경매를 취소할 수 있어.');
   if(lot.bidderId)throw Error('입찰이 발생한 경매는 취소할 수 없어.');
   lot.status='CANCELLED';lot.settledAt=now();
   put(k,lot);
   db.exec('COMMIT');
   return {ok:true,lot:lotPublic(lot)};
  }catch(err){try{db.exec('ROLLBACK')}catch{}throw err}
 }
 function settleOne(id){
  const k=lotKey(id);
  db.exec('BEGIN IMMEDIATE');
  try{
   const lot=parse(getKey(k));
   if(!lot||lot.status!=='OPEN'||lot.expiresAt>now()){db.exec('COMMIT');return false}
   const t=now();
   if(!lot.bidderId){
    lot.status='EXPIRED';lot.settledAt=t;put(k,lot,t);db.exec('COMMIT');return true;
   }
   const amount=valueOf(lot.currentBid);
   const valid=!!owning(lot.sellerId,lot.itemId)&&!owning(lot.bidderId,lot.itemId)&&!user(lot.bidderId)?.is_disabled&&!!user(lot.bidderId);
   if(!valid){
    wallet(lot.bidderId,amount,'royal_auction_invalid_refund','소유권 검증 실패 · 입찰금 반환 · '+lot.itemId,t);
    lot.status='VOID';lot.settledAt=t;put(k,lot,t);db.exec('COMMIT');return true;
   }
   const cert=ensureCertificate(lot.sellerId,lot.itemId);
   if(cert.serial!==lot.serial)throw Error('경매 증명서가 소유 증명서와 달라.');
   const fee=amount*MARKET_FEE_PCT/100n,net=amount-fee;
   const buyer=user(lot.bidderId),seller=user(lot.sellerId);
   db.prepare('DELETE FROM user_inventory WHERE user_id=? AND item_id=?').run(lot.sellerId,lot.itemId);
   db.prepare('INSERT INTO user_inventory(user_id,item_id,purchase_price,purchased_at) VALUES(?,?,?,?)')
    .run(lot.bidderId,lot.itemId,exactWallet.mirror(amount),t);
   detachShowcase(lot.sellerId,lot.itemId);
   remove(inscriptionKey(lot.sellerId,lot.itemId));
   remove(holderKey(lot.sellerId,lot.itemId));
   put(holderKey(lot.bidderId,lot.itemId),cert.serial,t);
   put(inscriptionKey(lot.bidderId,lot.itemId),{
    ownerId:lot.bidderId,ownerNickname:buyer.nickname,itemId:lot.itemId,
    itemName:itemBy(lot.itemId).name,paid:String(amount),purchasedAt:t,
    originalPurchaseAt:cert.issuedAt,certificateSerial:cert.serial
   },t);
   cert.currentOwnerId=lot.bidderId;cert.currentOwner=buyer.nickname;
   cert.transfers++;
   cert.history.push({type:'AUCTION_TRANSFER',at:t,from:seller?.nickname||lot.sellerName,
    to:buyer.nickname,price:String(amount),fee:String(fee),lotId:lot.id});
   put(certKey(cert.serial),cert,t);
   wallet(lot.sellerId,net,'royal_auction_seller_credit','명품 경매 낙찰 · '+lot.itemId+' · 수수료 8%',t);
   lot.status='SOLD';lot.settledAt=t;lot.winnerName=buyer.nickname;lot.finalPrice=String(amount);
   put(k,lot,t);db.exec('COMMIT');return true;
  }catch(err){try{db.exec('ROLLBACK')}catch{}throw err}
 }
 function settleExpired(){
  const matured=auctionRows().filter(x=>x.status==='OPEN'&&x.expiresAt<=now());
  let n=0;
  for(const lot of matured){if(settleOne(lot.id))n++}
  return n;
 }
 function market(uid){
  const current=goodUser(uid);
  const lots=auctionRows().sort((a,b)=>b.createdAt-a.createdAt);
  const owned=items.filter(x=>owning(uid,x.id)).map(x=>({
   id:x.id,name:x.name,category:x.category,art:x.art,visualSlot:x.visualSlot??null,
   rarity:x.rarity,retail:x.price,bankOffer:bankOffer(x.id),
   certificate:certificate(uid,x.id),listed:!!activeFor(uid,x.id)
  }));
  const active=lots.filter(x=>x.status==='OPEN').map(x=>({...lotPublic(x),mine:x.sellerId===uid,myBid:x.bidderId===uid,alreadyOwned:!!owning(uid,x.itemId)}));
  const history=lots.filter(x=>x.status!=='OPEN').sort((a,b)=>(b.settledAt||0)-(a.settledAt||0)||b.createdAt-a.createdAt).slice(0,20).map(lotPublic);
  return {owner:current.nickname,owned,active,history,now:now(),rules:{
   durationHours:24,minimumBid:'10000000000000000',sellerFeePct:Number(MARKET_FEE_PCT),bankBuybackPct:Number(BANK_BUYBACK_PCT),minimumRaisePct:5,maxListingsPerUser:10}};
 }
 return {bankSell,bankSellInTransaction,bankOffer,list,bid,cancel,market,settleExpired,activeFor,certificate,issueCertificate};
}
module.exports={createRoyalMarket};
