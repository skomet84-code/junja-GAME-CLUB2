'use strict';
const BANK = require('./goldenbell-questions');
module.exports = function createGoldenbell({db,crypto,readBody,requireAuth,json,rateLimit,notify=()=>{},isUserBusy=()=>false,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}) {
  const rooms=new Map(), timers=new Map();
  const DAY_LIMIT=3, QUESTION_MS=20000, REVEAL_MS=5000;
  const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const out=fn();db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}};
  const get=(key,fallback)=>{const row=db.prepare('SELECT value FROM game_state WHERE key=?').get(key);return row?JSON.parse(row.value):fallback;};
  const put=(key,value)=>db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(key,JSON.stringify(value),now());
  const day=()=>new Date(now()+9*3600000).toISOString().slice(0,10);
  function money(id,delta,type){
    const row=db.prepare('SELECT CAST(balance AS TEXT) balance FROM users WHERE id=?').get(id);
    if(!row)throw Error('회원 정보를 찾을 수 없습니다.');
    const balance=BigInt(row.balance)+BigInt(delta);
    if(balance<0n)throw Error('참가자의 게임머니가 부족합니다.');
    if(balance>9000000000000000000n)throw Error('게임머니 저장 한도를 초과합니다.');
    db.prepare('UPDATE users SET balance=? WHERE id=?').run(balance,id);
    db.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)').run(id,delta,balance,type,'준자 골든벨',now());
  }
  // Refund interrupted paid games before the host's general escrow recovery runs.
  tx(()=>{for(const e of db.prepare("SELECT * FROM room_escrow WHERE game='goldenbell'").all()){
    money(e.user_id,e.amount,'goldenbell_refund');
    db.prepare('DELETE FROM room_escrow WHERE room_id=? AND user_id=?').run(e.room_id,e.user_id);
  }});
  function stats(id){
    const s=get('goldenbell:stats:'+id,{games:0,wins:0,bells:0,random30Bells:0,best:0,streak:0,categories:{}});
    // Preserve records created before the random-30 leaderboard field existed.
    if(s.random30Bells===undefined)s.random30Bells=Number(s.bells||0);
    return s;
  }
  function daily(id){const v=get('goldenbell:daily:'+id,{});return v.day===day()?v:{day:day(),used:0};}
  function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
  function difficultyDeck(pool){
    const groups=new Map();
    for(const q of pool){if(!groups.has(q.level))groups.set(q.level,[]);groups.get(q.level).push(q)}
    for(const list of groups.values()){const mixed=shuffle(list);list.length=0;list.push(...mixed)}
    // Every round now reaches the hard bank. The final slot is always level 4
    // when the selected category has enough questions.
    const plan=[1,1,1,1,2,2,2,2,2,2,2,2,3,3,3,3,3,3,3,3,3,3,3,3,4,4,4,4,4,4],out=[];
    for(const level of plan){const list=groups.get(level)||[];if(list.length)out.push(list.pop());}
    const rest=shuffle([...groups.values()].flat());
    while(out.length<Math.min(30,pool.length)&&rest.length)out.push(rest.pop());
    return out.slice(0,30);
  }
  function deck(category){
    let pool=BANK.filter(q=>category==='전체'||q.category===category);
    // Mixed rounds are balanced across categories, then arranged by difficulty.
    if(category==='전체'){
      const groups=Object.groupBy(pool,q=>q.category);pool=[];
      for(const key of Object.keys(groups))groups[key]=shuffle(groups[key]);
      while(pool.length<30){for(const key of shuffle(Object.keys(groups))){if(groups[key].length)pool.push(groups[key].pop());if(pool.length===30)break;}}
    }else pool=shuffle(pool).slice(0,30);
    return difficultyDeck(pool).map(q=>{
      const options=q.options.length===2?[...q.options]:shuffle(q.options);return {...q,options,answer:options.indexOf(q.options[q.answer])};
    });
  }
  const player=u=>({id:Number(u.id),nickname:u.nickname,ready:false,alive:true,lives:3,correct:0,streak:0,bestStreak:0,time:0,lastAlive:0,left:false,payout:0,categories:{}});
  const mine=id=>[...rooms.values()].find(r=>r.phase!=='complete'&&r.players.some(p=>p.id===Number(id)&&!p.left));
  const eligible=(r,p)=>!p.left&&(r.mode!=='survival'||p.alive||r.revival);
  const compare=(r,a,b)=>Number(a.left)-Number(b.left)||(r.mode==='survival'?(Number(b.alive)-Number(a.alive)||b.lastAlive-a.lastAlive):0)||b.correct-a.correct||a.time-b.time;
  function rankings(r){const ps=[...r.players].sort((a,b)=>compare(r,a,b));let rank=1;return ps.map((p,i)=>{if(i&&compare(r,ps[i-1],p))rank=i+1;return {...p,rank};});}
  function publish(r){r.updated=now();notify(r.players.filter(p=>!p.left).map(p=>p.id),r.id);}
  function arm(r,ms){clearTimer(timers.get(r.id));const t=setTimer(()=>{try{tick(r);publish(r);}catch(e){console.error('[goldenbell]',e.message);arm(r,5000);}},Math.max(1,ms));t?.unref?.();timers.set(r.id,t);}
  function startQuestion(r){
    r.phase='question';r.answers={};r.revival=r.mode==='survival'&&[9,19].includes(r.index);
    r.opened=now();r.deadline=now()+QUESTION_MS;r.result=null;arm(r,QUESTION_MS);
  }
  function finish(r){
    if(r.phase==='complete')return;
    const sorted=rankings(r),payouts=new Map(),active=sorted.filter(p=>!p.left);
    if(r.mode==='solo'){
      const p=r.players[0];payouts.set(p.id,r.rewarded?p.correct*10000+(p.correct>=10?50000:0)+(p.correct>=20?100000:0)+(p.correct===r.total?500000:0):0);
    }else if(!active.length){r.players.forEach(p=>payouts.set(p.id,r.entry));}
    else{
      const weights=active.length===1?[100]:active.length===2?[70,30]:[60,30,10];
      const prizes=weights.map(w=>Math.floor(r.pot*w/100));prizes[0]+=r.pot-prizes.reduce((a,b)=>a+b,0);
      for(let i=0;i<active.length;){let end=i+1;while(end<active.length&&!compare(r,active[i],active[end]))end++;
        const group=active.slice(i,end).sort((a,b)=>a.id-b.id),sum=prizes.slice(i,end).reduce((a,b)=>a+b,0);
        group.forEach((p,j)=>payouts.set(p.id,Math.floor(sum/group.length)+(j<sum%group.length?1:0)));i=end;
      }
    }
    const winners=active.filter(p=>p.rank===1&&p.correct>0).map(p=>p.id);
    tx(()=>{for(const p of r.players){
      if(r.entry){const held=db.prepare('SELECT amount FROM room_escrow WHERE room_id=? AND user_id=?').get(r.id,p.id);if(Number(held?.amount)!==r.entry)throw Error('참가비 정산 확인이 필요합니다.');}
      const amount=payouts.get(p.id)||0;if(amount)money(p.id,amount,'goldenbell_payout');
      db.prepare('DELETE FROM room_escrow WHERE room_id=? AND user_id=?').run(r.id,p.id);
      const s=stats(p.id),perfect=p.correct===r.total&&!p.left,random30Perfect=r.category==='전체'&&r.total===30&&p.correct===30&&!p.left;s.nickname=p.nickname;s.games++;s.wins+=r.mode!=='solo'&&winners.includes(p.id)?1:0;s.bells+=perfect?1:0;s.random30Bells=Number(s.random30Bells||0)+(random30Perfect?1:0);s.best=Math.max(s.best,p.correct);s.streak=Math.max(s.streak,p.bestStreak);
      for(const [cat,v] of Object.entries(p.categories)){const old=s.categories[cat]||{correct:0,total:0};s.categories[cat]={correct:old.correct+v.correct,total:old.total+v.total};}
      put('goldenbell:stats:'+p.id,s);
    }});
    r.players.forEach(p=>p.payout=payouts.get(p.id)||0);r.winners=winners;r.phase='complete';r.deadline=0;
    clearTimer(timers.get(r.id));arm(r,20*60000);
  }
  function reveal(r){
    if(r.phase!=='question')return;
    const q=r.questions[r.index],participants=r.players.filter(p=>eligible(r,p));
    const correct=p=>r.answers[p.id]?.choice===q.answer;
    const grace=r.mode==='survival'&&participants.filter(p=>p.alive).every(p=>!correct(p));
    for(const p of participants){
      const ok=correct(p),c=p.categories[q.category]||{correct:0,total:0};c.total++;c.correct+=ok?1:0;p.categories[q.category]=c;
      if(ok){p.correct++;p.streak++;p.bestStreak=Math.max(p.bestStreak,p.streak);p.time+=r.answers[p.id].elapsed;if(r.revival)p.alive=true;}
      else{p.streak=0;p.time+=QUESTION_MS;if(r.mode==='solo')p.lives--;if(r.mode==='survival'&&!grace)p.alive=false;}
      if(p.alive)p.lastAlive=r.index+1;
    }
    r.result={answer:q.answer,explanation:q.explanation,grace,correctIds:participants.filter(correct).map(p=>p.id)};
    r.phase='reveal';r.deadline=now()+REVEAL_MS;arm(r,REVEAL_MS);
  }
  function tick(r){
    if(r.phase==='complete'){rooms.delete(r.id);timers.delete(r.id);return;}
    if(r.phase==='waiting'){if(now()-r.updated>=20*60000){rooms.delete(r.id);timers.delete(r.id);}else arm(r,20*60000);return;}
    if(now()<r.deadline){arm(r,r.deadline-now());return;}
    if(r.phase==='question')reveal(r);
    else if(r.phase==='reveal'){
      if(r.index+1>=r.total||(r.mode==='solo'&&r.players[0].lives<=0)||r.players.every(p=>p.left))finish(r);
      else {r.index++;startQuestion(r);}
    }
  }
  function pub(r,id){
    const p=r.players.find(p=>p.id===Number(id)),q=r.questions?.[r.index];
    return {id:r.id,mode:r.mode,category:r.category,hostId:r.hostId,phase:r.phase,maxPlayers:r.maxPlayers,entry:r.entry,pot:r.pot,total:r.total,index:r.index,revival:r.revival,deadline:r.deadline,serverNow:now(),rewarded:r.rewarded,selfId:Number(id),canAnswer:r.phase==='question'&&eligible(r,p||{left:true})&&!r.answers[id],myAnswer:r.answers?.[id]?.choice??null,result:r.result,winners:r.winners||[],question:q?{token:r.id+':'+r.index,text:q.text,options:q.options,category:q.category,level:q.level}:null,players:rankings(r).map(({categories,...p})=>({...p,answered:!!r.answers?.[p.id]}))};
  }
  function start(r){
    const questions=deck(r.category);
    tx(()=>{
      if(r.mode==='solo'){const d=daily(r.hostId);r.rewarded=d.used<DAY_LIMIT;if(r.rewarded){d.used++;put('goldenbell:daily:'+r.hostId,d);}}
      else for(const p of r.players)if(r.entry){money(p.id,-r.entry,'goldenbell_entry');db.prepare('INSERT INTO room_escrow(room_id,user_id,amount,game,created_at) VALUES(?,?,?,?,?)').run(r.id,p.id,r.entry,'goldenbell',now());}
    });
    r.questions=questions;r.total=questions.length;r.pot=r.entry*r.players.length;r.index=0;startQuestion(r);
  }
  async function handle(req,res,url){
    if(!url.pathname.startsWith('/api/goldenbell'))return false;
    const u=requireAuth(req,res);if(!u)return true;
    const reply=(status,data)=>{json(res,status,data);return true;};
    try{
      if(!rateLimit('goldenbell:'+u.id,180,60000))return reply(429,{error:'잠시 후 다시 시도해주세요.'});
      // Read the complete body BEFORE resolving room membership/state to prevent concurrent POST races.
      const b=req.method==='POST'?await readBody(req):{};
      if(url.pathname==='/api/goldenbell'&&req.method==='GET'){
        const r=mine(u.id);if(r&&r.deadline&&now()>=r.deadline){tick(r);publish(r);}
        return reply(200,{room:r?pub(r,u.id):null,categories:[...new Set(BANK.map(q=>q.category))].map(name=>({name,count:BANK.filter(q=>q.category===name).length})),questionCount:BANK.length,dailyRemaining:Math.max(0,DAY_LIMIT-daily(u.id).used),stats:stats(u.id),rooms:[...rooms.values()].filter(r=>r.phase==='waiting'&&r.mode!=='solo').map(r=>({id:r.id,mode:r.mode,category:r.category,entry:r.entry,players:r.players.length,maxPlayers:r.maxPlayers,host:r.players[0]?.nickname})),leaders:db.prepare("SELECT value FROM game_state WHERE key LIKE 'goldenbell:stats:%'").all().map(x=>{const s=JSON.parse(x.value);return {...s,random30Bells:Number(s.random30Bells??s.bells??0)};}).sort((a,b)=>b.random30Bells-a.random30Bells||b.wins-a.wins||b.best-a.best).slice(0,10)});
      }
      if(url.pathname==='/api/goldenbell/create'&&req.method==='POST'){
        if(mine(u.id)||isUserBusy(u.id))throw Error('참가 중인 게임방에서 먼저 나와주세요.');
        if(!rateLimit('goldenbell_create:'+u.id,10,60000))throw Error('방 생성은 잠시 후 다시 해주세요.');
        const mode=b.mode||'solo',category=b.category||'전체',maxPlayers=Number(b.maxPlayers||6),entry=mode==='solo'?0:Number(b.entry||0);
        if(!['solo','score','survival'].includes(mode))throw Error('게임 방식을 확인해주세요.');
        if(category!=='전체'&&!BANK.some(q=>q.category===category))throw Error('문제 분야를 확인해주세요.');
        if(!Number.isInteger(maxPlayers)||maxPlayers<2||maxPlayers>12)throw Error('인원은 2~12명입니다.');
        if(!Number.isSafeInteger(entry)||entry<0||entry>1000000000||entry%1000)throw Error('참가비는 0~10억 G, 1,000 G 단위입니다.');
        const r={id:'GB'+crypto.randomBytes(8).toString('hex'),hostId:Number(u.id),mode,category,maxPlayers,entry,pot:0,phase:'waiting',players:[player(u)],index:0,answers:{},updated:now(),total:0,deadline:0};
        if(mode==='solo')start(r);else arm(r,20*60000);
        rooms.set(r.id,r);publish(r);return reply(201,{room:pub(r,u.id)});
      }
      const m=url.pathname.match(/^\/api\/goldenbell\/(GB[a-f0-9]{16})(?:\/(join|ready|start|answer|leave))?$/);
      if(!m)return reply(404,{error:'퀴즈 요청을 찾을 수 없습니다.'});
      const r=rooms.get(m[1]),op=m[2];if(!r)return reply(404,{error:'종료된 방입니다. 골든벨 홈에서 다시 시작해주세요.'});
      if(r.deadline&&now()>=r.deadline){tick(r);publish(r);}
      let p=r.players.find(p=>p.id===Number(u.id)&&!p.left);
      if(op==='join'&&req.method==='POST'){
        if(p)return reply(200,{room:pub(r,u.id)});
        if(mine(u.id)||isUserBusy(u.id))throw Error('참가 중인 게임방에서 먼저 나와주세요.');
        if(r.mode==='solo'||r.phase!=='waiting'||r.players.length>=r.maxPlayers)throw Error('입장할 수 없는 방입니다.');
        r.players.push(player(u));publish(r);return reply(200,{room:pub(r,u.id)});
      }
      if(!p)return reply(403,{error:'이 방의 참가자가 아닙니다.'});
      if(!op&&req.method==='GET')return reply(200,{room:pub(r,u.id)});
      if(req.method!=='POST')return reply(405,{error:'잘못된 요청입니다.'});
      if(op==='ready'){if(r.phase!=='waiting')throw Error('이미 시작한 게임입니다.');p.ready=b.ready===true;}
      else if(op==='start'){
        if(r.phase!=='waiting'||r.hostId!==p.id)throw Error('방장만 시작할 수 있습니다.');
        if(r.players.length<2||!r.players.every(p=>p.ready))throw Error('2명 이상 모두 준비를 눌러주세요.');start(r);
      }else if(op==='answer'){
        if(r.phase!=='question'||b.token!==r.id+':'+r.index)throw Error('답변 시간이 끝났거나 이전 문제입니다.');
        if(!eligible(r,p))throw Error('관전 중입니다. 패자부활전을 기다려주세요.');
        if(r.answers[p.id])return reply(200,{room:pub(r,u.id)});
        if(!Number.isInteger(b.choice)||b.choice<0||b.choice>=r.questions[r.index].options.length)throw Error('보기를 선택해주세요.');
        r.answers[p.id]={choice:b.choice,elapsed:now()-r.opened};
        if(r.players.filter(p=>eligible(r,p)).every(p=>r.answers[p.id]))reveal(r);
      }else if(op==='leave'){
        if(r.phase==='waiting'||r.phase==='complete'){r.players=r.players.filter(x=>x!==p);if(!r.players.length){rooms.delete(r.id);clearTimer(timers.get(r.id));timers.delete(r.id);}else if(r.hostId===p.id)r.hostId=r.players[0].id;}
        else {p.left=true;p.alive=false;if(r.mode==='solo'||r.players.every(p=>p.left))finish(r);else if(r.phase==='question'&&r.players.filter(p=>eligible(r,p)).every(p=>r.answers[p.id]))reveal(r);}
        publish(r);return reply(200,{room:null});
      }else throw Error('지원하지 않는 요청입니다.');
      publish(r);return reply(200,{room:pub(r,u.id)});
    }catch(e){return reply(400,{error:e.message});}
  }
  return {handle,hasUser:id=>!!mine(id),findUserRoom:mine,roomCount:()=>rooms.size,close(){for(const t of timers.values())clearTimer(t);}};
};
