'use strict';
// Royal boutique cosmetics use the existing inventory/loadout tables and exact-wallet
// ledger so all ownership and economic events survive the SQLite -> Postgres sync.
const W=10n**4n,JO=10n**12n,GYEONG=10n**16n;
const P=n=>String(BigInt(n)*GYEONG);
// Read the original item IDs without change so all existing collectors retain ownership.
const ROYAL_ITEMS=Object.freeze([
 {id:'title_royalboutique_gold',category:'title',name:'황금빛 귀족',icon:'✦',rarity:'prestige',price:P(1),collection:'royalboutique',art:'noble',desc:'닉네임 아래에 빛나는 로얄 칭호 · 영구 소장'},
 {id:'title_royalboutique_diamond',category:'title',name:'다이아몬드 황제',icon:'💎',rarity:'mythic',price:P(3),collection:'royalboutique',art:'gem',desc:'다이아몬드로 새긴 고유 칭호 · 영구 소장'},
 {id:'frame_royalboutique_royal',category:'frame',name:'로얄 프로필 액자',icon:'👑',rarity:'mythic',price:P(6),collection:'royalboutique',art:'regalia',desc:'금빛 왕실 프로필 테두리 · 영구 소장'},
 {id:'costume_royalboutique_crown',category:'costume',name:'순금 황제관',icon:'👑',rarity:'prestige',price:P(10),collection:'royalboutique',art:'crown',desc:'프로필과 게임 아바타에 표시되는 왕관'},
 {id:'pet_royalboutique_dragon',category:'pet',name:'황금 신룡',icon:'🐉',rarity:'mythic',price:P(15),collection:'royalboutique',art:'dragon',desc:'왕실 수호신룡 펫 · 영구 소장'},
 {id:'title_royalboutique_entry',category:'title',name:'황실의 귀환',icon:'✨',rarity:'prestige',price:P(20),collection:'royalboutique',art:'scepter',desc:'등장할 때 눈에 띄는 최고급 칭호'},
 {id:'frame_royalboutique_aura',category:'frame',name:'황제의 오라',icon:'🌟',rarity:'mythic',price:P(30),collection:'royalboutique',art:'aura',desc:'장착하면 아바타 주위로 황금 광휘가 나타남'},
 {id:'costume_royalboutique_wings',category:'costume',name:'신화의 날개',icon:'🪽',rarity:'mythic',price:P(50),collection:'royalboutique',art:'wings',desc:'프로필과 게임 아바타에 표시되는 신화 날개'},
 {id:'frame_royalboutique_regalia',category:'frame',name:'THE ROYAL 문장',icon:'♛',rarity:'prestige',price:P(100),collection:'royalboutique',art:'regalia',desc:'왕실 정통 문장 · 장착 가능한 전설 프로필'},
 {id:'costume_royalboutique_phoenix',category:'costume',name:'불사조 황제관',icon:'🔥',rarity:'sovereign',price:P(300),collection:'royalboutique',art:'phoenix',stock:3,desc:'서버 단 3개 · 소유자 각인과 희소성 보장'},
 {id:'pet_royalboutique_immortal',category:'pet',name:'불멸의 황제 수호수',icon:'🦅',rarity:'sovereign',price:P(600),collection:'royalboutique',art:'immortal',desc:'최상위 영구 소장품 · 승률 및 경제 혜택 없음'},
 // Prestige exhibition objects. These are collectible luxury exhibits, NOT wearable avatars.
 // Never add display-only categories to user_loadout or any game perk.
 {id:'watch_royalboutique_aurora',category:'watch',name:'로열 오로라 워치',icon:'⌚',rarity:'prestige',price:P(1),collection:'royalboutique',art:'watch',displayOnly:true,desc:'핑크 골드와 자수정 다이얼의 하이엔드 타임피스'},
 {id:'watch_royalboutique_infinity',category:'watch',name:'인피니티 다이아 워치',icon:'⌚',rarity:'mythic',price:P(15),collection:'royalboutique',art:'watch-diamond',displayOnly:true,desc:'다이아몬드 베젤과 보랏빛 무브먼트의 왕실 시계'},
 {id:'art_royalboutique_lion',category:'art',name:'황금 사자 조각상',icon:'🦁',rarity:'prestige',price:P(5),collection:'royalboutique',art:'lion',displayOnly:true,desc:'황금 사자가 제국의 입구를 지키는 전용 예술 작품'},
 {id:'art_royalboutique_globe',category:'art',name:'다이아 황실 지구본',icon:'🌐',rarity:'mythic',price:P(55),collection:'royalboutique',art:'globe',displayOnly:true,desc:'자수정과 금속으로 만든 세계 유일의 황실 지구본'},
 {id:'art_royalboutique_throne',category:'art',name:'갓준자 황금 왕좌',icon:'♛',rarity:'sovereign',price:P(250),collection:'royalboutique',art:'throne',displayOnly:true,desc:'진열하는 순간 제국의 주인임을 증명하는 왕좌'},
 {id:'car_royalboutique_royal_gt',category:'car',name:'로얄 골드 GT',icon:'🏎️',rarity:'prestige',price:P(8),collection:'royalboutique',art:'car-gold',displayOnly:true,desc:'골드 메탈릭 바디와 맞춤 자수정 실내의 초호화 GT'},
 {id:'car_royalboutique_nebula',category:'car',name:'퍼플 네뷸라 슈퍼카',icon:'🏎️',rarity:'mythic',price:P(30),collection:'royalboutique',art:'car-purple',displayOnly:true,desc:'보라빛 카본 파이버와 황금 휠이 빛나는 한정 슈퍼카'},
 {id:'car_royalboutique_phantom',category:'car',name:'다이아 팬텀 리무진',icon:'🚘',rarity:'mythic',price:P(90),collection:'royalboutique',art:'limousine',displayOnly:true,desc:'별빛 실내와 다이아몬드 라디에이터의 황실 리무진'},
 {id:'car_royalboutique_emperor',category:'car',name:'황금 제왕 하이퍼카',icon:'🏎️',rarity:'sovereign',price:P(300),collection:'royalboutique',art:'car-hyper',displayOnly:true,stock:9,desc:'전 서버 9대 한정 · 황금 제왕의 하이퍼카'},
 {id:'car_royalboutique_eclipse',category:'car',name:'이클립스 원오브원',icon:'🏎️',rarity:'sovereign',price:P(1000),collection:'royalboutique',art:'car-eclipse',displayOnly:true,stock:1,desc:'전 서버 단 1대 · 유일 소유주의 이름을 새기는 컬렉터카'},
 {id:'yacht_royalboutique_midnight',category:'yacht',name:'미드나잇 로얄 요트',icon:'🛥️',rarity:'mythic',price:P(110),collection:'royalboutique',art:'yacht',displayOnly:true,desc:'달빛 위를 항해하는 프라이빗 럭셔리 요트'},
 {id:'yacht_royalboutique_sovereign',category:'yacht',name:'소버린 메가 요트',icon:'🛥️',rarity:'sovereign',price:P(480),collection:'royalboutique',art:'yacht-mega',displayOnly:true,desc:'전용 헬리패드와 황금 데크가 있는 최상급 메가 요트'},
 {id:'jet_royalboutique_noir',category:'jet',name:'로열 느와르 프라이빗 제트',icon:'✈️',rarity:'mythic',price:P(180),collection:'royalboutique',art:'jet',displayOnly:true,desc:'블랙 퍼플 외장과 골드 스트라이프의 황실 전용기'},
 {id:'jet_royalboutique_royal',category:'jet',name:'갓준자 시그니처 제트',icon:'✈️',rarity:'sovereign',price:P(700),collection:'royalboutique',art:'jet-gold',displayOnly:true,desc:'전용기 컬렉션의 정점 · 제국 문장을 새긴 한정 기체'},
 {id:'estate_royalboutique_penthouse',category:'estate',name:'스카이 로얄 펜트하우스',icon:'🏙️',rarity:'sovereign',price:P(700),collection:'royalboutique',art:'penthouse',displayOnly:true,desc:'도시 정상에 빛나는 스카이 프라이빗 레지던스'},
 {id:'estate_royalboutique_island',category:'estate',name:'골든 프라이빗 아일랜드',icon:'🏝️',rarity:'sovereign',price:P(10000),collection:'royalboutique',art:'island',displayOnly:true,stock:3,desc:'전 서버 3개 한정 · 독점 섬과 개인 항구'},
 {id:'vault_royalboutique_imperial',category:'vault',name:'황제의 금고',icon:'🔐',rarity:'sovereign',price:P(1000),collection:'royalboutique',art:'vault',displayOnly:true,desc:'수천 개의 보석이 내장된 황실 기념 금고 · 장식용'}
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
     // Luxury vehicles, jets, yachts and fine art are exhibition pieces, not avatar slots.
     if(!item.displayOnly)db.prepare('UPDATE user_loadout SET '+item.category+'=? WHERE user_id=?').run(item.id,uid);
     const inscription={ownerId:uid,ownerNickname:u.nickname,itemId:item.id,itemName:item.name,paid:String(price),purchasedAt:t};
     db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?)').run(purchaseKey(uid,item.id),JSON.stringify(inscription),t);
     db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)')
       .run(uid,exactWallet.mirror(-price),mirrored,String(-price),String(next),'royal_boutique_purchase','JUNJA ROYAL BOUTIQUE · '+item.name+' · 재화 영구 소멸',t);
     if(!owns.get(uid,item.id)||(!item.displayOnly&&db.prepare('SELECT '+item.category+' AS equipped FROM user_loadout WHERE user_id=?').get(uid)?.equipped!==item.id))throw new Error('구매 검증 실패');
     db.exec('COMMIT');
     return {item,inscription,balance:String(next)};
   }catch(e){try{db.exec('ROLLBACK')}catch{}throw e;}
 }

 const SHOWCASE_TIERS=Object.freeze([
  {name:'GOD COLLECTOR',min:10000n*GYEONG,icon:'♛'},
  {name:'THE ABSOLUTE',min:1000n*GYEONG,icon:'✦'},
  {name:'LEGEND',min:100n*GYEONG,icon:'✧'},
  {name:'EMPEROR',min:10n*GYEONG,icon:'💎'},
  {name:'ROYAL',min:GYEONG,icon:'👑'}
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
     nextTier:next?.name||null,nextAt:next?String(next.min):null,totalItems:ROYAL_ITEMS.length,
     showcase:chosen.map(id=>{const item=allowed.get(id);return {id:item.id,name:item.name,icon:item.icon,rarity:item.rarity,price:item.price,category:item.category,equipped:equipped[item.category]===id}}),
     equipped:ROYAL_ITEMS.filter(x=>!x.displayOnly&&equipped[x.category]===x.id&&allowed.has(x.id)).map(x=>({id:x.id,name:x.name,icon:x.icon}))
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

 // Read-only public museum: only owned royal collectibles, no wallet or private user data.
 function gallery(uid){
   const user=db.prepare('SELECT id,nickname,is_disabled FROM users WHERE id=?').get(uid);
   if(!user||user.is_disabled)return null;
   const load=db.prepare('SELECT title,frame,costume,pet FROM user_loadout WHERE user_id=?').get(uid)||{};
   const items=ROYAL_ITEMS.filter(item=>owns.get(uid,item.id)).map(item=>{
     const info=decorate(item,uid);
     const note=info.inscription;
     return {
       id:item.id,name:item.name,category:item.category,rarity:item.rarity,icon:item.icon,
       price:item.price,desc:item.desc,owned:true,equipped:load[item.category]===item.id,
       stock:item.stock??null,
       inscription:note?{itemId:item.id,itemName:item.name,ownerNickname:user.nickname,
         purchasedAt:note.purchasedAt,paid:note.paid}:null
     };
   });
   return {nickname:user.nickname,collector:collector(uid),items,public:true};
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
 return {buy,catalog,collector,gallery,updateShowcase,decorate,dashboard};
}
module.exports={ROYAL_ITEMS,createRoyalEconomy};
