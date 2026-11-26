/* Legacy OMR (v1) kept for regression metrics. */
(function(root){
  'use strict';
  const C=root.KanadeCore;
  const Img=root.KanadeOmrImage;
  const Staff=root.KanadeOmrStaff;
  const Priors=root.KanadeOmrPriors;

  function recognizeLegacy(imageData){
    let gray=Img.bitmapFromRGBA(imageData);
    gray=Img.contrast(gray,1.35);
    let binary=Img.binarizeGlobal(gray);
    binary=Img.deskew(binary,[-6,-4,-2,-1,0,1,2,4,6]);
    const staff=Staff.staffLines(binary);
    const minR=Math.max(2,Math.round(staff.spacing*0.22)),maxR=Math.round(staff.spacing*0.55);
    const step=Math.max(2,Math.round(staff.spacing*0.35));
    const heads=[];
    const {width,height,data}=binary;
    const top=Math.max(0,staff.lines[0]-staff.spacing*2);
    const bottom=Math.min(height-1,staff.lines.at(-1)+staff.spacing*2);
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
        heads.push({x,y,fill:ratio});
      }
    }
    const grid=Math.max(60,Math.round(C.TPQ/8));
    const clusters=new Map();
    for(const blob of heads){
      const tick=Math.round(blob.x/staff.spacing)*grid;
      if(!clusters.has(tick))clusters.set(tick,[]);
      clusters.get(tick).push(blob);
    }
    const notes=[...clusters.keys()].sort((a,b)=>a-b).map((tick,i,keys)=>{
      const items=clusters.get(tick);
      const blob=items[0];
      const next=keys[i+1];
      const span=next?next-tick:grid;
      let den=8;
      if(span>=C.TPQ*0.75)den=1;
      else if(span>=C.TPQ*0.4)den=2;
      else if(span>=C.TPQ*0.2)den=4;
      return {tick,pitch:Priors.pitchFromY(blob.y,staff),den,dots:0,x:blob.x,y:blob.y};
    });
    return {notes,staff,bitmap:binary};
  }

  root.KanadeOmrClassic={recognizeLegacy};
})(globalThis);