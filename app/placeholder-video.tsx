'use client';
import {useState} from 'react';
import {duration,placeholderPoster,placeholderSource} from '@/lib/placeholder-videos.mjs';
type Video={nasaId:string;title:string;seconds:number};
// Plays a NASA placeholder through /api/lesson-video. Nothing downloads until the viewer presses play.
export function PlaceholderVideo({video,src,note,gated=false}:{video:Video|null;src:string;note:string;gated?:boolean}){
 const [failed,setFailed]=useState('');
 if(!video)return null;
 return <figure className="placeholder-video">
  <video key={src} src={src} poster={placeholderPoster(video)} preload="none" controls playsInline controlsList="nodownload" onContextMenu={e=>e.preventDefault()} onPlay={()=>setFailed('')} onError={()=>setFailed(src)} aria-label={video.title}/>
  {failed===src&&<p className="error" role="alert">{gated?'This video could not play. Check that you are signed in and this resource is in your classroom, then try again.':'This video could not play right now. Please try again shortly.'}</p>}
  <figcaption>{note} · Video: <a href={placeholderSource(video)} target="_blank" rel="noreferrer">NASA, “{video.title}”</a> ({duration(video.seconds)}, public domain. NASA does not endorse SwIRL.)</figcaption>
 </figure>;
}
