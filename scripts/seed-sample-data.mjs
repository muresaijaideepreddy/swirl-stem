// Loads realistic sample records into a LOCAL Worker for previewing every screen.
// Usage: start the built Worker with --var LOCAL_TEST_AUTH:true, then
//   node scripts/seed-sample-data.mjs [http://127.0.0.1:8787] [--persist-to <wrangler state dir>]
// Never point this at a deployed site: it refuses non-localhost origins, and deployed sites ignore the identity headers it sends.
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2),persistAt=args.indexOf('--persist-to'),persist=persistAt>=0?args[persistAt+1]:null;
const origin=new URL(args.find(a=>a.startsWith('http'))??'http://127.0.0.1:8787').origin;
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw new Error('Sample data can only be loaded into a local Worker.');
const people={
 parent:{id:'sample_parent_jordan',email:'jordan.lee@example.com',name:'Jordan Lee'},
 director:{id:'sample_director_maria',email:'maria.lopez@example.org',name:'Maria Lopez'},
 teacher1:{id:'sample_teacher_sam',email:'sam.patel@example.org',name:'Sam Patel'},
 teacher2:{id:'sample_teacher_alex',email:'alex.kim@example.org',name:'Alex Kim'},
 tutor:{id:'sample_tutor_priya',email:'priya.shah@example.com',name:'Priya Shah'},
};
const headers=p=>({'oai-authenticated-user-id':p.id,'oai-authenticated-user-email':p.email,'oai-authenticated-user-full-name':encodeURIComponent(p.name),'oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'});
async function call(person,action,data){const r=await fetch(origin+'/api/'+action,{method:data===undefined?'GET':'POST',headers:{...(person?headers(person):{}),...(data===undefined?{}:{'Content-Type':'application/json',Origin:origin})},body:data===undefined?undefined:JSON.stringify(data)});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${action} failed (${r.status}): ${body.error}`);return body;}
const key=()=>crypto.randomUUID();
const state=await call(people.parent,'state');if(!state.user)throw new Error('Start the local Worker with --var LOCAL_TEST_AUTH:true first.');

// A parent and a tutor buy individual resources and make progress.
async function buy(person,ids,progress){for(const id of ids){const s=await call(person,'state');if(!s.owned.some(o=>o.product_id===id)&&!s.cart.includes(id))await call(person,'cart',{id,operation:'add'});}const s=await call(person,'state');if(s.cart.length)await call(person,'checkout',{mode:'demo',key:key()});for(const [id,lessons] of Object.entries(progress))for(const lesson of lessons)await call(person,'progress',{id,lesson,complete:true});}
await buy(people.parent,['wind-powered-car','seed-to-sprout','make-it-glow','code-without-screens'],{'wind-powered-car':[0,1,2,3],'seed-to-sprout':[0]});
await buy(people.tutor,['algorithm-adventures','circuit-detectives','block-coding-games'],{'algorithm-adventures':[0,1,2,3,4,5]});
for(const id of ['straw-rocket-lab','senses-explorers'])await call(people.parent,'cart',{id,operation:'add'}).catch(()=>{});

// A director with two locations, facilitators who joined by link, and program requests.
const riverside=(await call(people.director,'school-create',{name:'Riverside After-School STEM Club'})).id,northside=(await call(people.director,'school-create',{name:'Northside Summer Camp'})).id;
for(const [teacher,school] of [[people.teacher1,riverside],[people.teacher2,northside]]){const view=await call(teacher,'schools');if(view.schools.some(s=>s.id===school))continue;const {token}=await call(people.director,'school-invite',{schoolId:school});await call(teacher,'school-join',{token});}
await call(people.director,'school-invite',{schoolId:northside});
const lead={name:people.director.name,email:people.director.email,role:'afterschool',organization:'Riverside Community Programs',consent:true};
await call(people.director,'request',{...lead,kind:'pilot',sites:1,notes:'We would like to pilot two physics lessons with our 3rd–5th graders this spring.',key:key()});
await call(people.director,'program/submit',{...lead,kind:'quote',sites:12,notes:'Regional network of 12 after-school sites; looking for annual licensing.',key:key()});
await call(people.director,'program/submit',{...lead,kind:'po',sites:1,schoolId:riverside,po:'RCP-2026-0142',net30:true,taxExemptionRequested:true,addressLine1:'1200 Riverside Dr',addressCity:'College Station',addressState:'TX',addressPostal:'77840',addressCountry:'US',key:key()});

// Public visitors: free sample requests and contact messages.
await call(null,'sample-request',{name:'Taylor Brooks',email:'taylor.brooks@example.com',role:'daycare',organization:'Little Sprouts Daycare',subject:'biology',consent:true}).catch(e=>console.warn(e.message));
await call(null,'contact',{name:'Chris Morgan',email:'chris.morgan@example.com',organization:'First Community Church',topic:'Licensing & pricing',message:'Do you offer a discount for church summer programs with about 40 kids?',consent:true}).catch(e=>console.warn(e.message));
await call(null,'contact',{name:'Avery Nguyen',email:'avery.nguyen@example.com',organization:'',topic:'Curriculum feedback',message:'My kids loved the straw rockets! Any plans for a water rocket lesson?',consent:true}).catch(e=>console.warn(e.message));

// A paid seasonal robotics pass for the summer camp (written directly; checkout would need Stripe).
if(persist){const now=Date.now(),day=86400000,sql=`INSERT OR IGNORE INTO licenses(id,school_id,user_id,scope,starts_at,ends_at,amount,status,paid_total,paid_at,created_at) VALUES('sample-season-robotics','${northside}','${people.director.id}','subject:robotics',${now-day},${now+89*day},14900,'paid',14900,${now-day},${now-day});`;
 const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',persist,'--command',sql],{stdio:'inherit'});if(r.status!==0)console.warn('Seasonal pass sample was not written.');}
console.log('Sample data loaded. Local identities: '+Object.values(people).map(p=>p.email).join(', '));
