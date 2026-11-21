(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 function setup(api){
  const Spark=root.KanadeInspirationSpark;
  const dialog=$('sparkDialog');
  if(!dialog||!Spark)return null;
  let cards=[];
  let streamSeed=1;
  let autoTimer=null;
  let previewTimer=null;
  let selectionKey='';

  function keyLabel(ctx){
   if(!ctx)return '';
   const labels={0:'C',1:'G',2:'D',3:'A',4:'E',5:'B','-1':'F','-2':'B♭','-3':'E♭','-4':'A♭'};
   const name=labels[String(ctx.fifths)]||`調${ctx.fifths}`;
   return ctx.mode==='minor'?`${name}m 風`:`${name}`;
  }

  function stopPreview(){clearInterval(previewTimer);previewTimer=null;}
  function previewFragment(fragment,tempo){
   stopPreview();
   const queue=Spark.previewFragment(fragment,tempo);
   queue.forEach(item=>setTimeout(()=>api.previewPitch?.(item.pitch),item.delayMs));
  }

  function paintContext(ctx){
   $('sparkContextKey').textContent=keyLabel(ctx);
   $('sparkContextChords').textContent=ctx.timeline.map(t=>t.symbol).join(' · ');
   $('sparkContextTime').textContent=`${ctx.time.num}/${ctx.time.den} · ♩=${ctx.tempo}`;
   const hint=$('sparkSeedHint');
   if(hint)hint.textContent=api.selectionFragment?.()?'選択した音を種に変奏を自動追加しています':api.chordDraftHint?.()||'';
  }

  function paintStream(){
   const rail=$('sparkPhraseStream');
   rail.replaceChildren(...cards.map(card=>{
    const art=document.createElement('article');
    art.className='spark-phrase-card';
    art.tabIndex=0;
    art.innerHTML=`<h3>${card.label}</h3><p>${card.fragment.length}音 <span>${card.style||''}</span></p>`;
    const actions=document.createElement('div');
    actions.className='spark-phrase-actions';
    const play=document.createElement('button');
    play.type='button';play.textContent='試聴';
    play.onclick=e=>{e.stopPropagation();previewFragment(card.fragment,api.tempo?.());};
    const insert=document.createElement('button');
    insert.type='button';insert.className='solid';insert.textContent='挿入';
    insert.onclick=e=>{e.stopPropagation();api.insertPhrase?.(card.fragment);};
    actions.append(play,insert);
    art.append(actions);
    return art;
   }));
   if(!cards.length){
    const empty=document.createElement('p');
    empty.className='panel-hint';
    empty.textContent='フレーズを生成中…';
    rail.append(empty);
   }
  }

  function loadBatch({append=false,replaceSelection=false}={}){
   const ctx=api.harmonyContext?.();
   if(!ctx)return;
   const frag=replaceSelection||selectionKey?api.selectionFragment?.():null;
   streamSeed=(streamSeed+1)>>>0;
   const batch=Spark.buildPhraseStream(ctx,{seed:streamSeed,seedFragment:frag,count:append?6:12});
   if(append)cards=cards.concat(batch);else cards=batch;
   paintContext(ctx);
   paintStream();
  }

  function syncSelection(){
   const range=api.selectionRange?.();
   const next=range?`${range.start}-${range.end}`:'';
   if(next===selectionKey)return;
   selectionKey=next;
   if(!dialog.open)return;
   loadBatch({append:false,replaceSelection:true});
  }

  function setAuto(on){
   if(autoTimer){clearInterval(autoTimer);autoTimer=null;}
   const toggle=$('sparkAutoGenerate');
   if(toggle)toggle.checked=!!on;
   if(on)autoTimer=setInterval(()=>loadBatch({append:true}),2800);
  }

  function open(){
   selectionKey='';
   streamSeed=(Date.now()>>>0)||1;
   loadBatch({append:false});
   setAuto($('sparkAutoGenerate')?.checked??true);
   dialog.showModal();
  }

  $('sparkMore')?.addEventListener('click',()=>loadBatch({append:true}));
  $('sparkAutoGenerate')?.addEventListener('change',event=>setAuto(event.target.checked));
  $('sparkPhraseStream')?.addEventListener('scroll',event=>{
   const el=event.currentTarget;
   if(el.scrollLeft+el.clientWidth>=el.scrollWidth-40)loadBatch({append:true});
  });
  dialog.addEventListener('close',()=>{setAuto(false);stopPreview();});
  $('sparkQuickDice')?.addEventListener('click',()=>{
   const spark=Spark.rollSpark((Math.random()*0xffffffff)>>>0);
   api.commitSpark?.(spark);
   Spark.pushHistory(spark);
   dialog.close();
  });

  return {open,refreshPhrases:syncSelection,stopPreview};
 }
 root.KanadeInspirationSparkUI={setup};
})(globalThis);