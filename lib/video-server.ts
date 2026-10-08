import {bucket,content,courseAssets,coursePermission} from './content-server';
import {db,user} from './server';
import {InputError} from './core.mjs';
import {storageVideo} from './storage-video.mjs';
import {videoRange} from './mp4.mjs';
export const storedVideo=()=>storageVideo({db:db(),bucket:bucket(),content:content()});
export async function validateIntroduction(id:string){
 const row=await db().prepare("SELECT * FROM content_courses WHERE id=? AND published IS NOT NULL AND status!='archive'").bind(id).first<any>();
 if(!row||!JSON.parse(row.published).sample)throw new InputError('Choose a published sample curriculum for the introduction.',400);
 const asset=(await courseAssets(row)).filter(a=>a.kind==='preview'&&(a.playback_id||(a.storage_key&&a.mime==='video/mp4'))).at(-1);
 if(!asset)throw new InputError('Upload and publish a ready preview video before choosing this introduction.',400);return {row,asset};
}
export async function videoStream(req:Request){
 const url=new URL(req.url);let row:any,asset:any;
 if(url.searchParams.get('intro')==='1'){
  const config=JSON.parse((await db().prepare("SELECT data FROM site_content WHERE id='public'").first<any>())?.data??'{}');({row,asset}=await validateIntroduction(config.introCourse??''));
  if(asset.id!==url.searchParams.get('assetId'))throw new InputError('Introduction changed. Reload it.',404);
 }else{
  const u=await user(),permission=await coursePermission(u,url.searchParams.get('courseId')??'',url.searchParams.get('preview')==='1');row=permission.row;
  asset=(await courseAssets(row,permission.preview)).find(a=>a.id===url.searchParams.get('assetId'));
 }
 if(!asset||asset.mime!=='video/mp4'||!['video','prep','preview'].includes(asset.kind)||!asset.storage_key)throw new InputError('Video not found.',404);
 const object=await bucket().head(asset.storage_key);if(!object)throw new InputError('Video not found.',404);
 const headers=new Headers({'Content-Type':'video/mp4','Content-Disposition':'inline','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','ETag':object.httpEtag,'Referrer-Policy':'no-referrer'});
 const ifRange=req.headers.get('if-range');let range;try{range=videoRange(ifRange&&ifRange!==object.httpEtag?null:req.headers.get('range'),object.size);}catch{headers.set('Content-Range','bytes */'+object.size);return new Response(null,{status:416,headers});}
 headers.set('Content-Length',String(range?.length??object.size));if(range)headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${object.size}`);
 if(req.method==='HEAD')return new Response(null,{status:range?206:200,headers});const file=await bucket().get(asset.storage_key,range?{range}:undefined);if(!file)throw new InputError('Video unavailable.',404);return new Response(file.body,{status:range?206:200,headers});
}
