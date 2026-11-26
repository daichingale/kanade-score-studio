/* OMR image preprocessing: grayscale, Sauvola, deskew, perspective. */
(function(root){
  'use strict';

  function bitmapFromRGBA({width,height,data}){
    const gray=new Uint8Array(width*height);
    for(let i=0;i<width*height;i++){
      const o=i*4;
      gray[i]=Math.round(data[o]*0.299+data[o+1]*0.587+data[o+2]*0.114);
    }
    return {width,height,data:gray,ink:1};
  }

  function contrast(gray,amount=1.35){
    const out=new Uint8Array(gray.data.length);
    for(let i=0;i<gray.data.length;i++){
      const v=gray.data[i];
      out[i]=Math.max(0,Math.min(255,Math.round((v-128)*amount+128)));
    }
    return {...gray,data:out};
  }

  function sauvola(gray,{window=31,k=0.34,R=128}={}){
    const {width,height,data}=gray;
    const half=Math.floor(window/2),out=new Uint8Array(data.length);
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        let sum=0,sum2=0,count=0;
        for(let dy=-half;dy<=half;dy++){
          for(let dx=-half;dx<=half;dx++){
            const py=y+dy,px=x+dx;
            if(px<0||py<0||px>=width||py>=height)continue;
            const v=data[py*width+px];
            sum+=v;sum2+=v*v;count++;
          }
        }
        const mean=sum/count;
        const std=Math.sqrt(Math.max(0,sum2/count-mean*mean));
        const threshold=mean*(1+k*((std/R)-1));
        out[y*width+x]=data[y*width+x]<threshold?1:0;
      }
    }
    return {width,height,data:out,ink:1};
  }

  function binarizeGlobal(gray){
    let sum=0;
    for(const v of gray.data)sum+=v;
    const threshold=sum/gray.data.length*0.9;
    const out=new Uint8Array(gray.data.length);
    for(let i=0;i<gray.data.length;i++)out[i]=gray.data[i]<threshold?1:0;
    return {...gray,data:out,ink:1};
  }

  function deskew(bitmap,angles=[-8,-5,-3,-1,0,1,3,5,8]){
    const {width,height,data}=bitmap;
    let best=bitmap,bestScore=-Infinity;
    for(const angle of angles){
      const rad=angle*Math.PI/180;
      const cos=Math.cos(rad),sin=Math.sin(rad);
      const out=new Uint8Array(width*height);
      const cx=width/2,cy=height/2;
      for(let y=0;y<height;y++){
        for(let x=0;x<width;x++){
          const dx=x-cx,dy=y-cy;
          const sx=Math.round(cos*dx+sin*dy+cx);
          const sy=Math.round(-sin*dx+cos*dy+cy);
          out[y*width+x]=(sx>=0&&sx<width&&sy>=0&&sy<height)?data[sy*width+sx]:0;
        }
      }
      let rows=0;
      for(let y=2;y<height-2;y++){
        let run=0;
        for(let x=0;x<width;x++)if(out[y*width+x])run++;
        if(run>width*0.18)rows++;
      }
      if(rows>bestScore){bestScore=rows;best={width,height,data:out,ink:1};}
    }
    return best;
  }

  function perspective(bitmap){
    const {width,height,data}=bitmap;
    const margin=Math.floor(width*0.04);
    const corners=findStaffCorners(bitmap,margin);
    if(!corners)return bitmap;
    const targetW=width,targetH=height;
    const out=new Uint8Array(width*height);
    const src=corners;
    const dst=[{x:margin,y:margin},{x:width-margin,y:margin},{x:width-margin,y:height-margin},{x:margin,y:height-margin}];
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        const map=quadMap(x/width,y/height,dst,src);
        const sx=Math.round(map.x),sy=Math.round(map.y);
        out[y*width+x]=(sx>=0&&sx<width&&sy>=0&&sy<height)?data[sy*width+sx]:0;
      }
    }
    return {width:targetW,height:targetH,data:out,ink:1};
  }

  function findStaffCorners(bitmap,margin){
    const {width,height,data}=bitmap;
    let top=height,bottom=0,left=width,right=0,hits=0;
    for(let y=margin;y<height-margin;y++){
      let row=0;
      for(let x=margin;x<width-margin;x++)if(data[y*width+x])row++;
      if(row>width*0.22){
        hits++;
        top=Math.min(top,y);bottom=Math.max(bottom,y);
        for(let x=margin;x<width-margin;x++)if(data[y*width+x]){left=Math.min(left,x);right=Math.max(right,x);}
      }
    }
    if(hits<5||right-left<width*0.35)return null;
    const pad=Math.round((bottom-top)*0.15);
    return [
      {x:left,y:top-pad},{x:right,y:top-pad},{x:right,y:bottom+pad},{x:left,y:bottom+pad}
    ];
  }

  function quadMap(u,v,dst,src){
    const x=(1-u)*(1-v)*dst[0].x+u*(1-v)*dst[1].x+u*v*dst[2].x+(1-u)*v*dst[3].x;
    const y=(1-u)*(1-v)*dst[0].y+u*(1-v)*dst[1].y+u*v*dst[2].y+(1-u)*v*dst[3].y;
    const sx=(1-u)*(1-v)*src[0].x+u*(1-v)*src[1].x+u*v*src[2].x+(1-u)*v*src[3].x;
    const sy=(1-u)*(1-v)*src[0].y+u*(1-v)*src[1].y+u*v*src[2].y+(1-u)*v*src[3].y;
    return {x:sx+(x-dst[0].x),y:sy+(y-dst[0].y)};
  }

  function removeStaffLines(bitmap,lines,thickness=2){
    const {width,height,data}=bitmap;
    const out=new Uint8Array(data);
    for(const y of lines){
      for(let dy=-thickness;dy<=thickness;dy++){
        const row=y+dy;
        if(row<0||row>=height)continue;
        for(let x=0;x<width;x++)out[row*width+x]=0;
      }
    }
    return {...bitmap,data:out};
  }

  function binarizeEngraved(gray,threshold=210){
    const out=new Uint8Array(gray.data.length);
    for(let i=0;i<gray.data.length;i++)out[i]=gray.data[i]<threshold?1:0;
    return {...gray,data:out,ink:1};
  }

  root.KanadeOmrImage={bitmapFromRGBA,contrast,sauvola,binarizeGlobal,binarizeEngraved,deskew,perspective,removeStaffLines};
})(globalThis);