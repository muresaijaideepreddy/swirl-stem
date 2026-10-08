import {PDFDocument,PDFDict,PDFName,PDFArray,PDFRef,PDFStream,StandardFonts,rgb} from 'pdf-lib';
import {InputError,csvCell} from './core.mjs';
export {csvCell};
export async function boundedBytes(req,limit=25*1024*1024){if(Number(req.headers.get('content-length'))>limit)throw new InputError('File is too large.',413);const reader=req.body?.getReader();if(!reader)throw new InputError('Choose a file.');const chunks=[];let length=0;try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new InputError('File is too large.',413)}chunks.push(value)}}finally{reader.releaseLock()}if(!length)throw new InputError('Empty files are not accepted.');const result=new Uint8Array(length);let offset=0;for(const c of chunks){result.set(c,offset);offset+=c.length}return result;}
export async function validateFile(bytes,name,mime,kind){
 const ext=name.split('.').pop()?.toLowerCase(),prefix=new TextDecoder().decode(bytes.slice(0,8));
 if(['plan','worksheet','book','certificate'].includes(kind)){
  if(ext!=='pdf'||mime!=='application/pdf'||!prefix.startsWith('%PDF-'))throw new InputError('Choose a PDF document with a .pdf extension.');
  let doc;try{doc=await PDFDocument.load(bytes,{ignoreEncryption:false,updateMetadata:false})}catch{throw new InputError('This PDF is damaged or password protected. Export an unencrypted PDF and try again.');}
  if(!doc.getPageCount()||doc.getPageCount()>200)throw new InputError('PDFs must contain 1–200 pages.');
  const forbidden=['JavaScript','JS','OpenAction','AA','A','Launch','EmbeddedFiles','EF','FS','AF','RichMedia','SubmitForm','GoToR','XFA','AcroForm'],visited=new Set();
  function inspect(object,depth=0){if(depth>100)throw new InputError('This PDF has an excessively nested structure.');if(object instanceof PDFRef)object=doc.context.lookup(object);if(!object||visited.has(object))return;visited.add(object);if(object instanceof PDFStream)inspect(object.dict,depth+1);else if(object instanceof PDFDict){if(forbidden.some(key=>object.has(PDFName.of(key))))throw new InputError('This PDF contains active content, interactive fields or attachments. Export a flattened PDF and try again.');for(const [,value]of object.entries())inspect(value,depth+1);}else if(object instanceof PDFArray)for(const value of object.asArray())inspect(value,depth+1);}
  for(const [,object]of doc.context.enumerateIndirectObjects())inspect(object);
  return 'application/pdf';
 }
 if(kind==='image'){
  const png=ext==='png'&&mime==='image/png'&&bytes[0]===137&&prefix.slice(1,4)==='PNG';const jpg=['jpg','jpeg'].includes(ext)&&mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(bytes.length>5*1024*1024||(!png&&!jpg))throw new InputError('Choose a PNG or JPEG image no larger than 5 MB.');try{if(png){if(bytes.length<40||bytes[4]!==13||bytes[5]!==10||bytes[6]!==26||bytes[7]!==10)throw new Error();const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=view.getUint32(16),height=view.getUint32(20);if(!width||!height||width*height>10000000)throw new Error();}const doc=await PDFDocument.create(),img=png?await doc.embedPng(bytes):await doc.embedJpg(bytes);if(!img.width||!img.height||img.width*img.height>10000000)throw new Error();}catch{throw new InputError('This image is damaged or exceeds 10 megapixels. Export a smaller PNG or JPEG.');}return png?'image/png':'image/jpeg';
 }
 if(kind==='captions'){
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw new InputError('Save your captions as UTF-8.')}if(ext!=='vtt'||bytes.length>500000||!text.startsWith('WEBVTT')||/<script|<iframe/i.test(text))throw new InputError('Choose a valid WebVTT caption file up to 500 KB.');return 'text/vtt';
 }
 if(kind==='supplies'){
  if(ext!=='csv'||bytes.length>500000)throw new InputError('Choose a CSV supply list up to 500 KB.');let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw new InputError('Save your CSV as UTF-8.')}if(text.includes('\0'))throw new InputError('Invalid CSV file.');return 'text/csv';
 }
 throw new InputError('This file purpose is not supported.');
}
export function sanitizeCsv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){row.push(csvCell(cell));cell='';if(c==='\n'){rows.push(row.join(','));row=[];}}else if(c!=='\r')cell+=c;}if(quoted)throw new InputError('CSV contains an unclosed quoted cell.');row.push(csvCell(cell));rows.push(row.join(','));return rows.join('\r\n');}
const latin=value=>String(value).replace(/\u2022/g,' - ').replace(/[\u2013\u2014]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[^\x20-\x7e\xa0-\xff\n]/g,'?');
export async function documentPdf(sections,watermark='SwIRL • Licensed adult teaching resource'){
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);let page,y;
 const add=()=>{page=doc.addPage([612,792]);y=736};add();
 for(const section of sections){if(y<180)add();const lines=[{text:section.title??'',size:19,font:bold},...(section.lines??[]).flatMap(t=>String(t).split('\n').map(text=>({text,size:11,font})))];
  for(const line of lines){let rest=latin(line.text),first=true;while(rest.length||first){first=false;let n=Math.min(rest.length,88);while(n>1&&line.font.widthOfTextAtSize(rest.slice(0,n),line.size)>500)n--;if(n<rest.length&&rest.lastIndexOf(' ',n)>n/2)n=rest.lastIndexOf(' ',n);if(y<65)add();page.drawText(rest.slice(0,n),{x:52,y,size:line.size,font:line.font,color:rgb(.1,.18,.15)});y-=line.size+7;rest=rest.slice(n).trimStart();} }y-=20;
 }
 for(const [i,p]of doc.getPages().entries())p.drawText(latin(watermark).slice(0,105)+` | ${i+1}/${doc.getPageCount()}`,{x:35,y:25,size:8,font,color:rgb(.35,.35,.35)});return doc.save();
}
export async function bundlePdf(files,generated,watermark){const doc=await PDFDocument.create();for(const bytes of [...files,generated].filter(Boolean)){const src=await PDFDocument.load(bytes);if(doc.getPageCount()+src.getPageCount()>400)throw new InputError('Choose individual documents; this combined bundle exceeds 400 pages.');for(const p of await doc.copyPages(src,src.getPageIndices()))doc.addPage(p);}const font=await doc.embedFont(StandardFonts.Helvetica);for(const [i,p]of doc.getPages().entries()){p.drawRectangle({x:0,y:0,width:p.getWidth(),height:19,color:rgb(1,1,1)});p.drawText(latin(watermark).slice(0,100)+` | ${i+1}`,{x:15,y:6,size:7,font,color:rgb(.3,.3,.3)});}return doc.save();}
