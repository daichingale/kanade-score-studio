/* Lightweight printed single-staff OMR for browser use (melody line, treble). */
(function(root){
  'use strict';
  const C=root.KanadeCore,P=root.KanadePerformance;

  function bitmapFromRGBA({width,height,data}){
    const gray=new Uint8Array(width*height);
    for(let i=0;i<width*height;i++){
      const o=i*4;
      gray[i]=Math.round(data[o]*0.299+data[o+1]*0.587+data[o+2]*0.114);
    }
    return {width,height,data:gray};
  }

  function contrast(gray,amount=1.4){
    const out=new Uint8Array(gray.data.length);
    for(let i=0;i<gray.data.length;i++){
      const v=gray.data[i];
      out[i]=Math.max(0,Math.min(255,Math.round((v-128)*amount+128)));
    }
    return {...gray,data:out};
  }

  function binarize(gray){
    let sum=0;
    for(const v of gray.data)sum+=v;
    const threshold=sum/gray.data.length*0.92;
    const out=new Uint8Array(gray.data.length);
    for(let i=0;i<gray.data.length;i++)out[i]=gray.data[i]<threshold?1:0;
    return {...gray,data:out};
  }

  function crop(bitmap,{left,top,width,height}){
    const out=new Uint8Array(width*height);
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        const sx=left+x,sy=top+y;
        out[y*width+x]=bitmap.data[sy*bitmap.width+sx]??0;
      }
    }
    return {width,height,data:out};
  }

  function deskew(bitmap){
    const {width,height,data}=bitmap;
    let best=bitmap,bestScore=-1;
    for(const angle of [-6,-4,-2,-1,0,1,2,4,6]){
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
      let score=0;
      for(let y=1;y<height-1;y++){
        let row=0;
        for(let x=0;x<width;x++)if(out[y*width+x])row++;
        score+=row;
      }
      if(score>bestScore){bestScore=score;best={width,height,data:out};}
    }
    return best;
  }

  function staffLines(bitmap){
    const {width,height,data}=bitmap;
    const projection=new Float32Array(height);
    for(let y=0;y<height;y++){
      let dark=0;
      for(let x=0;x<width;x++)if(data[y*width+x])dark++;
      projection[y]=dark/width;
    }
    const lines=[];
    for(let y=2;y<height-2;y++){
      const v=projection[y];
      if(v<0.12)continue;
      const neighbors=(projection[y-1]+projection[y+1])/2;
      if(v>=neighbors&&v>=projection[y-2]&&v>=projection[y+2])lines.push(y);
    }
  const groups=[];
    for(const y of lines){
      const last=groups.at(-1);
      if(!last||y-last.last>height*0.03)groups.push({first:y,last:y,values:[y]});
      else{last.last=y;last.values.push(y);}
    }
    const merged=groups.map(g=>({y:g.values.reduce((a,b)=>a+b,0)/g.values.length,len:g.values.length}));
    merged.sort((a,b)=>b.len-a.len);
    const picked=merged.slice(0,5).sort((a,b)=>a.y-b.y);
    if(picked.length<4)throw Error('五線が見つかりません。明るい場所で真上から撮り直してください');
    const spacing=(picked.at(-1).y-picked[0].y)/(picked.length-1);
    return {lines:picked.map(item=>item.y),spacing,width,height};
  }

  function pitchFromY(y,staff){
    const {lines,spacing}=staff;
    const mid=(lines[0]+lines.at(-1))/2;
    const lineIndex=Math.round((y-mid)/(-spacing/2));
    const midi=71-lineIndex;
    return P.fromMidi(Math.min(96,Math.max(48,midi)),0);
  }

  function noteheads(bitmap,staff){
    const {width,height,data}=bitmap;
    const {lines,spacing}=staff;
    const top=Math.max(0,lines[0]-spacing*2);
    const bottom=Math.min(height-1,lines.at(-1)+spacing*2);
    const blobs=[];
    const minR=Math.max(2,Math.round(spacing*0.22)),maxR=Math.round(spacing*0.55);
    const step=Math.max(2,Math.round(spacing*0.35));
    for(let y=top;y<=bottom;y+=step){
      for(let x=minR;x<width-maxR;x+=step){
        let fill=0,count=0;
        for(let dy=-maxR;dy<=maxR;dy++){
          for(let dx=-maxR;dx<=maxR;dx++){
            if(dx*dx+dy*dy>maxR*maxR)continue;
            const px=x+dx,py=y+dy;
            if(px<0||py<0||px>=width||py>=height)continue;
            count++;
            if(data[py*width+px])fill++;
          }
        }
        const ratio=fill/count;
        if(ratio<0.22||ratio>0.72)continue;
        const centerDist=Math.abs(y-(lines[2]??lines[1]));
        if(centerDist>spacing*4)continue;
        blobs.push({x,y,fill:ratio});
      }
    }
    blobs.sort((a,b)=>a.x-b.x||a.y-b.y);
    const merged=[];
    for(const blob of blobs){
      const near=merged.find(item=>Math.abs(item.x-blob.x)<step*1.5&&Math.abs(item.y-blob.y)<step*1.5);
      if(near){
        near.x=(near.x+blob.x)/2;
        near.y=(near.y+blob.y)/2;
        near.count=(near.count||1)+1;
      }else merged.push({...blob,count:1});
    }
    return merged.filter(item=>item.count>=1);
  }

  function ticksFromSpacing(spacing){return Math.max(120,Math.round(C.TPQ/spacing*8));}

  function clusterTimes(blobs,spacing){
    const grid=ticksFromSpacing(spacing);
    const groups=new Map();
    for(const blob of blobs){
      const tick=Math.round(blob.x/spacing)*grid;
      if(!groups.has(tick))groups.set(tick,{tick,items:[]});
      groups.get(tick).items.push(blob);
    }
    return [...groups.values()].sort((a,b)=>a.tick-b.tick);
  }

  function recognizeRGBA(imageData,{cropRect=null}={}){
    let gray=bitmapFromRGBA(imageData);
    gray=contrast(gray,1.35);
    let binary=binarize(gray);
    if(cropRect)binary=crop(binary,cropRect);
    binary=deskew(binary);
    const staff=staffLines(binary);
    const heads=noteheads(binary,staff);
    if(!heads.length)throw Error('音符らしい点を検出できませんでした');
    const clusters=clusterTimes(heads,staff.spacing);
    const notes=clusters.map((group,index)=>{
      const blob=group.items.reduce((best,item)=>item.fill>best.fill?item:best,group.items[0]);
      const pitch=pitchFromY(blob.y,staff);
      const next=clusters[index+1];
      const span=next?next.tick-group.tick:staff.spacing*C.TPQ/16;
      let den=8;
      if(span>=C.TPQ*0.75)den=1;
      else if(span>=C.TPQ*0.4)den=2;
      else if(span>=C.TPQ*0.2)den=4;
      else den=8;
      return {tick:group.tick,pitch,den,dots:0,x:blob.x,y:blob.y,confidence:Math.min(1,blob.fill*1.2)};
    });
    return {notes,staff,bitmap:binary,warnings:[
      'ブラウザ内の簡易OMRです。印刷された1譜表のメロディー向けで、和音・連符・臨時付きの譜は誤認識しやすいです。',
      '高精度が必要な場合は PC 版 Audiveris や oemer などの外部OMRを使い、MusicXML で取り込んでください。'
    ]};
  }

  function scoreFromNotes(notes,{title='写真から取り込み',time={num:4,den:4},tempo=100}={}){
    let score={...C.createScore(),title:title.slice(0,200),time,key:0,tempo,
      measures:[{id:C.uid(),events:[]}]};
    let mi=0,tick=0;
    for(const note of notes){
      const event=C.makeNote(note.pitch,note.den,note.dots||0);
      while(mi>=score.measures.length)score=C.addMeasure(score);
      const need=C.eventTicks(event);
      if(tick+need>C.barTicks(score,mi)){
        const rest=C.barTicks(score,mi)-tick;
        if(rest>0)score=C.placeEventAt(score,mi,tick,C.makeRest(4,0)).score;
        mi+=1;
        tick=0;
        if(mi>=score.measures.length)score=C.addMeasure(score);
      }
      score=C.placeEventAt(score,mi,tick,event).score;
      tick+=need;
    }
    return score;
  }

  function advance(score,cursor,gap){
    let next=score,left=gap;
    while(left>0){
      const offsets=C.measureOffsets(next);
      if(cursor>=offsets.at(-1))next=C.addMeasure(next);
      const {mi,tick}=C.locateTick(C.measureOffsets(next),cursor);
      const room=C.barTicks(next,mi)-tick;
      const chunk=Math.min(left,room);
      const den=chunk>=C.TPQ?4:8;
      next=C.placeEventAt(next,mi,tick,C.makeRest(den,0)).score;
      cursor+=chunk;
      left-=chunk;
    }
    return {score:next,cursor};
  }

  function extractPdfImage(bytes){
    const text=String.fromCharCode(...bytes.subarray(0,Math.min(bytes.length,2_000_000)));
    const start=text.indexOf('/DCTDecode');
    if(start<0)throw Error('このPDFには埋め込み画像がありません。写真で撮り直すか、画像として書き出してください');
    const stream=text.indexOf('stream',start);
    if(stream<0)throw Error('PDF画像ストリームを読み取れませんでした');
    const contentStart=text.indexOf('\n',stream)+1;
    const end=text.indexOf('endstream',contentStart);
    if(end<0)throw Error('PDF画像の終端が見つかりませんでした');
    const chunk=text.slice(contentStart,end).replace(/\r/g,'');
    const raw=Uint8Array.from(chunk,c=>c.charCodeAt(0));
    const begin=raw.findIndex((_,i)=>raw[i]===255&&raw[i+1]===216);
    if(begin<0)throw Error('PDF内のJPEGを検出できませんでした');
    return raw.subarray(begin);
  }

  root.KanadeOMR={
    preprocess:{bitmapFromRGBA,contrast,binarize,crop,deskew},
    recognizeRGBA,scoreFromNotes,extractPdfImage,staffLines,noteheads
  };
})(globalThis);