/* OMR orchestrator: classical CV pipeline + priors; ONNX optional via KanadeOmrMl. */
(function(root){
  'use strict';
  const C=root.KanadeCore;
  const Img=()=>root.KanadeOmrImage;
  const Staff=()=>root.KanadeOmrStaff;
  const Glyphs=()=>root.KanadeOmrGlyphs;
  const Priors=()=>root.KanadeOmrPriors;

  function recognizeRGBA(imageData,{cropRect=null,time=null,solver=true}={}){
    deps();
  const prep=root.KanadeOmrPreprocess?.prepare(imageData)||null;
    let gray=prep?.gray||Img().bitmapFromRGBA(imageData);
    let binary=prep?.binary||Img().sauvola(Img().contrast(gray,1.25),{window:Math.max(15,Math.round(imageData.width/28)|1)});
    if(cropRect)binary=crop(binary,cropRect);
    if(!prep){binary=Img().deskew(binary);binary=Img().perspective(binary);}
    let staff;
    try{staff=Staff().staffLines(binary);}
    catch{
      binary=prep?.engraved||Img().binarizeEngraved(gray);
      binary=Img().deskew(binary,[-4,-2,0,2,4]);
      try{staff=Staff().staffLines(binary);}
      catch{
        binary=Img().binarizeGlobal(gray);
        binary=Img().deskew(binary,[-4,-2,0,2,4]);
        staff=Staff().staffLines(binary);
      }
    }
    const bars=Staff().barLines(binary,staff);
    const slices=Staff().measureSlices(bars,binary.width);
    const symbols=Glyphs().assignSymbols(binary,staff);
    const groups=Glyphs().chordGroups(symbols.noteHeads,staff);
    const slotted=[];
    const seen=new Set();
    for(const group of groups){
      const tick=Priors().xToTick(group.x,staff,slices);
      const slot=Math.round(tick/(C.TPQ/4));
      if(seen.has(slot))continue;
      seen.add(slot);
      slotted.push({...group,tick});
    }
    if(!slotted.length)throw Error('音符らしい点を検出できませんでした');
    const beamList=symbols.beamList;
    const notes=[];
    for(let gi=0;gi<slotted.length;gi++){
      const group=slotted[gi];
      const next=slotted[gi+1];
      const head=group.heads[0];
      const span=next?next.tick-group.tick:C.TPQ;
      let den=Glyphs().durationForHead(head,symbols.stemInfo,beamList,staff,next?.x);
      if(span>=C.TPQ*0.9)den=4;
      else if(span>=C.TPQ*0.45)den=8;
      const pitches=group.heads.map(item=>{
        const accidental=Glyphs().accidentalMarks(binary,staff,item);
        const alter=accidental==='flat'?-1:accidental==='sharp'?1:0;
        const pitch=Priors().pitchFromY(item.y,staff,'treble',0);
        pitch.alter=alter||pitch.alter||0;
        return C.normalPitch(pitch);
      });
      notes.push({
        tick:group.tick,
        pitch:pitches[0],
        pitches:pitches.length>1?pitches:undefined,
        den,dots:0,
        x:group.x,y:head.y,
        confidence:head.filled?0.85:0.72
      });
    }
    for(const rest of symbols.heads.filter(h=>h.kind==='rest')){
      notes.push({
        tick:Priors().xToTick(rest.x,staff,slices),
        rest:true,den:4,dots:0,x:rest.x,y:rest.y,confidence:0.6
      });
    }
    const key=Priors().inferKey(notes.filter(n=>!n.rest));
    const snapped=Priors().snapNotes(notes.filter(n=>!n.rest),key);
    const meter=time||{num:4,den:4};
    let quantized=Priors().quantizeBarDurations(snapped,meter);
    if(solver&&root.KanadeOmrSolver){
      const withMi=quantized.map(note=>{
        const barTicks=C.TPQ*meter.num*(4/meter.den);
        return {...note,mi:Math.floor((note.tick||0)/barTicks),tick:(note.tick||0)%barTicks};
      });
      quantized=root.KanadeOmrSolver.correct(withMi,{time:meter,key,instrument:'melody'});
    }
    const mlNote=root.KanadeOmrMl?.status;
    return {
      notes:quantized,
      rests:notes.filter(n=>n.rest),
      staff,
      bitmap:binary,
      key,
      slices,
      warnings:[
        '改良版ブラウザOMRです。印刷譜の単一〜数系統、和音や符尾による音価推定に対応しましたが、手書き・スキャン品質・複雑な囲み音符は誤差が残ります。',
        mlNote?.reason||'外部の高精度OMRは MusicXML 経由で取り込んでください。'
      ]
    };
  }

  function crop(bitmap,{left,top,width,height}){
    const out=new Uint8Array(width*height);
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        const sx=left+x,sy=top+y;
        out[y*width+x]=bitmap.data[sy*bitmap.width+sx]??0;
      }
    }
    return {width,height,data:out,ink:1};
  }

  function deps(){
    if(!Img()||!Staff()||!Glyphs()||!Priors())throw Error('OMRモジュールが未読込です');
  }

  function scoreFromNotes(notes,{title='写真から取り込み',time={num:4,den:4},tempo=100,key=0}={}){
    const timed=notes.some(note=>Number.isFinite(note.tick));
    if(timed)return scoreFromTicks(notes,{title,time,tempo,key});
    let score={...C.createScore(),title:title.slice(0,200),time,key,tempo,
      measures:[{id:C.uid(),events:[]}]};
    let mi=0,tick=0;
    for(const note of notes){
      const event=C.makeNote(note.pitch,note.den,note.dots||0);
      if(note.pitches?.length>1)event.pitches=note.pitches.map(p=>C.normalPitch(p));
      while(mi>=score.measures.length)score=C.addMeasure(score);
      const need=C.eventTicks(event);
      if(tick+need>C.barTicks(score,mi)){
        const rest=C.barTicks(score,mi)-tick;
        if(rest>0)score=C.placeEventAt(score,mi,tick,C.makeRest(4,0)).score;
        mi+=1;tick=0;
        if(mi>=score.measures.length)score=C.addMeasure(score);
      }
      score=C.placeEventAt(score,mi,tick,event).score;
      tick+=need;
    }
    return score;
  }

  function scoreFromTicks(notes,meta){
    let score={...C.createScore(),title:meta.title.slice(0,200),time:meta.time,key:meta.key,tempo:meta.tempo,
      measures:[{id:C.uid(),events:[]}]};
    const barTicks=C.TPQ*meta.time.num*(4/meta.time.den);
    const grouped=new Map();
    for(const note of [...notes].sort((a,b)=>a.tick-b.tick)){
      const tick=Math.round(note.tick);
      if(!grouped.has(tick))grouped.set(tick,{...note,tick,pitches:[C.normalPitch(note.pitch)]});
      else grouped.get(tick).pitches.push(C.normalPitch(note.pitch));
    }
    for(const note of grouped.values()){
      const pitches=C.normalizeChord(note.pitches);
      const event=C.makeNote(pitches[0],note.den,note.dots||0);
      if(pitches.length>1)event.pitches=pitches;
      let mi=Math.floor(note.tick/barTicks);
      let tick=note.tick%barTicks;
      while(mi>=score.measures.length)score=C.addMeasure(score);
      if(tick+C.eventTicks(event)>C.barTicks(score,mi)){
        tick=0;mi=Math.min(mi+1,score.measures.length-1);
        if(mi>=score.measures.length)score=C.addMeasure(score);
      }
      score=C.placeEventAt(score,mi,tick,event).score;
    }
    return score;
  }

  function scoreFromRecognition(result,meta={}){
    return scoreFromNotes(result.notes,{title:meta.title,time:meta.time,key:result.key??0,tempo:meta.tempo||100});
  }

  function extractPdfImage(bytes){
    const text=String.fromCharCode(...bytes.subarray(0,Math.min(bytes.length,2_000_000)));
    const start=text.indexOf('/DCTDecode');
    if(start<0)throw Error('このPDFには埋め込み画像がありません。pdf.js 配置後はベクターPDFにも対応します。');
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

  async function pdfToImage(bytes){
    if(root.KanadeOmrPdf?.renderFirstPage&&typeof document!=='undefined'){
      try{return await root.KanadeOmrPdf.renderFirstPage(bytes);}
      catch(_){/* fall through */}
    }
    if(typeof document==='undefined')throw Error('PDF評価はブラウザまたは pdf.js 同梱が必要です');
    const jpeg=extractPdfImage(bytes);
    return decodeJpegBytes(jpeg);
  }

  function decodeJpegBytes(bytes){
    return new Promise((resolve,reject)=>{
      const blob=new Blob([bytes],{type:'image/jpeg'});
      const url=URL.createObjectURL(blob);
      const image=new Image();
      image.onload=()=>{
        const canvas=document.createElement('canvas');
        canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.drawImage(image,0,0);
        URL.revokeObjectURL(url);
        resolve(ctx.getImageData(0,0,canvas.width,canvas.height));
      };
      image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('PDF画像を開けませんでした'));};
      image.src=url;
    });
  }

  root.KanadeOMR={
    recognizeRGBA,
    recognizeLegacy:()=>root.KanadeOmrClassic?.recognizeLegacy,
    scoreFromNotes,
    scoreFromRecognition,
    extractPdfImage,
    pdfToImage,
    preprocess:()=>Img()?.bitmapFromRGBA
  };
})(globalThis);