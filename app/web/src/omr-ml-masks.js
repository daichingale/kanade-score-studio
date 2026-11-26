/* Turn oemer ONNX masks into note events (browser + node tests). */
(function(root){
  'use strict';
  const C=root.KanadeCore;
  const Priors=()=>root.KanadeOmrPriors;
  const Staff=()=>root.KanadeOmrStaff;

  function resizeMask(mask,srcW,srcH,dstW,dstH){
    const out=new Uint8Array(dstW*dstH);
    for(let y=0;y<dstH;y++){
      for(let x=0;x<dstW;x++){
        const sx=Math.floor(x*srcW/dstW),sy=Math.floor(y*srcH/dstH);
        out[y*dstW+x]=mask[sy*srcW+sx]||0;
      }
    }
    return {width:dstW,height:dstH,data:out};
  }

  function staffFromMask(staffMask,width,height){
    const projection=new Float32Array(height);
    for(let y=0;y<height;y++){
      let c=0;
      for(let x=0;x<width;x++)if(staffMask[y*width+x])c++;
      projection[y]=c/width;
    }
    const bitmap={width,height,data:staffMask,ink:1};
    return Staff().staffLines(bitmap);
  }

  function centroids(mask,width,height,klass,minArea=8){
    const hits=[];
    for(let y=1;y<height-1;y++){
      for(let x=1;x<width-1;x++){
        const i=y*width+x;
        if(mask[i]!==klass)continue;
        let area=0,sumX=0,sumY=0;
        for(let dy=-2;dy<=2;dy++){
          for(let dx=-2;dx<=2;dx++){
            const px=x+dx,py=y+dy;
            if(px<0||py<0||px>=width||py>=height)continue;
            if(mask[py*width+px]===klass){area++;sumX+=px;sumY+=py;}
          }
        }
        if(area<minArea)continue;
        hits.push({x:sumX/area,y:sumY/area,area});
      }
    }
    const merged=[];
    const step=Math.max(6,Math.round(width/80));
    for(const hit of hits){
      const near=merged.find(item=>Math.abs(item.x-hit.x)<step&&Math.abs(item.y-hit.y)<step);
      if(near){near.x=(near.x+hit.x)/2;near.y=(near.y+hit.y)/2;near.area+=hit.area;}
      else merged.push({...hit});
    }
    return merged;
  }

  function asMask(logits,size,klass){
    if(logits instanceof Uint8Array)return {width:size,height:size,data:logits};
    return thresholdClass(logits,size,size,klass);
  }

  function recognizeFromMlOutputs(imageData,{staffLogits,segLogits,symbolSize=512}={}){
    Priors();Staff();
    const {width,height}=imageData;
    const staffMask=asMask(staffLogits,symbolSize,1);
    const noteMask=asMask(segLogits,symbolSize,1);
    const scaledStaff=resizeMask(staffMask.data,symbolSize,symbolSize,width,height);
    let staff;
    try{staff=staffFromMask(scaledStaff.data,width,height);}
    catch{staff=Staff().staffLines({width,height,data:staffMask.data,ink:1});}
    const noteScaled=resizeMask(noteMask.data,symbolSize,symbolSize,width,height);
    const heads=centroids(noteScaled.data,width,height,1,6);
    const slices=Staff().measureSlices(Staff().barLines({width,height,data:scaledStaff.data,ink:1},staff),width);
    const notes=heads.map((head,index)=>{
      const next=heads[index+1];
      const tick=Priors().xToTick(head.x,staff,slices);
      let den=4;
      if(next){
        const span=Math.max(1,Priors().xToTick(next.x,staff,slices)-tick);
        if(span>=C.TPQ*0.85)den=4;
        else if(span>=C.TPQ*0.42)den=8;
        else den=16;
      }
      return {
        tick,pitch:Priors().pitchFromY(head.y,staff,'treble',0),
        den,dots:0,x:head.x,y:head.y,confidence:0.88,method:'ml'
      };
    });
    const key=Priors().inferKey(notes);
    return {
      notes:Priors().quantizeBarDurations(Priors().snapNotes(notes,key)),
      staff,
      bitmap:{width,height,data:scaledStaff.data,ink:1},
      key,
      warnings:[
        '高精度モード（oemer ONNX セグメンテーション）の結果です。全後処理は oemer 本体ほど完備ではありません。',
        'さらに高精度な場合は PC エンジン（Audiveris / oemer CLI）か MusicXML を直接取り込んでください。'
      ],
      method:'ml'
    };
  }

  function thresholdClass(logits,w,h,klass){
    const out=new Uint8Array(w*h);
    for(let i=0;i<w*h;i++){
      const v=logits[i];
      out[i]=v===klass||v>0.35?klass:0;
    }
    return {width:w,height:h,data:out};
  }

  function syntheticMasksFromFixture(imageData,truth){
    const {width,height}=imageData;
    const staff=new Uint8Array(width*height);
    const notes=new Uint8Array(width*height);
    const margin=48;
    const spacing=10;
    const staffTop=Math.round(height*0.38);
    const lines=Array.from({length:5},(_,i)=>staffTop+i*spacing);
    for(const y of lines){
      for(let x=margin;x<width-margin;x++)staff[y*width+x]=1;
    }
    const barCount=Math.max(1,...truth.map(note=>note.mi||0))+0;
    const barTicks=C.TPQ*4;
    const innerW=(width-margin*2)/Math.max(1,barCount+1);
    for(const note of truth){
      const mi=note.mi||0;
      const x=Math.round(margin+mi*innerW+(note.tick/barTicks)*innerW*0.85);
      const midi=C.pitchMidi(note.pitch);
      const y=Math.round(lines[2]-(midi-71)*(spacing/2));
      for(let dy=-4;dy<=4;dy++){
        for(let dx=-4;dx<=4;dx++){
          if(dx*dx+dy*dy>16)continue;
          const px=x+dx,py=y+dy;
          if(px<0||py<0||px>=width||py>=height)continue;
          notes[py*width+px]=1;
        }
      }
    }
    return {staffMask:staff,noteMask:notes,classSize:{w:width,h:height}};
  }

  function recognizeFromSyntheticMl(imageData,truth){
    const {width,height}=imageData;
    const spacing=10;
    const staffTop=Math.round(height*0.38);
    const lines=Array.from({length:5},(_,i)=>staffTop+i*spacing);
    const staff={lines,spacing,width,height};
    const {noteMask}=syntheticMasksFromFixture(imageData,truth);
    const slices=Staff().measureSlices(Staff().barLines({width,height,data:noteMask,ink:1},staff),width);
    const heads=centroids(noteMask,width,height,1,6);
    const barTicks=C.TPQ*4;
    const notes=heads.map((head,index)=>{
      const next=heads[index+1];
      const tick=Priors().xToTick(head.x,staff,slices);
      let den=4;
      if(next){
        const span=Math.max(1,Priors().xToTick(next.x,staff,slices)-tick);
        if(span>=barTicks*0.85)den=4;
        else if(span>=barTicks*0.4)den=8;
        else den=16;
      }
      return {tick,pitch:Priors().pitchFromY(head.y,staff,'treble',0),den,dots:0,x:head.x,y:head.y,confidence:0.9,method:'ml'};
    });
    const key=Priors().inferKey(notes);
    return {
      notes:Priors().quantizeBarDurations(Priors().snapNotes(notes,key)),
      staff,bitmap:{width,height,data:noteMask,ink:1},key,
      warnings:['合成 ML マスク評価'],method:'ml'
    };
  }

  root.KanadeOmrMlMasks={
    recognizeFromMlOutputs,recognizeFromSyntheticMl,syntheticMasksFromFixture,centroids
  };
})(globalThis);