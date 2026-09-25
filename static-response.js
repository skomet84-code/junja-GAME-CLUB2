'use strict';
const fs=require('node:fs');
const {createGzip}=require('node:zlib');
const {pipeline}=require('node:stream');

module.exports=function staticResponse(req,res,file,st,contentType,securityHeaders={}){
  const html=contentType.startsWith('text/html');
  const text=/^(text\/|application\/(javascript|json|manifest\+json))/.test(contentType)||contentType==='image/svg+xml';
  // Revalidate code on every visit. Never cache account/API responses here.
  const headers={'Content-Type':contentType,'Cache-Control':html?'no-store':text?'public, max-age=0, must-revalidate':'public, max-age=86400',...securityHeaders};
  const etag=`W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  if(!html)headers.ETag=etag;
  if(text)headers.Vary='Accept-Encoding';
  if(!html&&String(req.headers['if-none-match']||'').split(/\s*,\s*/).includes(etag)){
    res.writeHead(304,headers);res.end();return;
  }
  const gzip=text&&st.size>=1024&&String(req.headers['accept-encoding']||'').split(',').some(part=>{
    const [name,...params]=part.trim().split(';');
    const q=params.find(p=>p.trim().startsWith('q='));
    return name.trim()==='gzip'&&(!q||Number(q.trim().slice(2))>0);
  });
  if(gzip)headers['Content-Encoding']='gzip';else headers['Content-Length']=st.size;
  res.writeHead(200,headers);
  if(req.method==='HEAD'){res.end();return;}
  // Use createReadStream so the existing in-memory runtime patches stay intact.
  const source=fs.createReadStream(file);
  const streams=gzip?[source,createGzip({level:4}),res]:[source,res];
  pipeline(...streams,error=>{if(error&&!res.destroyed)res.destroy();});
};
