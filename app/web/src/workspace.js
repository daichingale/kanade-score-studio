/* Presentation only: keep document settings and secondary editing out of the score. */
(function(root){
 'use strict';
 const $=id=>document.getElementById(id),panels=[...document.querySelectorAll('.settings-panel:not(#mediaDialog):not(#scoreImportDialog)')];
 let opener=null;
 function closePanels(restore=false){
  for(const panel of panels)if(panel.open)panel.close();
  if(restore){opener?.focus({preventScroll:true});opener=null;}
 }
 function closeMenus(except=null){document.querySelectorAll('.app-menu[open]').forEach(menu=>{if(menu!==except)menu.open=false;});}
 function openPanel(id){
  const panel=$(id);if(!panels.includes(panel))return;
  const wasOpen=panel.open;closePanels();closeMenus();if(wasOpen)return;
  opener=document.activeElement;panel.show();
 }
 function toggleInspector(){
  const inspector=$('noteInspector');inspector.hidden=!inspector.hidden;
  document.querySelector('.workspace').classList.toggle('inspector-open',!inspector.hidden);
  document.querySelectorAll('[data-toggle-inspector]').forEach(button=>button.setAttribute('aria-pressed',String(!inspector.hidden)));
  closeMenus();
 }
 document.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>openPanel(button.dataset.panel)));
 document.querySelectorAll('[data-close-panel]').forEach(button=>button.addEventListener('click',()=>closePanels(true)));
 document.querySelectorAll('[data-toggle-inspector]').forEach(button=>button.addEventListener('click',toggleInspector));
 document.querySelectorAll('.app-menu').forEach(menu=>{
  menu.addEventListener('toggle',()=>{if(menu.open)closeMenus(menu);});
  menu.addEventListener('click',e=>{const button=e.target.closest('button');if(button&&button.id!=='exportBtn')closeMenus();});
 });
 document.addEventListener('pointerdown',e=>{
  if(!e.target.closest('.app-menu'))closeMenus();
  if(!e.target.closest('.settings-panel,[data-panel]'))closePanels();
 });
 document.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||$('commandPalette').open)return;
  if(panels.some(panel=>panel.open)){e.preventDefault();e.stopImmediatePropagation();closePanels(true);}
  else if(document.querySelector('.app-menu[open]')){e.preventDefault();e.stopImmediatePropagation();closeMenus();}
 },true);
 root.KanadeWorkspace={openPanel,toggleInspector,closePanels};
})(window);
