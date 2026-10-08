// Full refunds revoke what the payment bought. Partial refunds (goodwill credits) leave access in place.
// The webhook payload is only a hint: the charge, checkout session and invoice are re-read from Stripe.
const idOf=v=>typeof v==='string'?v:v?.id;
export function refundHandling({db,stripe}){
 const q=(sql,...args)=>db.prepare(sql).bind(...args);
 async function webhook(event){
  if(event.type!=='charge.refunded')return false;
  const id=idOf(event.data?.object);if(typeof id!=='string'||!/^(ch|py)_[A-Za-z0-9]+$/.test(id))return true;
  const charge=await stripe('charges/'+encodeURIComponent(id));if(charge.refunded!==true)return true;
  const pi=idOf(charge.payment_intent);if(!pi)return true;
  const session=(await stripe('checkout/sessions?limit=1&payment_intent='+encodeURIComponent(pi))).data?.[0];
  if(session?.metadata?.license_id){await q("UPDATE licenses SET status='refunded' WHERE id=? AND session_id=? AND status='paid'",session.metadata.license_id,session.id).run();return true;}
  if(session?.client_reference_id){const order=await q('SELECT * FROM orders WHERE id=? AND session_id=?',session.client_reference_id,session.id).first();
   if(order)await db.batch([q("UPDATE orders SET status='refunded' WHERE id=?",order.id),q('DELETE FROM entitlements WHERE order_id=? AND user_id=?',order.id,order.user_id)]);return true;}
  const invoice=idOf((await stripe('invoice_payments?limit=1&payment[type]=payment_intent&payment[payment_intent]='+encodeURIComponent(pi))).data?.[0]?.invoice);
  const request=invoice?await q('SELECT * FROM purchase_requests WHERE invoice_id=?',invoice).first():null;
  if(request)await db.batch([q("UPDATE purchase_requests SET status='refunded' WHERE id=?",request.id),q("UPDATE licenses SET status='refunded' WHERE id=?",request.id)]);
  // Subscription invoices keep access until the subscription itself is canceled.
  return true;
 }
 return {webhook};
}
