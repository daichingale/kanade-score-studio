/* Score-only navigation: SVG coordinates remain authoritative for note input. */
(function(root){
 'use strict';
 const host=document.getElementById('scoreScroll'),paper=host.querySelector('.paper');
 const mobile=root.matchMedia('(max-width:760px)'),R=root.KanadeRenderer;
 const layout=()=>mobile.matches?R.MOBILE:R.PAGE;
 const storageKey=()=>mobile.matches?'kanade.view.mobile.v1':'kanade.view.v1';
 document.querySelector('.zoom-controls [data-hand-tool]').innerHTML=root.KanadeIcons.svg('hand');
 const MIN=.25,MAX=3,pointers=new Map();
 let mode='fit',scale=1,hand=false,gesture=null,blocked=false,suppressUntil=0,frame=0,pending=null;
 function readZoom(){
  mode='fit';
  try{const saved=JSON.parse(localStorage.getItem(storageKey()));if(saved?.mode==='manual'&&Number.isFinite(saved.scale)){mode='manual';scale=clamp(saved.scale);}}catch(_){}
 }
 const clamp=n=>Math.max(MIN,Math.min(MAX,n));
 const center=()=>{const r=host.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};};
 function anchorAt(point){const r=paper.getBoundingClientRect();return {x:(point.x-r.left)/r.width,y:(point.y-r.top)/r.width,clientX:point.x,clientY:point.y};}
 function updateTools(){
  document.getElementById('zoomLevel').textContent=Math.round(scale*100)+'%';
  document.getElementById('zoomLevel').setAttribute('aria-label',`拡大率${Math.round(scale*100)}%・100%に戻す`);
  document.getElementById('zoomOut').disabled=scale<=MIN+.001;document.getElementById('zoomIn').disabled=scale>=MAX-.001;
  document.querySelectorAll('[data-hand-tool]').forEach(b=>b.setAttribute('aria-pressed',String(hand)));
  document.querySelectorAll('[data-view-action="fit"]').forEach(b=>b.setAttribute('aria-pressed',String(mode==='fit')));
  host.classList.toggle('hand-tool',hand);
 }
 function persist(){try{localStorage.setItem(storageKey(),JSON.stringify({mode,scale}));}catch(_){} }
 function apply(next,anchor=null,save=true){
  scale=clamp(next);paper.style.setProperty('--score-width',layout().width*scale+'px');
  if(anchor){const r=paper.getBoundingClientRect();host.scrollLeft+=r.left+anchor.x*r.width-anchor.clientX;host.scrollTop+=r.top+anchor.y*r.width-anchor.clientY;}
  host.dispatchEvent(new Event('kanade-viewchange'));updateTools();if(save)persist();
 }
 function fit(){mode='fit';const css=getComputedStyle(host);apply((host.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight))/layout().width);}
 function zoom(next,point=center()){mode='manual';apply(next,anchorAt(point));}
 function action(name){if(name==='in')zoom(scale*1.2);else if(name==='out')zoom(scale/1.2);else if(name==='actual')zoom(1);else if(name==='fit')fit();}
 function toggleHand(){hand=!hand;updateTools();}
 function distance(points){return Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);}
 function midpoint(points){return {x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};}
 function startPinch(){const points=[...pointers.values()].slice(0,2);gesture={kind:'pinch',distance:Math.max(1,distance(points)),scale,anchor:anchorAt(midpoint(points))};blocked=true;host.classList.add('navigating');}
 function pitchDrag(phase,dy=0){
  return !host.dispatchEvent(new CustomEvent('kanade-pitch-drag',{detail:{phase,dy},cancelable:true}));
 }
 function flush(){if(frame)cancelAnimationFrame(frame);frame=0;if(pending){const {next,anchor}=pending;pending=null;mode='manual';apply(next,anchor,false);}}
 host.addEventListener('pointerdown',e=>{
  const phonePointer=mobile.matches&&e.button===0&&e.target.closest('#scoreHost svg');
  if(e.pointerType!=='touch'&&e.button!==1&&!(hand&&e.button===0)&&!phonePointer)return;
  const flick=!!phonePointer&&!hand&&host.scrollWidth<=host.clientWidth+2;
  e.preventDefault();root.KanadeWorkspace?.closePanels();host.dispatchEvent(new Event('kanade-viewchange'));
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,target:e.target,tap:e.pointerType==='touch'||!!phonePointer,flick,time:e.timeStamp});
  host.setPointerCapture(e.pointerId);
  if(pointers.size===1){blocked=hand||e.button===1;gesture={kind:'pan',lastX:e.clientX,lastY:e.clientY};}
  if(pointers.size>=2){if(gesture?.kind==='pitch')pitchDrag('cancel');for(const point of pointers.values())point.flick=false;startPinch();}
 },{passive:false});
 host.addEventListener('pointermove',e=>{
  const point=pointers.get(e.pointerId);if(!point)return;
  e.preventDefault();point.x=e.clientX;point.y=e.clientY;
  if(pointers.size>=2){
   const points=[...pointers.values()].slice(0,2),mid=midpoint(points);
   pending={next:gesture.scale*distance(points)/gesture.distance,anchor:{...gesture.anchor,clientX:mid.x,clientY:mid.y}};
   if(!frame)frame=requestAnimationFrame(()=>{frame=0;flush();});
  }else if(gesture?.kind==='pitch'){
   pitchDrag('move',point.y-point.startY);
  }else if(gesture?.kind==='pan'){
   const dx=point.x-point.startX,dy=point.y-point.startY;
   if(!blocked&&point.flick&&Math.abs(dy)>=8&&Math.abs(dy)>Math.abs(dx)*1.35&&pitchDrag('start')){
    blocked=true;point.flick=false;gesture={kind:'pitch'};pitchDrag('move',dy);return;
   }
   if(Math.abs(point.y-point.startY)>25&&Math.abs(point.y-point.startY)>Math.abs(point.x-point.startX))point.flick=false;
   const moved=Math.hypot(point.x-point.startX,point.y-point.startY)>7;
   if(moved||blocked){blocked=true;host.classList.add('navigating');host.scrollLeft-=point.x-gesture.lastX;host.scrollTop-=point.y-gesture.lastY;}
   gesture.lastX=point.x;gesture.lastY=point.y;
  }
 },{passive:false,capture:true});
 function finish(e,cancelled=false){
  const point=pointers.get(e.pointerId);if(!point)return;
  flush();e.preventDefault();pointers.delete(e.pointerId);if(host.hasPointerCapture(e.pointerId))host.releasePointerCapture(e.pointerId);
  const dx=e.clientX-point.startX,dy=e.clientY-point.startY,elapsed=e.timeStamp-point.time;
  const tap=point.tap&&!blocked&&!cancelled&&pointers.size===0&&Math.hypot(dx,dy)<=7;
  const flick=point.flick&&!cancelled&&pointers.size===0&&Math.abs(dx)>=48&&Math.abs(dx)>=Math.abs(dy)*1.8&&elapsed<=450&&Math.abs(dx)>=elapsed*0.23;
  if(gesture?.kind==='pitch')pitchDrag(cancelled?'cancel':'end',dy);
  suppressUntil=performance.now()+400;
  if(pointers.size){blocked=true;const remaining=[...pointers.values()][0];gesture={kind:'pan',lastX:remaining.x,lastY:remaining.y};}
  else {gesture=null;host.classList.remove('navigating');persist();}
  if(flick)host.dispatchEvent(new CustomEvent('kanade-measure-flick',{detail:dx<0?1:-1}));
  else if(tap&&point.target.isConnected){
   // Deliver a single tap after deciding it was not the beginning of a pinch.
   const click=new MouseEvent('click',{bubbles:true,cancelable:true,clientX:e.clientX,clientY:e.clientY});syntheticTap=true;try{point.target.dispatchEvent(click);}finally{syntheticTap=false;}
  }
 }
 let syntheticTap=false;
 host.addEventListener('pointerup',e=>finish(e),{passive:false});
 host.addEventListener('pointercancel',e=>finish(e,true),{passive:false});
 host.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))finish(e,true);});
 host.addEventListener('click',e=>{if(!syntheticTap&&(e.pointerType==='touch'||performance.now()<suppressUntil||hand)){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
 host.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
 host.addEventListener('wheel',e=>{
  if(e.ctrlKey||e.metaKey){e.preventDefault();zoom(scale*Math.exp(-e.deltaY*(e.deltaMode===1?.03:e.deltaMode===2?.5:.002)),{x:e.clientX,y:e.clientY});}
  else if(e.shiftKey&&e.deltaY){e.preventDefault();host.scrollLeft+=e.deltaY;}
 },{passive:false});
 document.querySelectorAll('[data-view-action]').forEach(b=>b.addEventListener('click',()=>action(b.dataset.viewAction)));
 document.querySelectorAll('[data-hand-tool]').forEach(b=>b.addEventListener('click',toggleHand));
 document.addEventListener('keydown',e=>{
  if(e.isComposing||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable||document.querySelector('dialog[open]'))return;
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&['+','=','-','0'].includes(e.key)){
   e.preventDefault();e.stopImmediatePropagation();action(e.key==='0'?'actual':e.key==='-'?'out':'in');
  }else if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.toLowerCase()==='h'){
   e.preventDefault();e.stopImmediatePropagation();toggleHand();
  }else if(e.key==='Escape'&&hand){hand=false;updateTools();}
 },true);
 root.addEventListener('blur',()=>{if(gesture?.kind==='pitch')pitchDrag('cancel');pointers.clear();gesture=null;blocked=true;pending=null;if(frame)cancelAnimationFrame(frame);frame=0;host.classList.remove('navigating');});
 new ResizeObserver(()=>{if(mode==='fit')fit();}).observe(host);
 mobile.addEventListener('change',()=>{readZoom();if(mode==='fit')fit();else apply(scale);});
 root.KanadeViewport={mobile,layout,action,toggleHand,get gesturing(){return pointers.size>0||hand;},capture:()=>({mode,scale,hand}),restore:s=>{if(!s||!['fit','manual'].includes(s.mode)||!Number.isFinite(s.scale))return;mode=s.mode;hand=!!s.hand;if(mode==='fit')fit();else apply(s.scale);}};
 readZoom();if(mode==='fit')fit();else apply(scale);
})(window);
