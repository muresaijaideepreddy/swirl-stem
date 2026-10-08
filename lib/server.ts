import {individualBilling} from './individual-billing.mjs';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {InputError,assertTestKey,isPayableSession} from './core.mjs';
import {catalog,product,premiumAccess} from './content-server';
import {schoolBilling,schoolAccess} from './school-billing.mjs';
export function db(){if(!env.DB)throw new InputError('Your classroom is temporarily unavailable. Please try again shortly.',503);return env.DB;}
export function settings(){return env as unknown as Record<string,string>}
export async function user(){const u=await getChatGPTUser();if(!u)throw new InputError('Sign in to continue.',401);return u;}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
export async function body(req:Request,rawInput?:string){if(!req.headers.get('content-type')?.includes('application/json'))throw new InputError('Send JSON data.',415);const raw=rawInput??await req.text();if(raw.length>16000)throw new InputError('The request is too large.',413);let parsed;try{parsed=JSON.parse(raw)}catch{throw new InputError('The request could not be read.');}if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new InputError('Expected a JSON object.');return parsed;}
export function failure(e:unknown){if(e instanceof InputError)return json({error:e.message},e.status);console.error('Request failed',e instanceof Error?e.message:'Unknown error');return json({error:'Something went wrong. Your request was not confirmed. Please try again.'},503);}
export async function stripe(path:string,form?:URLSearchParams,key?:string){const secret=settings().STRIPE_SECRET_KEY;assertTestKey(secret);const response=await fetch('https://api.stripe.com/v1/'+path,{method:form?'POST':'GET',headers:{Authorization:'Bearer '+secret,'Stripe-Version':'2025-03-31.basil',...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},body:form?.toString(),signal:AbortSignal.timeout(15000)});if(!response.ok)throw new InputError('Stripe test billing is unavailable. Please retry before starting another payment.',502);return response.json() as Promise<any>;}
export function schoolService(){return schoolBilling({db:db(),stripe,settings:settings()})}
export function individualService(){return individualBilling({db:db(),stripe,settings:settings(),catalog})}
export async function requireAccess(userId:string,id:string){const p=await product(id,true);if(!p)throw new InputError('Curriculum not found.',404);if(await premiumAccess(userId,id))return {mode:'school-or-purchase-test'};const entitlement=await db().prepare('SELECT * FROM entitlements WHERE user_id = ? AND product_id = ?').bind(userId,id).first<any>();if(entitlement&&(!p.custom||p.sample))return entitlement;if(p.custom&&p.sample)return {mode:'sample'};throw new InputError('Add this resource to your classroom or ask your director to check the school subscription.',403);}
