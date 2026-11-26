/* Synthetic engraved images for OMR evaluation without a browser canvas. */
(function(root){
  'use strict';
  const C=root.KanadeCore;

  function renderScoreBitmap(score,{width=640,height=200,measuresOnImage=null,rotationDeg=0,noise=0}={}){
    const barCount=measuresOnImage??score.measures.length;
    const data=new Uint8ClampedArray(width*height*4);
    for(let i=0;i<data.length;i+=4)data[i]=data[i+1]=data[i+2]=248,data[i+3]=255;
    const margin=48;
    const staffTop=Math.round(height*0.38);
    const spacing=10;
    const lines=Array.from({length:5},(_,i)=>staffTop+i*spacing);
    for(const y of lines){
      for(let x=margin;x<width-margin;x++){
        const i=(y*width+x)*4;
        data[i]=data[i+1]=data[i+2]=28;
      }
    }
    const barTicks=C.TPQ*score.time.num*(4/score.time.den);
    const innerW=(width-margin*2)/barCount;
    const notes=groundTruth(score).filter(note=>note.mi<barCount);
    for(const note of notes){
      const x=Math.round(margin+note.mi*innerW+(note.tick/barTicks)*innerW*0.85);
      const y=pitchY(note.pitch,lines,spacing);
      drawDisc(data,width,x,y,6);
      if(note.den<=4)drawStem(data,width,x,y-6,Math.round(spacing*(note.den===1?6:note.den===2?4:2)));
    }
    for(let b=1;b<barCount;b++){
      const x=Math.round(margin+b*innerW);
      for(let y=lines[0]-spacing;y<=lines.at(-1)+spacing;y++){
        const i=(y*width+x)*4;
        data[i]=data[i+1]=data[i+2]=35;
      }
    }
    if(noise)addNoise(data,noise);
    if(rotationDeg)return rotate(data,width,height,rotationDeg);
    return {width,height,data};
  }

  function groundTruth(score){
    const time=score.time||{num:4,den:4};
    return score.measures.flatMap((bar,mi)=>{
      const spans=C.eventSpans(score,mi,false);
      return spans.filter(span=>span.event.type==='note').flatMap(span=>
        span.event.pitches.map(pitch=>({
          mi,tick:span.start,den:span.event.den,dots:span.event.dots||0,pitch:C.normalPitch(pitch)
        }))
      );
    });
  }

  function pitchY(pitch,lines,spacing){
    const midi=C.pitchMidi(pitch);
    const ref=71;
    return Math.round(lines[2]-(midi-ref)*(spacing/2));
  }

  function drawDisc(data,width,cx,cy,r){
    for(let dy=-r;dy<=r;dy++){
      for(let dx=-r;dx<=r;dx++){
        if(dx*dx+dy*dy>r*r)continue;
        const x=cx+dx,y=cy+dy;
        const i=(y*width+x)*4;
        if(i<0||i>=data.length)continue;
        data[i]=data[i+1]=data[i+2]=20;
      }
    }
  }

  function drawStem(data,width,x,y0,len){
    for(let y=y0;y<y0+len;y++){
      const i=(y*width+x)*4;
      if(i<0||i>=data.length)continue;
      data[i]=data[i+1]=data[i+2]=22;
    }
  }

  function addNoise(data,strength){
    for(let i=0;i<data.length;i+=4){
      if(Math.random()<strength*0.02)data[i]=data[i+1]=data[i+2]=Math.random()>0.5?30:230;
    }
  }

  function rotate(data,width,height,deg){
    const rad=deg*Math.PI/180;
    const cos=Math.cos(rad),sin=Math.sin(rad);
    const out=new Uint8ClampedArray(data.length);
    for(let i=0;i<out.length;i+=4)out[i]=out[i+1]=out[i+2]=248,out[i+3]=255;
    const cx=width/2,cy=height/2;
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        const dx=x-cx,dy=y-cy;
        const sx=Math.round(cos*dx+sin*dy+cx);
        const sy=Math.round(-sin*dx+cos*dy+cy);
        if(sx<0||sy<0||sx>=width||sy>=height)continue;
        const si=sy*width+sx,o=y*width+x;
        out[si*4]=data[o*4];out[si*4+1]=data[o*4+1];out[si*4+2]=data[o*4+2];
      }
    }
    return {width,height,data:out};
  }

  function buildDurationMix(){
    const score={...C.createScore(),time:{num:4,den:4}};
    score.measures[0].events.push(
      C.makeNote({step:'E',octave:4,alter:0},4),
      C.makeNote({step:'F',octave:4,alter:0},8),
      C.makeNote({step:'G',octave:4,alter:0},8),
      C.makeNote({step:'A',octave:4,alter:0},2)
    );
    return score;
  }

  function buildAccidentalMelody(){
    const score={...C.createScore(),time:{num:4,den:4},key:2};
    score.measures[0].events.push(
      C.makeNote({step:'F',octave:4,alter:1},4),
      C.makeNote({step:'C',octave:5,alter:1},4),
      C.makeNote({step:'B',octave:4,alter:-1},4)
    );
    return score;
  }

  function buildTwoStaffMelody(){
    const score={...C.createScore(),time:{num:4,den:4}};
    score.measures[0].events.push(
      C.makeNote({step:'E',octave:4,alter:0},4),
      C.makeNote({step:'G',octave:4,alter:0},4)
    );
    score.measures.push({id:C.uid(),events:[
      C.makeNote({step:'C',octave:4,alter:0},4),
      C.makeNote({step:'E',octave:4,alter:0},4)
    ]});
    return score;
  }

  function blurBitmap(imageData,radius=1){
    if(!radius)return imageData;
    const {width,height,data}=imageData;
    const out=new Uint8ClampedArray(data);
    for(let y=1;y<height-1;y++){
      for(let x=1;x<width-1;x++){
        let r=0,g=0,b=0,c=0;
        for(let dy=-radius;dy<=radius;dy++){
          for(let dx=-radius;dx<=radius;dx++){
            const o=((y+dy)*width+(x+dx))*4;
            r+=data[o];g+=data[o+1];b+=data[o+2];c++;
          }
        }
        const o=(y*width+x)*4;
        out[o]=r/c;out[o+1]=g/c;out[o+2]=b/c;
      }
    }
    return {width,height,data:out};
  }

  root.KanadeOmrFixture={
    renderScoreBitmap,groundTruth,buildDurationMix,buildAccidentalMelody,buildTwoStaffMelody,blurBitmap
  };
})(globalThis);