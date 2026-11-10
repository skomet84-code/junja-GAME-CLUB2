'use strict';
/* Allow exactly one trusted, static inline import map on the licensed GLB
 * gallery. Global production CSP remains strict; never use unsafe-inline.
 * The SHA-256 is derived from the exact HTML bytes served to the browser.
 */
const crypto=require('node:crypto');

function atelierImportMapCsp(html,baseCsp){
  const matches=[...String(html).matchAll(/<script\s+type=["']importmap["'][^>]*>([\s\S]*?)<\/script\s*>/gi)];
  if(matches.length!==1)throw new Error('Expected exactly one vetted Sovereign importmap');
  const content=matches[0][1];
  // Verify that the map imports only our own pinned local runtime.
  let map;
  try{map=JSON.parse(content);}catch{throw new Error('Sovereign importmap is malformed');}
  if(Object.keys(map).join(',')!=='imports'||
    Object.keys(map.imports||{}).sort().join(',')!=='three,three/addons/'||
    map.imports.three!=='/vendor/three/build/three.module.js'||
    map.imports['three/addons/']!=='/vendor/three/examples/jsm/'){
    throw new Error('Unexpected external or altered importmap specifier');
  }
  const source="script-src 'self'";
  if(!String(baseCsp).includes(source))throw new Error('Unexpected CSP script directive');
  const digest=crypto.createHash('sha256').update(content,'utf8').digest('base64');
  return String(baseCsp).replace(source,source+" 'sha256-"+digest+"'");
}
module.exports={atelierImportMapCsp};
