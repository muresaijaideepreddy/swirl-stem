import {InputError} from './core.mjs';
// Google sign-in (OpenID Connect authorization code flow with PKCE, state and nonce).
// Sessions are random tokens stored only as SHA-256 hashes; the browser holds the token in an HttpOnly cookie.
export const SESSION_COOKIE='__Host-swirl_session';
export const STATE_COOKIE='__Host-swirl_oauth';
const SESSION_TTL=30*24*3600*1000,STATE_TTL=10*60*1000;
const AUTHORIZE='https://accounts.google.com/o/oauth2/v2/auth',TOKEN='https://oauth2.googleapis.com/token';
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export const randomToken=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
export async function sha256(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function pkceChallenge(verifier){return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));}
export function parseCookies(header){const out={};for(const part of String(header??'').split(';')){const i=part.indexOf('=');if(i<1)continue;const name=part.slice(0,i).trim();if(!(name in out))out[name]=part.slice(i+1).trim();}return out;}
export function safeReturnPath(value){
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return '/library';
 let url;try{url=new URL(value,'https://app.local')}catch{return '/library'}
 if(url.origin!=='https://app.local'||url.pathname.startsWith('/api/'))return '/library';
 return url.pathname+url.search+url.hash;
}
const cookie=(name,value,maxAge)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export const clearCookie=name=>cookie(name,'',0);
function decodeJwtPayload(token){const parts=String(token??'').split('.');if(parts.length!==3)throw new InputError('Google returned an invalid sign-in token.',502);try{return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(parts[1].replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))))}catch{throw new InputError('Google returned an invalid sign-in token.',502)}}
// The ID token comes straight from Google's token endpoint over TLS, so OpenID Connect allows claim checks without re-verifying the signature.
export function verifyIdClaims(idToken,{clientId,nonce,now=Date.now()}){
 const c=decodeJwtPayload(idToken),seconds=Math.floor(now/1000);
 if(!['https://accounts.google.com','accounts.google.com'].includes(c.iss)||c.aud!==clientId||typeof c.sub!=='string'||!/^[0-9A-Za-z_-]{1,255}$/.test(c.sub)||!Number.isInteger(c.exp)||c.exp<seconds-60||!Number.isInteger(c.iat)||c.iat>seconds+300||c.nonce!==nonce)throw new InputError('Google sign-in could not be verified. Please try again.',401);
 if(c.email_verified!==true||typeof c.email!=='string'||!c.email.includes('@'))throw new InputError('Use a Google account with a verified email address.',403);
 return {userId:'g_'+c.sub,email:c.email.toLowerCase(),displayName:typeof c.name==='string'&&c.name.trim()?c.name.trim().slice(0,100):c.email.toLowerCase(),fullName:typeof c.name==='string'?c.name.slice(0,100):null};
}
export function googleAuth({db,settings,fetcher=fetch,now=()=>Date.now()}){
 const q=(sql,...args)=>db.prepare(sql).bind(...args);
 const clientId=settings.GOOGLE_CLIENT_ID,secret=settings.GOOGLE_CLIENT_SECRET;
 const configured=()=>typeof clientId==='string'&&/\.apps\.googleusercontent\.com$/.test(clientId)&&typeof secret==='string'&&secret.length>=10;
 // Plain http is accepted only for a localhost origin in local test mode, so Google sign-in can be tried before deploying.
 function redirectUri(){let origin;try{origin=new URL(settings.SITE_ORIGIN)}catch{}const local=settings.LOCAL_TEST_AUTH==='true'&&origin?.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname);if(!origin||(origin.protocol!=='https:'&&!local)||origin.origin!==settings.SITE_ORIGIN)throw new InputError('Sign-in is not configured: set SITE_ORIGIN to the site’s https origin.',503);return origin.origin+'/api/auth/callback';}
 async function start(returnTo){
  if(!configured())throw new InputError('Google sign-in is not configured yet.',503);
  const state=randomToken(),verifier=randomToken(),nonce=randomToken(),time=now();
  await db.batch([q('DELETE FROM auth_states WHERE expires_at<?',time),q('INSERT INTO auth_states(state_hash,verifier,nonce,return_to,expires_at) VALUES(?,?,?,?,?)',await sha256(state),verifier,nonce,safeReturnPath(returnTo),time+STATE_TTL)]);
  const url=new URL(AUTHORIZE);for(const [k,v] of Object.entries({client_id:clientId,redirect_uri:redirectUri(),response_type:'code',scope:'openid email profile',state,nonce,code_challenge:await pkceChallenge(verifier),code_challenge_method:'S256',prompt:'select_account'}))url.searchParams.set(k,v);
  return {location:url.href,cookies:[cookie(STATE_COOKIE,state,STATE_TTL/1000)]};
 }
 async function callback(params,cookieHeader){
  const cookies=parseCookies(cookieHeader),state=params.get('state')??'';
  if(params.get('error'))throw new InputError('Google sign-in was canceled.',400);
  if(!state||state!==cookies[STATE_COOKIE])throw new InputError('This sign-in link expired or came from another browser. Please sign in again.',400);
  const hash=await sha256(state),row=await q('SELECT * FROM auth_states WHERE state_hash=?',hash).first();
  if(!row)throw new InputError('This sign-in link was already used or expired. Please sign in again.',400);
  const claimed=await q('DELETE FROM auth_states WHERE state_hash=?',hash).run();
  if(!claimed.meta.changes||row.expires_at<now())throw new InputError('This sign-in link was already used or expired. Please sign in again.',400);
  const code=params.get('code');if(!code||code.length>2048)throw new InputError('Google did not return a sign-in code.',400);
  let response;try{response=await fetcher(TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:clientId,client_secret:secret,redirect_uri:redirectUri(),grant_type:'authorization_code',code_verifier:row.verifier}),signal:AbortSignal.timeout(15000)})}catch{throw new InputError('Google sign-in is temporarily unavailable. Please try again.',502)}
  const tokens=await response.json().catch(()=>({}));if(!response.ok||typeof tokens.id_token!=='string')throw new InputError('Google sign-in could not be completed. Please try again.',502);
  const user=verifyIdClaims(tokens.id_token,{clientId,nonce:row.nonce,now:now()}),session=randomToken(),time=now();
  await q('INSERT INTO auth_sessions(token_hash,user_id,email,name,created_at,expires_at) VALUES(?,?,?,?,?,?)',await sha256(session),user.userId,user.email,user.displayName,time,time+SESSION_TTL).run();
  return {location:row.return_to,cookies:[clearCookie(STATE_COOKIE),cookie(SESSION_COOKIE,session,SESSION_TTL/1000)],user};
 }
 async function session(cookieHeader){
  const token=parseCookies(cookieHeader)[SESSION_COOKIE];if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  const row=await q('SELECT * FROM auth_sessions WHERE token_hash=? AND expires_at>?',await sha256(token),now()).first();
  return row?{userId:row.user_id,email:row.email,displayName:row.name,fullName:row.name}:null;
 }
 async function signOut(cookieHeader){const token=parseCookies(cookieHeader)[SESSION_COOKIE];if(token)await q('DELETE FROM auth_sessions WHERE token_hash=?',await sha256(token)).run();return {cookies:[clearCookie(SESSION_COOKIE)]};}
 return {configured,start,callback,session,signOut};
}
