(function(root){
  'use strict';
  const groups=[
    {title:'音符入力',rows:[
      ['A – G','音名（入力モード）'],['1 – 7','音価（7=全音符）'],['Enter','音符を入力'],['Shift+Enter','休符を入力'],
      ['0 / ,','休符'],['.','付点'],['↑ / ↓','音高（入力）'],['Shift+↑ / ↓','1オクターブ上下（入力）'],
      ['Ctrl+↑ / ↓','1オクターブ上下（入力・確定）'],['8 / 9','選択音を1オクターブ下 / 上'],['Tab','次のパートへ']
    ]},
    {title:'移動・選択',rows:[
      ['← / →','音符・休符間'],['Shift+← / →','範囲選択'],['Ctrl+← / →','小節移動'],['N / V','入力 / 選択モード'],
      ['Ctrl+A','全選択'],['Esc','選択解除・選択モード']
    ]},
    {title:'編集',rows:[
      ['Ctrl+Z / Y','元に戻す / やり直し'],['Ctrl+C / X / V','コピー / 切り取り / 貼り付け'],['`（バッククォート）','前小節を複製'],
      ['T','タイ'],['R','休符切替'],['U','連符'],['Delete','消去']
    ]},
    {title:'再生',rows:[
      ['Space','再生・一時停止'],['Ctrl+K','操作検索'],['F1','ショートカット一覧（この画面）']
    ]}
  ];
  function setup(){
    const dialog=document.getElementById('shortcutsDialog');
    const host=document.getElementById('shortcutsBody');
    if(!dialog||!host)return;
    const paint=()=>{
      host.replaceChildren(...groups.map(group=>{
        const section=document.createElement('section');
        const title=document.createElement('h3');title.textContent=group.title;
        const dl=document.createElement('dl');
        for(const [key,desc] of group.rows){
          const dt=document.createElement('dt');dt.textContent=key;
          const dd=document.createElement('dd');dd.textContent=desc;
          dl.append(dt,dd);
        }
        section.append(title,dl);
        return section;
      }));
    };
    function open(){
      paint();
      dialog.showModal();
    }
    document.getElementById('shortcutsOpen')?.addEventListener('click',open);
    dialog.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();dialog.close();}
      event.stopPropagation();
    });
    return {open};
  }
  root.KanadeShortcuts={setup,groups};
})(typeof globalThis!=='undefined'?globalThis:this);