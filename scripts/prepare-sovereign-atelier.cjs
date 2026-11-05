'use strict';
/* Reproducible CC0 car + MIT Three.js packaging for the isolated pro showroom.
 * The upstream Git blob is pinned and validated so a replaced asset fails closed.
 * Never mutate user profiles, ownership, inventory, payments or wallets here.
 */
const fs=require('node:fs'),p=require('node:path'),crypto=require('node:crypto'),https=require('node:https');
const root=p.join(__dirname,'..');
const glbPath=p.join(root,'public/art/royal/models/spectral-gt-rs-cc0.glb');
const expectedBlob='f5b814848453a6c75a48f5047fdadaa7bdc78969';
const source='https://raw.githubusercontent.com/JaronKBragg7337/spectral-gt-rs/34499c501908818a2b08e589a7aecf963343cee7/spectral_gt_rs_game_ready.glb';
const upstream='https://github.com/JaronKBragg7337/spectral-gt-rs';
const modules=[
 'build/three.core.js',
 'build/three.module.js',
 'examples/jsm/loaders/GLTFLoader.js',
 'examples/jsm/controls/OrbitControls.js',
 'examples/jsm/utils/BufferGeometryUtils.js',
 'examples/jsm/environments/RoomEnvironment.js',
 'LICENSE'
];
function validate(bytes){
 if(bytes.length<1_000_000||bytes.length>16_000_000)throw Error('unexpected GLB size '+bytes.length);
 if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('invalid GLB header');
 const sha=crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 if(sha!==expectedBlob)throw Error('CC0 model changed unexpectedly: '+sha);
 return sha;
}
function fetchBinary(url){
 return new Promise((resolve,reject)=>{
  const req=https.get(url,{headers:{'User-Agent':'JUNJA-LAND-asset-packager/1.0','Accept':'application/octet-stream'}},res=>{
   if(res.statusCode!==200){res.resume();return reject(Error('download HTTP '+res.statusCode));}
   const parts=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>16_000_000){req.destroy(Error('asset exceeds limit'));return;}parts.push(chunk);});
   res.on('end',()=>resolve(Buffer.concat(parts)));
   res.on('error',reject);
  });
  req.setTimeout(20000,()=>req.destroy(Error('download timeout')));
  req.on('error',reject);
 });
}
(async()=>{
 const lib=p.join(root,'node_modules/three'),vendor=p.join(root,'public/vendor/three');
 if(!fs.existsSync(p.join(lib,'LICENSE')))throw Error('npm install three@0.180.0 first');
 const pkg=require(p.join(lib,'package.json'));
 if(pkg.version!=='0.180.0')throw Error('Unexpected Three version '+pkg.version);
 for(const file of modules){
  const input=p.join(lib,file),output=p.join(vendor,file);
  if(!fs.existsSync(input))throw Error('Missing Three.js module '+file);
  fs.mkdirSync(p.dirname(output),{recursive:true});
  fs.copyFileSync(input,output);
 }
 let binary;
 if(fs.existsSync(glbPath)){
  binary=fs.readFileSync(glbPath);
  validate(binary);
 }else{
  try{binary=await fetchBinary(source);}catch(e){
   throw Error('Cannot fetch pinned licensed GLB (previous production remains untouched): '+e.message);
  }
  validate(binary);
  fs.mkdirSync(p.dirname(glbPath),{recursive:true});
  fs.writeFileSync(glbPath,binary,{flag:'wx'});
 }
 console.log('SOVEREIGN_LICENSED_ASSET_OK: '+binary.length+' bytes; Git blob '+expectedBlob+
  '; CC0 '+upstream+'; local Three.js MIT '+pkg.version);
})().catch(e=>{console.error(e);process.exitCode=1});
