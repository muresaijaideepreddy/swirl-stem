// Every inquiry form sends a confirmation to the person and a notification to the SwIRL team.
// Confirmations repeat no free text, so the forms cannot be used to send arbitrary messages to other people.
// Messages wait in the email outbox until Resend is connected; administrators can retry them from the studio.
const roles={parent:'Parent / caregiver',tutor:'Tutor / educator',daycare:'Daycare leader',afterschool:'After-school leader',camp:'Camp director',other:'Other adult facilitator'};
const validEmail=s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const line=v=>String(v??'').replace(/[\r\n]+/g,' ').trim();
export function teamAddress(settings){return String(settings.TEAM_EMAIL||settings.CONTENT_ADMIN_EMAILS||'').split(',').map(s=>s.trim()).find(validEmail)??null;}
export function inquiryEmails(kind,d,{site='',link=''}={}){
 const sign='\n\nThe SwIRL team\nSouthwest Innovation Research Lab, College Station, Texas',who=line(d.organization)||line(d.name);
 const details=[['Name',d.name],['Email',d.email],['Role',roles[d.role]??d.role],['Organization',d.organization||'Not given'],...(d.sites?[['Sites',d.sites]]:[]),...(d.subject?[['Stream',d.subject]]:[]),...(d.po?[['PO number',d.po]]:[])].map(([k,v])=>k+': '+line(v)).join('\n');
 const notes=d.notes?'\n\nTheir message:\n'+String(d.notes):'';
 if(kind==='pilot')return {requester:{subject:'We received your SwIRL pilot request',text:`Hello,\n\nThank you for requesting a free SwIRL pilot unit. Someone from the SwIRL team will email you at ${line(d.email)} to plan your pilot and set up a live demo.\n\nWhile you wait, explore the curriculum: ${site}/curriculum${sign}`},team:{subject:'New pilot and demo request: '+who,text:`Someone requested a free pilot unit and a live demo.\n\n${details}${notes}\n\nReply to ${line(d.email)} to schedule the demo. It is also in the studio inbox: ${site}/studio`}};
 if(kind==='contact')return {requester:{subject:'We received your message',text:`Hello,\n\nThank you for contacting SwIRL about "${line(d.topic)}". The team will reply to ${line(d.email)}.${sign}`},team:{subject:'New contact message: '+line(d.topic),text:`A visitor sent a message through the contact page.\n\n${details}\nTopic: ${line(d.topic)}${notes}\n\nReply to ${line(d.email)}. It is also in the studio inbox: ${site}/studio`}};
 if(kind==='sample')return {requester:{subject:'Your free SwIRL sample lesson',text:`Hello,\n\nHere is your free sample lesson bundle. The download link works for 24 hours:\n${site}${link}\n\nWatch the sample video and explore the full curriculum: ${site}/curriculum${sign}`},team:{subject:'New free sample request: '+who,text:`Someone downloaded a free sample lesson.\n\n${details}\n\nFollow up at ${line(d.email)}. It is also in the studio inbox: ${site}/studio`}};
 if(kind==='quote'||kind==='po')return {team:{subject:'New '+(kind==='po'?'purchase order':'quote request')+': '+who,text:`A program submitted a ${kind==='po'?'purchase order':'quote request'}.\n\n${details}${notes}\n\nReview it in Program billing: ${site}/program`}};
 throw new Error('Unknown inquiry type');
}
export async function notifyInquiry(mail,settings,{id,userId='public',kind,data,link=''}){
 const messages=inquiryEmails(kind,data,{site:settings.SITE_ORIGIN??'',link}),team=teamAddress(settings),out={};
 if(messages.requester)out.confirmation=(await mail.queue(id+'-confirm',userId,line(data.email),messages.requester.subject,messages.requester.text)).status;
 out.team=team?(await mail.queue(id+'-team',userId,team,line(messages.team.subject).slice(0,200),messages.team.text)).status:'no team address';
 return out;
}
