import {auth,localTestAuth,json,db} from './server';
import {InputError,assertSameOrigin,textField} from './core.mjs';
import {STATE_COOKIE,clearCookie,safeReturnPath,sha256} from './google-auth.mjs';
// Read (and bound) request bodies before any early rejection: an unread body on a reused connection breaks the next request.
async function readBounded(req:Request,limit:number){const reader=req.body?.getReader();if(!reader)return '';const chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new InputError('The message is too long.',413)}chunks.push(value)}}finally{reader.releaseLock()}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}return new TextDecoder().decode(bytes);}
function redirect(location:string,cookies:string[]=[]){const headers=new Headers({Location:location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});for(const c of cookies)headers.append('Set-Cookie',c);return new Response(null,{status:302,headers});}
// Callback failures go back to /signin with a fixed code so the page never echoes attacker-supplied text.
const errorCode=(e:unknown)=>e instanceof InputError?(e.status===403?'email':e.status===503?'config':/canceled/.test(e.message)?'canceled':'retry'):'retry';
export async function authRoute(req:Request):Promise<Response|null>{
 const url=new URL(req.url),action=url.pathname.slice(5);
 if(action==='auth/google'&&req.method==='GET'){
  const returnTo=safeReturnPath(url.searchParams.get('return_to')??'/library'),service=auth();
  // Local development without Google credentials falls back to the Sites dev sign-in.
  if(!service.configured()&&localTestAuth(req.headers.get('host')))return redirect('/signin-with-chatgpt?return_to='+encodeURIComponent(returnTo));
  try{const r=await service.start(returnTo);return redirect(r.location,r.cookies);}catch(e){return redirect('/signin?error='+errorCode(e));}
 }
 if(action==='auth/callback'&&req.method==='GET'){
  try{const r=await auth().callback(url.searchParams,req.headers.get('cookie'));return redirect(r.location,r.cookies);}
  catch(e){if(!(e instanceof InputError))console.error('Google sign-in failed',e instanceof Error?e.message:'unknown');return redirect('/signin?error='+errorCode(e),[clearCookie(STATE_COOKIE)]);}
 }
 if(action==='auth/signout'&&req.method==='POST'){
  await readBounded(req,1000);assertSameOrigin(req);const r=await auth().signOut(req.headers.get('cookie')),response=json({signedOut:true});for(const c of r.cookies)response.headers.append('Set-Cookie',c);return response;
 }
 if(action==='contact'&&req.method==='POST'){
  const raw=await readBounded(req,8000);assertSameOrigin(req);if(!req.headers.get('content-type')?.includes('application/json'))throw new InputError('Send JSON data.',415);
  let b:any;try{b=JSON.parse(raw)}catch{throw new InputError('The message could not be read.')}
  if(!b||typeof b!=='object'||Array.isArray(b))throw new InputError('Expected a JSON object.');
  const name=textField(b.name,'Name',100),email=textField(b.email,'Email',254).toLowerCase(),organization=textField(b.organization??'','Organization',160,false),message=textField(b.message,'Message',3000);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new InputError('Enter a valid email address.');
  const topics=['General question','Licensing & pricing','Refunds & billing','Curriculum feedback','Privacy & my data','Technical help'];if(!topics.includes(b.topic))throw new InputError('Choose a topic.');if(b.consent!==true)throw new InputError('Please confirm that you are an adult and agree to us storing this message.');
  const ipHash=await sha256((req.headers.get('cf-connecting-ip')??'local')+':'+Math.floor(Date.now()/86400000)),recent=await db().prepare('SELECT count(*) AS n FROM contact_messages WHERE ip_hash=? AND created_at>?').bind(ipHash,Date.now()-3600000).first<any>();
  if(recent?.n>=5)throw new InputError('Please wait an hour before sending another message.',429);
  await db().prepare('INSERT INTO contact_messages(id,ip_hash,data,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),ipHash,JSON.stringify({kind:'contact',name,email,organization,role:b.topic,notes:message}),Date.now()).run();
  return json({sent:true,message:'Message received. The SwIRL team will get back to you by email.'});
 }
 return null;
}
