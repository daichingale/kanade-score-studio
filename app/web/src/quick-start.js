(function(root){
  'use strict';
  const I=root.KanadeInstruments;
  const pinned=[
    {id:'wind',label:'吹奏楽フル編成',hint:'フルート〜打楽器まで標準配列'},
    {id:'smallWind',label:'小編成吹奏楽',hint:'13パートの学校向け編成'},
    {id:'schoolWind',label:'学校吹奏楽（25人）',hint:'部活でよく使う25人編成'},
    {id:'windSymphony',label:'シンフォニック・ウィンド',hint:'大型コンサート用'}
  ];
  function template(id){
    const row=I.templates.find(entry=>entry.id===id);
    if(!row)throw Error('テンプレートが見つかりません');
    return row;
  }
  function setup(api){
    const dialog=document.getElementById('quickStartDialog');
    if(!dialog)return null;
    const host=document.getElementById('quickStartList');
    const render=()=>{
      host.replaceChildren(...pinned.map(item=>{
        const row=document.createElement('button');
        row.type='button';row.className='quick-start-card';
        row.innerHTML=`<strong>${item.label}</strong><span>${item.hint}</span>`;
        row.onclick=()=>{
          const preset=template(item.id);
          if(!window.confirm(`「${item.label}」で新しい楽譜を作ります。未保存の変更は先に保存してください。`))return;
          api.apply(item.id,preset);
          dialog.close();
        };
        return row;
      }));
    };
    document.getElementById('quickStartOpen')?.addEventListener('click',()=>{
      render();
      dialog.showModal();
    });
    dialog.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();dialog.close();}
      event.stopPropagation();
    });
    return {open:()=>{render();dialog.showModal();}};
  }
  root.KanadeQuickStart={setup,pinned,template};
})(typeof globalThis!=='undefined'?globalThis:this);