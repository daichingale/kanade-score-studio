/* Encode on demand, outside the editor's UI thread. */
importScripts('../vendor/lamejs.iife.js');
self.onmessage=({data:{left,right,rate}})=>{
  const encoder=new lamejs.Mp3Encoder(2,rate,192);
  const leftPCM=new Int16Array(1152),rightPCM=new Int16Array(1152),parts=[];
  const pcm=sample=>Math.round(Math.max(-1,Math.min(1,sample))*32767);
  for(let start=0;start<left.length;start+=1152){
    const size=Math.min(1152,left.length-start);
    for(let i=0;i<size;i++){leftPCM[i]=pcm(left[start+i]);rightPCM[i]=pcm(right[start+i]);}
    const bytes=encoder.encodeBuffer(leftPCM.subarray(0,size),rightPCM.subarray(0,size));
    if(bytes.length)parts.push(bytes);
  }
  const tail=encoder.flush();
  if(tail.length)parts.push(tail);
  self.postMessage(new Blob(parts,{type:'audio/mpeg'}));
};
