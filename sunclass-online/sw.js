/* UX-hub: avkrypterar den ej ihopbakade prototypen i webbläsaren. Skapad av UX-hubben, ändra inte. */
function idb(){return new Promise(function(res,rej){var r=indexedDB.open("pp-site",1);r.onupgradeneeded=function(){r.result.createObjectStore("k")};r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)}})}
function idbGet(k){return idb().then(function(db){return new Promise(function(res,rej){var q=db.transaction("k").objectStore("k").get(k);q.onsuccess=function(){res(q.result)};q.onerror=function(){rej(q.error)}})})}
function idbPut(k,v){return idb().then(function(db){return new Promise(function(res,rej){var t=db.transaction("k","readwrite");t.objectStore("k").put(v,k);t.oncomplete=function(){res()};t.onerror=function(){rej(t.error)}})})}
var SCOPE=self.registration.scope, APP=SCOPE+"app/", APP_PATH=new URL(APP).pathname, REC=null, CHECKED=0, MEM=new Map();
self.addEventListener("install",function(){self.skipWaiting()});
self.addEventListener("activate",function(e){e.waitUntil(self.clients.claim())});
self.addEventListener("fetch",function(e){var u=new URL(e.request.url);if(e.request.method!=="GET"||u.href.indexOf(APP)!==0)return;e.respondWith(handle(e.request,u))});
function login(rel,why){return Response.redirect(SCOPE+"?next="+encodeURIComponent(rel)+"&why="+(why||"")+"&t="+Date.now(),302)}
var TYPES={"png":"image/png","jpg":"image/jpeg","jpeg":"image/jpeg","gif":"image/gif","webp":"image/webp","svg":"image/svg+xml","ico":"image/x-icon","woff2":"font/woff2","woff":"font/woff","ttf":"font/ttf","otf":"font/otf","mp4":"video/mp4","webm":"video/webm","mp3":"audio/mpeg","wav":"audio/wav","json":"application/json","css":"text/css","js":"text/javascript","pdf":"application/pdf","html":"text/html","htm":"text/html","txt":"text/plain","xml":"application/xml","mjs":"text/javascript","avif":"image/avif","m4a":"audio/mp4","glb":"model/gltf-binary","gltf":"model/gltf+json"};
async function handle(req,u){
  var rel=decodeURIComponent(u.pathname.slice(APP_PATH.length)), nav=req.mode==="navigate";
  if(nav||!REC){try{REC=await idbGet(SCOPE);if(REC&&REC.raw)REC.key=await crypto.subtle.importKey("raw",REC.raw,"AES-GCM",false,["decrypt"]);else REC=null}catch(e){REC=null}}
  if(!REC)return nav?login(rel+u.search,"nyckel"):new Response("",{status:401});
  if(rel===""||/\/$/.test(rel))rel+=rel===""?REC.m.start:"index.html";
  // Har en ny version publicerats? Då låser lösenordssidan upp den (automatiskt om lösenordet är detsamma)
  // Versionskollen: Safari på iPhone startar om service workern ofta (då nollställs CHECKED), så tiden för senaste
  // omdirigering sparas också i IndexedDB – högst en omdirigering per minut, annars kan det bli en loop.
  if(nav&&Date.now()-CHECKED>20000&&!(REC.bounced&&Date.now()-REC.bounced<60000)){CHECKED=Date.now();try{var t=await(await fetch(SCOPE+"index.html?v="+Date.now(),{cache:"no-store"})).text();var v=(t.match(/name="pp-build" content="([^"]+)"/)||[])[1];if(v&&v!==REC.v){REC.bounced=Date.now();try{await idbPut(SCOPE,{raw:REC.raw,m:REC.m,v:REC.v,bounced:REC.bounced})}catch(e){}return login(rel+u.search,"version")}}catch(e){}}
  var f=REC.m.files[rel];
  if(!f)return new Response("Filen finns inte i prototypen: "+rel,{status:404,headers:{"Content-Type":"text/plain; charset=utf-8"}});
  var plain=MEM.get(f.id);
  if(!plain){
    var r=await fetch(SCOPE+"f/"+f.id+".bin");
    if(!r.ok)return nav?login(rel+u.search,"fil-"+r.status):new Response("",{status:502});
    var buf=new Uint8Array(await r.arrayBuffer());
    try{plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:buf.slice(0,12)},REC.key,buf.slice(12))}catch(e){return nav?login(rel+u.search,"dekryptering"):new Response("",{status:403})}
    if(/^(video|audio)\//.test(f.type||"")){MEM.set(f.id,plain);if(MEM.size>3)MEM.delete(MEM.keys().next().value)}
  }
  var type=f.type||TYPES[(rel.split(".").pop()||"").toLowerCase()]||"application/octet-stream";
  if(/^text\/|javascript|json|svg/.test(type)&&type.indexOf("charset")<0)type+="; charset=utf-8";
  // Video och ljud hämtas i bitar (Range), särskilt i Safari på iPad och iPhone
  var total=plain.byteLength,range=req.headers.get("range"),m=range&&/bytes=(\d*)-(\d*)/.exec(range);
  if(m&&(m[1]||m[2])){
    var a=m[1]?+m[1]:Math.max(0,total-(+m[2])),b=m[1]&&m[2]?Math.min(+m[2],total-1):total-1;
    if(a>=total)return new Response("",{status:416,headers:{"Content-Range":"bytes */"+total}});
    return new Response(plain.slice(a,b+1),{status:206,headers:{"Content-Type":type,"Content-Range":"bytes "+a+"-"+b+"/"+total,"Content-Length":String(b-a+1),"Accept-Ranges":"bytes"}});
  }
  return new Response(plain,{headers:{"Content-Type":type,"Content-Length":String(total),"Accept-Ranges":"bytes","Cache-Control":"no-cache"}});
}
