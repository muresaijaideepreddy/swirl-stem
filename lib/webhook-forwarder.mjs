import {verifySignature} from './core.mjs';
const SITE_ORIGIN='https://swirl-stem-lab.ring-3-20260908-a6-p.chatgpt.site';
export async function forwardStripeWebhook(request,config,{fetcher=fetch,now=Date.now()}={}){
 const reply=(status,error)=>Response.json({error},{status});
 if(request.method!=='POST')return reply(405,'Use POST.');
 if(!config.webhookSecret||!config.siteAccessToken)return reply(503,'Webhook forwarding is not configured.');
 if(Number(request.headers.get('content-length'))>250000)return reply(413,'Event too large.');
 let raw='';const reader=request.body?.getReader();if(!reader)return reply(400,'Missing event.');
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>250000){await reader.cancel();return reply(413,'Event too large.')}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length}raw=new TextDecoder().decode(bytes);
 const signature=request.headers.get('stripe-signature');
 if(!await verifySignature(raw,signature,config.webhookSecret,now))return reply(400,'Invalid event signature.');
 let event;try{event=JSON.parse(raw)}catch{return reply(400,'Invalid event.')}
 if(event.livemode!==false)return reply(400,'Only Stripe test events are accepted.');
 try{
  const response=await fetcher(SITE_ORIGIN+'/api/stripe-webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':signature,'OAI-Sites-Authorization':'Bearer '+config.siteAccessToken},body:raw,redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(!response.ok)return reply(502,'The private site did not acknowledge this event. Retry delivery.');
  return Response.json({received:true});
 }catch{return reply(502,'The private site is temporarily unavailable. Retry delivery.')}
}
