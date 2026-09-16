// Cache only the app shell, never documents or registered fonts.
const PREFIX='hwp-viewer-',SCOPE=new URL(self.registration.scope),CACHE=PREFIX+'v51-'+encodeURIComponent(SCOPE.href);
const CORE=new URL('index.html',SCOPE).href,MANIFEST=new URL('manifest.webmanifest',SCOPE).href;
function shellKey(request){const url=new URL(request.url);if(url.origin!==SCOPE.origin)return null;
  if(url.pathname===new URL(CORE).pathname)return CORE;
  if(url.pathname===new URL(MANIFEST).pathname)return MANIFEST;
  if(request.mode==='navigate'&&(url.pathname===SCOPE.pathname||url.pathname===new URL('index.html',SCOPE).pathname))return CORE;
  return null;
}
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll([CORE,MANIFEST])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith(PREFIX)&&k.endsWith(encodeURIComponent(SCOPE.href))).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;const key=shellKey(event.request);if(!key)return;
  event.respondWith((async()=>{const cache=await caches.open(CACHE),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),5000);
    try{const response=await fetch(key,{signal:abort.signal,cache:'no-cache'});if(response.ok){await cache.put(key,response.clone());return response;}return await cache.match(key)||response;}
    catch(error){return await cache.match(key)||Response.error();}finally{clearTimeout(timer);}
  })());
});
