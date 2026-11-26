/* Noteheads, stems, beams, rests, chords from staff-removed ink. */
(function(root){
  'use strict';
  const I=root.KanadeOmrImage;

  function components(bitmap,staff){
    const {width,height,data}=bitmap;
    const top=Math.max(0,staff.lines[0]-staff.spacing*2);
    const bottom=Math.min(height-1,staff.lines.at(-1)+staff.spacing*2);
    const visited=new Uint8Array(width*height);
    const blobs=[];
    for(let y=top;y<=bottom;y++){
      for(let x=1;x<width-1;x++){
        const i=y*width+x;
        if(!data[i]||visited[i])continue;
        const stack=[[x,y]],pixels=[];
        let sumX=0,sumY=0;
        visited[i]=1;
        let minX=x,maxX=x,minY=y,maxY=y;
        while(stack.length){
          const [cx,cy]=stack.pop();
          pixels.push([cx,cy]);
          sumX+=cx;sumY+=cy;
          minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);
          minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);
          for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
            const nx=cx+dx,ny=cy+dy;
            if(nx<0||ny<0||nx>=width||ny>=height)continue;
            const ni=ny*width+nx;
            if(!data[ni]||visited[ni])continue;
            visited[ni]=1;
            if(Math.abs(ny-y)<=staff.spacing*5)stack.push([nx,ny]);
          }
        }
        const area=pixels.length;
        const bw=maxX-minX+1,bh=maxY-minY+1;
        if(area<3)continue;
        if(bw>width*0.55&&bh<staff.spacing*1.25)continue;
        blobs.push({
          x:sumX/area,y:sumY/area,minX,maxX,minY,maxY,area,
          width:bw,height:bh,hollow:hollowRatio(bitmap,pixels)
        });
      }
    }
    return blobs.filter(b=>classifyBlob(b,staff));
  }

  function hollowRatio(bitmap,pixels){
    let inner=0,total=0;
    for(const [x,y] of pixels){
      const i=y*bitmap.width+x;
      if(bitmap.data[i])total++;
      for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=bitmap.width||ny>=bitmap.height)continue;
        if(!bitmap.data[ny*bitmap.width+nx])inner++;
      }
    }
    return total?inner/(total*5):0;
  }

  function classifyBlob(blob,staff){
    if(blob.width>staff.spacing*3.2&&blob.height<staff.spacing*0.85)return false;
    const round=blob.width<staff.spacing*1.55&&blob.height<staff.spacing*1.55;
    const tall=blob.height>staff.spacing*1.4&&blob.width<=staff.spacing*0.65;
    const wide=blob.width>staff.spacing*2&&blob.height<staff.spacing*0.85;
    return round||tall||wide;
  }

  function stems(bitmap,staff,heads){
    const {width,height,data}=bitmap;
    const stems=[];
    for(const head of heads){
      if(head.kind!=='note')continue;
      let best=null;
      for(let dy=1;dy<staff.spacing*4;dy++){
        const y=head.y-Math.round(dy);
        const x=head.x+Math.round(staff.spacing*0.35);
        if(y<0||x>=width)break;
        if(data[y*width+x]){
          best={x,y,length:dy,up:true};break;
        }
      }
      for(let dy=1;dy<staff.spacing*3;dy++){
        const y=head.y+Math.round(dy);
        const x=head.x+Math.round(staff.spacing*0.35);
        if(y>=height||x>=width)break;
        if(data[y*width+x]){
          const down={x,y,length:dy,up:false};
          if(!best||down.length>best.length)best=down;
          break;
        }
      }
      if(best)stems.push({head,best});
    }
    return stems;
  }

  function beams(bitmap,staff){
    const {width,height,data}=bitmap;
    const beams=[];
    const top=staff.lines[0]-staff.spacing, bottom=staff.lines[2]+staff.spacing;
    for(let y=top;y<=bottom;y++){
      let start=null;
      for(let x=0;x<width;x++){
        const on=data[y*width+x];
        if(on&&!start)start=x;
        if((!on||x===width-1)&&start!==null){
          const end=on?x:x-1;
          if(end-start>=staff.spacing*1.4)beams.push({y,x0:start,x1:end,len:end-start+1});
          start=null;
        }
      }
    }
    return beams;
  }

  function scanNoteheads(bitmap,staff){
    const {width,height,data}=bitmap;
    const minR=Math.max(2,Math.round(staff.spacing*0.2)),maxR=Math.round(staff.spacing*0.65);
    const step=Math.max(3,Math.round(staff.spacing*0.45));
    const top=Math.max(0,staff.lines[0]-staff.spacing*2);
    const bottom=Math.min(height-1,staff.lines.at(-1)+staff.spacing*2);
    const hits=[];
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
        if(ratio<0.22||ratio>0.74)continue;
        const top=staff.lines[0]-staff.spacing*2.2,bottom=staff.lines.at(-1)+staff.spacing*2.2;
        if(y<top||y>bottom)continue;
        hits.push({x,y,minX:x-maxR,maxX:x+maxR,minY:y-maxR,maxY:y+maxR,width:maxR*2,height:maxR*2,
          area:count,fill:ratio,filled:ratio>0.45,hollow:ratio<0.45,kind:'note'});
      }
    }
    const merged=[];
    for(const hit of hits){
      const near=merged.find(item=>Math.abs(item.x-hit.x)<step*1.2&&Math.abs(item.y-hit.y)<step*1.2);
      if(near){near.x=(near.x+hit.x)/2;near.y=(near.y+hit.y)/2;}
      else merged.push(hit);
    }
    return merged;
  }

  function assignSymbols(bitmap,staff){
    const scanned=scanNoteheads(bitmap,staff);
    const raw=components(bitmap,staff);
    const heads=[...scanned,...raw.map(blob=>{
      const round=blob.width<staff.spacing*1.55&&blob.height<staff.spacing*1.55;
      const rest=blob.width>staff.spacing*1.8;
      return {
        ...blob,
        kind:rest?'rest':(round?'note':'mark'),
        filled:blob.hollow<0.22
      };
    }).filter(item=>item.kind!=='mark')];
    let noteHeads=heads.filter(h=>h.kind==='note');
    const unique=[];
    for(const head of noteHeads){
      if(unique.some(u=>Math.abs(u.x-head.x)<staff.spacing*0.35&&Math.abs(u.y-head.y)<staff.spacing*0.35))continue;
      unique.push(head);
    }
    noteHeads=unique;
    const stemInfo=stems(bitmap,staff,heads);
    const beamList=beams(bitmap,staff);
    return {heads,noteHeads,stemInfo,beamList};
  }

  function durationForHead(head,stemInfo,beamList,staff,nextX){
    const stem=stemInfo.find(item=>item.head===head);
    const localBeams=beamList.filter(b=>Math.abs(b.y-head.y)<staff.spacing*1.2&&b.x0<=head.x+4&&b.x1>=head.x-4);
    if(localBeams.length>=2)return 16;
    if(localBeams.length===1)return 8;
    if(stem?.best?.length>=staff.spacing*2.2)return 8;
    if(head.filled===false)return 2;
    const gap=nextX!=null?nextX-head.x:staff.spacing*2;
    if(gap>=staff.spacing*3.5)return 1;
    if(gap>=staff.spacing*2.3)return 2;
    if(gap>=staff.spacing*1.5)return 4;
    return 8;
  }

  function chordGroups(noteHeads,staff){
    const groups=[];
    const sorted=[...noteHeads].sort((a,b)=>a.x-b.x||a.y-b.y);
    for(const head of sorted){
      const group=groups.find(g=>Math.abs(g.x-head.x)<staff.spacing*0.45);
      if(group)group.heads.push(head);
      else groups.push({x:head.x,heads:[head]});
    }
    return groups;
  }

  function accidentalMarks(bitmap,staff,head){
    const {data,width}=bitmap;
    const box=head.minX-staff.spacing;
    for(let x=Math.max(0,box);x<head.minX;x++){
      let col=0;
      for(let y=head.minY;y<=head.maxY;y++)if(data[y*width+x])col++;
      if(col>head.height*0.35)return x<head.minX-staff.spacing*0.4?'flat':'sharp';
    }
    return 0;
  }

  root.KanadeOmrGlyphs={
    components,assignSymbols,durationForHead,chordGroups,accidentalMarks,stems,beams
  };
})(globalThis);