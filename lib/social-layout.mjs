// Keep every permitted character inside its own canvas section, including unbroken words.
export function fitGraphicText(text,{width,height,maxFont,minFont=16,measure}){
 const value=String(text).trim();
 for(let font=maxFont;font>=minFont;font--){
  const lines=[];let line='';
  for(const character of value){
   if(character==='\n'){lines.push(line);line='';continue;}
   if(line&&measure(line+character,font)>width){lines.push(line.trimEnd());line='';}
   if(line||character!==' ')line+=character;
  }
  if(line)lines.push(line.trimEnd());
  const lineHeight=Math.ceil(font*1.25);
  if(lines.length*lineHeight<=height)return {font,lineHeight,lines};
 }
 throw new Error('This text is too long for the graphic. Please shorten it.');
}
