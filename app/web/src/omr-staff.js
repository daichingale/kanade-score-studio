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
    const candidates=[];
    const bandTop=Math.floor(height*0.18),bandBottom=Math.ceil(height*0.88);
    for(let y=bandTop;y<bandBottom;y++){
      const v=projection[y];
      if(v<0.1)continue;
      if(v>=projection[y-1]&&v>=projection[y+1]&&v>=projection[y-2]&&v>=projection[y+2])candidates.push({y,v});
    }
    const groups=[];
    for(const item of candidates){
      const last=groups.at(-1);
      if(!last||item.y-last.last>height*0.028)groups.push({first:item.y,last:item.y,values:[item.y],score:item.v});
      else{last.last=item.y;last.values.push(item.y);last.score+=item.v;}
    }
    const systems=clusterSystems(groups,height);
  const picked=systems[0]?.lines||[];
    if(picked.length<4)throw Error('五線が見つかりません。明るい場所で真上から撮り直してください');
    const spacing=(picked.at(-1)-picked[0])/(picked.length-1);
    return {lines:picked,spacing,width,height,systems};
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