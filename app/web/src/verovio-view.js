(function(root,factory){
  const api=factory(root.KanadeCore,root.KanadeMei,root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.KanadeVerovio=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C,Mei,root){
  'use strict';
  const STORAGE='kanade.renderer.v1';
  let enabled=false,paintedScore=null,timer=0,sequence=0,worker,workerFailed=false,mainEngine;
  const pending=new Map();
  function setEnabled(value){enabled=!!value;if(!enabled){paintedScore=null;clearTimeout(timer);}}
  function isEnabled(){return enabled;}
  function storageKey(){return STORAGE;}
  function options(kind){
    const print=kind==='print';
    return {
      font:'Bravura',scale:print?40:36,pageWidth:print?2100:1680,pageHeight:print?2970:2400,
      pageMarginTop:70,pageMarginBottom:70,pageMarginLeft:70,pageMarginRight:70,
      adjustPageHeight:!print,svgViewBox:true,xmlIdChecksum:false,header:'none',footer:'none',
      measureMinWidth:print?15:30
    };
  }
  function workerUrl(){
    const script=root.document?.querySelector('script[src$="verovio-view.js"]');
    const base=script?new URL(script.src):new URL('src/verovio-view.js',root.location?.href||'http://127.0.0.1/');
    return new URL('verovio-worker.js',base);
  }
  function ensureWorker(){
    if(worker||workerFailed||typeof Worker!=='function')return worker;
    try{
      worker=new Worker(workerUrl());
      worker.onmessage=event=>{
        const waiter=pending.get(event.data.id);
        if(!waiter)return;
        pending.delete(event.data.id);
        if(event.data.ok)waiter.resolve(event.data);
        else waiter.reject(new Error(event.data.error||'刻譜に失敗しました'));
      };
      worker.onerror=()=>{
        workerFailed=true;
        for(const [,waiter] of pending)waiter.reject(new Error('Verovioのワーカーを開始できませんでした'));
        pending.clear();
        try{worker.terminate();}catch{}
        worker=null;
      };
    }catch{workerFailed=true;worker=null;}
    return worker;
  }
  function loadMain(){
    if(root.verovio)return Promise.resolve(root.verovio);
    return new Promise((resolve,reject)=>{
      const script=root.document.createElement('script');
      script.src=new URL('../vendor/verovio/verovio-toolkit-wasm.js',workerUrl()).href;
      script.onload=()=>resolve(root.verovio);
      script.onerror=()=>reject(new Error('Verovioを読み込めませんでした'));
      root.document.head.append(script);
    });
  }
  async function engraveMain(data,kind){
    const verovio=await loadMain();
    if(!mainEngine)mainEngine=await new Promise((resolve,reject)=>{
      const start=()=>{try{resolve(new verovio.toolkit());}catch(error){reject(error);}};
      if(verovio.module?.calledRun)start();
      else verovio.module.onRuntimeInitialized=start;
    });
    const started=performance.now();
    mainEngine.setOptions(options(kind));
    if(!mainEngine.loadData(data))throw new Error('Verovioが楽譜を読めませんでした');
    const pages=mainEngine.getPageCount();
    const svgs=[];
    for(let page=1;page<=pages;page++)svgs.push(mainEngine.renderToSVG(page));
    return {svgs,pages,ms:Math.round(performance.now()-started)};
  }
  function engrave(data,kind){
    const engine=ensureWorker();
    if(!engine)return engraveMain(data,kind);
    const id=++sequence;
    return new Promise((resolve,reject)=>{
      pending.set(id,{resolve,reject});
      engine.postMessage({id,data,options:options(kind)});
    });
  }
  function readBox(measure){
    const staff=measure.querySelector?.('.staff')||measure;
    const lines=[...staff.querySelectorAll('path')].map(path=>{
      const match=(path.getAttribute('d')||'').match(/M\s*([\d.]+)[,\s]+([\d.]+)\s+L\s*([\d.]+)[,\s]+([\d.]+)/);
      if(!match)return null;
      const line={x0:+match[1],y:+match[2],x1:+match[3],y2:+match[4]};
      if(Math.abs(line.y-line.y2)>1||Math.abs(line.x1-line.x0)<20)return null;
      return line;
    }).filter(Boolean);
    if(!lines.length)return null;
    const longest=Math.max(...lines.map(line=>Math.abs(line.x1-line.x0)));
    const staffLines=lines.filter(line=>Math.abs(line.x1-line.x0)>longest*0.6).sort((a,b)=>a.y-b.y);
    const used=staffLines.length?staffLines:lines.sort((a,b)=>a.y-b.y);
    const gaps=[];
    for(let index=1;index<used.length;index++)gaps.push(used[index].y-used[index-1].y);
    gaps.sort((a,b)=>a-b);
    return {x0:Math.min(...used.map(line=>Math.min(line.x0,line.x1))),x1:Math.max(...used.map(line=>Math.max(line.x0,line.x1))),
      top:used[0].y,bottom:used[used.length-1].y,space:gaps[Math.floor(gaps.length/2)]||180,lines:used.length};
  }
  function systemStart(measure,box){
    const svg=measure.ownerSVGElement;
    const peers=[...svg.querySelectorAll('.measure')].map(item=>({item,box:readBox(item)})).filter(item=>item.box&&Math.abs(item.box.top-box.top)<2);
    return Math.min(...peers.map(item=>item.box.x0));
  }
  function engravedPoints(measure){
    const points=[];
    for(const node of measure.querySelectorAll('[data-event-tick][data-implicit="0"]')){
      const use=node.querySelector('.notehead use, use');
      const match=(use?.getAttribute('transform')||'').match(/translate\(\s*([\d.]+)/);
      let x=match?+match[1]:null;
      if(x===null){try{x=node.getBBox().x;}catch{x=null;}}
      if(x!==null)points.push({x,tick:Number(node.dataset.eventTick)});
    }
    return points;
  }
  function leadingEdge(measure,box){
    let right=box.x0;
    for(const use of measure.querySelectorAll('.clef use, .keySig use, .meterSig use')){
      const match=(use.getAttribute('transform')||'').match(/translate\(\s*([\d.]+)/);
      if(match)right=Math.max(right,+match[1]);
    }
    return right+(box.space||180)*1.5;
  }
  function addHitTargets(host){
    const ns='http://www.w3.org/2000/svg';
    for(const node of host.querySelectorAll('[data-event-id]')){
      let box;try{box=node.getBBox();}catch{continue;}
      const rect=root.document.createElementNS(ns,'rect');
      rect.setAttribute('class','verovio-hit');
      rect.setAttribute('x',box.x-8);rect.setAttribute('y',box.y-8);
      rect.setAttribute('width',Math.max(12,box.width+16));rect.setAttribute('height',Math.max(12,box.height+16));
      rect.setAttribute('fill','transparent');
      node.insertBefore(rect,node.firstChild);
    }
  }
  function stamp(host){
    let space=0;
    for(const svg of host.querySelectorAll('svg')){
      const measure=svg.querySelector('.measure');
      const box=measure&&readBox(measure);
      if(!box)continue;
      svg.dataset.staffSpace=String(box.space);
      space=box.space;
    }
    if(space)host.dataset.staffSpace=String(space);
  }
  function buttons(){return [...(root.document?.querySelectorAll('[data-verovio-toggle]')||[])];}
  function markBusy(busy){for(const button of buttons())button.dataset.busy=busy?'1':'0';}
  function applySelection(host,selection){
    host.querySelectorAll('.verovio-selection').forEach(node=>node.remove());
    const ids=selection?.ids||(selection?.eventId?new Set([selection.eventId]):new Set());
    for(const node of host.querySelectorAll('[data-event-id]')){
      if(!ids.has(node.dataset.eventId))continue;
      let box;
      try{box=node.getBBox();}catch{continue;}
      if(!box.width&&!box.height)continue;
      const rect=root.document.createElementNS('http://www.w3.org/2000/svg','rect');
      rect.setAttribute('class','verovio-selection');
      rect.setAttribute('x',box.x-6);rect.setAttribute('y',box.y-6);
      rect.setAttribute('width',box.width+12);rect.setAttribute('height',box.height+12);
      rect.setAttribute('fill','rgba(29,78,137,.16)');
      rect.setAttribute('pointer-events','none');
      node.parentNode?.insertBefore(rect,node);
    }
  }
  function mount(host,score,selection,result,built){
    if(!enabled||paintedToken!==result.token)return;
    const pages=result.svgs.map(svg=>Mei.decorateSvg(svg,built.entries,built.measureMap));
    host.innerHTML=`<div class="verovio-pages">${pages.join('')}</div>`;
    host.dataset.renderer='verovio';
    delete host.dataset.engraving;
    stamp(host);
    addHitTargets(host);
    paintedScore=score;
    applySelection(host,selection);
    markBusy(false);
    host.dispatchEvent(new root.CustomEvent('kanade-engraved',{bubbles:true,detail:{ms:result.ms,pages:result.pages}}));
    lastFlushAt=performance.now();
    editBurst=0;
  }
  let paintedToken=0,queued=null,rafId=0,lastFlushAt=0,editBurst=0;
  const MIN_GAP=48,MAX_BURST_GAP=12;
  function scheduleFlush(){
    if(rafId)return;
    const now=performance.now();
    const since=now-lastFlushAt;
    const gap=editBurst>2?Math.min(MIN_GAP,MAX_BURST_GAP+editBurst):MIN_GAP;
    if(since>=gap){rafId=root.requestAnimationFrame(flush);return;}
    clearTimeout(timer);
    timer=setTimeout(()=>{timer=0;rafId=root.requestAnimationFrame(flush);},gap-since);
  }
  function flush(){
    rafId=0;clearTimeout(timer);timer=0;
    const job=queued;queued=null;
    if(!job||!enabled)return;
    const built=Mei.meiForPart(job.score);
    const token=++paintedToken;
    job.host.dataset.engraving='1';
    markBusy(true);
    engrave(built.mei,'screen').then(result=>{
      result.token=token;
      mount(job.host,job.score,job.selection,result,built);
    }).catch(error=>{
      if(token!==paintedToken)return;
      delete job.host.dataset.engraving;
      markBusy(false);
      console.warn(error);
    });
  }
  function sync(host,score,selection){
    if(!enabled)return;
    if(score===paintedScore&&host.querySelector('.verovio-pages')){applySelection(host,selection);return;}
    queued={host,score,selection};
    editBurst++;
    scheduleFlush();
  }
  function hitTest(host,point,score,den,dots,extras={}){
    if(!point)return null;
    const svg=point.svg||host.querySelector('svg');
    const measures=[...host.querySelectorAll('.measure')].filter(measure=>!svg||measure.ownerSVGElement===svg);
    let found=null,loose=null;
    for(const measure of measures){
      const box=readBox(measure);
      if(!box)continue;
      const pad=box.space*3;
      if(point.y<box.top-pad||point.y>box.bottom+pad||point.x<box.x0-8||point.x>box.x1+8)continue;
      const tight=point.x>=box.x0&&point.x<=box.x1&&point.y>=box.top-box.space&&point.y<=box.bottom+box.space;
      if(tight){found={measure,box};break;}
      loose={measure,box};
    }
    found=found||loose;
    if(!found)return null;
    const mi=Number(found.measure.dataset.measure);
    if(!Number.isInteger(mi)||!score.measures[mi])return null;
    const cap=C.barTicks(score,mi);
    const points=engravedPoints(found.measure);
    const placed=Mei.tickFromEngraving(point.x,found.box,points,{cap,den,dots,score,mi,systemStart:systemStart(found.measure,found.box),notesStart:leadingEdge(found.measure,found.box),overwrite:!!extras.overwrite});
    const tick=extras.overwrite&&extras.onset!==undefined?extras.onset:placed.tick;
    let pitch=Mei.pitchFromStaff(point.y,found.box,score.clef);
    if(score.clef==='percussion'&&(score.staffLines||5)===1&&extras.drum)pitch={...pitch,step:extras.drum.step,octave:extras.drum.octave};
    const shift=extras.octaveShift||0;
    const octave=Math.max(0,Math.min(8,pitch.octave+shift));
    const y=Mei.yForPitch({step:pitch.step,octave,alter:0},found.box,score.clef);
    const valid=C.canPlaceAt(score,mi,tick,den,dots,{overwrite:!!extras.overwrite});
    return {mi,tick,x:Mei.xForTick(tick,found.box,points,{cap,systemStart:systemStart(found.measure,found.box),notesStart:leadingEdge(found.measure,found.box)}),y,step:pitch.step,octave,valid,svg:found.measure.ownerSVGElement,top:found.box.top};
  }
  function ghostAt(host,score,draft,den,dots,overwrite){
    const measure=[...host.querySelectorAll('.measure')].find(node=>Number(node.dataset.measure)===draft.mi);
    if(!measure)return null;
    const box=readBox(measure);
    if(!box)return null;
    const cap=C.barTicks(score,draft.mi);
    const points=engravedPoints(measure);
    const timing={cap,den,dots,score,mi:draft.mi,systemStart:systemStart(measure,box),notesStart:leadingEdge(measure,box),overwrite};
    const y=Mei.yForPitch({step:draft.step,octave:draft.octave,alter:0},box,score.clef);
    return {mi:draft.mi,tick:draft.tick,x:Mei.xForTick(draft.tick,box,points,timing),y,step:draft.step,octave:draft.octave,
      valid:C.canPlaceAt(score,draft.mi,draft.tick,den,dots,{overwrite:!!overwrite}),svg:measure.ownerSVGElement};
  }
  function paintGhost(host,hit,den){
    host.querySelectorAll('#kanade-verovio-ghost').forEach(node=>node.remove());
    if(!hit?.svg)return;
    const space=Number(hit.svg.dataset.staffSpace||host.dataset.staffSpace)||180;
    const group=root.document.createElementNS('http://www.w3.org/2000/svg','g');
    group.id='kanade-verovio-ghost';
    group.setAttribute('pointer-events','none');
    const head=root.document.createElementNS('http://www.w3.org/2000/svg','ellipse');
    const rx=space*0.27,ry=space*0.2;
    head.setAttribute('cx',hit.x);head.setAttribute('cy',hit.y);head.setAttribute('rx',rx);head.setAttribute('ry',ry);
    head.setAttribute('fill',hit.valid?'rgba(29,78,137,.38)':'rgba(164,48,48,.38)');
    group.append(head);
    if(den>1){
      const stem=root.document.createElementNS('http://www.w3.org/2000/svg','line');
      stem.setAttribute('x1',hit.x+rx);stem.setAttribute('x2',hit.x+rx);
      stem.setAttribute('y1',hit.y);stem.setAttribute('y2',hit.y-space*3.2);
      stem.setAttribute('stroke',hit.valid?'rgba(29,78,137,.55)':'rgba(164,48,48,.55)');
      stem.setAttribute('stroke-width',space*0.07);
      group.append(stem);
    }
    hit.svg.append(group);
  }
  async function exportMarkup(parts){
    const xml=root.KanadeExport.musicXMLScore(parts);
    try{return await engrave(xml,'print');}
    catch{return engrave(Mei.meiForParts(parts).mei,'print');}
  }
  function playbackGrid(measureEl,score,mi){
    const box=readBox(measureEl);
    if(!box)return null;
    const cap=C.barTicks(score,mi);
    const points=engravedPoints(measureEl);
    const grid=points.length?[[0,leadingEdge(measureEl,box)],...points.map(p=>[p.tick,p.x]),[cap,box.x1]]
      :[[0,box.x0],[cap,box.x1]];
    return {top:box.top,grid:grid.map(([tick,x])=>`${tick}:${x}`).join(',')};
  }
  return {setEnabled,isEnabled,storageKey,sync,hitTest,ghostAt,paintGhost,exportMarkup,engrave,options,readBox,playbackGrid};
});
