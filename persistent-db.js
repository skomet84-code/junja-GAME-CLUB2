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
    ['is_admin','INTEGER NOT NULL DEFAULT 0'],
    ['is_disabled','INTEGER NOT NULL DEFAULT 0'],
    ['rank_level','INTEGER NOT NULL DEFAULT 0'],
    ['last_rank_salary','TEXT'],
    ['rank_free_slot_date','TEXT'],
    ['rank_free_slot_used','INTEGER NOT NULL DEFAULT 0'],
    ['rank_free_wheel_date','TEXT'],
    ['rank_free_wheel_used','INTEGER NOT NULL DEFAULT 0']
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

function hasRemote(){ return !!String(process.env.DATABASE_URL || '').trim(); }

function sslOptions(){
  const url=String(process.env.DATABASE_URL||'');
  return /sslmode=require|neon\.tech/i.test(url) ? {rejectUnauthorized:false} : undefined;
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
    return JSON.parse(out);
  }catch(e){
    console.error('[PERSIST] Neon snapshot load failed; starting with local DB:',e.message);
    return null;
  }
}

function qIdent(s){ return '"'+String(s).replace(/"/g,'""')+'"'; }

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
        this._native.exec('COMMIT; PRAGMA foreign_keys=ON;');
        const restoredRows=TABLES.reduce((n,t)=>n+(snap.tables[t]?.length||0),0);
        const restoredUsers=(snap.tables.users||[]).length;
        if(hasRemote() && restoredUsers===0) throw new Error('Safety stop: remote snapshot contains zero users.');
        this._persistedLedgerId=Math.max(0,Number(snap.__remoteLedgerMaxId||0));
        restoreHealthy=true;
        this._restore=null;
        console.log(`[PERSIST] Restored ${restoredRows} rows from Neon (${restoredUsers} users, remote ledger through #${this._persistedLedgerId}).`);
      }catch(e){
        try{this._native.exec('ROLLBACK; PRAGMA foreign_keys=ON;');}catch{}
        restoreHealthy=false;
        console.error('[PERSIST] Snapshot restore failed; remote writes DISABLED for safety:',e);
      }
    }else{
      restoreHealthy=!hasRemote();
      console.log(hasRemote()?'[PERSIST] Neon connected but no previous snapshot exists; remote writes DISABLED for safety.':'[PERSIST] DATABASE_URL not set; local SQLite mode.');
    }
    this._restored=true;
    this._enabled=true;
  }

  exec(sql){
    const result=this._native.exec(sql);
    this._applyRestoreIfReady(sql);
    if(this._enabled && isMutationExec(sql)) this._scheduleSave();
    return result;
  }

  prepare(sql){
    const stmt=this._native.prepare(sql);
    const self=this;
    return {
      get(...args){ return stmt.get(...args); },
      all(...args){ return stmt.all(...args); },
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
      try{tables[t]=this._native.prepare(`SELECT * FROM ${t}`).all();}
      catch{tables[t]=[];}
    }
    return {version:2,updatedAt:Date.now(),tables};
  }

  _ledgerDelta(){
    try{return this._native.prepare('SELECT * FROM ledger WHERE id>? ORDER BY id').all(this._persistedLedgerId);}
    catch{return [];}
  }

  _scheduleSave(){
    if(!hasRemote() || !restoreHealthy) return;
    const t=Date.now();
    if(!this._firstDirtyAt)this._firstDirtyAt=t;
    clearTimeout(this._saveTimer);
    const elapsed=t-this._firstDirtyAt;
    const delay=Math.max(100,Math.min(1200,4000-elapsed));
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
      const snapshot=this._snapshot();
      const ledgerRows=this._ledgerDelta();
      const meta=String(snapshot.updatedAt)+':'+SNAPSHOT_TABLES.map(t=>snapshot.tables[t]?.length||0).join(',');
      const json=JSON.stringify(snapshot);
      const ledgerJson=ledgerRows.length?JSON.stringify(ledgerRows):null;
      let client=null;
      try{
        const p=await getPool();
        client=await p.connect();
        await client.query('BEGIN');
        if(ledgerRows.length){
          await client.query(`INSERT INTO junja_club_ledger(id,user_id,amount,balance_after,type,memo,created_at)
            SELECT x.id,x.user_id,x.amount,x.balance_after,x.type,x.memo,x.created_at
            FROM jsonb_to_recordset($1::jsonb)
              AS x(id BIGINT,user_id BIGINT,amount BIGINT,balance_after BIGINT,type TEXT,memo TEXT,created_at BIGINT)
            ON CONFLICT(id) DO NOTHING`,[ledgerJson]);
        }
        await client.query(`INSERT INTO junja_club_state(id,payload,updated_at) VALUES(1,$1::jsonb,$2)
          ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload, updated_at=EXCLUDED.updated_at`,[json,Date.now()]);
        await client.query('COMMIT');
        if(ledgerRows.length)this._persistedLedgerId=Math.max(this._persistedLedgerId,Number(ledgerRows[ledgerRows.length-1].id||0));
        lastSnapshotMeta=meta;
        const ms=Date.now()-started;
        if(ms>250)console.log(`[PERSIST] save ${ms}ms · core ${Buffer.byteLength(json)}B · ledger +${ledgerRows.length}`);
      }catch(e){
        if(client)try{await client.query('ROLLBACK');}catch{}
        console.error('[PERSIST] Neon save failed:',e.message);
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
