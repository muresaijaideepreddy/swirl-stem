import {InputError,validKey} from './core.mjs';
import {digest} from './content.mjs';

export function youtubeId(value){
 if(typeof value!=='string'||value.length>2048)throw new InputError('Paste a YouTube video link.');
 let url;try{url=new URL(value.trim())}catch{throw new InputError('Paste a complete https:// YouTube video link.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port)throw new InputError('Use a secure YouTube video link without credentials or a custom port.');
 const host=url.hostname,parts=url.pathname.split('/').filter(Boolean);let id;
 if(host==='youtu.be'&&parts.length===1)id=parts[0];
 else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host)){
  if(url.pathname==='/watch'&&url.searchParams.getAll('v').length===1)id=url.searchParams.get('v');
  else if(parts.length===2&&['embed','shorts','live'].includes(parts[0]))id=parts[1];
 }else if(['youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)&&parts.length===2&&parts[0]==='embed')id=parts[1];
 if(!/^[A-Za-z0-9_-]{11}$/.test(id??''))throw new InputError('Use a link to one YouTube video, not a channel or playlist.');
 return id;
}

export function youtubePlayback(id){
 if(!/^[A-Za-z0-9_-]{11}$/.test(id??''))throw new InputError('This YouTube link needs to be added again.',409);
 return {provider:'youtube',url:'https://www.youtube-nocookie.com/embed/'+id+'?playsinline=1&rel=0',watchUrl:'https://www.youtube.com/watch?v='+id};
}

export async function linkYoutube({db,content},u,b){
 validKey(b.key);
 const videoId=youtubeId(b.url),m=await content.assetMeta(u,{...b,name:'YouTube '+videoId});
 if(!['video','prep','preview'].includes(m.kind))throw new InputError('Choose Student video, Prep video or Public preview video.');
 const id='youtube-'+(await digest(JSON.stringify([m.courseId,m.lessonId,m.kind,m.language,videoId,b.key]))).slice(0,40);
 const existing=await db.prepare('SELECT id,status FROM content_assets WHERE id=?').bind(id).first();
 if(existing?.status==='ready')return {id,status:'ready'};
 const count=await db.prepare("SELECT count(*) AS n FROM content_assets WHERE course_id=? AND status!='deleted'").bind(m.courseId).first();
 if(count.n>=150)throw new InputError('This course has reached its file limit.',429);
 const result=await content.attachAsset(u,m,{id,mime:'video/youtube',size:0,playbackId:videoId,status:'ready'});
 await content.audit(u,'youtube-link',m.courseId,m.kind).run();
 return result;
}
