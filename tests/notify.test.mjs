import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {emailService} from '../lib/email.mjs';
import {inquiryEmails,notifyInquiry,teamAddress} from '../lib/notify.mjs';

const lead={name:'Dana Director',email:'dana@example.org',role:'daycare',organization:'Little Sprouts',sites:2,notes:'Visit http://spam.example now!'};
function harness(settings={}){
 const sql=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
 const db={prepare(text){return {bind(...args){return {async first(){return sql.prepare(text).get(...args)??null},async all(){return {results:sql.prepare(text).all(...args)}},async run(){return {meta:{changes:sql.prepare(text).run(...args).changes}}}}}}}};
 const sent=[];const send=async(url,init)=>{sent.push({url,body:JSON.parse(init.body),key:init.headers['Idempotency-Key']});return new Response(JSON.stringify({id:'re_'+sent.length}),{status:200})};
 const all={SITE_ORIGIN:'https://swirl.example',...settings};return {sql,sent,all,mail:emailService({db,settings:all,send})};
}

test('Team address comes from TEAM_EMAIL, then the admin list',()=>{
 assert.equal(teamAddress({TEAM_EMAIL:'team@swirl.org'}),'team@swirl.org');
 assert.equal(teamAddress({CONTENT_ADMIN_EMAILS:' bad , owner@swirl.org,second@swirl.org'}),'owner@swirl.org');
 assert.equal(teamAddress({}),null);
});

test('Pilot request: confirmation promises a live demo and repeats no free text; team gets every detail',()=>{
 const m=inquiryEmails('pilot',lead,{site:'https://swirl.example'});
 assert.match(m.requester.text,/live demo/);assert.match(m.requester.text,/dana@example\.org/);assert.match(m.requester.text,/https:\/\/swirl\.example\/curriculum/);
 assert.doesNotMatch(m.requester.text,/spam|Dana|Little Sprouts/,'confirmation must not echo visitor-supplied text');
 assert.equal(m.team.subject,'New pilot and demo request: Little Sprouts');
 for(const s of ['Dana Director','dana@example.org','Daycare leader','Little Sprouts','Sites: 2','Visit http://spam.example now!','/studio'])assert.ok(m.team.text.includes(s),s);
});

test('Contact, sample, quote and PO messages',()=>{
 const c=inquiryEmails('contact',{...lead,topic:'Refunds & billing'});assert.match(c.requester.text,/Refunds & billing/);assert.match(c.team.subject,/Refunds & billing/);
 const s=inquiryEmails('sample',{...lead,subject:'robotics'},{site:'https://swirl.example',link:'/api/sample-pdf?token=t1&subject=robotics'});assert.match(s.requester.text,/https:\/\/swirl\.example\/api\/sample-pdf\?token=t1/);assert.match(s.requester.text,/24 hours/);assert.match(s.team.text,/Stream: robotics/);
 const q=inquiryEmails('quote',lead),p=inquiryEmails('po',{...lead,po:'PO-9'});assert.equal(q.requester,undefined);assert.match(q.team.subject,/quote request/);assert.match(p.team.text,/PO number: PO-9/);
 assert.throws(()=>inquiryEmails('other',lead));
});

test('Line breaks in names cannot spill into email subjects',()=>{
 const m=inquiryEmails('pilot',{...lead,organization:'Evil\r\nBcc: victim@example.com'});assert.doesNotMatch(m.team.subject,/[\r\n]/);
});

test('Without an email provider both messages wait in the outbox',async()=>{
 const h=harness({TEAM_EMAIL:'team@swirl.org'});const r=await notifyInquiry(h.mail,h.all,{id:'pilot-1',kind:'pilot',data:lead});
 assert.deepEqual(r,{confirmation:'queued',team:'queued'});assert.equal(h.sent.length,0);
 assert.deepEqual(h.sql.prepare('SELECT id,recipient,status FROM email_outbox ORDER BY id').all().map(x=>[x.id,x.recipient,x.status]),[['pilot-1-confirm','dana@example.org','queued'],['pilot-1-team','team@swirl.org','queued']]);
});

test('With Resend connected both are sent once, even if the form is retried',async()=>{
 const h=harness({TEAM_EMAIL:'team@swirl.org',RESEND_API_KEY:'re_test',EMAIL_FROM:'SwIRL <hello@swirl.org>'});
 assert.deepEqual(await notifyInquiry(h.mail,h.all,{id:'pilot-2',kind:'pilot',data:lead}),{confirmation:'sent',team:'sent'});
 await notifyInquiry(h.mail,h.all,{id:'pilot-2',kind:'pilot',data:lead});
 assert.equal(h.sent.length,2);assert.deepEqual(h.sent.map(s=>s.body.to[0]),['dana@example.org','team@swirl.org']);assert.equal(h.sent[0].body.from,'SwIRL <hello@swirl.org>');assert.equal(h.sent[0].key,'swirl/pilot-2-confirm');
});

test('No team address: only the confirmation is queued',async()=>{
 const h=harness();assert.deepEqual(await notifyInquiry(h.mail,h.all,{id:'contact-1',kind:'contact',data:{...lead,topic:'Technical help'}}),{confirmation:'queued',team:'no team address'});
 assert.equal(h.sql.prepare('SELECT count(*) n FROM email_outbox').get().n,1);
});
