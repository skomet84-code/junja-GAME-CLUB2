'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DatabaseSync: NativeDatabaseSync } = require('node:sqlite');
let PoolCtor = null;

const TABLES = ['users','stats','sessions','ledger','admin_audit','room_escrow'];
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
    ['horse_profit','INTEGER NOT NULL DEFAULT 0']
  ],
  users: [
    ['is_admin','INTEGER NOT NULL DEFAULT 0'],
    ['is_disabled','INTEGER NOT NULL DEFAULT 0']
  ]
};

let pool = null;
let saveChain = Promise.resolve();
let lastSnapshotJson = '';
let remoteReady = false;

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
    remoteReady=true;
  }
  return pool;
}

function loadRemoteSnapshotSync(){
  if(!hasRemote()) return null;
  try{
    const out=execFileSync(process.execPath,[path.join(__dirname,'remote-load.js')],{
      env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:20*1024*1024
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
        for(const table of ['room_escrow','admin_audit','ledger','sessions','stats','users']){
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
        console.log(`[PERSIST] Restored ${TABLES.reduce((n,t)=>n+(snap.tables[t]?.length||0),0)} rows from Neon.`);
      }catch(e){
        try{this._native.exec('ROLLBACK; PRAGMA foreign_keys=ON;');}catch{}
        console.error('[PERSIST] Snapshot restore failed:',e);
      }
    }else{
      console.log('[PERSIST] Neon connected but no previous snapshot exists yet.');
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
    for(const t of TABLES){
      try{tables[t]=this._native.prepare(`SELECT * FROM ${t}`).all();}
      catch{tables[t]=[];}
    }
    return {version:1,updatedAt:Date.now(),tables};
  }

  _scheduleSave(){
    if(!hasRemote()) return;
    clearTimeout(this._saveTimer);
    this._saveTimer=setTimeout(()=>this._queueSave(),60);
  }

  _queueSave(){
    if(!hasRemote()) return saveChain;
    const snapshot=this._snapshot();
    const json=JSON.stringify(snapshot);
    if(json===lastSnapshotJson) return saveChain;
    lastSnapshotJson=json;
    saveChain=saveChain.then(async()=>{
      try{
        const p=await getPool();
        await p.query(`INSERT INTO junja_club_state(id,payload,updated_at) VALUES(1,$1::jsonb,$2)
          ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload, updated_at=EXCLUDED.updated_at`,[json,Date.now()]);
      }catch(e){console.error('[PERSIST] Neon save failed:',e.message);}
    });
    return saveChain;
  }

  async flush(){
    clearTimeout(this._saveTimer);
    if(this._enabled) this._queueSave();
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
  const quit=async(sig)=>{
    try{await db.flush(); if(pool) await pool.end();}catch{}
    process.exit(0);
  };
  process.once('SIGTERM',()=>quit('SIGTERM'));
  process.once('SIGINT',()=>quit('SIGINT'));
}

module.exports={DatabaseSync};
