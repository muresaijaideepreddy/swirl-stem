import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {refundHandling} from '../lib/refunds.mjs';

function harness(){
 const sql=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
 const db={prepare(text){return {bind(...args){return {async first(){return sql.prepare(text).get(...args)??null},async all(){return {results:sql.prepare(text).all(...args)}},async run(){return {meta:{changes:sql.prepare(text).run(...args).changes}}},exec(){return sql.prepare(text).run(...args)}}}}},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>s.exec());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
 const charges=new Map(),sessions=new Map(),invoicePayments=new Map(),calls=[];
 const stripe=async path=>{calls.push(path);const [base,query]=path.split('?'),params=new URLSearchParams(query);
  if(base.startsWith('charges/'))return charges.get(decodeURIComponent(base.slice(8)))??{};
  if(base==='checkout/sessions')return {data:sessions.has(params.get('payment_intent'))?[sessions.get(params.get('payment_intent'))]:[]};
  if(base==='invoice_payments')return {data:invoicePayments.has(params.get('payment[payment_intent]'))?[{invoice:invoicePayments.get(params.get('payment[payment_intent]'))}]:[]};
  throw new Error('unexpected '+path);};
 const event=id=>({type:'charge.refunded',data:{object:{id}}});
 return {sql,charges,sessions,invoicePayments,calls,service:refundHandling({db,stripe}),event};
}
const now=Date.now();

test('A full refund of a single purchase removes its classroom access',async()=>{
 const h=harness();h.sql.prepare("INSERT INTO orders(id,user_id,items,total,status,mode,session_id,created_at) VALUES('o1','u1','[\"a\",\"b\"]',198,'complete','stripe-test','cs_test_1',?)").run(now);
 for(const p of ['a','b'])h.sql.prepare("INSERT INTO entitlements(user_id,product_id,order_id,mode,created_at) VALUES('u1',?,'o1','stripe-test',?)").run(p,now);
 h.sql.prepare("INSERT INTO entitlements(user_id,product_id,order_id,mode,created_at) VALUES('u1','c','o-other','stripe-test',?)").run(now);
 h.charges.set('ch_1',{id:'ch_1',refunded:true,payment_intent:'pi_1'});h.sessions.set('pi_1',{id:'cs_test_1',client_reference_id:'o1',metadata:{user_id:'u1'}});
 assert.equal(await h.service.webhook(h.event('ch_1')),true);
 assert.equal(h.sql.prepare("SELECT status FROM orders WHERE id='o1'").get().status,'refunded');
 assert.deepEqual(h.sql.prepare("SELECT product_id FROM entitlements WHERE user_id='u1'").all().map(r=>r.product_id),['c'],'only the refunded order loses access');
});

test('Partial refunds and unknown payments change nothing',async()=>{
 const h=harness();h.sql.prepare("INSERT INTO orders(id,user_id,items,total,status,mode,session_id,created_at) VALUES('o1','u1','[\"a\"]',99,'complete','stripe-test','cs_test_1',?)").run(now);
 h.sql.prepare("INSERT INTO entitlements(user_id,product_id,order_id,mode,created_at) VALUES('u1','a','o1','stripe-test',?)").run(now);
 h.charges.set('ch_partial',{id:'ch_partial',refunded:false,amount_refunded:20,payment_intent:'pi_1'});h.sessions.set('pi_1',{id:'cs_test_1',client_reference_id:'o1'});
 h.charges.set('ch_unknown',{id:'ch_unknown',refunded:true,payment_intent:'pi_unknown'});
 await h.service.webhook(h.event('ch_partial'));await h.service.webhook(h.event('ch_unknown'));
 assert.equal(h.sql.prepare("SELECT status FROM orders").get().status,'complete');assert.equal(h.sql.prepare('SELECT count(*) n FROM entitlements').get().n,1);
 assert.equal(await h.service.webhook({type:'charge.succeeded',data:{object:{id:'ch_1'}}}),false,'other events are not consumed');
 assert.equal(await h.service.webhook(h.event('../evil')),true);assert.ok(!h.calls.some(c=>c.includes('evil')),'malformed ids never reach Stripe');
});

test('A session that does not match the stored order is ignored',async()=>{
 const h=harness();h.sql.prepare("INSERT INTO orders(id,user_id,items,total,status,mode,session_id,created_at) VALUES('o1','u1','[\"a\"]',99,'complete','stripe-test','cs_test_real',?)").run(now);
 h.charges.set('ch_1',{id:'ch_1',refunded:true,payment_intent:'pi_1'});h.sessions.set('pi_1',{id:'cs_test_other',client_reference_id:'o1'});
 await h.service.webhook(h.event('ch_1'));assert.equal(h.sql.prepare("SELECT status FROM orders").get().status,'complete');
});

test('Refunding a seasonal pass or a purchase-order invoice revokes the license',async()=>{
 const h=harness();
 h.sql.prepare("INSERT INTO licenses(id,school_id,user_id,scope,starts_at,ends_at,amount,status,session_id,created_at) VALUES('season-1','s1','d1','subject:robotics',?,?,75,'paid','cs_test_season',?)").run(now,now+90*864e5,now);
 h.sql.prepare("INSERT INTO purchase_requests(id,user_id,school_id,data,amount,status,invoice_id,created_at) VALUES('po-1','d1','s1','{}',99,'paid','in_1',?)").run(now);
 h.sql.prepare("INSERT INTO licenses(id,school_id,user_id,scope,starts_at,ends_at,amount,status,created_at) VALUES('po-1','s1','d1','all',?,?,99,'paid',?)").run(now,now+365*864e5,now);
 h.charges.set('ch_season',{id:'ch_season',refunded:true,payment_intent:'pi_season'});h.sessions.set('pi_season',{id:'cs_test_season',metadata:{license_id:'season-1'}});
 h.charges.set('ch_po',{id:'ch_po',refunded:true,payment_intent:'pi_po'});h.invoicePayments.set('pi_po','in_1');
 await h.service.webhook(h.event('ch_season'));await h.service.webhook(h.event('ch_po'));
 assert.deepEqual(h.sql.prepare('SELECT id,status FROM licenses ORDER BY id').all().map(r=>r.id+':'+r.status),['po-1:refunded','season-1:refunded']);
 assert.equal(h.sql.prepare("SELECT status FROM purchase_requests").get().status,'refunded');
});
