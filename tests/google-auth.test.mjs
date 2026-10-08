import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {googleAuth,verifyIdClaims,safeReturnPath,parseCookies,pkceChallenge,SESSION_COOKIE,STATE_COOKIE} from '../lib/google-auth.mjs';

const clientId='123-abc.apps.googleusercontent.com',settings={GOOGLE_CLIENT_ID:clientId,GOOGLE_CLIENT_SECRET:'secret-value-123',SITE_ORIGIN:'https://swirl.example'};
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const idToken=claims=>b64({alg:'RS256'})+'.'+b64(claims)+'.signature';
function claims(nonce,extra={}){const now=Math.floor(Date.now()/1000);return {iss:'https://accounts.google.com',aud:clientId,sub:'1098765432101234567',email:'Director@Example.org',email_verified:true,name:'Dana Director',iat:now,exp:now+3600,nonce,...extra};}
function harness(options={}){
 const sql=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
 const db={prepare(text){return {bind(...args){return {async first(){return sql.prepare(text).get(...args)??null},async all(){return {results:sql.prepare(text).all(...args)}},async run(){return {meta:{changes:sql.prepare(text).run(...args).changes}}},exec(){return sql.prepare(text).run(...args)}}}}},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>s.exec());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
 const calls=[];let time=Date.now(),reply=options.reply;
 const fetcher=async(url,init)=>{calls.push({url,body:new URLSearchParams(init.body)});return reply?reply(calls.at(-1)):new Response(JSON.stringify({id_token:idToken(claims(options.nonce??lastNonce))}),{status:200})};
 let lastNonce='';
 const service=googleAuth({db,settings:{...settings,...options.settings},fetcher,now:()=>time});
 return {sql,calls,service,setTime:t=>{time=t},get time(){return time},captureNonce(){lastNonce=sql.prepare('SELECT nonce FROM auth_states').get()?.nonce},setReply:r=>{reply=r}};
}
async function signIn(h,returnTo='/library'){const start=await h.service.start(returnTo);const url=new URL(start.location),state=url.searchParams.get('state');h.captureNonce();return {start,url,state,cookie:STATE_COOKIE+'='+state};}

test('Return paths stay on this site and away from the API',()=>{
 for(const [input,out] of [['/library','/library'],['/course/x?y=1#z','/course/x?y=1#z'],['//evil.example','/library'],['https://evil.example','/library'],['/api/auth/google','/library'],['/\\evil','/library'],[null,'/library'],['library','/library']])assert.equal(safeReturnPath(input),out,String(input));
 assert.deepEqual(parseCookies('a=1; b=two; a=3'),{a:'1',b:'two'});
});

test('ID token claims are checked strictly',()=>{
 const ok=verifyIdClaims(idToken(claims('n1')),{clientId,nonce:'n1'});assert.deepEqual(ok,{userId:'g_1098765432101234567',email:'director@example.org',displayName:'Dana Director',fullName:'Dana Director'});
 const bad=[{aud:'other.apps.googleusercontent.com'},{iss:'https://evil.example'},{exp:Math.floor(Date.now()/1000)-600},{nonce:'other'},{sub:'../x'},{iat:Math.floor(Date.now()/1000)+3600}];
 for(const change of bad)assert.throws(()=>verifyIdClaims(idToken({...claims('n1'),...change}),{clientId,nonce:'n1'}),e=>e.status===401,JSON.stringify(change));
 assert.throws(()=>verifyIdClaims(idToken(claims('n1',{email_verified:false})),{clientId,nonce:'n1'}),e=>e.status===403);
 assert.throws(()=>verifyIdClaims('not-a-jwt',{clientId,nonce:'n1'}),e=>e.status===502);
});

test('Start redirects to Google with PKCE, state and nonce, and stores only hashed state',async()=>{
 const h=harness(),{start,url,state}=await signIn(h,'/school');
 assert.equal(url.origin+url.pathname,'https://accounts.google.com/o/oauth2/v2/auth');
 for(const [k,v] of Object.entries({client_id:clientId,redirect_uri:'https://swirl.example/api/auth/callback',response_type:'code',scope:'openid email profile',code_challenge_method:'S256'}))assert.equal(url.searchParams.get(k),v,k);
 assert.ok(url.searchParams.get('nonce')&&url.searchParams.get('code_challenge'));assert.match(start.cookies[0],/^__Host-swirl_oauth=.+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
 const row=h.sql.prepare('SELECT * FROM auth_states').get();assert.notEqual(row.state_hash,state);assert.equal(row.return_to,'/school');assert.equal(await pkceChallenge(row.verifier),url.searchParams.get('code_challenge'));
});

test('Callback exchanges the code once and creates a hashed session',async()=>{
 const h=harness(),{state,cookie}=await signIn(h,'/cart');
 const result=await h.service.callback(new URLSearchParams({state,code:'auth-code'}),cookie);
 assert.equal(result.location,'/cart');assert.equal(result.user.userId,'g_1098765432101234567');
 const sent=h.calls[0].body;assert.equal(h.calls[0].url,'https://oauth2.googleapis.com/token');assert.equal(sent.get('code'),'auth-code');assert.equal(sent.get('grant_type'),'authorization_code');assert.equal(sent.get('redirect_uri'),'https://swirl.example/api/auth/callback');assert.ok(sent.get('code_verifier'));
 const sessionCookie=result.cookies.find(c=>c.startsWith(SESSION_COOKIE+'='));assert.match(sessionCookie,/HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
 const token=sessionCookie.split(';')[0].split('=')[1];assert.equal(h.sql.prepare('SELECT count(*) n FROM auth_sessions WHERE token_hash=?').get(token).n,0,'raw token is never stored');
 assert.deepEqual(await h.service.session(SESSION_COOKIE+'='+token),{userId:'g_1098765432101234567',email:'director@example.org',displayName:'Dana Director',fullName:'Dana Director'});
 await assert.rejects(h.service.callback(new URLSearchParams({state,code:'auth-code'}),cookie),e=>e.status===400,'state is single use');
 assert.equal(h.sql.prepare('SELECT count(*) n FROM auth_states').get().n,0);
});

test('Callback rejects missing or mismatched state, cancellations and expired attempts',async()=>{
 const h=harness(),{state,cookie}=await signIn(h);
 await assert.rejects(h.service.callback(new URLSearchParams({state,code:'c'}),STATE_COOKIE+'=other'),e=>e.status===400);
 await assert.rejects(h.service.callback(new URLSearchParams({state,code:'c'}),''),e=>e.status===400);
 await assert.rejects(h.service.callback(new URLSearchParams({error:'access_denied',state}),cookie),/canceled/);
 h.setTime(h.time+11*60*1000);await assert.rejects(h.service.callback(new URLSearchParams({state,code:'c'}),cookie),e=>e.status===400);
 assert.equal(h.calls.length,0,'Google is never called for a rejected callback');
});

test('Token endpoint failures and unverified accounts create no session',async()=>{
 const h=harness();let attempt=await signIn(h);h.setReply(()=>new Response('{"error":"invalid_grant"}',{status:400}));
 await assert.rejects(h.service.callback(new URLSearchParams({state:attempt.state,code:'c'}),attempt.cookie),e=>e.status===502);
 attempt=await signIn(h);const nonce=h.sql.prepare('SELECT nonce FROM auth_states').get().nonce;h.setReply(()=>new Response(JSON.stringify({id_token:idToken(claims(nonce,{email_verified:false}))})));
 await assert.rejects(h.service.callback(new URLSearchParams({state:attempt.state,code:'c'}),attempt.cookie),e=>e.status===403);
 attempt=await signIn(h);h.setReply(()=>{throw new TypeError('network')});
 await assert.rejects(h.service.callback(new URLSearchParams({state:attempt.state,code:'c'}),attempt.cookie),e=>e.status===502);
 assert.equal(h.sql.prepare('SELECT count(*) n FROM auth_sessions').get().n,0);
});

test('Sessions expire, sign-out revokes them, and forged cookies are ignored',async()=>{
 const h=harness(),{state,cookie}=await signIn(h),result=await h.service.callback(new URLSearchParams({state,code:'c'}),cookie);
 const session=result.cookies.find(c=>c.startsWith(SESSION_COOKIE)).split(';')[0];
 assert.ok(await h.service.session(session));assert.equal(await h.service.session(SESSION_COOKIE+'=forged'),null);assert.equal(await h.service.session(SESSION_COOKIE+'='+'a'.repeat(43)),null);assert.equal(await h.service.session(''),null);
 const out=await h.service.signOut(session);assert.match(out.cookies[0],/^__Host-swirl_session=; .*Max-Age=0$/);assert.equal(await h.service.session(session),null);
 const again=await signIn(h),second=await h.service.callback(new URLSearchParams({state:again.state,code:'c'}),again.cookie),cookie2=second.cookies.find(c=>c.startsWith(SESSION_COOKIE)).split(';')[0];
 h.setTime(h.time+31*24*3600*1000);assert.equal(await h.service.session(cookie2),null);
});

test('Sign-in refuses to start without credentials or an https site origin',async()=>{
 await assert.rejects(harness({settings:{GOOGLE_CLIENT_ID:''}}).service.start('/'),e=>e.status===503);
 await assert.rejects(harness({settings:{GOOGLE_CLIENT_ID:'not-a-google-client'}}).service.start('/'),e=>e.status===503);
 await assert.rejects(harness({settings:{SITE_ORIGIN:'http://swirl.example'}}).service.start('/'),e=>e.status===503);
 await assert.rejects(harness({settings:{SITE_ORIGIN:'https://swirl.example/path'}}).service.start('/'),e=>e.status===503);
 assert.equal(harness().service.configured(),true);assert.equal(harness({settings:{GOOGLE_CLIENT_SECRET:''}}).service.configured(),false);
});
