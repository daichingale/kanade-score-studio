(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 function setup(api){
  const Spark=root.KanadeInspirationSpark;
  const dialog=$('sparkDialog');
  if(!dialog||!Spark)return null;
  let spark=null;
  let locks=Spark.emptyLocks();
  let previewTimer=null;

  const lockFields={
   sparkMoodLock:'mood',sparkKeyLock:'key',sparkTempoLock:'tempo',sparkRhythmLock:'rhythm',
   sparkProgressionLock:'progression',sparkMotifLock:'motif'
  };

  function syncLocks(){
   for(const [id,field] of Object.entries(lockFields))locks[field]=$(id)?.checked??locks[field];
  }

  function keyLabel(fifths,mode){
   const labels={0:'ハ長調',1:'ト長調',2:'ニ長調',3:'イ長調',4:'ホ長調',5:'ロ長調',6:'嬰ヘ長調',7:'嬰ハ長調',
     '-1':'ヘ長調','-2':'変ロ長調','-3':'変ホ長調','-4':'変イ長調','-5':'変ニ長調','-6':'変ト長調','-7':'変ハ長調'};
   const name=labels[String(fifths)]||String(fifths);
   return mode==='minor'?`${name.replace('長調','')}短調寄り`:name;
  }

  function paintSpark(){
   if(!spark)return;
   $('sparkMood').textContent=spark.mood;
   $('sparkKey').textContent=keyLabel(spark.key,spark.mode);
   $('sparkTempo').textContent=`♩=${spark.tempo}`;
   $('sparkTime').textContent=`${spark.time.num}/${spark.time.den}`;
   $('sparkScene').textContent=spark.scene;
   $('sparkProgression').textContent=spark.progression.timeline.map(t=>t.symbol).join(' – ');
   $('sparkMotif').textContent=`${spark.motif.notes.length}音 · ${spark.bars}小節`;
   $('sparkConstraints').replaceChildren(...spark.constraints.map(text=>{
    const span=document.createElement('span');span.className='spark-constraint';span.textContent=text;return span;
   }));
   $('sparkPromptPool').replaceChildren(...Spark.CONSTRAINTS.slice(0,8).map(text=>{
    const button=document.createElement('button');
    button.type='button';button.className='spark-prompt';
    button.textContent=text;
    button.addEventListener('click',()=>{if(!spark.constraints.includes(text))spark.constraints.push(text);paintSpark();});
    return button;
   }));
  }

  function paintHistory(){
   const list=$('sparkHistory');
   const items=Spark.loadHistory();
   list.replaceChildren(...items.map(item=>{
    const button=document.createElement('button');
    button.type='button';
    button.textContent=`${item.mood} · seed ${item.seed} · ${item.template||'進行'}`;
    button.addEventListener('click',()=>{spark=Spark.rollSpark(item.seed);locks=Spark.emptyLocks();paintSpark();paintHistory();});
    return button;
   }));
   if(!items.length)list.textContent='まだ履歴はありません';
  }

  function paintVariations(){
   const wrap=$('sparkVariations');
   const range=api.selectionRange?.();
   if(!range){wrap.hidden=true;return;}
   const score=api.currentScore?.();
   const fragment=Spark.fragmentFromRange(score,range.start,range.end);
   const cards=Spark.variationDescriptors(fragment);
   wrap.hidden=!cards.length;
   const host=$('sparkVariationCards');
   host.replaceChildren(...cards.map(card=>{
    const el=document.createElement('article');
    el.className='spark-variation';
    el.innerHTML=`<h3>${card.label}</h3><p>${card.fragment.length}音</p>`;
    const play=document.createElement('button');
    play.type='button';play.textContent='試聴';
    play.onclick=()=>card.fragment.slice(0,12).forEach((item,i)=>setTimeout(()=>
      api.previewPitch?.(item.event.pitches[0]),i*220));
    const insert=document.createElement('button');
    insert.type='button';insert.className='solid';insert.textContent='挿入';
    insert.onclick=()=>api.insertVariation?.(card.fragment);
    el.append(play,insert);
    return el;
   }));
  }

  function reroll(){
   syncLocks();
   const seed=(Math.random()*0xffffffff)>>>0;
   spark=Spark.rollSpark(seed,spark,locks);
   paintSpark();
  }

  function stopPreview(){clearInterval(previewTimer);previewTimer=null;}
  function preview(){
   stopPreview();
   if(!spark)return;
   const queue=Spark.previewSequence(spark);
   let i=0;
   previewTimer=setInterval(()=>{
    if(i>=queue.length){stopPreview();return;}
    const item=queue[i++];
    if(item.kind==='note')api.previewPitch?.(item.pitch);
    else api.previewChord?.(item.symbol);
   },360);
  }

  function open(){
   if(!spark)reroll();
   paintSpark();paintHistory();paintVariations();
   dialog.showModal();
  }

  $('sparkRoll')?.addEventListener('click',reroll);
  $('sparkPreview')?.addEventListener('click',preview);
  $('sparkKeep')?.addEventListener('click',()=>{
   if(!spark)return;
   syncLocks();
   api.commitSpark?.(spark);
   Spark.pushHistory(spark);
   paintHistory();
   dialog.close();
  });
  $('sparkClosePreview')?.addEventListener('click',stopPreview);
  dialog.addEventListener('close',stopPreview);

  return {open,refreshVariations:paintVariations,reroll,getSpark:()=>spark};
 }
 root.KanadeInspirationSparkUI={setup};
})(globalThis);