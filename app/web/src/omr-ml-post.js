/* oemer seg masks → notes with durations (stems/rests/dots heuristic). */
(function(root){
  'use strict';
  const C=root.KanadeCore;
  const Staff=()=>root.KanadeOmrStaff;
  const Priors=()=>root.KanadeOmrPriors;
  const Masks=root.KanadeOmrMlMasks;

  const CLS={BG:0,STAFF:1,SYMBOL:2,NOTEHEAD:1,CLEF_KEY:2,STEM_REST:3};

  function decodeSeg(seg,width,height){
    const data=seg instanceof Uint8Array?seg:seg.data;
    const note=new Uint8Array(width*height);
    const stem=new Uint8Array(width*height);
    for(let i=0;i<data.length;i++){
      const v=data[i];
      if(v===CLS.NOTEHEAD)note[i]=1;
      if(v===CLS.CLEF_KEY||v===CLS.STEM_REST)stem[i]=1;
    }
    return {note,stem};
  }

  function dotNear(note,x,y,staff,binary){
    const r=Math.round(staff.spacing*0.35);
    let hits=0;
    for(let dy=-r;dy<=r;dy++){
      for(let dx=Math.round(staff.spacing*0.3);dx<=Math.round(staff.spacing*0.9);dx++){
        const px=x+dx,py=y+dy;
        if(px<0||py<0||px>=binary.width||py>=binary.height)continue;
        if(binary.data[py*binary.width+px])hits++;
      }
    }
    return hits>staff.spacing*0.35?1:0;
  }

  function durationFromStem(note,staff,stemMask,beams){
    const {width}=stemMask;
    const x=Math.round(note.x),y=Math.round(note.y);
    let stemLen=0,flags=0;
    for(let dy=1;dy<staff.spacing*5;dy++){
      const row=y-Math.round(dy);
      const col=x+Math.round(staff.spacing*0.35);
      if(row<0||col>=width)break;
      if(stemMask[row*width+col])stemLen=dy;
    }
    const local=beams.filter(b=>Math.abs(b.y-y+staff.spacing*1.2)<staff.spacing&&b.x0<=x+6&&b.x1>=x-6);
    if(local.length>=2)return {den:16,dots:0,conf:0.82};
    if(local.length===1)return {den:8,dots:0,conf:0.8};
    if(stemLen>=staff.spacing*1.6)return {den:8,dots:0,conf:0.76};
    if(!note.filled)return {den:2,dots:0,conf:0.74};
    return {den:4,dots:0,conf:0.78};
  }

  function recognizeFromMlSeg(imageData,{staffMask,segMask,time={num:4,den:4}}={}){
    const prep=root.KanadeOmrPreprocess?.prepare(imageData)||{binary:{width:imageData.width,height:imageData.height,data:new Uint8Array(imageData.width*imageData.height)}};
    const binary=prep.binary;
    let staff;
    try{staff=Staff().staffLines(binary);}
    catch(_){staff={lines:[84,94,104,114,124],spacing:10,width:binary.width,height:binary.height};}
    const w=segMask.width||512,h=segMask.height||512;
    const {note,stem}=decodeSeg(segMask,w,h);
    const scaledNote=Masks.resizeMask?.(note,w,h,binary.width,binary.height)||{data:note,width:binary.width,height:binary.height};
    const scaledStem=Masks.resizeMask?.(stem,w,h,binary.width,binary.height)||{data:stem,width:binary.width,height:binary.height};
    const heads=Masks.centroids(scaledNote.data,binary.width,binary.height,1,5);
    const slices=Staff().measureSlices(Staff().barLines(binary,staff),binary.width);
    const beams=root.KanadeOmrGlyphs?.beams(binary,staff)||[];
    const notes=[];
    for(let i=0;i<heads.length;i++){
      const head=heads[i];
      const next=heads[i+1];
      const dur=durationFromStem(head,staff,scaledStem.data,beams);
      const dots=dotNear(head,head.x,head.y,staff,binary);
      const accidental=root.KanadeOmrGlyphs?.accidentalMarks(binary,staff,head)||0;
      const pitch=Priors().pitchFromY(head.y,staff,'treble',0);
      if(accidental==='flat')pitch.alter=-1;
      if(accidental==='sharp')pitch.alter=1;
      notes.push({
        mi:Math.floor(Priors().xToTick(head.x,staff,slices)/(C.TPQ*time.num*(4/time.den))),
        tick:Priors().xToTick(head.x,staff,slices)%(C.TPQ*time.num*(4/time.den)),
        pitch,dots,den:dur.den,
        x:head.x,y:head.y,filled:true,
        confidence:dur.conf-(dots?0.05:0)
      });
    }
    const rests=Masks.centroids(scaledStem.data,binary.width,binary.height,1,12)
      .filter(r=>!heads.some(h=>Math.abs(h.x-r.x)<staff.spacing*0.5&&Math.abs(h.y-r.y)<staff.spacing));
    for(const rest of rests){
      notes.push({mi:0,tick:Priors().xToTick(rest.x,staff,slices),rest:true,den:4,dots:0,confidence:0.62,x:rest.x,y:rest.y});
    }
    const key=Priors().inferKey(notes.filter(n=>!n.rest));
    let solved=root.KanadeOmrSolver?.correct(Priors().snapNotes(notes.filter(n=>!n.rest),key),{time,key})||notes;
    return {
      notes:solved,
      staff,bitmap:binary,key,method:'ml',
      warnings:['oemer ONNX セグメンテーション＋音価推定（符幹・ビーム・付点）']
    };
  }

  root.KanadeOmrMlPost={recognizeFromMlSeg,decodeSeg,durationFromStem};
})(globalThis);