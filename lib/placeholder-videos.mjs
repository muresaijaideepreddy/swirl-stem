import {InputError} from './core.mjs';
// Public-domain NASA education videos that stand in for SwIRL recordings until the real lesson videos are supplied.
// Lesson videos are streamed same-origin by /api/lesson-video after an access check; browsers never get a reusable upstream link.
const v=(nasaId,title,seconds)=>({nasaId,title,seconds});
export const placeholderVideos={
 biology:[v('jsc2021m000207-STEMonstrations_Five_Senses_social','STEMonstration: Five Senses',254),v('jsc2023m000208-STEMonstrations_Physical_and_Chemical_Changes_social','STEMonstrations: Physical and Chemical Changes',220),v('248_SpaceGardening','ScienceCasts: Space Gardening',268),v('jsc2023m000117-STEMonstrations_Properties_of_Water_social','STEMonstrations: Properties of Water',351),v('jsc2023m000159-STEMonstrations_Photosynthesis','STEMonstrations: Photosynthesis',267),v('jsc2024m000187-STEMonstrations_Chemistry_in_Space_1080_MP4','STEMonstrations: Chemistry in Space',495)],
 physics:[v('GRC-2020-CM-0138','NASA Engineering Design Challenge: Safe Travels',265),v('NHQ_2020_0427_How to Make Demo-2 Straw Rockets','How to Make a Demo-2 Straw Rocket',79),v('GRC-2020-CM-0140','NASA Engineering Design Challenge: Parachuting Onto Mars',285),v('jsc2018m000904-STEMonstrations_Engineering_Design_Trusses_MP4','STEMonstrations: Engineering Design - Trusses',264),v('GRC-2020-CM-0142','NASA Engineering Design Challenge: Let It Glide',238),v('jsc2024m000115-STEMonstrations_Momentum_and_Impulse_social','STEMonstrations: Momentum and Impulse',306),v('GRC-2020-CM-0150','NASA Engineering Design Challenge: Packing Up for the Moon',270)],
 electronics:[v('jsc2018m000903-STEMonstrations_Solar_Energy_MP4','STEMonstrations: Solar Energy',150),v('313_ISS_iROSA','ScienceCasts: The Power of the Station’s New Solar Arrays',88),v('jsc2024m000104-STEMonstrations_Thermal_Energy_Transfer_social','STEMonstrations: Thermal Energy Transfer',257)],
 robotics:[v('Do Robots Help Humans in Space_ - Horizontal Video','Do Robots Help Humans in Space?',100),v('ARC-20190417-AAV3189-AstrobeeLaunch-Shareable-NASAWeb','NASA’s New Flying Robots Will Be Busy Bees',89),v('ROVER CHALLENGE-VOY_UHD-H264','NASA Human Exploration Rover Challenge',125),v('JPL-20240508-EELSf-0002-Testing Out JPLs New Snake Robot','Testing Out JPL’s New Snake Robot',125)],
 coding:[v('Computer Science at NASA_2','Hack Into Computer Science With NASA',341),v('jsc2022m000064-STEMonstrations_Area_and_Volume','STEMonstrations: Area and Volume',249)],
};
export const introPlaceholder=v('jsc2022m000162-STEMonstrations_Engineering_Design_Process_social','STEMonstrations: Engineering Design Process',325);
export const VIDEO_FORMATS=['Complete course','Video lessons'];
const asset=video=>'https://images-assets.nasa.gov/video/'+encodeURIComponent(video.nasaId)+'/'+encodeURIComponent(video.nasaId);
export const placeholderUpstream=video=>asset(video)+'~mobile.mp4';
export const placeholderPoster=video=>asset(video)+'~medium.jpg';
export const placeholderSource=video=>'https://images.nasa.gov/details/'+encodeURIComponent(video.nasaId);
export const duration=seconds=>Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
const list=subject=>Object.hasOwn(placeholderVideos,subject)?placeholderVideos[subject]:placeholderVideos.physics;
const offset=id=>[...String(id)].reduce((sum,c)=>sum+c.charCodeAt(0),0);
export const hasLessonVideos=p=>VIDEO_FORMATS.includes(p.format);
export const hasPrepVideo=p=>p.format!=='Materials list';
export function lessonVideo(p,lesson){if(!hasLessonVideos(p)||!Number.isInteger(lesson)||lesson<0||lesson>=p.lessons.length)return null;const videos=list(p.subject);return videos[(offset(p.id)+lesson)%videos.length];}
export function prepVideo(p){return hasPrepVideo(p)?[...list(p.subject)].sort((a,b)=>a.seconds-b.seconds)[0]:null;}
export const previewVideo=p=>lessonVideo(p,0)??list(p.subject)[0];
export const streamPreview=subject=>list(subject)[0];
// Relay one byte range from the fixed upstream. Only the status, length and range headers are forwarded.
export async function streamPlaceholder(request,video,fetcher=fetch){
 const headers=new Headers({'Content-Type':'video/mp4','Content-Disposition':'inline','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Referrer-Policy':'no-referrer'}),range=request.headers.get('range');
 if(range!==null&&!/^bytes=(\d+-\d*|-\d+)$/.test(range))return new Response(null,{status:416,headers});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);let upstream;
 try{upstream=await fetcher(placeholderUpstream(video),{method:request.method==='HEAD'?'HEAD':'GET',headers:range?{Range:range}:{},signal:controller.signal});}catch{throw new InputError('The video service did not respond. Please try again.',502);}finally{clearTimeout(timer);}
 if(upstream.status===416){await upstream.body?.cancel();const total=upstream.headers.get('content-range');if(total)headers.set('Content-Range',total);return new Response(null,{status:416,headers});}
 if(![200,206].includes(upstream.status)||!upstream.headers.get('content-type')?.startsWith('video/mp4')){await upstream.body?.cancel();throw new InputError('This video is temporarily unavailable. Please try again shortly.',502);}
 for(const name of ['content-length','content-range'])if(upstream.headers.get(name))headers.set(name,upstream.headers.get(name));
 return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers});
}
