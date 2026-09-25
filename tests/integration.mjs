import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin='http://127.0.0.1:8787',run=crypto.randomUUID(),adult='qa-'+run,other='other-'+run;const results=[];
async function request(path,{who=adult,data,method,headers={},raw}={}){return fetch(origin+'/api/'+path,{method:method??(data!==undefined||raw!==undefined?'POST':'GET'),headers:{...(who?{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.test'}:{}),...(data!==undefined||raw!==undefined?{'Content-Type':'application/json',Origin:origin}:{}),...headers},body:raw??(data!==undefined?JSON.stringify(data):undefined)});}
async function check(name,fn){try{await fn();results.push({name,result:'PASS'});console.log('PASS '+name)}catch(e){results.push({name,result:'FAIL',error:e.message});console.error('FAIL '+name+': '+e.message)}}
async function post(action,data,expected=200,who=adult){const r=await request(action,{data,who});assert.equal(r.status,expected,await r.clone().text());return r.json()}
async function state(who=adult){return(await request('state',{who})).json()}
await check('Anonymous state and download blocked',async()=>{assert.equal((await request('state',{who:null})).status,401);assert.equal((await request('download?id=wind-powered-car',{who:null})).status,401)});
await check('New account has empty cart and library',async()=>{const s=await state();assert.deepEqual(s.cart,[]);assert.deepEqual(s.owned,[])});
await check('Unknown product rejected',()=>post('cart',{id:'../secrets',operation:'add'},400));
await check('Invalid cart action rejected',()=>post('cart',{id:'wind-powered-car',operation:'delete-all'},400));
await check('Null JSON rejected with 400',async()=>assert.equal((await request('cart',{raw:'null'})).status,400));
await check('Array JSON rejected with 400',async()=>assert.equal((await request('cart',{raw:'[]'})).status,400));
await check('Malformed JSON rejected with 400',async()=>assert.equal((await request('cart',{raw:'{'})).status,400));
await check('Wrong content type rejected',async()=>assert.equal((await request('cart',{raw:'{}',headers:{'Content-Type':'text/plain'}})).status,415));
await check('Oversized JSON rejected',async()=>assert.equal((await request('cart',{data:{x:'a'.repeat(17000)}})).status,413));
await check('Cross-origin mutation rejected',async()=>assert.equal((await request('cart',{data:{id:'wind-powered-car',operation:'add'},headers:{Origin:'https://evil.example'}})).status,403));
await check('Empty checkout rejected',()=>post('checkout',{mode:'demo',key:crypto.randomUUID()},400));
await check('Add to cart persists',async()=>{await post('cart',{id:'wind-powered-car',operation:'add'});assert.deepEqual((await state()).cart,['wind-powered-car'])});
await check('Concurrent duplicate additions stay unique',async()=>{await Promise.all(Array.from({length:5},()=>post('cart',{id:'wind-powered-car',operation:'add'})));assert.equal((await state()).cart.length,1)});
await check('Remove last item creates empty cart',async()=>{await post('cart',{id:'wind-powered-car',operation:'remove'});assert.deepEqual((await state()).cart,[])});
await check('Concurrent distinct additions preserve both items',async()=>{await Promise.all(['wind-powered-car','paper-circuits'].map(id=>post('cart',{id,operation:'add'})));assert.equal((await state()).cart.length,2)});
await check('Downloads blocked before purchase',async()=>assert.equal((await request('download?id=wind-powered-car')).status,403));
await check('Unconfigured Stripe checkout fails safely',()=>post('checkout',{mode:'stripe-test',key:crypto.randomUUID()},503));
const orderKey=crypto.randomUUID();
await check('Demo checkout ignores browser price and grants catalog items',async()=>{await post('checkout',{mode:'demo',key:orderKey,total:1,items:['robot-rescue']});const s=await state();assert.equal(s.orders[0].total,5800);assert.equal(s.orders[0].mode,'demo');assert.equal(s.owned.length,2);assert.equal(s.cart.length,0);assert.ok(!s.owned.some(p=>p.product_id==='robot-rescue'))});
await check('Repeated and concurrent checkout retries are idempotent',async()=>{await Promise.all(Array.from({length:4},()=>post('checkout',{mode:'demo',key:orderKey})));assert.equal((await state()).orders.filter(o=>o.status==='complete').length,1);assert.equal((await state()).owned.length,2)});
await check('Changing mode on existing order rejected',()=>post('checkout',{mode:'stripe-test',key:orderKey},409));
await check('Already-owned item cannot be added again',()=>post('cart',{id:'wind-powered-car',operation:'add'},409));
await check('Other account cannot see order or owned items',async()=>{const s=await state(other);assert.equal(s.orders.length,0);assert.equal(s.owned.length,0);assert.equal((await request('download?id=wind-powered-car',{who:other})).status,403)});
await check('Unknown download IDs and formats rejected',async()=>{assert.equal((await request('download?id=../secret')).status,404);assert.equal((await request('download?id=wind-powered-car&kind=secret')).status,400);assert.equal((await request('download?id=wind-powered-car&lang=xx')).status,400)});
await mkdir('work/qa',{recursive:true});
await check('Combined PDF and Spanish worksheet are downloadable',async()=>{for(const lang of ['en','es']){const r=await request('download?id=wind-powered-car&lang='+lang);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('content-type'),/application\/pdf/);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(0,8).toString(),'%PDF-1.4');await writeFile('work/qa/bundle-'+lang+'.pdf',bytes)}});
await check('Materials CSV includes product supplies',async()=>{const r=await request('download?id=wind-powered-car&kind=supplies');assert.equal(r.status,200);assert.match(await r.text(),/Cardboard/)});
await check('Missing premium video fails closed',async()=>{assert.equal((await request('playback?id=wind-powered-car')).status,503);assert.equal((await request('playback?id=robot-rescue')).status,403)});
await check('Progress rejects out-of-range lessons and wrong types',async()=>{for(const lesson of [-1,10,1.5,'1'])await post('progress',{id:'wind-powered-car',lesson,complete:true},400);await post('progress',{id:'wind-powered-car',lesson:0,complete:'true'},400)});
await check('Progress survives reload and concurrent updates',async()=>{await Promise.all([0,1,2,2].map(lesson=>post('progress',{id:'wind-powered-car',lesson,complete:true})));const p=(await state()).progress.find(p=>p.product_id==='wind-powered-car');assert.deepEqual(JSON.parse(p.completed).sort(),[0,1,2]);await post('progress',{id:'wind-powered-car',lesson:1,complete:false});assert.deepEqual(JSON.parse((await state()).progress[0].completed).sort(),[0,2])});
await check('Progress for unowned curriculum rejected',()=>post('progress',{id:'robot-rescue',lesson:0,complete:true},403));
const form={kind:'quote',name:'QA Facilitator',email:'qa@example.test',role:'camp',organization:'Test STEM Club',sites:2,consent:true,key:crypto.randomUUID()};let quoteId;
await check('Request saves and returns a real draft PDF',async()=>{quoteId=(await post('request',form)).id;const r=await request('quote?id='+encodeURIComponent(quoteId));assert.equal(r.status,200);await writeFile('work/qa/quote.pdf',Buffer.from(await r.arrayBuffer()))});
await check('Other account cannot download private quote',async()=>assert.equal((await request('quote?id='+encodeURIComponent(quoteId),{who:other})).status,404));
await check('Duplicate request is idempotent; changed request rejected',async()=>{assert.equal((await post('request',form)).id,quoteId);await post('request',{...form,sites:3},409);assert.equal((await state()).requests.length,1)});
await check('Bad email and missing adult consent rejected',async()=>{await post('request',{...form,key:crypto.randomUUID(),email:'bad'},400);await post('request',{...form,key:crypto.randomUUID(),consent:false},400)});
await check('Request limit and lost-response retry handled',async()=>{for(let i=0;i<9;i++)await post('request',{...form,key:crypto.randomUUID()});await post('request',{...form,key:crypto.randomUUID()},429);assert.equal((await post('request',form)).id,quoteId)});
await check('Forged webhook rejected',async()=>assert.equal((await request('stripe-webhook',{data:{type:'checkout.session.completed',livemode:false}})).status,400));
await check('Forged checkout return cannot unlock content',async()=>{await post('verify-checkout',{sessionId:'cs_test_fake'},404);assert.equal((await state()).owned.length,2)});
await check('Unknown API and curriculum routes return 404',async()=>{assert.equal((await request('does-not-exist')).status,404);assert.equal((await fetch(origin+'/course/does-not-exist')).status,404);assert.equal((await fetch(origin+'/curriculum/does-not-exist')).status,404)});
await writeFile('work/qa/integration-results.json',JSON.stringify({run,results},null,2));console.log(`${results.filter(x=>x.result==='PASS').length}/${results.length} integration checks passed`);if(results.some(x=>x.result==='FAIL'))process.exitCode=1;
