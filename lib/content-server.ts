import {env} from 'cloudflare:workers';
import {db,settings} from './server';
import {contentService} from './content.mjs';
import {products as seeds,Product} from './catalog';
import {InputError} from './core.mjs';
export const content=()=>contentService({db:db(),settings:settings()});
export function bucket(){if(!env.BUCKET)throw new InputError('File storage is temporarily unavailable.',503);return env.BUCKET;}
export async function catalog(archived=false):Promise<Product[]>{return [...seeds,...await content().catalog(archived)] as Product[];}
export async function product(id:string,archived=false){return (await catalog(archived)).find(p=>p.id===id);}
export async function premiumAccess(userId:string,id:string){const individual=await db().prepare("SELECT mode FROM entitlements WHERE user_id=? AND product_id=? AND mode!='demo'").bind(userId,id).first();if(individual)return true;const {schoolService}=await import('./server');const {schoolAccess}=await import('./school-billing.mjs');if((await schoolService().accessSchools(userId)).some(s=>schoolAccess(s)))return true;const p=await product(id,true);const time=Date.now();const pass=await db().prepare("SELECT l.id FROM licenses l JOIN school_members m ON m.school_id=l.school_id WHERE m.user_id=? AND l.status='paid' AND l.starts_at<=? AND l.ends_at>? AND (l.scope='all' OR l.scope=? OR l.scope=?) LIMIT 1").bind(userId,time,time,id,'subject:'+p?.subject).first();return !!pass;}
export async function coursePermission(u:any,id:string,preview=false){
 const row=await db().prepare('SELECT * FROM content_courses WHERE id=?').bind(id).first<any>();if(!row)throw new InputError('Curriculum not found.',404);
 if(preview){await content().owned(u,id);const data=JSON.parse(row.draft);if(!Array.isArray(data.steps)||!data.steps.length)throw new InputError('Save a complete draft in Curriculum studio before opening its preview.',409);return {row,data,preview:true};}
 if(!row.published)throw new InputError('This curriculum has not been published.',404);const data=JSON.parse(row.published);
 if(!data.sample&&!await premiumAccess(u.userId,id))throw new InputError('A paid test license is required for this premium curriculum. Demo checkout unlocks samples only.',403);
 return {row,data,preview:false};
}
export async function courseAssets(row:any,preview=false){const rows=(await db().prepare("SELECT * FROM content_assets WHERE course_id=? AND status='ready' ORDER BY created_at").bind(row.id).all<any>()).results;const ids=JSON.parse(row.published_assets??'[]');return rows.filter(a=>preview||ids.includes(a.id));}
