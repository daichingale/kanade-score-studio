/* Web Worker: oemer ONNX via onnxruntime-web (WASM). */
import * as ort from '../vendor/onnx/ort.wasm.min.mjs';

const wasmBase=new URL('../vendor/onnx/',import.meta.url).href;
ort.env.wasm.wasmPaths=wasmBase;
ort.env.wasm.numThreads=1;

function imageTensor(imageData,size=512){
  const {width,height,data}=imageData;
  const out=new Float32Array(3*size*size);
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const sx=Math.floor(x*width/size),sy=Math.floor(y*height/size);
      const o=(sy*width+sx)*4;
      const gray=(data[o]*0.299+data[o+1]*0.587+data[o+2]*0.114)/255;
      const idx=y*size+x;
      out[idx]=gray;
      out[size*size+idx]=gray;
      out[2*size*size+idx]=gray;
    }
  }
  return out;
}

function argmaxLabels(tensor){
  const ch=tensor.dims[1]||3;
  const h=tensor.dims[2],w=tensor.dims[3];
  const data=tensor.data;
  const out=new Uint8Array(h*w);
  for(let i=0;i<h*w;i++){
    let best=-Infinity,label=0;
    for(let c=0;c<ch;c++){
      const v=data[c*h*w+i];
      if(v>best){best=v;label=c;}
    }
    out[i]=label;
  }
  return {data:out,width:w,height:h};
}

async function runSession(buffer,tensor,size){
  const session=await ort.InferenceSession.create(buffer,{executionProviders:['wasm']});
  const inputName=session.inputNames[0];
  const feeds={[inputName]:new ort.Tensor('float32',tensor,[1,3,size,size])};
  const output=await session.run(feeds);
  return output[session.outputNames[0]];
}

self.onmessage=async event=>{
  const msg=event.data;
  try{
    if(msg?.type==='ping'){self.postMessage({type:'pong',id:msg.id});return;}
    if(msg?.type==='infer'){
      const size=512;
      const tensor=imageTensor(msg.imageData,size);
      const staffTensor=await runSession(msg.models.unet_big,tensor,size);
      const segTensor=await runSession(msg.models.seg_net,tensor,size);
      self.postMessage({type:'result',id:msg.id,staff:argmaxLabels(staffTensor),seg:argmaxLabels(segTensor)});
    }
  }catch(error){
    self.postMessage({type:'error',id:msg?.id,message:error.message||String(error)});
  }
};