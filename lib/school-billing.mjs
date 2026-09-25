import {InputError,assertTestKey,textField} from './core.mjs';

export const SCHOOL_PLAN={id:'school-annual-v1',amount:39900,currency:'usd',interval:'year',name:'School annual subscription',scope:'One physical location; unlimited adult facilitators'};
const idOf=value=>typeof value==='string'?value:value?.id;
export function schoolAccess(s,now=Date.now()) {return s.status==='active' && s.paid_until>now && s.period_end>now && s.synced_at>now-60000;}
export function validateSubscription(sub,school){
 const item=sub.items?.data?.[0],price=item?.price;
 if(sub.livemode!==false||idOf(sub.customer)!==school.customer_id||sub.metadata?.school_id!==school.id||sub.metadata?.plan!==SCHOOL_PLAN.id||sub.items?.data?.length!==1||sub.items?.has_more||item.quantity!==1||price?.unit_amount!==SCHOOL_PLAN.amount||price.currency!==SCHOOL_PLAN.currency||price.recurring?.interval!=='year'||price.recurring?.interval_count!==1||!Number.isInteger(item.current_period_end)||!Number.isInteger(item.current_period_start))throw new InputError('The Stripe subscription does not match this school plan. Contact the school director.',409);
 return item;
}
export function paidThrough(sub,item){
 const invoice=sub.latest_invoice,line=invoice?.lines?.data?.[0];
 if(!invoice||invoice.livemode!==false||invoice.status!=='paid'||invoice.amount_remaining!==0||invoice.amount_paid!==SCHOOL_PLAN.amount||invoice.total!==SCHOOL_PLAN.amount||invoice.currency!==SCHOOL_PLAN.currency||idOf(invoice.customer)!==idOf(sub.customer)||idOf(invoice.parent?.subscription_details?.subscription??invoice.subscription)!==sub.id||invoice.lines?.data?.length!==1||invoice.lines?.has_more||idOf(line?.pricing?.price_details?.price??line?.price)!==item.price.id||line?.period?.start!==item.current_period_start||line?.period?.end!==item.current_period_end)return 0;
 return item.current_period_end*1000;
}
export function siteOrigin(settings){let url;try{url=new URL(settings.SITE_ORIGIN)}catch{}if(!url||url.protocol!=='https:'||url.origin!==settings.SITE_ORIGIN)throw new InputError('The secure billing return address is not configured.',503);return url.origin;}
async function hashToken(token){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');}

// Dependencies are injected so the same service is exercised against SQLite and a fake Stripe transport in tests.
export function schoolBilling({db,stripe,settings,now=()=>Date.now()}){
 const query=(sql,...args)=>db.prepare(sql).bind(...args);
 async function school(id){const s=await query('SELECT * FROM schools WHERE id = ?',String(id??'')).first();if(!s)throw new InputError('School not found.',404);return s;}
 async function owner(u,id){const s=await school(id);if(s.owner_id!==u.userId)throw new InputError('Only the school director can manage billing and facilitators.',403);return s;}
 async function locked(id,fn){
  const token=crypto.randomUUID(),time=now();
  const r=await query('INSERT INTO school_locks(school_id,token,expires_at) VALUES (?,?,?) ON CONFLICT(school_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE school_locks.expires_at < ?',id,token,time+120000,time).run();
  if(!r.meta.changes)throw new InputError('This school is being updated. Please retry in a moment.',409);
  // D1 batch is transactional. The NOT NULL guard aborts the entire batch if a lease was replaced or expired.
  const atomic=async statements=>{try{return await db.batch([query('INSERT INTO school_locks(school_id,token,expires_at) SELECT ?,NULL,0 WHERE NOT EXISTS (SELECT 1 FROM school_locks WHERE school_id=? AND token=? AND expires_at>?)',id,id,token,now()),...statements]);}catch(e){if(!(await query('SELECT token FROM school_locks WHERE school_id=? AND token=? AND expires_at>?',id,token,now()).first()))throw new InputError('The update timed out. Please retry.',409);throw e;}};
  try{return await fn(atomic)}finally{await query('DELETE FROM school_locks WHERE school_id = ? AND token = ?',id,token).run();}
 }
 function configured(){try{assertTestKey(settings.STRIPE_SECRET_KEY);siteOrigin(settings);return true}catch{return false}}
 async function syncUnlocked(s,subId,atomic){
  if(!subId)return s;
  const sub=await stripe('subscriptions/'+encodeURIComponent(subId)+'?expand[]=latest_invoice');
  const item=validateSubscription(sub,s),paid=Math.max(s.subscription_id===sub.id?s.paid_until:0,paidThrough(sub,item));
  await atomic([query('UPDATE schools SET subscription_id=?,status=?,paid_until=?,period_end=?,cancel_at_end=?,synced_at=? WHERE id=?',sub.id,sub.status,paid,item.current_period_end*1000,sub.cancel_at_period_end?1:0,now(),s.id)]);
  return school(s.id);
 }
 async function refresh(id,force=false){const s=await school(id);if(!s.subscription_id||(!force&&s.synced_at>now()-60000))return s;return locked(id,async atomic=>{const current=await school(id);return syncUnlocked(current,current.subscription_id,atomic)});}
 async function accessSchools(userId){
  const {results}=await query('SELECT s.* FROM schools s JOIN school_members m ON m.school_id=s.id WHERE m.user_id=?',userId).all();
  return Promise.all(results.map(async s=>{try{return await refresh(s.id)}catch{return {...s,synced_at:0}}}));
 }
 async function create(u,name){
  name=textField(name,'School name',120);const existing=await query('SELECT id FROM schools WHERE owner_id=?',u.userId).first();if(existing)return {id:existing.id};
  const id=crypto.randomUUID(),time=now();
  await db.batch([query('INSERT INTO schools(id,owner_id,name,created_at) VALUES (?,?,?,?) ON CONFLICT(owner_id) DO NOTHING',id,u.userId,name,time),query('INSERT INTO school_members(school_id,user_id,name,joined_at) SELECT id,owner_id,?,? FROM schools WHERE owner_id=? ON CONFLICT(school_id,user_id) DO NOTHING',u.displayName||u.email,time,u.userId)]);
  return query('SELECT id FROM schools WHERE owner_id=?',u.userId).first();
 }
 async function view(u){const rows=await accessSchools(u.userId);return {plan:SCHOOL_PLAN,ready:configured(),schools:await Promise.all(rows.map(async s=>({id:s.id,name:s.name,role:s.owner_id===u.userId?'director':'facilitator',status:s.status,access:schoolAccess(s,now()),paidUntil:s.paid_until,periodEnd:s.period_end,cancelAtEnd:!!s.cancel_at_end,syncUnavailable:!!s.subscription_id&&!s.synced_at,hasCustomer:!!s.customer_id,members:s.owner_id===u.userId?(await query('SELECT user_id AS id,name,joined_at AS joinedAt FROM school_members WHERE school_id=? ORDER BY joined_at',s.id).all()).results.map(m=>({...m,role:m.id===s.owner_id?'director':'facilitator'})):[],invites:s.owner_id===u.userId?(await query('SELECT id,expires_at AS expiresAt FROM school_invites WHERE school_id=? AND revoked=0 AND accepted_by IS NULL AND expires_at>? ORDER BY created_at DESC',s.id,now()).all()).results:[]})))};}
 async function checkout(u,id,consent){
  await owner(u,id);if(consent!==true)throw new InputError('Confirm the annual test subscription and automatic renewal.');assertTestKey(settings.STRIPE_SECRET_KEY);const origin=siteOrigin(settings);
  return locked(id,async atomic=>{
   let s=await school(id);
   if(s.subscription_id){s=await syncUnlocked(s,s.subscription_id,atomic);if(!['canceled','incomplete_expired'].includes(s.status))throw new InputError('This school already has a subscription. Use Manage billing to update it.',409);}
   if(!s.customer_id){const customer=await stripe('customers',new URLSearchParams({'metadata[school_id]':s.id}), 'school-customer-'+s.id);if(customer.livemode!==false||!customer.id)throw new InputError('Invalid Stripe test customer.',502);await atomic([query('UPDATE schools SET customer_id=? WHERE id=?',customer.id,s.id)]);s=await school(id);}
   let attempt=await query('SELECT * FROM school_checkouts WHERE school_id=?',id).first();
   if(attempt?.session_id){
    const session=await stripe('checkout/sessions/'+encodeURIComponent(attempt.session_id));
    if(session.status==='open')return {url:session.url};
    if(session.status==='complete'){await confirmUnlocked(s,session,atomic);s=await school(id);if(!['canceled','incomplete_expired'].includes(s.status))return {status:s.status};}
    else if(session.status!=='expired')throw new InputError('The previous checkout is still pending.',409);
    await atomic([query('DELETE FROM school_checkouts WHERE school_id=?',id)]);attempt=null;
   }
   if(!attempt){attempt={school_id:id,attempt:crypto.randomUUID(),created_at:now()};await atomic([query('INSERT INTO school_checkouts(school_id,attempt,created_at) VALUES (?,?,?)',id,attempt.attempt,attempt.created_at)]);}
   // Beyond Stripe's idempotency retention window, never risk charging a second subscription.
   if(now()-attempt.created_at>23*3600000)throw new InputError('An earlier checkout could not be confirmed. Contact support to reconcile it before starting another subscription.',409);
   const form=new URLSearchParams({mode:'subscription',customer:s.customer_id,client_reference_id:s.id,success_url:origin+'/school?session_id={CHECKOUT_SESSION_ID}',cancel_url:origin+'/school?canceled=1','payment_method_types[0]':'card','line_items[0][quantity]':'1','line_items[0][price_data][currency]':SCHOOL_PLAN.currency,'line_items[0][price_data][unit_amount]':String(SCHOOL_PLAN.amount),'line_items[0][price_data][recurring][interval]':'year','line_items[0][price_data][product_data][name]':'SwIRL school annual access (test only)','metadata[school_id]':id,'metadata[attempt]':attempt.attempt,'subscription_data[metadata][school_id]':id,'subscription_data[metadata][plan]':SCHOOL_PLAN.id,'subscription_data[metadata][attempt]':attempt.attempt});
   const session=await stripe('checkout/sessions',form,'school-checkout-'+attempt.attempt);
   if(session.livemode!==false||session.mode!=='subscription'||!session.id)throw new InputError('Stripe did not return a test subscription checkout.',502);
   await atomic([query('UPDATE school_checkouts SET session_id=? WHERE school_id=? AND attempt=?',session.id,id,attempt.attempt)]);return {url:session.url};
  });
 }
 async function confirmUnlocked(s,session,atomic){
  const attempt=await query('SELECT * FROM school_checkouts WHERE school_id=?',s.id).first();
  if(session.livemode!==false||session.mode!=='subscription'||session.client_reference_id!==s.id||session.metadata?.school_id!==s.id||session.metadata?.attempt!==attempt?.attempt||idOf(session.customer)!==s.customer_id||(attempt.session_id&&session.id!==attempt.session_id))throw new InputError('Checkout does not belong to this school.',403);
  if(session.status!=='complete'||session.payment_status!=='paid'||!idOf(session.subscription))return {status:'pending'};
  const subId=idOf(session.subscription);if(s.subscription_id&&s.subscription_id!==subId&&!['canceled','incomplete_expired'].includes(s.status))throw new InputError('A different subscription is already linked to this school.',409);
  const result=await syncUnlocked(s,subId,atomic);await atomic([query('UPDATE school_checkouts SET session_id=? WHERE school_id=?',session.id,s.id)]);return {status:result.status};
 }
 async function confirm(u,sessionId){if(typeof sessionId!=='string'||!/^cs_test_[A-Za-z0-9_]+$/.test(sessionId))throw new InputError('Invalid test checkout session.');const row=await query('SELECT c.school_id FROM school_checkouts c JOIN schools s ON s.id=c.school_id WHERE c.session_id=? AND s.owner_id=?',sessionId,u.userId).first();if(!row)throw new InputError('School checkout not found.',404);return locked(row.school_id,async atomic=>confirmUnlocked(await school(row.school_id),await stripe('checkout/sessions/'+encodeURIComponent(sessionId)),atomic));}
 async function portal(u,id){const s=await owner(u,id);assertTestKey(settings.STRIPE_SECRET_KEY);const origin=siteOrigin(settings);if(!s.customer_id)throw new InputError('Start a school subscription before managing its billing.',409);
  const config=await stripe('billing_portal/configurations',new URLSearchParams({'business_profile[headline]':'Manage your SwIRL school test subscription','features[customer_update][enabled]':'false','features[invoice_history][enabled]':'true','features[payment_method_update][enabled]':'true','features[subscription_cancel][enabled]':'true','features[subscription_cancel][mode]':'at_period_end','features[subscription_update][enabled]':'false'}),'school-portal-config-v1-'+s.id);
  const session=await stripe('billing_portal/sessions',new URLSearchParams({customer:s.customer_id,configuration:config.id,return_url:origin+'/school?billing_return=1'}));return {url:session.url};
 }
 async function invite(u,id){await owner(u,id);return locked(id,async atomic=>{const count=await query('SELECT count(*) AS n FROM school_invites WHERE school_id=? AND created_at>?',id,now()-3600000).first();if(count.n>=20)throw new InputError('Too many join links created. Please try again in an hour.',429);const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),inviteId=crypto.randomUUID(),expires=now()+7*86400000;await atomic([query('INSERT INTO school_invites(id,school_id,token_hash,created_at,expires_at) VALUES (?,?,?,?,?)',inviteId,id,await hashToken(token),now(),expires)]);return {id:inviteId,token,expiresAt:expires};});}
 async function accept(u,token){if(typeof token!=='string'||!/^([a-f0-9]{64})$/.test(token))throw new InputError('Invalid invitation.');const inv=await query('SELECT * FROM school_invites WHERE token_hash=?',await hashToken(token)).first();if(!inv)throw new InputError('This invitation is invalid or unavailable.',404);return locked(inv.school_id,async atomic=>{
  const current=await query('SELECT * FROM school_invites WHERE id=?',inv.id).first();
  if(current.revoked||current.expires_at<=now()||(current.accepted_by&&current.accepted_by!==u.userId))throw new InputError('This invitation expired, was revoked, or was already used.',410);
  const member=await query('SELECT user_id FROM school_members WHERE school_id=? AND user_id=?',inv.school_id,u.userId).first();
  if(current.accepted_by&&!member)throw new InputError('Your school access was removed. Ask for a new invitation.',410);
  if((await school(inv.school_id)).owner_id===u.userId)throw new InputError('You already direct this school. Share the link with a facilitator.',409);
  if(!member){const count=await query('SELECT count(*) AS n FROM school_members WHERE user_id=?',u.userId).first();if(count.n>=20)throw new InputError('Your account has reached the school membership limit.',409);}
  await atomic([query('INSERT INTO school_members(school_id,user_id,name,joined_at) VALUES (?,?,?,?) ON CONFLICT(school_id,user_id) DO NOTHING',inv.school_id,u.userId,u.displayName||u.email,now()),query('UPDATE school_invites SET accepted_by=? WHERE id=?',u.userId,inv.id)]);return {id:inv.school_id};
 });}
 async function remove(u,id,memberId){const s=await owner(u,id);if(typeof memberId!=='string'||memberId===s.owner_id)throw new InputError('The school director cannot be removed.');return locked(id,async atomic=>{await atomic([query('DELETE FROM school_members WHERE school_id=? AND user_id=?',id,memberId)]);return {removed:true};});}
 async function revoke(u,id,inviteId){await owner(u,id);return locked(id,async atomic=>{await atomic([query('UPDATE school_invites SET revoked=1 WHERE school_id=? AND id=?',id,String(inviteId??''))]);return {revoked:true};});}
 async function webhook(event){
  const object=event.data?.object;if(!object)return false;
  if(event.type.startsWith('checkout.session.')&&object.mode==='subscription'){
   const s=await query('SELECT * FROM schools WHERE id=?',object.metadata?.school_id??'').first();if(!s)return true;
   // Retry only known, outstanding checkouts. Old school events cannot overwrite a newer plan.
   const attempt=await query('SELECT attempt FROM school_checkouts WHERE school_id=?',s.id).first();if(attempt?.attempt!==object.metadata?.attempt)return true;
   await locked(s.id,async atomic=>confirmUnlocked(await school(s.id),await stripe('checkout/sessions/'+encodeURIComponent(object.id)),atomic));return true;
  }
  if(event.type.startsWith('customer.subscription.')||event.type.startsWith('invoice.')){
   const subId=event.type.startsWith('customer.subscription.')?object.id:idOf(object.parent?.subscription_details?.subscription??object.subscription);
   if(!subId)return true;const s=await query('SELECT * FROM schools WHERE customer_id=?',idOf(object.customer)??'').first();if(!s)return true;
   await locked(s.id,async atomic=>{
    const current=await school(s.id);
    if(current.subscription_id===subId){await syncUnlocked(current,current.subscription_id,atomic);return;}
    const sub=await stripe('subscriptions/'+encodeURIComponent(subId));const attempt=await query('SELECT attempt FROM school_checkouts WHERE school_id=?',s.id).first();
    if(sub.metadata?.attempt!==attempt?.attempt||!attempt||sub.metadata?.school_id!==s.id)return;
    if(current.subscription_id&&!['canceled','incomplete_expired'].includes(current.status))return;
    await syncUnlocked(current,subId,atomic);
   });return true;
  }
  return false;
 }
 async function manualRefresh(u,id){const s=await owner(u,id);await refresh(s.id,true);return {refreshed:true};}
 return {create,view,checkout,confirm,portal,invite,accept,remove,revoke,webhook,manualRefresh,accessSchools};
}
