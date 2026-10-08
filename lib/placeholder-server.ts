import {findProduct,subjects} from './catalog';
import {InputError} from './core.mjs';
import {user,requireAccess} from './server';
import {introPlaceholder,lessonVideo,prepVideo,previewVideo,streamPreview,streamPlaceholder} from './placeholder-videos.mjs';
// Intro, stream and course previews are public "video hooks"; lesson and prep videos require the same access as the course downloads.
export async function lessonVideoRoute(req:Request){
 const url=new URL(req.url),kind=url.searchParams.get('kind')??'lesson';let video;
 if(kind==='intro')video=introPlaceholder;
 else if(kind==='stream'){const subject=url.searchParams.get('subject')??'';if(!subjects.some(s=>s.id===subject))throw new InputError('Stream not found.',404);video=streamPreview(subject);}
 else{
  const p=findProduct(url.searchParams.get('id')??'');if(!p)throw new InputError('Video not found.',404);
  if(kind==='preview')video=previewVideo(p);
  else if(kind==='lesson'||kind==='prep'){const u=await user();await requireAccess(u.userId,p.id);const lesson=url.searchParams.get('lesson')??'';if(kind==='lesson'&&!/^\d{1,2}$/.test(lesson))throw new InputError('Choose a lesson.',400);video=kind==='prep'?prepVideo(p):lessonVideo(p,Number(lesson));}
  else throw new InputError('Choose a valid video.',400);
 }
 if(!video)throw new InputError('This resource has no video for that lesson.',404);
 return streamPlaceholder(req,video);
}
