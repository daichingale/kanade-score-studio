const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core');
require('../src/performance');
require('../src/omr-recognize');

const O=global.KanadeOMR;

function syntheticStaffBitmap(width=320,height=180){
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4)data[i]=data[i+1]=data[i+2]=248,data[i+3]=255;
  const lines=[60,76,92,108,124];
  for(const y of lines){
    for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      data[i]=data[i+1]=data[i+2]=30;
      data[i+3]=255;
    }
  }
  const notes=[{x:70,y:92},{x:120,y:84},{x:170,y:100},{x:220,y:76}];
  for(const {x,y} of notes){
    for(let dy=-6;dy<=6;dy++){
      for(let dx=-6;dx<=6;dx++){
        if(dx*dx+dy*dy>36)continue;
        const px=x+dx,py=y+dy;
        const i=(py*width+px)*4;
        data[i]=data[i+1]=data[i+2]=35;
        data[i+3]=255;
      }
    }
  }
  return {width,height,data};
}

test('OMR detects synthetic staff notes',()=>{
  const result=O.recognizeRGBA(syntheticStaffBitmap());
  assert.ok(result.notes.length>=2);
  const score=O.scoreFromNotes(result.notes,{title:'OMRテスト'});
  assert.equal(C.validateScore(score).length,0);
  assert.ok(score.measures[0].events.length);
});

test('OMR binarize treats dark pixels as ink',()=>{
  const gray=O.preprocess.bitmapFromRGBA(syntheticStaffBitmap());
  const binary=O.preprocess.binarize(O.preprocess.contrast(gray));
  let dark=0;
  for(const v of binary.data)if(v)dark++;
  assert.ok(dark>100);
});