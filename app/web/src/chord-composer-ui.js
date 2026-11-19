(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 function setup({keyLabel,partCount,fifths,mode,previewChord,commit}){
  const dialog=$('chordComposerDialog');
  if(!dialog)return null;
  const Pop=root.KanadePopProgression,Composer=root.KanadeChordComposer;
  let timeline=Composer.loadDraft();
  let dragIndex=null;

  function currentMode(){return typeof mode==='function'?mode():'major';}
  function currentFifths(){return typeof fifths==='function'?fifths():0;}

  function paintPad(){
   const pad=$('chordComposerPad');
   const prev=timeline.map(t=>t.roman).filter(Boolean);
   const suggested=new Set(Pop.rankNext(prev,currentFifths(),currentMode(),4).map(x=>x.roman));
   pad.replaceChildren(...Pop.buildChordPad(currentFifths(),currentMode()).map(entry=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='chord-composer-pad-btn'+(entry.borrowed?' is-borrowed':'')+(suggested.has(entry.roman)?' is-suggested':'');
    button.dataset.roman=entry.roman;
    button.dataset.symbol=entry.symbol;
    button.innerHTML=`<span class="chord-composer-pad-roman">${entry.label}</span><span class="chord-composer-pad-symbol">${entry.symbol}</span>`;
    button.setAttribute('aria-label',`${entry.label} ${entry.symbol}`);
    return button;
   }));
  }

  function paintTimeline(){
   const list=$('chordComposerTimeline');
   const den=Number($('chordComposerDen').value)||4;
   list.replaceChildren(...timeline.map((item,index)=>{
    const chip=document.createElement('div');
    chip.className='chord-composer-chip';
    chip.draggable=true;
    chip.dataset.index=String(index);
    chip.innerHTML=`<button type="button" class="chord-composer-chip-body" data-action="preview">${item.symbol}</button>`+
      `<span class="chord-composer-chip-meta">${item.roman||''}</span>`+
      `<button type="button" class="chord-composer-chip-del" data-action="remove" aria-label="削除">×</button>`;
    return chip;
   }));
   const whole=root.KanadeCore?.WHOLE||1920;
   $('chordComposerTimelineMeta').textContent=timeline.length?`${timeline.length}コード · 約${(Composer.timelineTicks(timeline,den)/whole).toFixed(1)}小節相当`:'タップでコードを並べます';
  }

  function persist(){Composer.saveDraft(timeline);paintPad();paintTimeline();}

  function refreshParts(){
   const parts=typeof partCount==='function'?partCount():partCount;
   for(const id of ['chordComposerHarmonyPart','chordComposerBassPart','chordComposerMelodyPart']){
    const select=$(id);
    if(!select)continue;
    const current=select.value;
    select.replaceChildren(...Array.from({length:parts},(_,i)=>{
     const o=document.createElement('option');o.value=String(i+1);o.textContent=`パート ${i+1}`;return o;
    }));
    if(+current>=1&&+current<=parts)select.value=current;
   }
  }

  function open(){
   refreshParts();
   $('chordComposerKey').textContent=`調: ${keyLabel()}`;
   paintPad();
   paintTimeline();
   dialog.showModal();
  }

  $('chordComposerPad').onclick=event=>{
   const button=event.target.closest('[data-symbol]');
   if(!button)return;
   timeline.push({roman:button.dataset.roman,symbol:button.dataset.symbol});
   previewChord?.(button.dataset.symbol);
   persist();
  };

  $('chordComposerTimeline').onclick=event=>{
   const chip=event.target.closest('.chord-composer-chip');
   if(!chip)return;
   const index=Number(chip.dataset.index);
   const action=event.target.closest('[data-action]')?.dataset.action;
   if(action==='remove'){timeline.splice(index,1);persist();return;}
   if(action==='preview')previewChord?.(timeline[index].symbol);
  };

  $('chordComposerTimeline').ondragstart=event=>{
   const chip=event.target.closest('.chord-composer-chip');
   if(!chip)return;
   dragIndex=Number(chip.dataset.index);
   event.dataTransfer?.setData('text/plain',chip.dataset.index);
  };
  $('chordComposerTimeline').ondragover=event=>{event.preventDefault();};
  $('chordComposerTimeline').ondrop=event=>{
   event.preventDefault();
   const chip=event.target.closest('.chord-composer-chip');
   if(chip==null||dragIndex==null)return;
   const to=Number(chip.dataset.index);
   if(to===dragIndex)return;
   const [item]=timeline.splice(dragIndex,1);
   timeline.splice(to,0,item);
   dragIndex=null;
   persist();
  };

  $('chordComposerPresets').onclick=event=>{
   const button=event.target.closest('[data-preset]');
   if(!button)return;
   timeline=Composer.presetTimeline(button.dataset.preset,currentFifths(),currentMode());
   persist();
  };

  $('chordComposerClear').onclick=()=>{timeline=[];persist();};
  $('chordComposerUndo').onclick=()=>{timeline.pop();persist();};

  $('chordComposerPreview').onclick=()=>{
   if(!timeline.length)return;
   let i=0;
   const play=()=>{
    if(i>=timeline.length)return;
    previewChord?.(timeline[i++].symbol);
    setTimeout(play,480);
   };
   play();
  };

  $('chordComposerDen').onchange=paintTimeline;

  $('chordComposerGenerate').onclick=()=>{
   try{
    if(!timeline.length)throw new Error('コードを1つ以上追加してください');
    commit({
     timeline:[...timeline],
     from:Number($('chordComposerFrom').value)||1,
     den:Number($('chordComposerDen').value)||4,
     voicing:$('chordComposerVoicing').value,
     harmonyPart:Number($('chordComposerHarmonyPart').value)||1,
     bassPart:Number($('chordComposerBassPart').value)||1,
     melodyPart:Number($('chordComposerMelodyPart').value)||1,
     bass:$('chordComposerBass').checked,
     melody:$('chordComposerMelody').checked,
     harmonyOctave:Number($('chordComposerHarmonyOct').value)||4,
     bassOctave:Number($('chordComposerBassOct').value)||3,
     melodyOctave:Number($('chordComposerMelodyOct').value)||5,
     learn:$('chordComposerLearn').checked,
     mode:currentMode()
    });
    dialog.close();
   }catch(error){alert(error.message);}
  };

  return {open,refreshParts,getTimeline:()=>[...timeline]};
 }
 root.KanadeChordComposerUI={setup};
})(globalThis);