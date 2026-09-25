(function(root){
  'use strict';
  // Only concurrent reads are shared. Wallet/game actions are never replayed.
  function createClient(env){
    const reads=new Map();
    let generation=0;
    function request(url,options={}){
      const method=String(options.method||'GET').toUpperCase();
      if(method!=='GET'){generation++;reads.clear();}
      const key=method==='GET'&&!options.signal?JSON.stringify([generation,url,options]):null;
      if(key&&reads.has(key))return reads.get(key);
      const task=(async()=>{
        const controller=new env.AbortController();
        const abort=()=>controller.abort();
        if(options.signal?.aborted)abort();
        options.signal?.addEventListener('abort',abort,{once:true});
        const timer=env.setTimeout(abort,12000);
        try{
          const res=await env.fetch(url,{cache:'no-store',credentials:'same-origin',...options,
            method,headers:{'Content-Type':'application/json',...(options.headers||{})},signal:controller.signal});
          const data=await res.json();
          if(!res.ok){const e=new Error(data.error||'요청에 실패했습니다.');e.status=res.status;throw e;}
          return data;
        }finally{
          env.clearTimeout(timer);
          options.signal?.removeEventListener('abort',abort);
        }
      })();
      if(key){reads.set(key,task);task.then(clean,clean);}
      function clean(){if(reads.get(key)===task)reads.delete(key);}
      return task;
    }
    return {request};
  }
  function createEventStream(env,onRefresh,onState){
    let source=null,retry=null,stable=null,attempt=0,closed=false;
    const visible=()=>!env.document.hidden&&env.navigator.onLine!==false;
    function suspend(){
      env.clearTimeout(retry);env.clearTimeout(stable);retry=stable=null;
      if(source)source.close();source=null;
    }
    function open(){
      if(closed||!visible()||source)return;
      const current=source=new env.EventSource('/api/events');
      current.onopen=()=>{
        if(source!==current)return;
        onState('online');
        stable=env.setTimeout(()=>{attempt=0;},60000);
      };
      current.addEventListener('refresh',e=>{if(source===current&&visible())onRefresh(e);});
      current.onerror=()=>{
        if(source!==current)return;
        suspend();onState(env.navigator.onLine===false?'offline':'degraded');
        if(!visible()||attempt>=5)return;
        const delay=Math.min(30000,2000*2**attempt++);
        retry=env.setTimeout(()=>{retry=null;open();},delay);
      };
    }
    function resume(){if(!visible()){suspend();return;}if(!source&&!retry){attempt=0;open();}}
    env.document.addEventListener('visibilitychange',resume);
    env.addEventListener('offline',suspend);env.addEventListener('online',resume);
    open();
    return {close(){closed=true;suspend();env.document.removeEventListener('visibilitychange',resume);
      env.removeEventListener('offline',suspend);env.removeEventListener('online',resume);}};
  }
  const exports={createClient,createEventStream};
  if(typeof module!=='undefined'&&module.exports)module.exports=exports;
  else root.JunjaNetwork=exports;
})(typeof window!=='undefined'?window:globalThis);
