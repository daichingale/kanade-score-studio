/* Shared document prep for all OMR paths. */
(function(root){
  'use strict';
  const Img=()=>root.KanadeOmrImage;

  function toGray(imageData){
    return Img().bitmapFromRGBA(imageData);
  }

  function illuminationNormalize(gray){
    const {width,height,data}=gray;
    const out=new Uint8Array(data.length);
    const window=Math.max(31,Math.round(width/12)|1);
    const half=window>>1;
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        let sum=0,count=0;
        for(let dy=-half;dy<=half;dy+=4){
          for(let dx=-half;dx<=half;dx+=4){
            const px=x+dx,py=y+dy;
            if(px<0||py<0||px>=width||py>=height)continue;
            sum+=data[py*width+px];count++;
          }
        }
        const bg=sum/Math.max(1,count);
        const v=data[y*width+x];
        out[y*width+x]=Math.max(0,Math.min(255,Math.round(v+(128-bg)*0.85)));
      }
    }
    return {...gray,data:out};
  }

  function upscaleIfNeeded(imageData,minWidth=1400){
    if(imageData.width>=minWidth)return {imageData,scale:1};
    const scale=minWidth/imageData.width;
    const width=Math.round(imageData.width*scale);
    const height=Math.round(imageData.height*scale);
    const data=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        const sx=Math.floor(x/scale),sy=Math.floor(y/scale);
        const o=(sy*imageData.width+sx)*4,d=(y*width+x)*4;
        data[d]=imageData.data[o];
        data[d+1]=imageData.data[o+1];
        data[d+2]=imageData.data[o+2];
        data[d+3]=255;
      }
    }
    return {imageData:{width,height,data},scale};
  }

  function prepare(imageData,{minWidth=1400}={}){
    const up=upscaleIfNeeded(imageData,minWidth);
    let gray=toGray(up.imageData);
    gray=illuminationNormalize(gray);
    gray=Img().contrast(gray,1.18);
    let binary=Img().sauvola(gray,{window:Math.max(21,Math.round(up.imageData.width/24)|1)});
    binary=Img().deskew(binary,[-10,-6,-3,-1,0,1,3,6,10]);
    binary=Img().perspective(binary);
    const engraved=Img().binarizeEngraved(gray);
    return {gray,binary,engraved,scale:up.scale,imageData:up.imageData};
  }

  root.KanadeOmrPreprocess={prepare,upscaleIfNeeded,illuminationNormalize};
})(globalThis);