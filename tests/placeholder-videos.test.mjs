import test from 'node:test';
import assert from 'node:assert/strict';
import {placeholderVideos,introPlaceholder,lessonVideo,prepVideo,previewVideo,streamPreview,hasLessonVideos,placeholderUpstream,placeholderPoster,placeholderSource,duration,streamPlaceholder} from '../lib/placeholder-videos.mjs';

const course={id:'wind-powered-car',subject:'physics',format:'Complete course',lessons:Array.from({length:10},(_,i)=>'Lesson '+i)};
const book={id:'simple-machines-book',subject:'physics',format:'PDF Book',lessons:['a','b']};
const list={id:'supply-planner',subject:'electronics',format:'Materials list',lessons:['a']};

test('Every stream has placeholder videos with stable fixed upstream URLs',()=>{
 for(const subject of ['biology','physics','electronics','robotics','coding']){
  assert.ok(placeholderVideos[subject].length>=2,subject);
  for(const v of placeholderVideos[subject]){
   const url=new URL(placeholderUpstream(v));assert.equal(url.origin,'https://images-assets.nasa.gov');assert.ok(url.pathname.endsWith('~mobile.mp4'));
   assert.equal(new URL(placeholderPoster(v)).origin,'https://images-assets.nasa.gov');assert.equal(new URL(placeholderSource(v)).origin,'https://images.nasa.gov');
   assert.ok(Number.isInteger(v.seconds)&&v.seconds>0);
  }
 }
 assert.match(placeholderUpstream(placeholderVideos.robotics[0]),/Do%20Robots%20Help%20Humans/);
 assert.equal(duration(79),'1:19');assert.equal(duration(325),'5:25');
});

test('Lesson videos exist only for video formats and valid lesson numbers',()=>{
 assert.ok(hasLessonVideos(course));assert.ok(!hasLessonVideos(book));
 for(let i=0;i<10;i++)assert.ok(placeholderVideos.physics.includes(lessonVideo(course,i)));
 for(const bad of [-1,10,1.5,NaN,'1'])assert.equal(lessonVideo(course,bad),null);
 assert.equal(lessonVideo(book,0),null);
 assert.notEqual(lessonVideo(course,0),lessonVideo(course,1),'consecutive lessons use different clips');
});

test('Prep, preview and stream videos fall back sensibly',()=>{
 assert.equal(prepVideo(course).seconds,Math.min(...placeholderVideos.physics.map(v=>v.seconds)));
 assert.equal(prepVideo(list),null);assert.ok(prepVideo(book));
 assert.equal(previewVideo(course),lessonVideo(course,0));assert.equal(previewVideo(book),placeholderVideos.physics[0]);
 assert.equal(streamPreview('robotics'),placeholderVideos.robotics[0]);
 assert.equal(streamPreview('__proto__'),placeholderVideos.physics[0]);assert.equal(streamPreview('unknown'),placeholderVideos.physics[0]);
 assert.ok(introPlaceholder.nasaId);
});

function fakeUpstream(status,headers={},body='abc'){const calls=[];const fetcher=async(url,init)=>{calls.push({url,init});return new Response(status===416||init.method==='HEAD'?null:body,{status,headers})};return {calls,fetcher};}

test('Relay forwards only safe range requests and headers',async()=>{
 const {calls,fetcher}=fakeUpstream(206,{'Content-Type':'video/mp4','Content-Length':'3','Content-Range':'bytes 0-2/100','Set-Cookie':'x=1','Access-Control-Allow-Origin':'*'});
 const r=await streamPlaceholder(new Request('https://site.test/api/lesson-video',{headers:{Range:'bytes=0-2',Cookie:'secret=1'}}),introPlaceholder,fetcher);
 assert.equal(r.status,206);assert.equal(await r.text(),'abc');assert.equal(r.headers.get('content-range'),'bytes 0-2/100');assert.equal(r.headers.get('content-length'),'3');
 assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('set-cookie'),null);assert.equal(r.headers.get('access-control-allow-origin'),null);
 assert.equal(calls[0].url,placeholderUpstream(introPlaceholder));assert.deepEqual(calls[0].init.headers,{Range:'bytes=0-2'});assert.equal(calls[0].init.method,'GET');
});

test('Relay rejects malformed ranges without calling upstream',async()=>{
 for(const range of ['bytes=a-b','bytes=0-1,5-9','items=0-1','bytes=-']){const {calls,fetcher}=fakeUpstream(206,{'Content-Type':'video/mp4'});const r=await streamPlaceholder(new Request('https://site.test/x',{headers:{Range:range}}),introPlaceholder,fetcher);assert.equal(r.status,416,range);assert.equal(calls.length,0);}
});

test('Relay passes HEAD and unsatisfiable ranges, and fails closed on bad upstream responses',async()=>{
 const head=fakeUpstream(200,{'Content-Type':'video/mp4','Content-Length':'100'});const h=await streamPlaceholder(new Request('https://site.test/x',{method:'HEAD'}),introPlaceholder,head.fetcher);assert.equal(h.status,200);assert.equal(head.calls[0].init.method,'HEAD');assert.equal(h.headers.get('content-length'),'100');
 const late=fakeUpstream(416,{'Content-Range':'bytes */100'});const l=await streamPlaceholder(new Request('https://site.test/x',{headers:{Range:'bytes=500-'}}),introPlaceholder,late.fetcher);assert.equal(l.status,416);assert.equal(l.headers.get('content-range'),'bytes */100');
 for(const [status,type] of [[404,'application/xml'],[403,'application/xml'],[200,'text/html']]){const {fetcher}=fakeUpstream(status,{'Content-Type':type});await assert.rejects(streamPlaceholder(new Request('https://site.test/x'),introPlaceholder,fetcher),e=>e.status===502);}
 await assert.rejects(streamPlaceholder(new Request('https://site.test/x'),introPlaceholder,async()=>{throw new TypeError('network down')}),e=>e.status===502);
});
