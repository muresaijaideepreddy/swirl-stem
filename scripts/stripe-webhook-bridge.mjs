import {createServer} from 'node:http';
import {forwardStripeWebhook} from '../lib/webhook-forwarder.mjs';

// A local sandbox bridge, not a production public endpoint. Secrets are accepted
// only through hidden stdin and stay in memory. Do not put them in command args.
if(!process.stdin.isTTY)throw new Error('Start in an interactive terminal so runtime secrets can be entered through hidden stdin.');
process.stderr.write('Enter runtime secret JSON on hidden stdin (webhookSecret, siteAccessToken):\n');
process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');
const input=await new Promise((resolve,reject)=>{let value='';const done=()=>{process.stdin.removeListener('data',read);process.stdin.setRawMode(false);process.stdin.pause();};const read=chunk=>{value+=chunk;if(value.includes('\u0003')||value.length>16384){done();reject(new Error('Setup canceled.'));}else if(/[\r\n]/.test(value)){done();resolve(value.trim());}};process.stdin.on('data',read);process.stdin.resume();});
let config;try{config=JSON.parse(input)}catch{throw new Error('Invalid setup JSON. No secret value was logged.')}
if(!config.webhookSecret||!config.siteAccessToken)throw new Error('Both runtime secrets are required.');
const server=createServer(async(req,res)=>{
 try{
  if(req.url!=='/stripe-webhook'||req.method!=='POST'){res.writeHead(404);res.end();return;}
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>250000){res.writeHead(413);res.end();return}chunks.push(chunk)}
  const response=await forwardStripeWebhook(new Request('http://127.0.0.1:8788/stripe-webhook',{method:'POST',headers:{'stripe-signature':String(req.headers['stripe-signature']??'')},body:Buffer.concat(chunks)}),config);
  res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());
 }catch{res.writeHead(502);res.end('{"error":"Forwarding failed; retry delivery."}')}
});
server.listen(8788,'127.0.0.1',()=>process.stderr.write('Sandbox webhook bridge ready at http://127.0.0.1:8788/stripe-webhook. No public audience change was made.\n'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
