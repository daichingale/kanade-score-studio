(function(root){
  'use strict';
  const Pop=root.KanadePopProgression,$=id=>document.getElementById(id);
  function setup({commit,partCount,measureCount,concertKey}){
    const countParts=()=>typeof partCount==='function'?partCount():partCount;
    const countMeasures=()=>typeof measureCount==='function'?measureCount():measureCount;
    const dialog=$('popProgressionDialog');
    if(!dialog)return;
    const select=$('popProgressionTemplate');
    const auto=document.createElement('option');
    auto.value='auto';auto.textContent='自動（モデル）';
    select.replaceChildren(auto,...Pop.TEMPLATE_KEYS.map(key=>{
      const option=document.createElement('option');
      option.value=key;option.textContent=`${key}（${Pop.TEMPLATES[key].join(' – ')}）`;
      return option;
    }));
    function refresh(){
      const parts=countParts(),measures=countMeasures();
      $('popProgressionPart').replaceChildren(...Array.from({length:parts},(_,i)=>{
        const o=document.createElement('option');o.value=String(i+1);o.textContent=String(i+1);return o;
      }));
      $('popProgressionTo').value=String(measures);
      $('popProgressionTo').max=String(measures);
      $('popProgressionFrom').max=String(measures);
      $('popProgressionKey').textContent=`現在の調: ${concertKey()}`;
      try{
        const learned=Pop.loadStore().learned;
        $('popProgressionLearn').checked=!!learned;
      }catch{}
    }
    function open(){refresh();dialog.showModal();}
    dialog.addEventListener('close',()=>{});
    $('popProgressionApply').onclick=()=>{
      try{
        const args={
          part:Number($('popProgressionPart').value),
          from:Number($('popProgressionFrom').value),
          to:Number($('popProgressionTo').value),
          progression:$('popProgressionTemplate').value,
          den:Number($('popProgressionDen').value),
          grid:$('popProgressionGrid').value,
          voicing:$('popProgressionVoicing').value,
          octave:Number($('popProgressionOctave').value),
          learn:$('popProgressionLearn').checked,
          mode:(concertKey().includes('短調')?'minor':'major')
        };
        commit(args);
        dialog.close();
      }catch(error){alert(error.message);}
    };
    return {open,refresh};
  }
  root.KanadePopProgressionUI={setup};
})(globalThis);