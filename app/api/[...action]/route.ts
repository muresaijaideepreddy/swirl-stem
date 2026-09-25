import {products,findProduct} from '@/lib/catalog';
import {assertSameOrigin,cleanIds,InputError,validateLead,validKey,verifySignature} from '@/lib/core.mjs';
import {db,user,json,body,failure,settings,stripe,fulfill,requireAccess,schoolService} from '@/lib/server';
import {schoolAccess} from '@/lib/school-billing.mjs';
import {makePdf} from '@/lib/pdf';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
 const u=await user(),url=new URL(req.url),action=url.pathname.slice(5),database=db();
 if(action==='schools')return json(await schoolService().view(u));
 if(action==='state'){
  const [cart,owned,orders,leads,progress]=await Promise.all([database.prepare('SELECT items FROM carts WHERE user_id = ?').bind(u.userId).first<any>(),database.prepare('SELECT product_id,mode FROM entitlements WHERE user_id = ?').bind(u.userId).all(),database.prepare('SELECT id,items,total,status,mode,created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').bind(u.userId).all(),database.prepare('SELECT id,data,created_at FROM leads WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').bind(u.userId).all(),database.prepare('SELECT product_id,completed FROM progress WHERE user_id = ?').bind(u.userId).all()]);
  const schools=await schoolService().accessSchools(u.userId),schoolOwned=schools.some(s=>schoolAccess(s))?products.filter(p=>!owned.results.some(o=>o.product_id===p.id)).map(p=>({product_id:p.id,mode:'school-test'})):[];
  return json({user:{name:u.displayName,email:u.email},cart:cart?JSON.parse(cart.items):[],owned:[...owned.results,...schoolOwned],orders:orders.results,requests:leads.results,progress:progress.results,stripeReady:settings().STRIPE_SECRET_KEY?.startsWith('sk_test_')===true});
 }
 if(action==='download'){
  const id=url.searchParams.get('id')??'',p=findProduct(id);await requireAccess(u.userId,id);if(!p)throw new InputError('Resource not found.',404);
  const kind=url.searchParams.get('kind')??'bundle',language=url.searchParams.get('lang')??'en';if(!['bundle','supplies'].includes(kind)||!['en','es'].includes(language))throw new InputError('Choose a valid download.');
  if(kind==='supplies'){const rows=['Item,Quantity note',...p.materials.map(x=>'"'+x.replaceAll('"','""')+'","Adjust for group size"')].join('\r\n');return new Response(rows,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${id}-supplies.csv"`,'Cache-Control':'private, no-store'}});}
  const pages=language==='es'?[['Cuaderno de muestra',p.title,'Contenido de demostracion para revision por un educador.','Pregunta: Que crees que va a pasar?','Prediccion: _____________________________________','Observacion: ____________________________________','Dibuja o escribe lo que has descubierto.','Que cambiarias la proxima vez?'],['Notas para el adulto','Supervise siempre la actividad.','Adapte los materiales y las instrucciones a la edad.','La traduccion completa del curso aun no esta disponible.']]:[
  ['SwIRL sample teaching bundle',p.title,'DEMONSTRATION CONTENT - educator review required',`Suggested ages: ${p.ages} | Activity time: ${p.minutes} minutes`,'Digital resources only. Source all materials separately.','Lesson plan, observation worksheet and materials list.'],
  ['Facilitator lesson plan','Learning goal: Ask a question, build or observe, and explain findings.','1. Introduce the question and gather predictions.','2. Review materials and demonstrate safe handling.','3. Guide learners through a small build or observation.','4. Test one change at a time and record the results.','5. Invite learners to explain what they would try next.','Adult supervision required. Review allergies and small-part hazards.','Adults handle sharp tools, batteries and electrical connections.','Review all placeholder activities before using with children.'],
  ['Student observation worksheet','My question: ___________________________________','My prediction: __________________________________','What I changed: _________________________________','What I observed: ________________________________','My drawing and notes:','________________________________________________','________________________________________________','Next time I would: _______________________________'],
  ['Bill of materials',...p.materials.map(m=>'- '+m),'Quantities depend on your group size.','Materials, tools and robot kits are not included.','This sample is not a safety-certified or standards-aligned lesson.']];
  return new Response(makePdf(pages),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${id}-${language}-sample.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(action==='quote'){
  const id=url.searchParams.get('id'),row=await database.prepare('SELECT data FROM leads WHERE id = ? AND user_id = ?').bind(id,u.userId).first<any>();if(!row)throw new InputError('Quote not found.',404);const lead=JSON.parse(row.data);
  return new Response(makePdf([['SwIRL sample quote',`Reference: ${id}`,`Prepared for: ${lead.organization||lead.name}`,`Sites: ${lead.sites}`,'Illustrative annual price per site: USD 399.00',`Illustrative total: USD ${(lead.sites*399).toFixed(2)}`,'DRAFT - not a binding quote or tax invoice.','No payment terms, tax exemption or license has been approved.','Prices, taxes, site scope and access terms require confirmation.']]),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="swirl-draft-quote.pdf"','Cache-Control':'private, no-store'}});
 }
 if(action==='playback'){await requireAccess(u.userId,url.searchParams.get('id')??'');return json({error:'Paid course videos have not been uploaded. The public NASA sample is available in the classroom.',code:'CONTENT_NOT_CONFIGURED'},503);}
 throw new InputError('Not found.',404);
 }catch(e){return failure(e)}}
export async function POST(req:Request){try{
 const action=new URL(req.url).pathname.slice(5),rawBody=await req.text();if(rawBody.length>250000)throw new InputError('Request too large.',413);
 if(action==='stripe-webhook'){
  const raw=rawBody;if(raw.length>250000)throw new InputError('Request too large.',413);if(!await verifySignature(raw,req.headers.get('stripe-signature'),settings().STRIPE_WEBHOOK_SECRET))throw new InputError('Invalid signature.',400);
  let event:any;try{event=JSON.parse(raw)}catch{throw new InputError('Invalid event.');}if(!event||typeof event.id!=='string'||!/^evt_[A-Za-z0-9]+$/.test(event.id)||typeof event.type!=='string'||!event.data?.object||event.livemode!==false)throw new InputError('Only valid Stripe test events are accepted.');
  if(await db().prepare('SELECT id FROM events WHERE id = ?').bind(event.id).first())return json({received:true});
  const schoolEvent=await schoolService().webhook(event);
  if(!schoolEvent&&['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){const order=await db().prepare('SELECT id FROM orders WHERE session_id=?').bind(event.data.object.id).first();if(order)await fulfill(event.data.object.id);}
  await db().prepare('INSERT INTO events(id,created_at) VALUES (?,?) ON CONFLICT(id) DO NOTHING').bind(event.id,Date.now()).run();return json({received:true});
 }
 assertSameOrigin(req);const u=await user(),b=await body(req,rawBody),database=db();
 if(action==='school-create')return json(await schoolService().create(u,b.name));
 if(action==='school-checkout')return json(await schoolService().checkout(u,b.schoolId,b.consent));
 if(action==='school-confirm')return json(await schoolService().confirm(u,b.sessionId));
 if(action==='school-portal')return json(await schoolService().portal(u,b.schoolId));
 if(action==='school-refresh')return json(await schoolService().manualRefresh(u,b.schoolId));
 if(action==='school-invite')return json(await schoolService().invite(u,b.schoolId));
 if(action==='school-join')return json(await schoolService().accept(u,b.token));
 if(action==='school-remove')return json(await schoolService().remove(u,b.schoolId,b.memberId));
 if(action==='school-revoke')return json(await schoolService().revoke(u,b.schoolId,b.inviteId));
 if(action==='cart'){
  const id=String(b.id??'');if(!findProduct(id))throw new InputError('That item is no longer available.');if(!['add','remove'].includes(b.operation))throw new InputError('Invalid cart action.');
  if(b.operation==='add'){
   if(await database.prepare('SELECT product_id FROM entitlements WHERE user_id = ? AND product_id = ?').bind(u.userId,id).first())throw new InputError('This resource is already in your classroom.',409);
   await database.prepare("INSERT INTO carts(user_id,items,updated_at) VALUES (?,json_array(?),?) ON CONFLICT(user_id) DO UPDATE SET items = CASE WHEN EXISTS(SELECT 1 FROM json_each(carts.items) WHERE value = ?) THEN carts.items ELSE json_insert(carts.items,'$[#]',?) END, updated_at = excluded.updated_at").bind(u.userId,id,Date.now(),id,id).run();
  }else await database.prepare("UPDATE carts SET items = (SELECT coalesce(json_group_array(value),'[]') FROM json_each(carts.items) WHERE value != ?), updated_at = ? WHERE user_id = ?").bind(id,Date.now(),u.userId).run();
  const cart=await database.prepare('SELECT items FROM carts WHERE user_id = ?').bind(u.userId).first<any>();return json({cart:cart?JSON.parse(cart.items):[]});
 }
 if(action==='checkout'){
  const key=validKey(b.key),orderId=u.userId+':'+key,mode=b.mode;if(!['demo','stripe-test'].includes(mode))throw new InputError('Choose a supported checkout mode.');
  const existing=await database.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').bind(orderId,u.userId).first<any>();
  if(existing&&existing.mode!==mode)throw new InputError('This checkout belongs to another payment mode. Refresh and try again.',409);
  if(existing?.status==='complete')return json({status:'complete'});
  const currentCart=await database.prepare('SELECT items FROM carts WHERE user_id = ?').bind(u.userId).first<any>();
  if(existing && (JSON.stringify(JSON.parse(existing.items).sort())!==JSON.stringify(cleanIds(currentCart?JSON.parse(currentCart.items):[],products.map(p=>p.id)).sort()) || JSON.parse(existing.items).reduce((sum:number,id:string)=>sum+(findProduct(id)?.price??-1),0)!==existing.total))throw new InputError('The cart or pricing changed. Refresh and start a new checkout.',409);
  if(existing?.session_id){const session=await stripe('checkout/sessions/'+encodeURIComponent(existing.session_id));if(session.status==='open')return json({url:session.url});if(session.status==='complete')return json(await fulfill(existing.session_id));throw new InputError('This checkout expired. Refresh to start again.',409);}
  const cart=await database.prepare('SELECT items FROM carts WHERE user_id = ?').bind(u.userId).first<any>();let ids=cleanIds(cart?JSON.parse(cart.items):[],products.map(p=>p.id));
  const owned=await database.prepare('SELECT product_id FROM entitlements WHERE user_id = ?').bind(u.userId).all<any>();ids=ids.filter(id=>!owned.results.some(r=>r.product_id===id));if(!ids.length)throw new InputError('Your cart is empty or these resources are already in your classroom.');
  const total=ids.reduce((sum,id)=>sum+findProduct(id)!.price,0),now=Date.now();
  if(mode==='demo'){
   await database.batch([database.prepare("INSERT INTO orders(id,user_id,items,total,status,mode,created_at) VALUES (?,?,?,?,'complete','demo',?) ON CONFLICT(id) DO NOTHING").bind(orderId,u.userId,JSON.stringify(ids),total,now),database.prepare("INSERT INTO entitlements(user_id,product_id,order_id,mode,created_at) SELECT o.user_id, j.value, o.id, 'demo', o.created_at FROM orders o, json_each(o.items) j WHERE o.id = ? AND o.user_id = ? AND o.mode = 'demo' AND o.status = 'complete' ON CONFLICT(user_id,product_id) DO NOTHING").bind(orderId,u.userId),database.prepare("UPDATE carts SET items = (SELECT coalesce(json_group_array(value),'[]') FROM json_each(carts.items) WHERE value NOT IN (SELECT product_id FROM entitlements WHERE user_id = ?)), updated_at = ? WHERE user_id = ?").bind(u.userId,now,u.userId)]);return json({status:'complete'});
  }
  const origin=settings().SITE_ORIGIN;if(!origin||!origin.startsWith('https://')||new URL(origin).origin!==origin)throw new InputError('Stripe return URL has not been configured.',503);
  await database.prepare("INSERT INTO orders(id,user_id,items,total,status,mode,created_at) VALUES (?,?,?,?,'pending','stripe-test',?) ON CONFLICT(id) DO NOTHING").bind(orderId,u.userId,JSON.stringify(ids),total,now);
  const persisted=await database.prepare('SELECT items FROM orders WHERE id = ?').bind(orderId).first<any>();ids=JSON.parse(persisted.items);
  const form=new URLSearchParams({mode:'payment',success_url:origin+'/checkout?session_id={CHECKOUT_SESSION_ID}',cancel_url:origin+'/cart?canceled=1',client_reference_id:orderId,'metadata[user_id]':u.userId,'payment_method_types[0]':'card'});
  ids.forEach((id,i)=>{const p=findProduct(id)!;form.set(`line_items[${i}][price_data][currency]`,'usd');form.set(`line_items[${i}][price_data][unit_amount]`,String(p.price));form.set(`line_items[${i}][price_data][product_data][name]`,p.title+' (prototype test)');form.set(`line_items[${i}][quantity]`,'1');});
  const session=await stripe('checkout/sessions',form,'swirl-'+orderId);await database.prepare('UPDATE orders SET session_id = ? WHERE id = ?').bind(session.id,orderId).run();return json({url:session.url});
 }
 if(action==='verify-checkout'){
  if(typeof b.sessionId!=='string'||!/^cs_test_[A-Za-z0-9_]+$/.test(b.sessionId))throw new InputError('Invalid checkout session.');const order=await database.prepare('SELECT id FROM orders WHERE session_id = ? AND user_id = ?').bind(b.sessionId,u.userId).first();if(!order)throw new InputError('Order not found.',404);return json(await fulfill(b.sessionId));
 }
 if(action==='request'){
  const lead=validateLead(b),id=u.userId+':'+validKey(b.key),now=Date.now();const prior=await database.prepare('SELECT data FROM leads WHERE id = ? AND user_id = ?').bind(id,u.userId).first<any>();if(prior){if(prior.data!==JSON.stringify(lead))throw new InputError('This request changed. Reload to save a new request.',409);return json({id,status:'saved',message:'Your prototype request is saved in your account. No email was sent and no license or invoice has been issued.'});}const count=await database.prepare('SELECT count(*) AS count FROM leads WHERE user_id = ? AND created_at > ?').bind(u.userId,now-3600000).first<any>();if(count?.count>=10)throw new InputError('Too many requests. Please try again in an hour.',429);
  await database.prepare('INSERT INTO leads(id,user_id,data,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,u.userId,JSON.stringify(lead),now).run();return json({id,status:'saved',message:'Your prototype request is saved in your account. No email was sent and no license or invoice has been issued.'});
 }
 if(action==='progress'){
  const p=findProduct(b.id);if(!p)throw new InputError('Lesson not found.',404);await requireAccess(u.userId,p.id);if(!Number.isInteger(b.lesson)||b.lesson<0||b.lesson>=p.lessons.length||typeof b.complete!=='boolean')throw new InputError('Invalid lesson progress.');
  if(b.complete)await database.prepare("INSERT INTO progress(user_id,product_id,completed) VALUES (?,?,json_array(?)) ON CONFLICT(user_id,product_id) DO UPDATE SET completed = CASE WHEN EXISTS(SELECT 1 FROM json_each(progress.completed) WHERE value = ?) THEN progress.completed ELSE json_insert(progress.completed,'$[#]',?) END").bind(u.userId,p.id,b.lesson,b.lesson,b.lesson).run();
  else await database.prepare("UPDATE progress SET completed = (SELECT coalesce(json_group_array(value),'[]') FROM json_each(progress.completed) WHERE value != ?) WHERE user_id = ? AND product_id = ?").bind(b.lesson,u.userId,p.id).run();return json({saved:true});
 }
 throw new InputError('Not found.',404);
 }catch(e){return failure(e)}}
