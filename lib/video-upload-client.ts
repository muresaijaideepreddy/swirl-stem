type Controls={pause:()=>void;resume:()=>void;abort:()=>void};
export async function uploadStoredVideo(file:File,meta:{courseId:string;kind:string;language:string;lesson:number},notify:(n:number)=>void,controls:(c:Controls|null)=>void){
 const chunkSize=8*1024*1024;
 if(!file.name.toLowerCase().endsWith('.mp4')||file.size<16||file.size>2*1024**3)throw new Error('Choose an H.264 MP4 up to 2 GiB, exported with Fast Start / Web Optimized.');
 const first=await file.slice(0,chunkSize).arrayBuffer(),fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',first))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const storageKey='swirl-video:'+JSON.stringify({...meta,name:file.name,size:file.size,fingerprint}),saved=localStorage.getItem(storageKey),key=saved||crypto.randomUUID();localStorage.setItem(storageKey,key);
 let paused=false,canceled=false,wake:(()=>void)|null=null,abort:AbortController|null=null;
 const wait=async()=>{while(paused&&!canceled)await new Promise<void>(resolve=>{wake=resolve});if(canceled)throw new Error('Video upload canceled.');};
 controls({pause(){paused=true},resume(){paused=false;wake?.();wake=null},abort(){canceled=true;paused=false;abort?.abort();wake?.();wake=null}});
 let id='';
 async function post(action:string,data:any){const r=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),d:any=await r.json();if(!r.ok)throw new Error(d.error||'Video request failed.');return d;}
 try{
  const session=await post('cms/storage-start',{...meta,name:file.name,size:file.size,fingerprint,key});id=session.id;
  if(session.status==='starting')throw new Error('Video setup is still pending. Try the same file again shortly.');
  const total=Math.ceil(file.size/chunkSize),received=new Set<number>(session.received);let sent=[...received].reduce((n,p)=>n+Math.min(chunkSize,file.size-(p-1)*chunkSize),0);notify(Math.floor(sent/file.size*100));
  for(const n of received){await wait();const bytes=await file.slice((n-1)*chunkSize,n*chunkSize).arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==session.hashes[n])throw Object.assign(new Error('The selected file differs from the saved upload. Start again with the correct file.'),{noRetry:true});}
  if(session.status==='complete'){notify(100);localStorage.removeItem(storageKey);return {id};}
  for(let n=1;n<=total;n++){if(received.has(n))continue;await wait();const data=file.slice((n-1)*chunkSize,n*chunkSize);let success=false;
   for(let attempt=0;attempt<3&&!success;attempt++){await wait();abort=new AbortController();try{const r=await fetch('/api/cms/storage-part?id='+encodeURIComponent(id)+'&part='+n,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:data,signal:abort.signal});const result:any=await r.json();if(!r.ok){if(r.status<500&&r.status!==409)throw Object.assign(new Error(result.error),{noRetry:true});throw new Error(result.error||'Chunk upload failed.');}success=true;}catch(e){if(canceled)throw new Error('Video upload canceled.');if((e as any).noRetry||attempt===2)throw e;}finally{abort=null;}}
   sent+=data.size;notify(Math.min(99,Math.floor(sent/file.size*100)));
  }
  await wait();await post('cms/storage-complete',{id});notify(100);localStorage.removeItem(storageKey);return {id};
 }catch(e){if(canceled||(e as any).noRetry){localStorage.removeItem(storageKey);if(id)await post('cms/storage-cancel',{id}).catch(()=>{});throw new Error(canceled?'Video upload canceled.':(e as Error).message);}if(/canceled or expired|could not start|video was removed/i.test((e as Error).message)){localStorage.removeItem(storageKey);throw e;}if(/lesson changed during upload/i.test((e as Error).message)){localStorage.removeItem(storageKey);if(id)await post('cms/storage-cancel',{id}).catch(()=>{});throw e;}throw new Error((e as Error).message+' Reselect the same file to resume saved chunks.');}
 finally{controls(null);}
}
