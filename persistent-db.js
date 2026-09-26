'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DatabaseSync: NativeDatabaseSync } = require('node:sqlite');
let PoolCtor = null;

const TABLES = ['users','stats','sessions','ledger','admin_audit','user_inventory','user_loadout','game_state','room_escrow','daily_draw_picks','daily_draw_bonus_picks'];
const SNAPSHOT_TABLES = TABLES.filter(t=>t!=='ledger');
const EXTRA_COLUMNS = {
  stats: [
    ['seotda_games','INTEGER NOT NULL DEFAULT 0'],
    ['seotda_wins','INTEGER NOT NULL DEFAULT 0'],
    ['gostop_games','INTEGER NOT NULL DEFAULT 0'],
    ['gostop_wins','INTEGER NOT NULL DEFAULT 0'],
    ['solo_poker_wins','INTEGER NOT NULL DEFAULT 0'],
    ['solo_yut_wins','INTEGER NOT NULL DEFAULT 0'],
    ['horse_races','INTEGER NOT NULL DEFAULT 0'],
    ['horse_wins','INTEGER NOT NULL DEFAULT 0'],
    ['horse_profit','INTEGER NOT NULL DEFAULT 0'],
    ['bigwheel_plays','INTEGER NOT NULL DEFAULT 0'],
    ['bigwheel_wins','INTEGER NOT NULL DEFAULT 0'],
    ['bigwheel_profit','INTEGER NOT NULL DEFAULT 0'],
    ['sicbo_plays','INTEGER NOT NULL DEFAULT 0'],
    ['sicbo_wins','INTEGER NOT NULL DEFAULT 0'],
    ['sicbo_profit','INTEGER NOT NULL DEFAULT 0'],
    ['seven_games','INTEGER NOT NULL DEFAULT 0'],
    ['seven_wins','INTEGER NOT NULL DEFAULT 0'],
    ['baccarat_games','INTEGER NOT NULL DEFAULT 0'],
    ['baccarat_wins','INTEGER NOT NULL DEFAULT 0'],
    ['baccarat_profit','INTEGER NOT NULL DEFAULT 0'],
    ['roulette_plays','INTEGER NOT NULL DEFAULT 0'],
    ['roulette_wins','INTEGER NOT NULL DEFAULT 0'],
    ['roulette_profit','INTEGER NOT NULL DEFAULT 0']
  ],
  users: [
    // Compatibility only: these columns may exist in snapshots written by the reverted large-money build.
    ['balance_text','TEXT'],
    ['is_admin','INTEGER NOT NULL DEFAULT 0'],
    ['is_disabled','INTEGER NOT NULL DEFAULT 0'],
    ['rank_level','INTEGER NOT NULL DEFAULT 0'],
    ['last_rank_salary','TEXT'],
    ['rank_free_slot_date','TEXT'],
    ['rank_free_slot_used','INTEGER NOT NULL DEFAULT 0'],
    ['rank_free_wheel_date','TEXT'],
    ['rank_free_wheel_used','INTEGER NOT NULL DEFAULT 0']
  ],
  ledger: [
    ['amount_text','TEXT'],
    ['balance_after_text','TEXT']
  ],
  admin_audit: [
    ['amount_text','TEXT']
  ],
  user_loadout: [
    ['character','TEXT']
  ]
};

let pool = null;
let saveChain = Promise.resolve();
let lastSnapshotMeta = '';
let remoteReady = false;
let restoreHealthy = false;

function persistenceUrl(){ return String(process.env.DATABASE_URL || '').trim(); }
function isRenderPrivateUrl(url){
  try{
    const h=new URL(url).hostname.toLowerCase();
    return /^dpg-[a-z0-9-]+$/.test(h);
  }catch{return false;}
}
function hasRemote(){
  const url=persistenceUrl();
  return !!url && isRenderPrivateUrl(url);
}

function sslOptions(){
  return undefined;
}

async function getPool(){
  if(!hasRemote()) return null;
  if(!pool){
    PoolCtor = PoolCtor || require('pg').Pool;
    pool = new PoolCtor({connectionString:process.env.DATABASE_URL,ssl:sslOptions(),max:2,idleTimeoutMillis:30000,connectionTimeoutMillis:15000});
    await pool.query(`CREATE TABLE IF NOT EXISTS junja_club_state (
      id INTEGER PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at BIGINT NOT NULL
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS junja_club_ledger (
      id BIGINT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      amount BIGINT NOT NULL,
      balance_after BIGINT NOT NULL,
      type TEXT NOT NULL,
      memo TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )`);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_junja_club_ledger_user_created ON junja_club_ledger(user_id, created_at DESC, id DESC)');
    remoteReady=true;
  }
  return pool;
}

function loadRemoteSnapshotSync(){
  if(!hasRemote()) return null;
  try{
    const out=execFileSync(process.execPath,[path.join(__dirname,'remote-load.js')],{
      env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000,maxBuffer:192*1024*1024
    }).trim();
    if(!out || out==='null') return null;
    const snapshot=JSON.parse(out);
    return snapshot;
  }catch(e){
    console.error('[PERSIST] Render Postgres snapshot load failed; starting with local DB:',e.message);
    return null;
  }
}

function qIdent(s){ return '"'+String(s).replace(/"/g,'""')+'"'; }

const JS_SAFE_MAX=BigInt(Number.MAX_SAFE_INTEGER), JS_SAFE_MIN=-JS_SAFE_MAX;
function normalizeSqliteValue(v){
  if(typeof v!=='bigint') return v;
  return v<=JS_SAFE_MAX&&v>=JS_SAFE_MIN ? Number(v) : v.toString();
}
function normalizeSqliteRow(row){
  if(!row||typeof row!=='object') return row;
  for(const k of Object.keys(row)) row[k]=normalizeSqliteValue(row[k]);
  return row;
}
function readableStatement(nativeDb,sql){
  const stmt=nativeDb.prepare(sql);
  if(typeof stmt.setReadBigInts==='function') stmt.setReadBigInts(true);
  return stmt;
}

class DatabaseSync {
  constructor(filename){
    this._native=new NativeDatabaseSync(filename);
    this._filename=filename;
    this._restore=loadRemoteSnapshotSync();
    this._restored=false;
    this._enabled=false;
    this._saveTimer=null;
    this._firstDirtyAt=0;
    this._persistedLedgerId=0;
    this._restoredFromLegacy=false;
    registerShutdown(this);
  }

  _ensureExtraColumns(){
    for(const [table, cols] of Object.entries(EXTRA_COLUMNS)){
      let existing=[];
      try{existing=this._native.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);}catch{}
      for(const [col,def] of cols){
        if(!existing.includes(col)){
          try{this._native.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);existing.push(col);}catch{}
        }
      }
    }
  }

  _applyRestoreIfReady(sql){
    if(this._restored) return;
    if(!/CREATE TABLE IF NOT EXISTS room_escrow/i.test(sql)) return;
    this._ensureExtraColumns();
    const snap=this._restore;
    if(snap && snap.tables){
      try{
        this._native.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
        for(const table of ['daily_draw_bonus_picks','daily_draw_picks','room_escrow','game_state','user_loadout','user_inventory','admin_audit','ledger','sessions','stats','users']){
          try{this._native.exec(`DELETE FROM ${table}`);}catch{}
        }
        for(const table of TABLES){
          const rows=Array.isArray(snap.tables[table])?snap.tables[table]:[];
          for(const row of rows){
            const cols=Object.keys(row);
            if(!cols.length) continue;
            const placeholders=cols.map(()=>'?').join(',');
            const sqlIns=`INSERT INTO ${qIdent(table)} (${cols.map(qIdent).join(',')}) VALUES (${placeholders})`;
            this._native.prepare(sqlIns).run(...cols.map(c=>row[c]));
          }
        }
        // Remote history stays in Postgres. New local ledger IDs must begin
        // after its high-water mark, otherwise incremental saves skip them.
        const remoteMax=Math.max(0,Number(snap.__remoteLedgerMaxId||0));
        const seq=this._native.prepare("SELECT seq FROM sqlite_sequence WHERE name='ledger'").get();
        if(seq)this._native.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='ledger'").run(remoteMax);
        else this._native.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES('ledger',?)").run(remoteMax);
        const repairKey='repair_admin_wallet_20260926_v1';
        const repaired=this._native.prepare('SELECT 1 FROM game_state WHERE key=?').get(repairKey);
        const evidence=snap.__walletRepair;
        if(!repaired&&evidence&&Number(evidence.id)===487725&&evidence.balance_after==='7077497140000000'){
          const admin=this._native.prepare("SELECT id,balance FROM users WHERE id=2 AND username='junja_admin'").get();
          if(admin&&admin.balance===0){
            const amount=Number(evidence.balance_after),at=Date.now();
            this._native.prepare('UPDATE users SET balance=?,balance_text=? WHERE id=?').run(amount,String(amount),admin.id);
            this._native.prepare('INSERT INTO ledger(user_id,amount,balance_after,type,memo,created_at) VALUES(?,?,?,?,?,?)').run(admin.id,amount,amount,'rollback_repair','2026-09-26 사용자 요청: 금액단위 변경 전 원장 #487725 기준 1회 복원',at);
            this._native.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?)').run(repairKey,JSON.stringify({completed:true,sourceLedgerId:487725,before:0,after:String(amount)}),at);
            console.log('[WALLET REPAIR] Applied once from ledger #487725; balance='+amount);
          }
        }
        this._native.exec('COMMIT; PRAGMA foreign_keys=ON;');
        const restoredRows=TABLES.reduce((n,t)=>n+(snap.tables[t]?.length||0),0);
        const restoredUsers=(snap.tables.users||[]).length;
        const auditUsers=this._native.prepare('SELECT id,balance,balance_text,is_admin,is_disabled FROM users');
        auditUsers.setReadBigInts(true);
        const wallets=auditUsers.all();
        const counts={};
        for(const table of ['users','stats','sessions','user_inventory','user_loadout'])counts[table]=this._native.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
        counts.missingStats=this._native.prepare('SELECT COUNT(*) AS n FROM users u LEFT JOIN stats s ON s.user_id=u.id WHERE s.user_id IS NULL').get().n;
        counts.validSessions=this._native.prepare('SELECT COUNT(*) AS n FROM sessions WHERE expires_at>?').get(Date.now()).n;
        counts.unsafeWallets=wallets.filter(u=>u.balance>BigInt(Number.MAX_SAFE_INTEGER)).length;
        counts.textWalletMismatches=wallets.filter(u=>u.balance_text!=null&&String(u.balance)!==u.balance_text).length;
        console.log('[RESTORE AUDIT] '+JSON.stringify({snapshotAt:snap.updatedAt,counts,adminWallets:wallets.filter(u=>u.is_admin===1n).map(u=>({id:String(u.id),balance:String(u.balance),balance_text:u.balance_text,disabled:String(u.is_disabled)}))}));
        if(hasRemote() && restoredUsers===0) throw new Error('Safety stop: persistent snapshot contains zero users.');
        this._restoredFromLegacy=snap.__restoreSource==='legacy';
        this._persistedLedgerId=this._restoredFromLegacy?0:Math.max(0,Number(snap.__remoteLedgerMaxId||0));
        restoreHealthy=true;
        this._restore=null;
        console.log(`[PERSIST] Restored ${restoredRows} rows from Render Postgres (${restoredUsers} users, remote ledger through #${this._persistedLedgerId}).`);
      }catch(e){
        try{this._native.exec('ROLLBACK; PRAGMA foreign_keys=ON;');}catch{}
        restoreHealthy=false;
        console.error('[PERSIST] Snapshot restore failed; remote writes DISABLED for safety:',e);
      }
    }else{
      restoreHealthy=!hasRemote();
      console.log(hasRemote()?'[PERSIST] Render Postgres connected but no previous snapshot exists; remote writes DISABLED for safety.':'[PERSIST] DATABASE_URL not set; local SQLite mode.');
    }
    this._restored=true;
    this._enabled=true;
    if(this._restoredFromLegacy && restoreHealthy){
      console.log('[PERSIST] Legacy snapshot recovered; copying it once into private Render Postgres.');
      this._queueSave();
    }
  }

  exec(sql){
    const result=this._native.exec(sql);
    this._applyRestoreIfReady(sql);
    if(this._enabled && isMutationExec(sql)) this._scheduleSave();
    return result;
  }

  prepare(sql){
    const stmt=readableStatement(this._native,sql);
    const self=this;
    return {
      get(...args){ return normalizeSqliteRow(stmt.get(...args)); },
      all(...args){ return stmt.all(...args).map(normalizeSqliteRow); },
      run(...args){
        const r=stmt.run(...args);
        if(self._enabled && isMutationSql(sql)) self._scheduleSave();
        return r;
      }
    };
  }

  close(){ try{this._native.close();}catch{} }

  _snapshot(){
    const tables={};
    for(const t of SNAPSHOT_TABLES){
      // A read failure is not an empty table. Abort the save so good remote
      // account data cannot be silently overwritten with an empty array.
      tables[t]=readableStatement(this._native,`SELECT * FROM ${t}`).all().map(normalizeSqliteRow);
    }
    return {version:2,updatedAt:Date.now(),tables};
  }

  _ledgerDelta(afterId, limit=1000){
    return readableStatement(this._native,'SELECT * FROM ledger WHERE id>? ORDER BY id LIMIT ?').all(afterId,limit).map(normalizeSqliteRow);
  }

  _scheduleSave(){
    if(!hasRemote() || !restoreHealthy) return;
    const t=Date.now();
    if(!this._firstDirtyAt)this._firstDirtyAt=t;
    clearTimeout(this._saveTimer);
    const elapsed=t-this._firstDirtyAt;
    const delay=Math.max(1000,Math.min(15000,30000-elapsed));
    this._saveTimer=setTimeout(()=>{
      this._saveTimer=null;
      this._firstDirtyAt=0;
      this._queueSave();
    },delay);
  }

  _queueSave(){
    if(!hasRemote() || !restoreHealthy) return saveChain;
    saveChain=saveChain.then(async()=>{
      const started=Date.now();
      let snapshot;
      try{snapshot=this._snapshot();}
      catch(e){console.error('[PERSIST] Snapshot read failed; previous remote data preserved:',e.message);return;}
      let ledgerCount=0;
      let ledgerMaxId=this._persistedLedgerId;
      const meta=String(snapshot.updatedAt)+':'+SNAPSHOT_TABLES.map(t=>snapshot.tables[t]?.length||0).join(',');
      const json=JSON.stringify(snapshot);
      let client=null;
      try{
        const p=await getPool();
        client=await p.connect();
        await client.query('BEGIN');
        for(;;){
          const batch=this._ledgerDelta(ledgerMaxId);
          if(!batch.length) break;
          const chunkJson=JSON.stringify(batch);
          await client.query(`INSERT INTO junja_club_ledger(id,user_id,amount,balance_after,type,memo,created_at)
            SELECT x.id,x.user_id,x.amount,x.balance_after,x.type,x.memo,x.created_at
            FROM jsonb_to_recordset($1::jsonb)
              AS x(id BIGINT,user_id BIGINT,amount BIGINT,balance_after BIGINT,type TEXT,memo TEXT,created_at BIGINT)
            ON CONFLICT(id) DO NOTHING`,[chunkJson]);
          ledgerCount+=batch.length;
          ledgerMaxId=Number(batch[batch.length-1].id);
        }
        await client.query(`INSERT INTO junja_club_state(id,payload,updated_at) VALUES(1,$1::jsonb,$2)
          ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload, updated_at=EXCLUDED.updated_at`,[json,Date.now()]);
        await client.query('COMMIT');
        if(ledgerCount)this._persistedLedgerId=ledgerMaxId;
        lastSnapshotMeta=meta;
        const ms=Date.now()-started;
        if(ms>250)console.log(`[PERSIST] save ${ms}ms · core ${Buffer.byteLength(json)}B · ledger +${ledgerCount}`);
      }catch(e){
        if(client)try{await client.query('ROLLBACK');}catch{}
        console.error('[PERSIST] Render Postgres save failed:',e.message);
      }finally{
        if(client)client.release();
        snapshot.tables=null;
      }
    });
    return saveChain;
  }

  async flush(){
    clearTimeout(this._saveTimer);
    this._saveTimer=null;
    this._firstDirtyAt=0;
    if(this._enabled && restoreHealthy) this._queueSave();
    await saveChain.catch(()=>{});
  }

  async verifySavedState(){
    if(!hasRemote()||!restoreHealthy)return;
    const p=await getPool();
    const r=await p.query(`SELECT jsonb_array_length(payload->'tables'->'users') AS users,
      jsonb_array_length(payload->'tables'->'stats') AS stats,
      (SELECT u->>'balance' FROM jsonb_array_elements(payload->'tables'->'users') u WHERE u->>'id'='2') AS admin_balance,
      (SELECT COUNT(*) FROM junja_club_ledger WHERE type='rollback_repair' AND user_id=2) AS repair_entries
      FROM junja_club_state WHERE id=1`);
    console.log('[SAVED STATE VERIFIED] '+JSON.stringify(r.rows[0]||{}));
  }
}

function isMutationSql(sql){ return /^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql); }
function isMutationExec(sql){
  if(/^\s*(BEGIN|COMMIT|ROLLBACK|PRAGMA|CREATE|ALTER)/i.test(sql)) return /^\s*COMMIT/i.test(sql);
  return /\b(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
}

let shutdownRegistered=false;
function registerShutdown(db){
  if(shutdownRegistered) return;
  shutdownRegistered=true;
  const quit=async()=>{
    try{await db.flush(); if(pool) await pool.end();}catch{}
    process.exit(0);
  };
  process.once('SIGTERM',()=>quit());
  process.once('SIGINT',()=>quit());
}

module.exports={DatabaseSync};
