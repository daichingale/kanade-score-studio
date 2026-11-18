/* Original offline marching percussion presets. Positions use C4–G4 in this preview. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.KanadePercussion=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const presets=[
    {name:'マーチング・スネア',icon:'snare',kind:'snare',pads:[['C','センター'],['D','リムショット'],['E','スティック']]},
    {name:'マーチング・テナー',icon:'tenors',kind:'tenor',pads:[['C','ロー'],['D','ミッドロー'],['E','ミッド'],['F','ハイ'],['G','スポック']]},
    {name:'マーチング・バスドラム',icon:'bass',kind:'bass',pads:[['C','バス5・低'],['D','バス4'],['E','バス3'],['F','バス2'],['G','バス1・高']]},
    {name:'マーチング・シンバル',icon:'cymbals',kind:'cymbal',pads:[['C','ハイハット・オン（閉）','hatClosed'],['D','ハイハット・オフ（開）','hatOpen'],['E','クラッシュ','cymbals'],['F','チョーク','choke']]},
  ];
  const preset=name=>presets.find(p=>p.name===name)||null;
  function voice(name,pitch){const p=preset(name);if(!p)return null;const index=Math.max(0,p.pads.findIndex(([step])=>step===pitch.step));return {kind:p.kind,index,label:p.pads[index][1]};}
  return {presets,preset,voice};
});
