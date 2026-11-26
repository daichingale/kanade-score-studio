import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../app/web/src/core.js');

function uid(){return C.uid();}

export function buildCorpus(){
  const corpus=[];
  const add=(id,title,builder)=>corpus.push({id,title,score:builder(title)});

  add('melody-cmajor','メロディー C メジャー',title=>{
    const s={...C.createScore(),title,time:{num:4,den:4},key:0};
    const steps=['E','F','G','A','G','F','E','D'];
    s.measures[0].events=steps.slice(0,4).map(step=>C.makeNote({step,octave:4,alter:0},4));
    s.measures.push({id:uid(),events:steps.slice(4,8).map(step=>C.makeNote({step,octave:4,alter:0},4))});
    return s;
  });

  add('dotted-eighth','付点8分+16分',title=>{
    const s={...C.createScore(),title,time:{num:4,den:4}};
    s.measures[0].events=[
      {...C.makeNote({step:'E',octave:4,alter:0},8),dots:1},
      C.makeNote({step:'F',octave:4,alter:0},16),
      C.makeNote({step:'G',octave:4,alter:0},4)
    ];
    return s;
  });

  add('accidentals-g','臨時 G メジャー / F#',title=>{
    const s={...C.createScore(),title,time:{num:4,den:4},key:1};
    s.measures[0].events=[
      C.makeNote({step:'G',octave:4,alter:0},4),
      C.makeNote({step:'F',octave:4,alter:1},4),
      C.makeNote({step:'E',octave:4,alter:0},4)
    ];
    return s;
  });

  add('3-4-waltz','3/4 ワルツ',title=>{
    const s={...C.createScore(),title,time:{num:3,den:4},key:0};
    s.measures[0].events=[
      C.makeNote({step:'C',octave:5,alter:0},4),
      C.makeNote({step:'E',octave:4,alter:0},8),
      C.makeNote({step:'G',octave:4,alter:0},8)
    ];
    s.measures.push({id:uid(),events:Array(3).fill(C.makeRest(4))});
    return s;
  });

  add('rest-heavy','休符多め',title=>{
    const s={...C.createScore(),title,time:{num:4,den:4}};
    s.measures[0].events=[C.makeRest(2),C.makeNote({step:'A',octave:4,alter:0},4),C.makeRest(4)];
    return s;
  });

  add('chord-triads','和音トライアド',title=>{
    const s={...C.createScore(),title,time:{num:4,den:4}};
    const chord=den=>{
      const e=C.makeNote({step:'C',octave:4,alter:0},den);
      e.pitches=[{step:'C',octave:4,alter:0},{step:'E',octave:4,alter:0},{step:'G',octave:4,alter:0}];
      return e;
    };
    s.measures[0].events=[chord(2),chord(4)];
    return s;
  });

  add('sixteenth-run','16分の走り',title=>{
    const s={...C.createScore(),title,time:{num:4,den:4}};
    s.measures[0].events=['E','F','G','A','B','C','D','E'].map(step=>C.makeNote({step,octave:4,alter:0},16));
    return s;
  });

  add('half-whole','二分+全音符',title=>{
    const s={...C.createScore(),title,time:{num:4,den:4}};
    s.measures[0].events=[
      C.makeNote({step:'D',octave:4,alter:0},2),
      C.makeNote({step:'E',octave:4,alter:0},1)
    ];
    return s;
  });

  add('key-change','調変更 2小節',title=>{
    const s={...C.createScore(),title,time:{num:4,den:4},key:0};
    s.measures[0].events=[C.makeNote({step:'C',octave:4,alter:0},4),C.makeNote({step:'D',octave:4,alter:0},4)];
    s.measures.push({id:uid(),events:[C.makeNote({step:'F',octave:4,alter:1},4)]});
    s.key=2;
    return s;
  });

  add('tie-across','タイ（同音連結）',title=>{
    const s={...C.createScore(),title,time:{num:4,den:4}};
    const a=C.makeNote({step:'A',octave:4,alter:0},2);
    a.tieStart=true;
    const b=C.makeNote({step:'A',octave:4,alter:0},2);
    b.tieStop=true;
    s.measures[0].events=[a];
    s.measures.push({id:uid(),events:[b,C.makeNote({step:'G',octave:4,alter:0},4)]});
    return s;
  });

  add('band-part','吹奏パート風 3小節',title=>{
    const s={...C.createScore(),title,time:{num:4,den:4},key:2,tempo:96};
    s.measures[0].events=[
      C.makeNote({step:'B',octave:4,alter:0},4),
      C.makeNote({step:'C',octave:5,alter:1},4),
      C.makeNote({step:'D',octave:5,alter:0},8),
      C.makeNote({step:'E',octave:5,alter:0},8)
    ];
    s.measures.push({id:uid(),events:[C.makeNote({step:'F',octave:5,alter:1},4),C.makeRest(4)]});
    s.measures.push({id:uid(),events:[C.makeNote({step:'G',octave:5,alter:0},2)]});
    return s;
  });

  add('bass-range','低音域',title=>{
    const s={...C.createScore(),title,time:{num:4,den:4},clef:'bass'};
    s.measures[0].events=[C.makeNote({step:'E',octave:2,alter:0},4),C.makeNote({step:'G',octave:2,alter:0},4)];
    return s;
  });

  add('mixed-durs','混在音価 4種',title=>{
    const s={...C.createScore(),title,time:{num:4,den:4}};
    s.measures[0].events=[
      C.makeNote({step:'E',octave:4,alter:0},4),
      C.makeNote({step:'F',octave:4,alter:0},8),
      C.makeNote({step:'G',octave:4,alter:0},2)
    ];
    return s;
  });

  add('pickup','弱起 1拍',title=>{
    const s={...C.createScore(),title,time:{num:4,den:4}};
    s.measures[0].events=[C.makeNote({step:'G',octave:4,alter:0},8)];
    s.measures.push({id:uid(),events:[C.makeNote({step:'A',octave:4,alter:0},4),C.makeNote({step:'B',octave:4,alter:0},4)]});
    return s;
  });

  add('chromatic','半音階 5音',title=>{
    const s={...C.createScore(),title,time:{num:4,den:4}};
    s.measures[0].events=[
      C.makeNote({step:'C',octave:4,alter:0},8),
      C.makeNote({step:'C',octave:4,alter:1},8),
      C.makeNote({step:'D',octave:4,alter:0},8),
      C.makeNote({step:'E',octave:4,alter:-1},8),
      C.makeNote({step:'E',octave:4,alter:0},4)
    ];
    return s;
  });

  return corpus;
}

export function truthEvents(score){
  const events=[];
  const barTicks=C.TPQ*score.time.num*(4/score.time.den);
  for(let mi=0;mi<score.measures.length;mi++){
    const spans=C.eventSpans(score,mi,false);
    for(const span of spans){
      if(span.event.type==='rest'){
        events.push({mi,tick:span.start,rest:true,den:span.event.den,dots:span.event.dots||0});
        continue;
      }
      for(const pitch of span.event.pitches||[{step:'C',octave:4,alter:0}]){
        events.push({
          mi,tick:span.start,pitch:C.normalPitch(pitch),
          den:span.event.den,dots:span.event.dots||0
        });
      }
    }
  }
  return {events,barTicks};
}