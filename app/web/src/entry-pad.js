(function(root){
  'use strict';
  const steps=['C','D','E','F','G','A','B'];
  const STORAGE='kanade.entryPad.v1';
  function setup(api){
    const host=document.getElementById('entryPad');
    const toggle=document.getElementById('entryPadToggle');
    if(!host||!toggle)return null;
    let hidden=false;
    try{hidden=localStorage.getItem(STORAGE)==='hidden';}catch(_){}
    const sync=()=>{
      host.hidden=hidden||!api.mobile();
      toggle.setAttribute('aria-pressed',String(!hidden));
      toggle.textContent=hidden?'音名パッド表示':'音名パッド非表示';
    };
    toggle.onclick=()=>{hidden=!hidden;try{localStorage.setItem(STORAGE,hidden?'hidden':'shown');}catch(_){}sync();};
    host.replaceChildren(...steps.map(step=>{
      const button=document.createElement('button');
      button.type='button';button.textContent=step;
      button.onclick=()=>api.note(step);
      return button;
    }));
    const rest=document.createElement('button');
    rest.type='button';rest.textContent='休';
    rest.className='entry-pad-rest';
    rest.onclick=()=>api.rest();
    host.append(rest);
    sync();
    return {sync,refresh:sync};
  }
  root.KanadeEntryPad={setup};
})(typeof globalThis!=='undefined'?globalThis:this);