import {InputError,validKey} from './core.mjs';
import {digest} from './content.mjs';
import {inspectMp4} from './mp4.mjs';
export const VIDEO_PART_SIZE=8*1024*1024,MAX_VIDEO_SIZE=2*1024**3;
export function storageVideo({db,bucket,content,now=()=>Date.now()}){
 const q=(s,...a)=>db.prepare(s).bind(...a),row=id=>q('SELECT * FROM media_uploads WHERE id=?',id).first();
 async function owned(u,id){const r=await row(String(id??''));if(!r||r.owner_id!==u.userId)throw new InputError('Upload not found.',404);await content.owned(u,r.course_id);return r;}
 const partList=async id=>(await q('SELECT part,size,hash,etag FROM media_upload_parts WHERE upload_id=? ORDER BY part',id).all()).results;
 async function status(u,id){const r=await owned(u,id);return {id:r.id,status:r.status,size:r.size,name:JSON.parse(r.meta).name,partSize:VIDEO_PART_SIZE,received:(await partList(r.id)).filter(p=>p.etag).map(p=>p.part),hashes:Object.fromEntries((await partList(r.id)).map(p=>[p.part,p.hash])),expiresAt:r.expires_at};}
 async function locked(u,id,fn){let r=await owned(u,id);const token=crypto.randomUUID(),t=now();const result=await q('UPDATE media_uploads SET lock_token=?,lock_until=? WHERE id=? AND lock_until<?',token,t+120000,id,t).run();if(!result.meta.changes)throw new InputError('Upload is being updated. Retry shortly.',409);
  const atomic=async statements=>{try{return await db.batch([q('INSERT INTO media_upload_parts(upload_id,part,size,hash,etag) SELECT ?,0,0,NULL,NULL WHERE NOT EXISTS(SELECT 1 FROM media_uploads WHERE id=? AND lock_token=? AND lock_until>?)',id,id,token,now()),...statements]);}catch(e){if(!await q('SELECT id FROM media_uploads WHERE id=? AND lock_token=? AND lock_until>?',id,token,now()).first())throw new InputError('Upload update timed out. Resume to recover saved progress.',409);throw e;}};
  try{r=await owned(u,id);return await fn(r,atomic);}finally{await q('UPDATE media_uploads SET lock_until=0,lock_token=NULL WHERE id=? AND lock_token=?',id,token).run();}
 }
 async function start(u,b){
  const m=await content.assetMeta(u,b);if(!['video','prep','preview'].includes(m.kind)||!m.name.toLowerCase().endsWith('.mp4'))throw new InputError('Choose an MP4 video purpose and file.');if(!Number.isSafeInteger(b.size)||b.size<16||b.size>MAX_VIDEO_SIZE)throw new InputError('Choose an MP4 up to 2 GiB.');if(!/^[a-f0-9]{64}$/.test(b.fingerprint??''))throw new InputError('Video fingerprint is missing. Select the file again.');
  const id='video-'+(await digest(u.userId+':'+validKey(b.key))).slice(0,40),existing=await row(id);
  if(existing){const old=JSON.parse(existing.meta);if(existing.owner_id!==u.userId||existing.course_id!==m.courseId||existing.size!==b.size||existing.fingerprint!==b.fingerprint||old.kind!==m.kind||old.language!==m.language||old.lesson!==m.lesson||old.name!==m.name)throw new InputError('The selected video changed. Start a new upload.',409);if(existing.status==='starting'){if(existing.created_at<now()-120000)throw new InputError('This upload was canceled or expired. Start again.',410);throw new InputError('Video setup is pending. Retry shortly.',409);}if(existing.status==='canceled'||(existing.status!=='complete'&&existing.expires_at<now()))throw new InputError('This upload was canceled or expired. Start again.',410);if(existing.status==='complete'){try{const asset=await content.asset(u,id);if(asset.status!=='ready')throw new Error('Not ready')}catch{throw new InputError('This video was removed. Select the file again to start a new upload.',410);}}return status(u,id);}
  const count=await q('SELECT count(*) n FROM media_uploads WHERE owner_id=? AND created_at>?',u.userId,now()-86400000).first();if(count.n>=20)throw new InputError('Daily video upload limit reached.',429);
  m.id=id;const key='videos/'+m.courseId+'/'+id;await q("INSERT INTO media_uploads(id,owner_id,course_id,meta,storage_key,size,fingerprint,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,'starting',?,?)",id,u.userId,m.courseId,JSON.stringify(m),key,b.size,b.fingerprint,now(),now()+6*86400000).run();
  let multipart;try{multipart=await bucket.createMultipartUpload(key,{httpMetadata:{contentType:'video/mp4'},customMetadata:{uploadId:id}});const saved=await q("UPDATE media_uploads SET upload_id=?,status='uploading' WHERE id=? AND status='starting'",multipart.uploadId,id).run();if(!saved.meta.changes){await multipart.abort();throw new InputError('Upload was canceled.',409);}}catch(e){if(multipart)await multipart.abort().catch(()=>{});await q("UPDATE media_uploads SET status='canceled' WHERE id=?",id).run();throw new InputError('Video upload could not start. Choose the file again.',503);}return status(u,id);
 }
 async function part(u,id,n,bytes){return locked(u,id,async(r,atomic)=>{
  if(r.status!=='uploading'||r.expires_at<now())throw new InputError('This upload is not accepting chunks.',409);const total=Math.ceil(r.size/VIDEO_PART_SIZE),expected=n===total?r.size-(n-1)*VIDEO_PART_SIZE:VIDEO_PART_SIZE;if(!Number.isInteger(n)||n<1||n>total||bytes.length!==expected)throw new InputError('Incorrect video chunk number or size.');
  const hash=await digest(bytes),saved=(await partList(id)).find(p=>p.part===n);if(saved){if(saved.hash!==hash)throw new InputError('This chunk differs from the saved video. Reselect the original file.',409);if(saved.etag)return {saved:true};}
  let info;if(n===1){if(hash!==r.fingerprint)throw new InputError('The selected video changed. Start again.',409);info=inspectMp4(bytes,r.size);}
  // Reserve immutable bytes before the provider call: a late writer can only retry identical content.
  await atomic([q("INSERT INTO media_upload_parts(upload_id,part,size,hash,etag) VALUES(?,?,?,?,'') ON CONFLICT(upload_id,part) DO NOTHING",id,n,bytes.length,hash),...(info?[q('UPDATE media_uploads SET info=? WHERE id=?',JSON.stringify(info),id)]:[])]);
  const uploaded=await bucket.resumeMultipartUpload(r.storage_key,r.upload_id).uploadPart(n,bytes);
  await atomic([q('UPDATE media_upload_parts SET etag=? WHERE upload_id=? AND part=? AND hash=?',uploaded.etag,id,n,hash)]);return {saved:true};
 });}
 async function complete(u,id){return locked(u,id,async(r,atomic)=>{
  if(r.status==='complete'){await content.asset(u,id);return {id,status:'ready'};}if(!['uploading','completing'].includes(r.status)||r.expires_at<now())throw new InputError('This upload cannot be completed.',409);
  const parts=await partList(id),total=Math.ceil(r.size/VIDEO_PART_SIZE);if(!r.info||parts.length!==total||parts.some((p,i)=>p.part!==i+1||!p.etag)||parts.reduce((n,p)=>n+p.size,0)!==r.size)throw new InputError('Upload all video chunks before completing.',409);
  await atomic([q("UPDATE media_uploads SET status='completing' WHERE id=?",id)]);
  let object=await bucket.head(r.storage_key);if(!object){await bucket.resumeMultipartUpload(r.storage_key,r.upload_id).complete(parts.map(p=>({partNumber:p.part,etag:p.etag})));object=await bucket.head(r.storage_key);}
  // Real R2 completion responses can omit metadata; verify the persisted object via HEAD.
  if(!object||object.size!==r.size||(object.customMetadata?.uploadId??object.customMetadata?.uploadid)!==id)throw new InputError('Stored video could not be verified.',409);
  const existing=await q('SELECT * FROM content_assets WHERE id=?',id).first();if(existing?.status==='deleted')throw new InputError('This video was removed.',409);
  if(!existing){const m=JSON.parse(r.meta);await content.owned(u,m.courseId);const result=await atomic([
   q("INSERT INTO content_assets(id,course_id,owner_id,kind,lesson_index,language,name,mime,size,storage_key,status,created_at) SELECT ?,?,?,?,?,?,?,'video/mp4',?,?,'ready',? FROM content_courses WHERE id=? AND revision=? AND json_extract(draft,?)=?",id,m.courseId,u.userId,m.kind,m.lesson,m.language,m.name,r.size,r.storage_key,now(),m.courseId,m.revision,'$.steps['+m.lesson+'].id',m.lessonId),
   q('UPDATE content_courses SET revision=revision+1,updated_at=? WHERE id=? AND revision=? AND changes()>0',now(),m.courseId,m.revision),
   q("UPDATE media_uploads SET status='complete' WHERE id=? AND EXISTS(SELECT 1 FROM content_assets WHERE id=? AND status='ready')",id,id)
  ]);if(!result[1].meta.changes)throw new InputError('The lesson changed during upload. Cancel this upload, reopen the lesson and upload again.',409);
  }else await atomic([q("UPDATE media_uploads SET status='complete' WHERE id=?",id)]);
  return {id,status:'ready',duration:JSON.parse(r.info).duration};
 });}
 async function cancel(u,id){return locked(u,id,async(r,atomic)=>{if(r.status==='complete'||await q("SELECT id FROM content_assets WHERE id=? AND status!='deleted'",id).first())throw new InputError('This video finished uploading. Remove it from the file list.',409);await atomic([q("UPDATE media_uploads SET status='canceled' WHERE id=?",id)]);if(r.upload_id){try{await bucket.resumeMultipartUpload(r.storage_key,r.upload_id).abort()}catch{}}await bucket.delete(r.storage_key);return {canceled:true};});}
 return {start,status,part,complete,cancel};
}
