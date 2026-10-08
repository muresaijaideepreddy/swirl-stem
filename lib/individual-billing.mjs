import {InputError,assertTestKey,validKey,cleanIds} from './core.mjs';
import {siteOrigin} from './school-billing.mjs';

const sessionId=value=>typeof value==='string'&&/^cs_test_[A-Za-z0-9_]+$/.test(value);
const safeInvoice=value=>{try{const u=new URL(value);return u.protocol==='https:'&&['invoice.stripe.com','pay.stripe.com','files.stripe.com'].includes(u.hostname)?u.href:null}catch{return null}};
export function individualBilling({db,stripe,settings,catalog,now=()=>Date.now()}){
 const q=(sql,...args)=>db.prepare(sql).bind(...args);
 const order=id=>q('SELECT * FROM orders WHERE id=?',id).first();
 async function locked(userId,fn){
  const id='individual:'+userId,token=crypto.randomUUID(),time=now();
  const claim=await q('INSERT INTO billing_locks(id,token,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE billing_locks.expires_at<?',id,token,time+120000,time).run();
  if(!claim.meta.changes)throw new InputError('A checkout is being updated. Please retry shortly.',409);
  const atomic=async statements=>{try{return await db.batch([q('INSERT INTO billing_locks(id,token,expires_at) SELECT ?,NULL,0 WHERE NOT EXISTS(SELECT 1 FROM billing_locks WHERE id=? AND token=? AND expires_at>?)',id,id,token,now()),...statements])}catch(e){if(!await q('SELECT id FROM billing_locks WHERE id=? AND token=? AND expires_at>?',id,token,now()).first())throw new InputError('Checkout update timed out. Retry to recover the existing payment.',409);throw e}};
  try{return await fn(atomic)}finally{await q('DELETE FROM billing_locks WHERE id=? AND token=?',id,token).run()}
 }
 function validate(row,s){
  if(!sessionId(s.id)||s.livemode!==false||s.mode!=='payment'||s.client_reference_id!==row.id||s.metadata?.user_id!==row.user_id||(row.session_id&&row.session_id!==s.id)||s.currency!=='usd')throw new InputError('Checkout does not match this order.',409);
  const snapshot=row.snapshot?JSON.parse(row.snapshot):null,tax=s.total_details?.amount_tax??0;
  if((s.amount_subtotal??s.amount_total)!==row.total||(s.total_details?.amount_discount??0)!==0||!Number.isInteger(tax)||tax<0||s.amount_total!==row.total+tax||(!snapshot?.tax&&tax!==0)||(tax>0&&s.automatic_tax?.status!=='complete'))throw new InputError('Checkout amount does not match the saved order.',409);
 }
 async function apply(row,s,atomic){
  validate(row,s);
  if(s.status==='expired'){await atomic([q("UPDATE orders SET status='expired',session_id=? WHERE id=? AND status!='complete'",s.id,row.id)]);return {status:'expired'}}
  if(s.status==='complete'&&s.payment_status==='paid'&&row.snapshot&&JSON.parse(row.snapshot).tax&&(s.automatic_tax?.enabled!==true||s.automatic_tax?.status!=='complete'))throw new InputError('Stripe has not completed tax calculation for this order.',409);
  if(s.status!=='complete'||s.payment_status!=='paid'){await atomic([q('UPDATE orders SET session_id=? WHERE id=? AND session_id IS NULL',s.id,row.id)]);return {status:'pending'}}
  const invoice=typeof s.invoice==='object'?s.invoice:null;
  await atomic([
   ...JSON.parse(row.items).map(id=>q("INSERT INTO entitlements(user_id,product_id,order_id,mode,created_at) VALUES(?,?,?,'stripe-test',?) ON CONFLICT(user_id,product_id) DO UPDATE SET order_id=excluded.order_id,mode=excluded.mode,created_at=excluded.created_at WHERE entitlements.mode='demo'",row.user_id,id,row.id,now())),
   q("UPDATE orders SET status='complete',session_id=?,paid_total=?,invoice_url=coalesce(?,invoice_url),invoice_pdf=coalesce(?,invoice_pdf) WHERE id=?",s.id,s.amount_total,safeInvoice(invoice?.hosted_invoice_url),safeInvoice(invoice?.invoice_pdf),row.id),
   q("UPDATE carts SET items=(SELECT coalesce(json_group_array(value),'[]') FROM json_each(carts.items) WHERE value NOT IN(SELECT product_id FROM entitlements WHERE user_id=?)),updated_at=? WHERE user_id=?",row.user_id,now(),row.user_id)
  ]);
  return {status:'complete'};
 }
 const retrieve=id=>stripe('checkout/sessions/'+encodeURIComponent(id)+'?expand[]=invoice');
 async function resume(row,atomic){
  if(!row.snapshot&&!row.session_id)throw new InputError('This older checkout needs billing review before a new payment.',409);
  if(row.session_id){
   const s=await retrieve(row.session_id);validate(row,s);
   if(s.status==='open'){if(!s.url||new URL(s.url).origin!=='https://checkout.stripe.com')throw new InputError('Invalid payment destination.',502);return {url:s.url,orderId:row.id}}
   return apply(row,s,atomic);
  }
  if(now()-row.created_at>23*3600000)throw new InputError('This earlier payment attempt needs review before retrying. A second charge has not been started.',409);
  const snapshot=JSON.parse(row.snapshot);
  const form=new URLSearchParams({mode:'payment',success_url:snapshot.origin+'/checkout?session_id={CHECKOUT_SESSION_ID}',cancel_url:snapshot.origin+'/cart?canceled=1',client_reference_id:row.id,'metadata[user_id]':row.user_id,'payment_method_types[0]':'card',customer_creation:'always',customer_email:snapshot.email,'invoice_creation[enabled]':'true',billing_address_collection:'required'});
  if(snapshot.tax)form.set('automatic_tax[enabled]','true');
  snapshot.lines.forEach((p,i)=>{form.set(`line_items[${i}][price_data][currency]`,'usd');form.set(`line_items[${i}][price_data][unit_amount]`,String(p.price));form.set(`line_items[${i}][price_data][tax_behavior]`,'exclusive');form.set(`line_items[${i}][price_data][product_data][name]`,p.title+' (test)');form.set(`line_items[${i}][quantity]`,'1')});
  const s=await stripe('checkout/sessions',form,'swirl-'+row.id);validate(row,s);
  await atomic([q('UPDATE orders SET session_id=? WHERE id=? AND session_id IS NULL',s.id,row.id)]);
  if(s.status==='complete')return apply(row,s,atomic);
  if(s.status!=='open'||!s.url||new URL(s.url).origin!=='https://checkout.stripe.com')throw new InputError('Stripe did not return an open test checkout.',502);
  return {url:s.url,orderId:row.id};
 }
 async function checkout(u,key){
  const id=u.userId+':'+validKey(key);
  return locked(u.userId,async atomic=>{
   const existing=await order(id);
   if(existing&&existing.mode!=='stripe-test')throw new InputError('This checkout belongs to another payment mode. Refresh and try again.',409);
   assertTestKey(settings.STRIPE_SECRET_KEY);const origin=siteOrigin(settings);
   if(existing?.status==='complete')return {status:'complete'};
   if(existing&&existing.status!=='pending')throw new InputError('This checkout expired. Start a new checkout.',409);
   // One unresolved checkout per account, even across new browser keys or a changed cart.
   const pending=existing??await q("SELECT * FROM orders WHERE user_id=? AND mode='stripe-test' AND status='pending' ORDER BY created_at LIMIT 1",u.userId).first();
   if(pending){const result=await resume(pending,atomic);if(result.status!=='expired')return result;if(existing)throw new InputError('This checkout expired. Start a new checkout.',409)}
   const products=await catalog(),cart=await q('SELECT items FROM carts WHERE user_id=?',u.userId).first(),owned=(await q('SELECT product_id FROM entitlements WHERE user_id=?',u.userId).all()).results;
   const ids=cleanIds(cart?JSON.parse(cart.items):[],products.map(p=>p.id)).filter(id=>!owned.some(o=>o.product_id===id));
   if(!ids.length)throw new InputError('Your cart is empty or these resources are already in your classroom.');
   const lines=ids.map(id=>{const p=products.find(p=>p.id===id);return {id,title:p.title,price:p.price}}),total=lines.reduce((n,p)=>n+p.price,0);
   const snapshot=JSON.stringify({lines,origin,email:u.email,tax:settings.STRIPE_TAX_ENABLED==='true'});
   await atomic([q("INSERT INTO orders(id,user_id,items,total,status,mode,snapshot,created_at) VALUES(?,?,?,?,'pending','stripe-test',?,?)",id,u.userId,JSON.stringify(ids),total,snapshot,now())]);
   return resume(await order(id),atomic);
  });
 }
 async function confirm(u,id){
  if(!sessionId(id))throw new InputError('Invalid test checkout session.');
  const bound=await q('SELECT user_id,mode FROM orders WHERE session_id=?',id).first();
  if(bound?(bound.user_id!==u.userId||bound.mode!=='stripe-test'):!await q("SELECT id FROM orders WHERE user_id=? AND mode='stripe-test' AND status='pending' AND session_id IS NULL LIMIT 1",u.userId).first())throw new InputError('Order not found.',404);
  const s=await retrieve(id),row=await order(String(s.client_reference_id??''));
  if(!row||row.user_id!==u.userId||row.mode!=='stripe-test')throw new InputError('Order not found.',404);
  return locked(row.user_id,async atomic=>apply(await order(row.id),s,atomic));
 }
 async function webhook(event){
  if(!event.type.startsWith('checkout.session.'))return false;
  const o=event.data?.object;if(o?.mode!=='payment'||o.metadata?.license_id)return false;
  const row=await order(String(o.client_reference_id??''));if(!row||row.mode!=='stripe-test')return false;
  const s=await retrieve(o.id);await locked(row.user_id,async atomic=>apply(await order(row.id),s,atomic));return true;
 }
 async function cancel(u,id){
  const row=await order(String(id??''));if(!row||row.user_id!==u.userId||row.mode!=='stripe-test')throw new InputError('Order not found.',404);
  return locked(u.userId,async atomic=>{
   const current=await order(row.id);if(current.status!=='pending')return {status:current.status};
   if(!current.session_id)throw new InputError('An interrupted payment attempt needs recovery before cancellation. Resume it first.',409);
   let s=await retrieve(current.session_id);validate(current,s);
   if(s.status==='complete')return apply(current,s,atomic);
   if(s.status==='open')s=await stripe('checkout/sessions/'+encodeURIComponent(s.id)+'/expire',new URLSearchParams(),'expire-'+current.id);
   if(s.status!=='expired')throw new InputError('Checkout cancellation is not confirmed. Refresh its status.',409);
   return apply(current,s,atomic);
  });
 }
 return {checkout,confirm,webhook,cancel};
}
