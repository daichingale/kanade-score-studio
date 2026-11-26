/* Staff systems, spacing, bar lines for OMR. */
(function(root){
  'use strict';

  function staffLines(bitmap){
    const {width,height,data}=bitmap;
    const projection=new Float32Array(height);
    for(let y=0;y<height;y++){
      let dark=0;
      for(let x=0;x<width;x++)if(data[y*width+x])dark++;
      projection[y]=dark/width;
    }
    const bandTop=Math.floor(height*0.12),bandBottom=Math.ceil(height*0.9);
    let peakMax=0;
    for(let y=bandTop;y<bandBottom;y++)peakMax=Math.max(peakMax,projection[y]);
    let picked=[];
    if(peakMax>0.18){
      picked=staffFromEngraving(projection,bandTop,bandBottom,height);
    }
    if(picked.length<4){
      picked=staffFromPhoto(projection,bandTop,bandBottom,height,peakMax);
    }
    if(picked.length<4)throw Error('五線が見つかりません。明るい場所で真上から撮り直してください');
    const spacing=(picked.at(-1)-picked[0])/(picked.length-1);
    return {lines:picked,spacing,width,height,systems:[{lines:picked,spacing,score:picked.length}]};
  }

  function staffFromEngraving(projection,top,bottom,height){
    const thin=[];
    for(let y=top;y<bottom;y++){
      const v=projection[y];
      if(v<0.007||v>0.12)continue;
      thin.push({y,v});
    }
    const lines=[];
    for(let i=0;i<thin.length;i++){
      let best=thin[i],j=i+1;
      while(j<thin.length&&thin[j].y-best.y<=3){
        if(thin[j].v>best.v)best=thin[j];
        j++;
      }
      lines.push(best.y);
      i=j-1;
    }
  return pickStaffRun(lines,height);
  }

  function pickStaffRun(lineYs,height){
    const uniq=[...new Set(lineYs)].sort((a,b)=>a-b);
    let best=[],bestScore=-Infinity;
    for(let i=0;i<uniq.length;i++){
      const run=[uniq[i]];
      for(let j=i+1;j<uniq.length;j++){
        const gap=uniq[j]-run.at(-1);
        if(gap<4||gap>24)break;
        run.push(uniq[j]);
      }
      if(run.length<4)continue;
      const gaps=[];
      for(let k=1;k<run.length;k++)gaps.push(run[k]-run[k-1]);
      const mean=gaps.reduce((a,b)=>a+b,0)/gaps.length;
      if(mean<5||mean>20)continue;
      const variance=gaps.reduce((a,g)=>a+(g-mean)**2,0)/gaps.length;
      const center=run.reduce((a,y)=>a+y,0)/run.length;
      const prefer=1-Math.abs(center-height*0.45)/(height*0.45);
      const score=run.length*12-variance*2+prefer*8;
      if(score>bestScore){
        bestScore=score;
        const five=run.length>5?pickFiveEven(run):run;
        best=five;
      }
    }
    return best;
  }

  function pickFiveEven(run){
    if(run.length<=5)return run;
    const stride=(run.length-1)/4;
    const out=[];
    for(let i=0;i<5;i++)out.push(run[Math.round(i*stride)]);
    return out;
  }

  function staffFromPhoto(projection,top,bottom,height,peakMax){
    const minRatio=Math.max(0.025,Math.min(0.14,peakMax*0.42));
    const candidates=[];
    for(let y=top+2;y<bottom-2;y++){
      const v=projection[y];
      if(v<minRatio)continue;
      if(v>=projection[y-1]&&v>=projection[y+1]&&v>=projection[y-2]&&v>=projection[y+2])candidates.push({y,v});
    }
    const groups=[];
    for(const item of candidates){
      const last=groups.at(-1);
      const gap=Math.max(4,Math.round(height*0.012));
      if(!last||item.y-last.last>gap)groups.push({first:item.y,last:item.y,values:[item.y],score:item.v});
      else{last.last=item.y;last.values.push(item.y);last.score+=item.v;}
    }
    return clusterSystems(groups,height)[0]?.lines||[];
  }

  function clusterSystems(groups,height){
    const merged=groups.map(g=>({y:g.values.reduce((a,b)=>a+b,0)/g.values.length,len:g.values.length,score:g.score}))
      .sort((a,b)=>b.score-a.score);
    const slice=merged.slice(0,Math.min(25,merged.length)).sort((a,b)=>a.y-b.y);
    const systems=[];
    let bucket=[];
    for(const line of slice){
      if(!bucket.length||line.y-bucket.at(-1).y<height*0.06)bucket.push(line);
      else{
        if(bucket.length>=4)systems.push(packLines(bucket));
        bucket=[line];
      }
    }
    if(bucket.length>=4)systems.push(packLines(bucket));
    systems.sort((a,b)=>{
      const centerA=a.lines.reduce((sum,y)=>sum+y,0)/a.lines.length;
      const centerB=b.lines.reduce((sum,y)=>sum+y,0)/b.lines.length;
      const prefer=y=>1-Math.abs(y-height*0.45)/(height*0.45);
      return (b.score*b.lines.length+prefer(centerB)*5)-(a.score*a.lines.length+prefer(centerA)*5);
    });
    return systems;
  }

  function packLines(bucket){
    bucket.sort((a,b)=>a.y-b.y);
    const pick=bucket.length>5?bucket.filter((_,i)=>i%Math.ceil(bucket.length/5)===0).slice(0,5):bucket;
    const lines=pick.map(item=>item.y);
    const score=pick.reduce((s,item)=>s+item.len,0);
    return {lines,spacing:(lines.at(-1)-lines[0])/(lines.length-1),score};
  }

  function barLines(bitmap,staff){
    const {width,height,data}=bitmap;
    const top=staff.lines[0]-staff.spacing;
    const bottom=staff.lines.at(-1)+staff.spacing;
    const bars=[];
    for(let x=2;x<width-2;x++){
      let span=0;
      for(let y=top;y<=bottom;y++)if(data[y*width+x])span++;
      if(span>=staff.spacing*3.5)bars.push(x);
    }
    const merged=[];
    for(const x of bars){
      const last=merged.at(-1);
      if(!last||x-last>staff.spacing)merged.push(x);
      else merged[merged.length-1]=Math.round((last+x)/2);
    }
    return merged;
  }

  function measureSlices(barXs,width,margin=0){
    const edges=[margin,...barXs,width-margin];
    const slices=[];
    for(let i=0;i<edges.length-1;i++){
      const left=edges[i],right=edges[i+1];
      if(right-left>12)slices.push({left,right,width:right-left,index:i});
    }
    return slices;
  }

  root.KanadeOmrStaff={staffLines,barLines,measureSlices};
})(globalThis);