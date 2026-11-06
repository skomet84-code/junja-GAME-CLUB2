'use strict';
// Royal boutique cosmetics use the existing inventory/loadout tables and exact-wallet
// ledger so all ownership and economic events survive the SQLite -> Postgres sync.
const W=10n**4n,JO=10n**12n,GYEONG=10n**16n;
const P=n=>String(BigInt(n)*GYEONG);
// V12: Retired fantasy items are not interchangeable with new jewellery purchases.
const RETIRED_ROYAL_IDS=Object.freeze(["title_royalboutique_gold","title_royalboutique_diamond","frame_royalboutique_royal","costume_royalboutique_crown","pet_royalboutique_dragon","title_royalboutique_entry","frame_royalboutique_aura","costume_royalboutique_wings","frame_royalboutique_regalia","costume_royalboutique_phoenix","pet_royalboutique_immortal"]);
const ROYAL_ITEMS=Object.freeze([
 {id:'jewel_royalboutique_platinum_drop',category:'jewel',name:"플래티넘 드롭 다이아 네크리스",icon:'💎',rarity:'prestige',price:P(1),collection:'royalboutique',art:'gem',visualSlot:0,displayOnly:true,stock:3,desc:"물방울 다이아몬드 펜던트가 돋보이는 플래티넘 하이주얼리"},
 {id:'jewel_royalboutique_emerald_drops',category:'jewel',name:"에메랄드 드롭 이어링",icon:'💎',rarity:'prestige',price:P(3),collection:'royalboutique',art:'gem',visualSlot:1,displayOnly:true,stock:1,desc:"선명한 에메랄드와 다이아몬드가 어우러진 드롭 귀걸이"},
 {id:'jewel_royalboutique_diamond_flower',category:'jewel',name:"플로럴 다이아 주얼리",icon:'💎',rarity:'mythic',price:P(6),collection:'royalboutique',art:'gem',visualSlot:2,displayOnly:true,stock:1,desc:"꽃잎처럼 펼쳐진 화이트 다이아몬드 하이주얼리"},
 {id:'jewel_royalboutique_pear_solitaire',category:'jewel',name:"페어컷 다이아 솔리테어",icon:'💎',rarity:'prestige',price:P(10),collection:'royalboutique',art:'gem',visualSlot:3,displayOnly:true,stock:1,desc:"투명하게 빛나는 물방울형 다이아몬드 메인 스톤"},
 {id:'jewel_royalboutique_emerald_cocktail',category:'jewel',name:"에메랄드 칵테일 링",icon:'💎',rarity:'mythic',price:P(15),collection:'royalboutique',art:'gem',visualSlot:4,displayOnly:true,stock:3,desc:"깊은 초록빛 에메랄드와 다이아몬드 세팅 반지"},
 {id:'jewel_royalboutique_diamond_cluster',category:'jewel',name:"다이아몬드 클러스터 링",icon:'💎',rarity:'mythic',price:P(20),collection:'royalboutique',art:'gem',visualSlot:5,displayOnly:true,stock:2,desc:"다이아몬드 군집 세팅과 정교한 플래티넘 밴드"},
 {id:'jewel_royalboutique_imperial_tiara',category:'jewel',name:"임페리얼 다이아 티아라",icon:'💎',rarity:'mythic',price:P(30),collection:'royalboutique',art:'gem',visualSlot:6,displayOnly:true,stock:3,desc:"대형 다이아몬드로 장식한 왕실 티아라"},
 {id:'jewel_royalboutique_emerald_suite',category:'jewel',name:"에메랄드 하이주얼리 세트",icon:'💎',rarity:'mythic',price:P(50),collection:'royalboutique',art:'gem',visualSlot:7,displayOnly:true,stock:3,desc:"에메랄드와 다이아몬드가 조화를 이루는 프라이빗 세트"},
 {id:'jewel_royalboutique_diamond_choker',category:'jewel',name:"그랑 다이아 드롭 네크리스",icon:'💎',rarity:'sovereign',price:P(100),collection:'royalboutique',art:'gem',visualSlot:0,displayOnly:true,stock:3,desc:"화이트 다이아몬드가 겹겹이 빛나는 하이주얼리 네크리스"},
 {id:'jewel_royalboutique_royal_tiara',category:'jewel',name:"로얄 다이아 티아라 리미티드",icon:'💎',rarity:'sovereign',price:P(300),collection:'royalboutique',art:'gem',visualSlot:6,displayOnly:true,stock:3,desc:"다이아몬드 티아라 모티브 3점 한정 가상 명품"},
 {id:'jewel_royalboutique_masterpiece',category:'jewel',name:"마스터피스 페어컷 다이아",icon:'💎',rarity:'sovereign',price:P(600),collection:'royalboutique',art:'gem',visualSlot:3,displayOnly:true,stock:1,desc:"대형 페어컷 다이아몬드의 존재감을 담은 가상 명품"},
 // Prestige exhibition objects. These are collectible luxury exhibits, NOT wearable avatars.
 // Never add display-only categories to user_loadout or any game perk.
 {id:'watch_royalboutique_aurora',category:'watch',name:'로열 오로라 워치',icon:'⌚',rarity:'prestige',price:P(1),collection:'royalboutique',art:'watch',displayOnly:true,photoFile:"Rolex Datejust ref. 16013, seconda metà anni '70-primi '80.jpg",photoBy:"EMore98",photoLicense:"CC BY-SA 4.0",stock:3,desc:'핑크 골드와 자수정 다이얼의 하이엔드 타임피스'},
 {id:'watch_royalboutique_infinity',category:'watch',name:'인피니티 다이아 워치',icon:'⌚',rarity:'mythic',price:P(15),collection:'royalboutique',art:'watch-diamond',displayOnly:true,photoFile:"Rolex Datejust con quadrante Wimbledon.jpg",photoBy:"EMore98",photoLicense:"CC BY-SA 4.0",stock:2,desc:'다이아몬드 베젤과 보랏빛 무브먼트의 왕실 시계'},
 {id:'art_royalboutique_lion',category:'art',name:'황금 사자 조각상',icon:'🦁',rarity:'prestige',price:P(5),collection:'royalboutique',art:'lion',displayOnly:true,stock:2,desc:'황금 사자가 제국의 입구를 지키는 전용 예술 작품'},
 {id:'art_royalboutique_globe',category:'art',name:'다이아 황실 지구본',icon:'🌐',rarity:'mythic',price:P(55),collection:'royalboutique',art:'globe',displayOnly:true,stock:2,desc:'자수정과 금속으로 만든 세계 유일의 황실 지구본'},
 {id:'art_royalboutique_throne',category:'art',name:'갓준자 황금 왕좌',icon:'♛',rarity:'sovereign',price:P(250),collection:'royalboutique',art:'throne',displayOnly:true,stock:2,desc:'진열하는 순간 제국의 주인임을 증명하는 왕좌'},
 {id:'car_royalboutique_royal_gt',category:'car',name:'로얄 골드 GT',icon:'🏎️',rarity:'prestige',price:P(8),collection:'royalboutique',art:'car-gold',displayOnly:true,stock:2,desc:'골드 메탈릭 바디와 맞춤 자수정 실내의 초호화 GT'},
 {id:'car_royalboutique_nebula',category:'car',name:'퍼플 네뷸라 슈퍼카',icon:'🏎️',rarity:'mythic',price:P(30),collection:'royalboutique',art:'car-purple',displayOnly:true,stock:2,desc:'보라빛 카본 파이버와 황금 휠이 빛나는 한정 슈퍼카'},
 {id:'car_royalboutique_phantom',category:'car',name:'다이아 팬텀 리무진',icon:'🚘',rarity:'mythic',price:P(90),collection:'royalboutique',art:'limousine',displayOnly:true,stock:1,desc:'별빛 실내와 다이아몬드 라디에이터의 황실 리무진'},
 {id:'car_royalboutique_emperor',category:'car',name:'황금 제왕 하이퍼카',icon:'🏎️',rarity:'sovereign',price:P(300),collection:'royalboutique',art:'car-hyper',displayOnly:true,stock:1,desc:'전 서버 9대 한정 · 황금 제왕의 하이퍼카'},
 {id:'car_royalboutique_eclipse',category:'car',name:'이클립스 원오브원',icon:'🏎️',rarity:'sovereign',price:P(1000),collection:'royalboutique',art:'car-eclipse',displayOnly:true,stock:1,desc:'전 서버 단 1대 · 유일 소유주의 이름을 새기는 컬렉터카'},
 {id:'yacht_royalboutique_midnight',category:'yacht',name:'미드나잇 로얄 요트',icon:'🛥️',rarity:'mythic',price:P(110),collection:'royalboutique',art:'yacht',displayOnly:true,photoFile:"Yacht Eclipse.jpg",photoBy:"Frankkaribik",photoLicense:"CC BY-SA 4.0",stock:3,desc:'달빛 위를 항해하는 프라이빗 럭셔리 요트'},
 {id:'yacht_royalboutique_sovereign',category:'yacht',name:'소버린 메가 요트',icon:'🛥️',rarity:'sovereign',price:P(480),collection:'royalboutique',art:'yacht-mega',displayOnly:true,photoFile:"Megayacht Eclipse.jpg",photoBy:"Otto Domes",photoLicense:"CC BY-SA 4.0",stock:3,desc:'전용 헬리패드와 황금 데크가 있는 최상급 메가 요트'},
 {id:'jet_royalboutique_noir',category:'jet',name:'로열 느와르 프라이빗 제트',icon:'✈️',rarity:'mythic',price:P(180),collection:'royalboutique',art:'jet',displayOnly:true,photoFile:"Gulfstream G650.JPG",photoBy:"TeWeBs",photoLicense:"CC BY-SA 4.0",stock:1,desc:'블랙 퍼플 외장과 골드 스트라이프의 황실 전용기'},
 {id:'jet_royalboutique_royal',category:'jet',name:'갓준자 시그니처 제트',icon:'✈️',rarity:'sovereign',price:P(700),collection:'royalboutique',art:'jet-gold',displayOnly:true,photoFile:"EC-MLR Gulfstream G650 SCQ 02.jpg",photoBy:"Bene Riobó",photoLicense:"CC BY-SA 4.0",stock:1,desc:'전용기 컬렉션의 정점 · 제국 문장을 새긴 한정 기체'},
 {id:'estate_royalboutique_penthouse',category:'estate',name:'스카이 로얄 펜트하우스',icon:'🏙️',rarity:'sovereign',price:P(700),collection:'royalboutique',art:'penthouse',displayOnly:true,stock:1,desc:'도시 정상에 빛나는 스카이 프라이빗 레지던스'},
 {id:'estate_royalboutique_island',category:'estate',name:'골든 프라이빗 아일랜드',icon:'🏝️',rarity:'sovereign',price:P(10000),collection:'royalboutique',art:'island',displayOnly:true,stock:3,desc:'전 서버 3개 한정 · 독점 섬과 개인 항구'},
 {id:'vault_royalboutique_imperial',category:'vault',name:'황제의 금고',icon:'🔐',rarity:'sovereign',price:P(1000),collection:'royalboutique',art:'vault',displayOnly:true,stock:3,desc:'수천 개의 보석이 내장된 황실 기념 금고 · 장식용'},
 {id:'car_royalboutique_rr_ghost',category:'car',name:'롤스로이스 고스트 로얄 블랙',brand:'rolls-royce',model:'Ghost',icon:'🚘',rarity:'prestige',price:P(1),collection:'royalboutique',art:'limousine',displayOnly:true,photoFile:'RR Ghost.jpg',photoBy:'MrWalkr',photoLicense:'CC BY-SA 4.0',stock:3,desc:'롤스로이스 고스트 실차를 모티브로 만든 준자랜드 블랙 로얄 컬렉션'},
 {id:'car_royalboutique_rr_phantom',category:'car',name:'롤스로이스 팬텀 임페리얼',brand:'rolls-royce',model:'Phantom VIII',icon:'🚘',rarity:'mythic',price:P(10),collection:'royalboutique',art:'limousine',displayOnly:true,photoFile:'Rolls-Royce Phantom VIII Black (36).jpg',photoBy:'Damian B Oh',photoLicense:'CC BY-SA 4.0',stock:3,desc:'상징적인 판테온 그릴, 밤의 궁전과 어울리는 황실 세단'},
 {id:'car_royalboutique_rr_cullinan',category:'car',name:'롤스로이스 컬리넌 퍼플 에디션',brand:'rolls-royce',model:'Cullinan',icon:'🚘',rarity:'mythic',price:P(30),collection:'royalboutique',art:'limousine',displayOnly:true,photoFile:'Rolls-Royce Cullinan (1).jpg',photoBy:'Mathious Ier',photoLicense:'CC0 1.0',stock:2,desc:'컬리넌을 모티브로 만든 준자랜드 자수정 황실 SUV 콘셉트'},
 {id:'car_royalboutique_rr_one',category:'car',name:'롤스로이스 원오브원 준자 에디션',brand:'rolls-royce',model:'Phantom VIII concept',icon:'🚘',rarity:'sovereign',price:P(300),collection:'royalboutique',art:'limousine',displayOnly:true,photoFile:'Rolls-Royce Phantom VIII Black (45).jpg',photoBy:'Damian B Oh',photoLicense:'CC BY-SA 4.0',stock:1,desc:'서버 3대 한정 · 팬텀 실차 이미지 기반의 준자랜드 가상 시그니처'},
 {id:'car_royalboutique_bentley_gt',category:'car',name:'벤틀리 컨티넨탈 GT 로얄',brand:'bentley',model:'Continental GT',icon:'🚘',rarity:'prestige',price:P(3),collection:'royalboutique',art:'car-gold',displayOnly:true,photoFile:'Bentley Continental GT (45672160794).jpg',photoBy:'Guillaume Vachey',photoLicense:'CC0 1.0',stock:2,desc:'플라잉 B의 품격과 그랜드 투어링의 역동성을 담은 황실 컬렉션'},
 {id:'car_royalboutique_bentley_spur',category:'car',name:'벤틀리 플라잉스퍼 시그니처',brand:'bentley',model:'Flying Spur',icon:'🚘',rarity:'mythic',price:P(15),collection:'royalboutique',art:'car-gold',displayOnly:true,photoFile:'Bentley Flying Spur (1).jpg',photoBy:'Mathious Ier',photoLicense:'CC0 1.0',stock:1,desc:'정숙한 럭셔리 세단의 디테일을 황금빛 진열장에 담다'},
 {id:'car_royalboutique_bentley_bentayga',category:'car',name:'벤틀리 벤테이가 블랙 퍼플',brand:'bentley',model:'Bentayga',icon:'🚘',rarity:'mythic',price:P(40),collection:'royalboutique',art:'car-gold',displayOnly:true,photoFile:'Bentley bentayga.jpg',photoBy:'Iorisrandombses5001',photoLicense:'CC0 1.0',stock:2,desc:'벤테이가 실차 이미지를 기반으로 재해석한 황실 SUV 컬렉션'},
 {id:'car_royalboutique_bentley_emperor',category:'car',name:'벤틀리 블랙라벨 황제 에디션',brand:'bentley',model:'Continental GT concept',icon:'🚘',rarity:'sovereign',price:P(500),collection:'royalboutique',art:'car-gold',displayOnly:true,photoFile:'Bentley Conti GT Image.jpg',photoBy:'MrWalkr',photoLicense:'CC BY-SA 4.0',stock:2,desc:'서버 5대 한정 · 준자랜드 전용 가상 블랙라벨 황제 에디션'},
 {id:'car_royalboutique_aston_db12',category:'car',name:'애스턴마틴 DB12 로얄 퍼플',brand:'aston-martin',model:'DB12',icon:'🚘',rarity:'prestige',price:P(5),collection:'royalboutique',art:'car-purple',displayOnly:true,photoFile:'2024 Aston Martin DB12.jpg',photoBy:'Calreyn88',photoLicense:'CC0 1.0',stock:3,desc:'유려한 그랜드 투어러의 우아함을 담은 가상 퍼플 사양'},
 {id:'car_royalboutique_aston_vantage',category:'car',name:'애스턴마틴 밴티지 골드라인',brand:'aston-martin',model:'Vantage V8',icon:'🚘',rarity:'mythic',price:P(12),collection:'royalboutique',art:'car-purple',displayOnly:true,photoFile:'2024 Aston Martin V8 Vantage.jpg',photoBy:'MrWalkr',photoLicense:'CC BY-SA 4.0',stock:1,desc:'섬세한 곡선과 스포티한 차체의 프리미엄 스포츠카'},
 {id:'car_royalboutique_aston_dbs',category:'car',name:'애스턴마틴 DBS 시그니처',brand:'aston-martin',model:'DBS Superleggera',icon:'🚘',rarity:'mythic',price:P(25),collection:'royalboutique',art:'car-purple',displayOnly:true,photoFile:'Aston dbs.jpg',photoBy:'Saschaporsche',photoLicense:'CC BY-SA 4.0',stock:1,desc:'DBS 슈퍼레제라의 존재감을 기념하는 황실 시그니처'},
 // V11: virtual collector editions with permanent distinct IDs. No gameplay advantage.
 {id:'watch_royalboutique_patek_grand',category:'watch',name:'파텍필립 그랜드마스터 시그니처',icon:'⌚',rarity:'mythic',price:P(15),collection:'royalboutique',art:'watch',displayOnly:true,stock:1,desc:'파텍필립 그랜드 컴플리케이션을 모티브로 한 가상 한정 워치'},
 {id:'watch_royalboutique_richard_mille',category:'watch',name:'리차드 밀 투르비용 로얄',icon:'⌚',rarity:'sovereign',price:P(35),collection:'royalboutique',art:'watch-diamond',displayOnly:true,stock:1,desc:'리차드 밀 스켈레톤 무브먼트를 모티브로 한 가상 황실 타임피스'},
 {id:'watch_royalboutique_audemars',category:'watch',name:'오데마 피게 로열 오크 블루',icon:'⌚',rarity:'prestige',price:P(8),collection:'royalboutique',art:'watch',displayOnly:true,stock:2,desc:'로열 오크 옥타곤 디자인을 재해석한 가상 컬렉션'},
 {id:'watch_royalboutique_vacheron',category:'watch',name:'바쉐론 콘스탄틴 헤리티지',icon:'⌚',rarity:'mythic',price:P(28),collection:'royalboutique',art:'watch-diamond',displayOnly:true,stock:3,desc:'바쉐론 콘스탄틴 전통 기계식 시계를 모티브로 한 가상 에디션'},
 {id:'watch_royalboutique_jacob',category:'watch',name:'제이콥앤코 아스트로노미아',icon:'⌚',rarity:'sovereign',price:P(180),collection:'royalboutique',art:'watch-diamond',displayOnly:true,stock:2,desc:'우주 궤도 장식의 초희귀 왕실 보석 시계 · 7점 한정'},
 {id:'car_royalboutique_ferrari_sf90',category:'car',name:'페라리 SF90 스트라달레 로얄',icon:'🏎️',rarity:'prestige',price:P(3),collection:'royalboutique',art:'car-hyper',displayOnly:true,stock:1,desc:'페라리 SF90의 붉은 차체를 모티브로 한 가상 슈퍼카 전시품'},
 {id:'car_royalboutique_lamborghini_svj',category:'car',name:'람보르기니 아벤타도르 SVJ 골드',icon:'🏎️',rarity:'mythic',price:P(30),collection:'royalboutique',art:'car-gold',displayOnly:true,stock:3,desc:'SVJ의 과감한 에어로 디자인을 모티브로 한 가상 황금 하이퍼카'},
 {id:'car_royalboutique_mclaren_765lt',category:'car',name:'맥라렌 765LT 오렌지',icon:'🏎️',rarity:'mythic',price:P(60),collection:'royalboutique',art:'car-purple',displayOnly:true,stock:2,desc:'765LT의 강렬한 실루엣을 담은 가상 프라이빗 모터 컬렉션'},
 {id:'car_royalboutique_bugatti_chiron',category:'car',name:'부가티 시론 블랙 다이아',icon:'🏎️',rarity:'sovereign',price:P(1000),collection:'royalboutique',art:'car-eclipse',displayOnly:true,stock:3,desc:'블랙 다이아 감성을 표현한 가상 황제 하이퍼카 · 서버 5대 한정'},
 {id:'car_royalboutique_aston_valhalla',category:'car',name:'애스턴마틴 발할라 갓준자 에디션',brand:'aston-martin',model:'Valhalla',icon:'🚘',rarity:'sovereign',price:P(700),collection:'royalboutique',art:'car-purple',displayOnly:true,photoFile:'2026 Aston Martin Valhalla.jpg',photoBy:'MrWalkr',photoLicense:'CC BY-SA 4.0',stock:3,desc:'서버 3대 한정 · 발할라 실차 사진을 사용하는 준자랜드 가상 하이퍼카'}
 // V14: six cinematic handbag collector editions; immutable IDs and limited inventory.
 {id:'bag_royalboutique_hermes_birkin',category:'bag',brand:'hermes',model:'Birkin 30',name:'에르메스 버킨 오렌지 로얄',icon:'👜',rarity:'sovereign',price:P(300),collection:'royalboutique',art:'bag-birkin',displayOnly:true,stock:1,desc:'버킨 30의 오렌지 레더와 골드 하드웨어를 재해석한 준자랜드 가상 한정 컬렉션'},
 {id:'bag_royalboutique_hermes_kelly',category:'bag',brand:'hermes',model:'Kelly 28',name:'에르메스 켈리 에토프 헤리티지',icon:'👜',rarity:'sovereign',price:P(150),collection:'royalboutique',art:'bag-kelly',displayOnly:true,stock:1,desc:'에토프 톤의 세련된 실루엣과 골드 클로저가 돋보이는 가상 왕실 소장품'},
 {id:'bag_royalboutique_hermes_constance',category:'bag',brand:'hermes',model:'Constance',name:'에르메스 콘스탄스 H 느와르',icon:'👜',rarity:'mythic',price:P(50),collection:'royalboutique',art:'bag-constance',displayOnly:true,stock:2,desc:'블랙 레더와 시그니처 H형 골드 클로저를 모티브로 한 가상 콜렉터백'},
 {id:'bag_royalboutique_chanel_classic',category:'bag',brand:'chanel',model:'Classic Flap',name:'샤넬 클래식 플랩 블랙 골드',icon:'👜',rarity:'mythic',price:P(30),collection:'royalboutique',art:'bag-classic',displayOnly:true,stock:2,desc:'블랙 퀼팅과 골드 체인 디테일을 시네마틱하게 재해석한 가상 콜렉터백'},
 {id:'bag_royalboutique_chanel_255',category:'bag',brand:'chanel',model:'2.55',name:'샤넬 2.55 버건디 레거시',icon:'👜',rarity:'mythic',price:P(20),collection:'royalboutique',art:'bag-255',displayOnly:true,stock:2,desc:'버건디 레더와 빈티지 골드 체인에서 착안한 로열 헤리티지 컬렉션'},
 {id:'bag_royalboutique_chanel_boy',category:'bag',brand:'chanel',model:'Boy Bag',name:'샤넬 보이백 블랙 엠퍼러',icon:'👜',rarity:'prestige',price:P(10),collection:'royalboutique',art:'bag-boy',displayOnly:true,stock:2,desc:'볼드한 골드 체인과 구조적 퀼팅을 가진 가상 프리미엄 리미티드 백'},
]);
function retireFantasyRoyalInventory(db,now){
 const key='royal:retired-fantasy-items-v12';
 if(db.prepare('SELECT 1 FROM game_state WHERE key=?').get(key))return;
 const ids=RETIRED_ROYAL_IDS,q=ids.map(()=>'?').join(',');
 db.exec('BEGIN IMMEDIATE');
 try{
  const rows=db.prepare('SELECT user_id,item_id FROM user_inventory WHERE item_id IN ('+q+')').all(...ids);
  db.prepare('DELETE FROM user_inventory WHERE item_id IN ('+q+')').run(...ids);
  for(const field of ['title','frame','costume','pet'])
   db.prepare('UPDATE user_loadout SET '+field+'=NULL WHERE '+field+' IN ('+q+')').run(...ids);
  for(const row of rows)db.prepare('DELETE FROM game_state WHERE key=?').run('royal:inscription:'+row.user_id+':'+row.item_id);
  const retired=new Set(ids);
  for(const row of db.prepare("SELECT key,value FROM game_state WHERE key LIKE 'royal:showcase:%'").all()){
   let selected;try{selected=JSON.parse(row.value)}catch{continue}
   if(!Array.isArray(selected))continue;
   const next=selected.filter(id=>!retired.has(id));
   if(next.length!==selected.length)db.prepare('UPDATE game_state SET value=?,updated_at=? WHERE key=?').run(JSON.stringify(next),now(),row.key);
  }
  db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?)')
   .run(key,JSON.stringify({removed:rows.length,affectedUsers:new Set(rows.map(x=>x.user_id)).size,retiredIds:ids,refund:false,ledgerPreserved:true}),now());
  db.exec('COMMIT');
  if(rows.length)console.log('[ROYAL] Retired '+rows.length+' mismatched fantasy holdings');
 }catch(err){db.exec('ROLLBACK');throw err}
}
function createRoyalEconomy({db,exactWallet,now,getAssets}){
 retireFantasyRoyalInventory(db,now);
 let market=null,bank=null;
 const setMarket=instance=>{market=instance};
 const setBank=instance=>{bank=instance};
 const itemMap=new Map(ROYAL_ITEMS.map(item=>[item.id,item]));
 const readExact=(v)=>BigInt(String(v??0));
 const inventoryCount=db.prepare('SELECT COUNT(*) AS n FROM user_inventory WHERE item_id=?');
 const ownerNames=db.prepare('SELECT u.nickname FROM user_inventory i JOIN users u ON u.id=i.user_id WHERE i.item_id=? AND COALESCE(u.is_disabled,0)=0 ORDER BY i.purchased_at ASC');
 const owns=db.prepare('SELECT purchased_at FROM user_inventory WHERE user_id=? AND item_id=?');
 const getInscription=db.prepare('SELECT value FROM game_state WHERE key=?');
 const purchaseKey=(uid,id)=>'royal:inscription:'+uid+':'+id;
 const kstDay=(at)=>new Date(at+9*3600000).toISOString().slice(0,10);
 // A personal collection number is the owner's acquisition order, NEVER an
 // official manufacturer serial or a server-wide limited-edition number.
 const inventoryOrder=db.prepare('SELECT item_id,purchased_at FROM user_inventory WHERE user_id=? ORDER BY purchased_at ASC,item_id ASC');
 const ownerRecords=uid=>new Map(inventoryOrder.all(uid).filter(row=>itemMap.has(row.item_id)).map((row,i)=>[
   row.item_id,{collectionNo:i+1,acquiredAt:row.purchased_at||null}
 ]));
 const ROOM_DEFS=Object.freeze([
  {id:'motors',name:'THE MOTOR HALL',label:'로얄 모터스',categories:['car']},
  {id:'fleet',name:'THE PRIVATE FLEET',label:'요트 · 전용기',categories:['jet','yacht']},
  {id:'jewels',name:'THE JEWEL VAULT',label:'시계 · 하이주얼리',categories:['watch','jewel']},
  {id:'couture',name:'THE COUTURE SALON',label:'헤리티지 명품백',categories:['bag']},
  {id:'relics',name:'THE IMPERIAL ARTS',label:'황실 예술품',categories:['art','vault','estate']}
 ]);
 function decorate(item,uid){
   if(item.collection!=='royalboutique')return {};
   const sold=Number(inventoryCount.get(item.id)?.n||0);
   const owned=owns.get(uid,item.id);
   let inscription=null;
   if(owned){const row=getInscription.get(purchaseKey(uid,item.id));try{inscription=row?JSON.parse(row.value):null}catch{}}
   return {stock:item.stock??null,remaining:item.stock==null?null:Math.max(0,item.stock-sold),soldOut:item.stock!=null&&sold>=item.stock&&!owned,owners:ownerNames.all(item.id).map(x=>x.nickname),soldCount:sold,inscription};
 }
 function buy(uid,id,options={}){
   const item=typeof id==='string'?itemMap.get(id):itemMap.get(id?.id);
   if(!item)throw new Error('로얄 명품관 상품을 찾을 수 없습니다.');
   db.exec('BEGIN IMMEDIATE');
   try{
     const u=db.prepare('SELECT id,nickname,is_disabled,balance,balance_exact,balance_base FROM users WHERE id=?').get(uid);
     if(!u||u.is_disabled)throw new Error('계정을 확인할 수 없습니다.');
     if(owns.get(uid,item.id))throw new Error('이미 영구 소장 중인 상품입니다. 추가 결제되지 않았습니다.');
     if(item.stock!=null&&Number(inventoryCount.get(item.id)?.n||0)>=item.stock)throw new Error('한정판 재고가 모두 소진됐습니다.');
     const price=readExact(item.price),walletBalance=exactWallet.read(u);
     let loanAmount='0';
     if(walletBalance<price){
      if(options.loanPurchase!==true)throw new Error('게임머니 잔액이 부족합니다. 대출구매를 선택하면 한도 내에서 이용할 수 있어.');
      if(!bank)throw new Error('은행 대출구매를 이용할 수 없습니다.');
      loanAmount=bank.borrowForPurchase(uid,String(price),item.name).loanAmount;
     }
     const balance=walletBalance+BigInt(loanAmount);
     if(balance<price)throw new Error('대출금으로도 구매가격을 충족할 수 없어.');
     const next=balance-price,t=now(),mirrored=exactWallet.mirror(next);
     db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?').run(mirrored,String(next),String(mirrored),uid);
     db.prepare('INSERT INTO user_inventory(user_id,item_id,purchase_price,purchased_at) VALUES(?,?,?,?)').run(uid,item.id,exactWallet.mirror(price),t);
     db.prepare('INSERT INTO user_loadout(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING').run(uid);
     // Category is trusted server-side catalog data, never a client-supplied column.
     // Luxury vehicles, jets, yachts and fine art are exhibition pieces, not avatar slots.
     if(!item.displayOnly)db.prepare('UPDATE user_loadout SET '+item.category+'=? WHERE user_id=?').run(item.id,uid);
     const inscription={ownerId:uid,ownerNickname:u.nickname,itemId:item.id,itemName:item.name,paid:String(price),purchasedAt:t};
     db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?)').run(purchaseKey(uid,item.id),JSON.stringify(inscription),t);
     if(market)market.issueCertificate(uid,item.id);
     db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)')
       .run(uid,exactWallet.mirror(-price),mirrored,String(-price),String(next),'royal_boutique_purchase','JUNJA ROYAL BOUTIQUE · '+item.name+' · 재화 영구 소멸',t);
     if(!owns.get(uid,item.id)||(!item.displayOnly&&db.prepare('SELECT '+item.category+' AS equipped FROM user_loadout WHERE user_id=?').get(uid)?.equipped!==item.id))throw new Error('구매 검증 실패');
     db.exec('COMMIT');
     return {item,inscription,balance:String(next),loanAmount};
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
     ownedCatalogValue:String(owned.reduce((total,item)=>total+readExact(item.price),0n)),
     rooms:ROOM_DEFS.map(room=>({
       id:room.id,name:room.name,label:room.label,
       owned:owned.filter(item=>room.categories.includes(item.category)).length,
       total:ROYAL_ITEMS.filter(item=>room.categories.includes(item.category)).length
     })),
     brandSets:['rolls-royce','bentley','aston-martin','hermes','chanel'].map(brand=>({
       brand,total:ROYAL_ITEMS.filter(item=>item.brand===brand).length,
       owned:owned.filter(item=>item.brand===brand).length
     })),
     nextTier:next?.name||null,nextAt:next?String(next.min):null,totalItems:ROYAL_ITEMS.length,
     showcase:chosen.map(id=>{const item=allowed.get(id);return {id:item.id,name:item.name,icon:item.icon,art:item.art,brand:item.brand||null,model:item.model||null,photoFile:item.photoFile||null,photoBy:item.photoBy||null,photoLicense:item.photoLicense||null,visualSlot:item.visualSlot??null,displayOnly:!!item.displayOnly,rarity:item.rarity,price:item.price,category:item.category,equipped:!item.displayOnly&&equipped[item.category]===id}}),
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
   const retiredNames=new Set(['황금빛 귀족','다이아몬드 황제','로얄 프로필 액자','순금 황제관','황금 신룡','황실의 귀환','황제의 오라','신화의 날개','THE ROYAL 문장','불사조 황제관','불멸의 황제 수호수']);
   const recent=db.prepare("SELECT u.nickname,l.memo,l.created_at AS purchasedAt FROM ledger l JOIN users u ON u.id=l.user_id WHERE l.type='royal_boutique_purchase' ORDER BY l.id DESC LIMIT 80").all()
    .map(r=>({nickname:r.nickname,itemName:String(r.memo||'').split(' · ')[1]||'로얄 명품',purchasedAt:r.purchasedAt}))
    .filter(r=>!retiredNames.has(r.itemName)).slice(0,8);
   const records=ownerRecords(uid);
   return {nickname:db.prepare('SELECT nickname FROM users WHERE id=?').get(uid)?.nickname||'',items:ROYAL_ITEMS.map(item=>({...item,owned:!!owns.get(uid,item.id),equipped:!item.displayOnly&&load[item.category]===item.id,...(records.get(item.id)||{}),...decorate(item,uid),certificate:market&&owns.get(uid,item.id)?market.certificate(uid,item.id):null,listed:market&&owns.get(uid,item.id)?!!market.activeFor(uid,item.id):false})),collector:collector(uid),ranking:rank(),recent,financing:bank?(()=>{const b=bank.status(uid);return {available:b.available,canBorrow:b.canBorrow,minLoan:b.minLoan,loanLimit:b.loanLimit,outstanding:b.outstanding,wallet:String(b.wallet),dailyInterestPct:b.dailyInterestPct}})():null,serverNow:now()};
 }

 // Read-only public museum: only owned royal collectibles, no wallet or private user data.
 function gallery(uid){
   const user=db.prepare('SELECT id,nickname,is_disabled FROM users WHERE id=?').get(uid);
   if(!user||user.is_disabled)return null;
   const load=db.prepare('SELECT title,frame,costume,pet FROM user_loadout WHERE user_id=?').get(uid)||{};
   const records=ownerRecords(uid);
   const items=ROYAL_ITEMS.filter(item=>owns.get(uid,item.id)).map(item=>{
     const info=decorate(item,uid);
     const note=info.inscription;
     const certificate=records.get(item.id)||{};
     return {
       id:item.id,name:item.name,category:item.category,rarity:item.rarity,icon:item.icon,art:item.art,brand:item.brand||null,model:item.model||null,photoFile:item.photoFile||null,photoBy:item.photoBy||null,photoLicense:item.photoLicense||null,visualSlot:item.visualSlot??null,displayOnly:!!item.displayOnly,
       price:item.price,desc:item.desc,owned:true,equipped:!item.displayOnly&&load[item.category]===item.id,
       stock:item.stock??null,collectionNo:certificate.collectionNo||null,acquiredAt:certificate.acquiredAt||null,
       inscription:note?{itemId:item.id,itemName:item.name,ownerNickname:user.nickname,
         purchasedAt:note.purchasedAt,paid:note.paid}:null,
        certificate:market?market.certificate(uid,item.id):null,
        listed:market?!!market.activeFor(uid,item.id):false
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
 function inventoryAudit(){
   // Read-only operator reconciliation. Never mutate inventories or certificates
   // while inspecting production. Missing pointers are normal for legacy inventory.
   const holdings=db.prepare('SELECT user_id,item_id FROM user_inventory').all().filter(x=>itemMap.has(x.item_id));
   const sold=new Map(),issues=[],holder=new Map();
   for(const record of holdings){
     sold.set(record.item_id,(sold.get(record.item_id)||0)+1);
     const key='royal:certificate:holder:'+record.user_id+':'+record.item_id;
     const row=db.prepare('SELECT value FROM game_state WHERE key=?').get(key);
     if(!row)continue;
     let serial;try{serial=JSON.parse(row.value)}catch{serial=null}
     if(typeof serial!=='string'||!/^JLC-[0-9A-F]{16}$/.test(serial)){
       issues.push({type:'INVALID_POINTER',itemId:record.item_id,userId:record.user_id});continue;
     }
     if(holder.has(serial))issues.push({type:'DUPLICATE_SERIAL',itemId:record.item_id,userId:record.user_id});
     holder.set(serial,record);
     const certRow=db.prepare('SELECT value FROM game_state WHERE key=?').get('royal:certificate:serial:'+serial);
     let cert;try{cert=certRow?JSON.parse(certRow.value):null}catch{cert=null}
     if(!cert||cert.itemId!==record.item_id||Number(cert.currentOwnerId)!==Number(record.user_id)||cert.status!=='ACTIVE'){
       issues.push({type:'CERTIFICATE_MISMATCH',itemId:record.item_id,userId:record.user_id});
     }
   }
   const items=ROYAL_ITEMS.map(item=>{
     const occupied=sold.get(item.id)||0,limit=item.stock??null;
     if(limit!=null&&occupied>limit)issues.push({type:'OVERSTOCK',itemId:item.id,excess:occupied-limit});
     return {id:item.id,name:item.name,category:item.category,price:item.price,stock:limit,sold:occupied,remaining:limit==null?null:Math.max(0,limit-occupied),soldOut:limit!=null&&occupied>=limit};
   });
   return {asOf:now(),totalProducts:items.length,totalOwned:holdings.length,issues,healthy:issues.length===0,items,readOnly:true,
     note:'기존 소유권 증명서가 아직 발급되지 않은 보유품은 정상으로 취급합니다. 이상 내역은 자동 수정되지 않습니다.'};
 }
 return {buy,catalog,collector,gallery,updateShowcase,decorate,dashboard,inventoryAudit,setMarket,setBank};
}
module.exports={ROYAL_ITEMS,RETIRED_ROYAL_IDS,createRoyalEconomy,retireFantasyRoyalInventory};
