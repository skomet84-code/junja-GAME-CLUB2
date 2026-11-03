'use strict';
// Royal boutique cosmetics use the existing inventory/loadout tables and exact-wallet
// ledger so all ownership and economic events survive the SQLite -> Postgres sync.
const W=10n**4n,JO=10n**12n;
const ROYAL_ITEMS=Object.freeze([
 {id:'title_royalboutique_gold',category:'title',name:'황금빛 귀족',icon:'✦',rarity:'prestige',price:String(10n*JO),collection:'royalboutique',desc:'닉네임 아래에 빛나는 로얄 칭호 · 영구 소장'},
 {id:'title_royalboutique_diamond',category:'title',name:'다이아몬드 황제',icon:'💎',rarity:'mythic',price:String(100n*JO),collection:'royalboutique',desc:'다이아몬드로 새긴 고유 칭호 · 영구 소장'},
 {id:'frame_royalboutique_royal',category:'frame',name:'로얄 프로필 액자',icon:'👑',rarity:'mythic',price:String(500n*JO),collection:'royalboutique',desc:'금빛 왕실 프로필 테두리 · 영구 소장'},
 {id:'costume_royalboutique_crown',category:'costume',name:'순금 황제관',icon:'👑',rarity:'prestige',price:String(1000n*JO),collection:'royalboutique',desc:'프로필과 게임 아바타에 표시되는 왕관'},
 {id:'pet_royalboutique_dragon',category:'pet',name:'황금 신룡',icon:'🐉',rarity:'mythic',price:String(10000n*JO),collection:'royalboutique',desc:'왕실 수호신룡 펫 · 영구 소장'},
 {id:'title_royalboutique_entry',category:'title',name:'황실의 귀환',icon:'✨',rarity:'prestige',price:String(30000n*JO),collection:'royalboutique',desc:'등장할 때 눈에 띄는 최고급 칭호'},
 {id:'frame_royalboutique_aura',category:'frame',name:'황제의 오라',icon:'🌟',rarity:'mythic',price:String(50000n*JO),collection:'royalboutique',desc:'장착하면 아바타 주위로 황금 광휘가 나타남'},
 {id:'costume_royalboutique_wings',category:'costume',name:'신화의 날개',icon:'🪽',rarity:'mythic',price:String(100000n*JO),collection:'royalboutique',desc:'프로필과 게임 아바타에 표시되는 신화 날개'},
 {id:'frame_royalboutique_regalia',category:'frame',name:'THE ROYAL 문장',icon:'♛',rarity:'prestige',price:String(300000n*JO),collection:'royalboutique',desc:'왕실 정통 문장 · 장착 가능한 전설 프로필'},
 {id:'costume_royalboutique_phoenix',category:'costume',name:'불사조 황제관',icon:'🔥',rarity:'sovereign',price:String(500000n*JO),collection:'royalboutique',stock:3,desc:'서버 단 3개 · 소유자 각인과 희소성 보장'},
 {id:'pet_royalboutique_immortal',category:'pet',name:'불멸의 황제 수호수',icon:'🦅',rarity:'sovereign',price:String(1000000n*JO),collection:'royalboutique',desc:'최상위 영구 소장품 · 승률 및 경제 혜택 없음'}
]);
function createRoyalEconomy({db,exactWallet,now,getAssets}){
 const itemMap=new Map(ROYAL_ITEMS.map(item=>[item.id,item]));
 const readExact=(v)=>BigInt(String(v??0));
 const inventoryCount=db.prepare('SELECT COUNT(*) AS n FROM user_inventory WHERE item_id=?');
 const owns=db.prepare('SELECT purchased_at FROM user_inventory WHERE user_id=? AND item_id=?');
 const getInscription=db.prepare('SELECT value FROM game_state WHERE key=?');
 const purchaseKey=(uid,id)=>'royal:inscription:'+uid+':'+id;
 const kstDay=(at)=>new Date(at+9*3600000).toISOString().slice(0,10);
 function decorate(item,uid){
   if(item.collection!=='royalboutique')return {};
   const sold=Number(inventoryCount.get(item.id)?.n||0);
   const owned=owns.get(uid,item.id);
   let inscription=null;
   if(owned){const row=getInscription.get(purchaseKey(uid,item.id));try{inscription=row?JSON.parse(row.value):null}catch{}}
   return {stock:item.stock??null,remaining:item.stock==null?null:Math.max(0,item.stock-sold),soldOut:item.stock!=null&&sold>=item.stock&&!owned,inscription};
 }
 function buy(uid,id){
   const item=typeof id==='string'?itemMap.get(id):itemMap.get(id?.id);
   if(!item)throw new Error('로얄 명품관 상품을 찾을 수 없습니다.');
   db.exec('BEGIN IMMEDIATE');
   try{
     const u=db.prepare('SELECT id,nickname,is_disabled,balance,balance_exact,balance_base FROM users WHERE id=?').get(uid);
     if(!u||u.is_disabled)throw new Error('계정을 확인할 수 없습니다.');
     if(owns.get(uid,item.id))throw new Error('이미 영구 소장 중인 상품입니다. 추가 결제되지 않았습니다.');
     if(item.stock!=null&&Number(inventoryCount.get(item.id)?.n||0)>=item.stock)throw new Error('한정판 재고가 모두 소진됐습니다.');
     const price=readExact(item.price),balance=exactWallet.read(u);
     if(balance<price)throw new Error('게임머니 잔액이 부족합니다.');
     const next=balance-price,t=now(),mirrored=exactWallet.mirror(next);
     db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?').run(mirrored,String(next),String(mirrored),uid);
     db.prepare('INSERT INTO user_inventory(user_id,item_id,purchase_price,purchased_at) VALUES(?,?,?,?)').run(uid,item.id,exactWallet.mirror(price),t);
     db.prepare('INSERT INTO user_loadout(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING').run(uid);
     // Category is trusted server-side catalog data, never a client-supplied column.
     db.prepare('UPDATE user_loadout SET '+item.category+'=? WHERE user_id=?').run(item.id,uid);
     const inscription={ownerId:uid,ownerNickname:u.nickname,itemId:item.id,itemName:item.name,paid:String(price),purchasedAt:t};
     db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?)').run(purchaseKey(uid,item.id),JSON.stringify(inscription),t);
     db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)')
       .run(uid,exactWallet.mirror(-price),mirrored,String(-price),String(next),'royal_boutique_purchase','JUNJA ROYAL BOUTIQUE · '+item.name+' · 재화 영구 소멸',t);
     if(!owns.get(uid,item.id)||db.prepare('SELECT '+item.category+' AS equipped FROM user_loadout WHERE user_id=?').get(uid)?.equipped!==item.id)throw new Error('구매 검증 실패');
     db.exec('COMMIT');
     return {item,inscription,balance:String(next)};
   }catch(e){try{db.exec('ROLLBACK')}catch{}throw e;}
 }

 const SHOWCASE_TIERS=Object.freeze([
  {name:'GOD COLLECTOR',min:10n**19n,icon:'♛'},
  {name:'THE ABSOLUTE',min:10n**18n,icon:'✦'},
  {name:'LEGEND',min:10n**17n,icon:'✧'},
  {name:'EMPEROR',min:10n**16n,icon:'💎'},
  {name:'ROYAL',min:100n*JO,icon:'👑'}
 ]);
 const showcaseKey=uid=>'royal:showcase:'+uid;
 function collector(uid){
   const rows=db.prepare("SELECT COALESCE(amount_exact,CAST(amount AS TEXT)) AS amount FROM ledger WHERE user_id=? AND type='royal_boutique_purchase'").all(uid);
   const spent=rows.reduce((total,r)=>{const n=readExact(r.amount);return n<0n?total-n:total},0n);
   const owned=ROYAL_ITEMS.filter(x=>!!owns.get(uid,x.id));
   const tier=SHOWCASE_TIERS.find(x=>spent>=x.min)||{name:'NEW COLLECTOR',min:0n,icon:'◇'};
   const next=[...SHOWCASE_TIERS].reverse().find(x=>x.min>spent);
   const equipped=db.prepare('SELECT title,frame,costume,pet FROM user_loadout WHERE user_id=?').get(uid)||{};
   const allowed=new Map(owned.map(x=>[x.id,x]));
   let custom=[],hasCustom=false;
   try{const row=getInscription.get(showcaseKey(uid));hasCustom=!!row;custom=row?JSON.parse(row.value):[];}catch{}
   if(!Array.isArray(custom)){custom=[];hasCustom=false;}
   const chosen=[...new Set(custom)].filter(id=>typeof id==='string'&&allowed.has(id)).slice(0,3);
   if(!hasCustom){
     const byPrice=owned.slice().sort((a,b)=>{const x=readExact(a.price),y=readExact(b.price);return x===y?0:x>y?-1:1;});
     chosen.push(...byPrice.filter(x=>equipped[x.category]===x.id).map(x=>x.id).slice(0,3));
     for(const item of byPrice){if(chosen.length>=3)break;if(!chosen.includes(item.id))chosen.push(item.id)}
   }
   return {
     tier:tier.name,tierIcon:tier.icon,spent:String(spent),ownedCount:owned.length,
     nextTier:next?.name||null,nextAt:next?String(next.min):null,
     showcase:chosen.map(id=>{const item=allowed.get(id);return {id:item.id,name:item.name,icon:item.icon,rarity:item.rarity,price:item.price,category:item.category,equipped:equipped[item.category]===id}}),
     equipped:ROYAL_ITEMS.filter(x=>equipped[x.category]===x.id&&allowed.has(x.id)).map(x=>({id:x.id,name:x.name,icon:x.icon}))
   };
 }
 function updateShowcase(uid,selectedIds){
   if(!Array.isArray(selectedIds)||selectedIds.length>3||selectedIds.length!==new Set(selectedIds).size)throw new Error('전시 명품은 최대 3개만 선택할 수 있습니다.');
   if(selectedIds.some(id=>typeof id!=='string'||!itemMap.has(id)||!owns.get(uid,id)))throw new Error('구매한 명품만 전시할 수 있습니다.');
   const t=now();
   db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
     .run(showcaseKey(uid),JSON.stringify(selectedIds),t);
   return collector(uid);
 }
 function rank(){
   const rows=db.prepare("SELECT user_id,COALESCE(amount_exact,CAST(amount AS TEXT)) AS amount FROM ledger WHERE type='royal_boutique_purchase'").all();
   const sums=new Map();
   for(const row of rows)sums.set(row.user_id,(sums.get(row.user_id)||0n)-readExact(row.amount));
   const names=new Map(db.prepare('SELECT id,nickname FROM users').all().map(u=>[u.id,u.nickname]));
   return [...sums.entries()].sort((a,b)=>a[1]===b[1]?a[0]-b[0]:a[1]>b[1]?-1:1).slice(0,10).map(([userId,spent],i)=>({rank:i+1,userId,nickname:names.get(userId)||'탈퇴 회원',spent:String(spent)}));
 }
 function catalog(uid){
   const load=db.prepare('SELECT title,frame,costume,pet FROM user_loadout WHERE user_id=?').get(uid)||{};
   const recent=db.prepare("SELECT u.nickname,l.memo,l.created_at AS purchasedAt FROM ledger l JOIN users u ON u.id=l.user_id WHERE l.type='royal_boutique_purchase' ORDER BY l.id DESC LIMIT 8").all()
    .map(r=>({nickname:r.nickname,itemName:String(r.memo||'').split(' · ')[1]||'로얄 명품',purchasedAt:r.purchasedAt}));
   return {nickname:db.prepare('SELECT nickname FROM users WHERE id=?').get(uid)?.nickname||'',items:ROYAL_ITEMS.map(item=>({...item,owned:!!owns.get(uid,item.id),equipped:load[item.category]===item.id,...decorate(item,uid)})),collector:collector(uid),ranking:rank(),recent,serverNow:now()};
 }
 function dashboard(){
   const people=db.prepare('SELECT id,nickname,balance,balance_exact,balance_base,is_disabled FROM users').all();
   let wallet=0n,savings=0n,installments=0n,stocks=0n,coins=0n,debt=0n,assetsFailed=0;
   const fortunes=[];
   for(const u of people){
     const cash=exactWallet.read(u);wallet+=cash;
     let sv=0n,iv=0n,st=0n,cv=0n,owed=0n;
     try{
       const x=getAssets(u.id);
       sv=readExact(x.bank?.savings?.total);iv=readExact(x.bank?.installment?.principal);
       st=readExact(x.stock?.marketValue);cv=readExact(x.coin?.marketValue);owed=readExact(x.bank?.outstanding);
     }catch{assetsFailed++;}
     savings+=sv;installments+=iv;stocks+=st;coins+=cv;debt+=owed;
     fortunes.push({userId:u.id,nickname:u.nickname,total:String(cash+sv+iv+st+cv-owed),wallet:String(cash)});
   }
   fortunes.sort((a,b)=>BigInt(a.total)===BigInt(b.total)?a.userId-b.userId:BigInt(a.total)>BigInt(b.total)?-1:1);
   const start=Date.parse(kstDay(now())+'T00:00:00+09:00');
   const events=db.prepare('SELECT type,COALESCE(amount_exact,CAST(amount AS TEXT)) AS amount,created_at FROM ledger WHERE created_at>=?').all(start);
   let positive=0n,negative=0n,royalBurned=0n,shopBurned=0n,rankBurned=0n;
   for(const e of events){
     const amount=readExact(e.amount);
     if(amount>0n)positive+=amount;else negative-=amount;
     if(e.type==='royal_boutique_purchase'&&amount<0n)royalBurned-=amount;
     if(e.type==='shop_purchase'&&amount<0n)shopBurned-=amount;
     if(e.type==='rank_promotion'&&amount<0n)rankBurned-=amount;
   }
   return {asOf:now(),date:kstDay(now()),registered:people.length,disabled:people.filter(u=>u.is_disabled).length,
     wallet:String(wallet),savings:String(savings),installments:String(installments),stocks:String(stocks),coins:String(coins),outstandingDebt:String(debt),
     grossAssets:String(wallet+savings+installments+stocks+coins),netAssets:String(wallet+savings+installments+stocks+coins-debt),
     today:{ledgerIn:String(positive),ledgerOut:String(negative),ledgerNet:String(positive-negative),royalBurned:String(royalBurned),shopBurned:String(shopBurned),rankBurned:String(rankBurned),confirmedBurned:String(royalBurned+shopBurned+rankBurned)},
     topWealth:fortunes.slice(0,10),royalRanking:rank(),assetsFailed,
     note:'오늘 장부 유입/유출에는 유저 송금·은행·투자 이동이 포함됩니다. 신규 재화 발행량과 동일하지 않습니다. 투자 평가액은 시세에 따라 변동합니다.'};
 }
 return {buy,catalog,collector,updateShowcase,decorate,dashboard};
}
module.exports={ROYAL_ITEMS,createRoyalEconomy};
