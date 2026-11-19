/* Offline Kanade Editor UI. UI orchestration will be replaced by the Rust
   WASM EngineClient once Session / kanade-wasm are implemented. */
(function () {
  'use strict';
  const C=window.KanadeCore, Ex=window.KanadeExport, R=window.KanadeRenderer, B=window.KanadeEditing;
  const $=id=>document.getElementById(id);
  const P=window.KanadePerformance,A=window.KanadeArrangement;
  let performancePanel,popProgressionUI,chordComposerUI,arrangementUI,transport,playbackDisplay=null,playbackPaint=null;
  let chordAssistEnabled=true;
  try{chordAssistEnabled=localStorage.getItem('kanade.chordAssist.v1')!=='off';}catch(_){}
  const STORAGE='kanade.web.v1.autosave',OVERWRITE_STORAGE='kanade.web.v1.overwrite';
  const TUPLET_STORAGE='kanade.web.v1.tuplet', RECENT_COMMAND_STORAGE='kanade.web.v1.recentCommands';
  const durationKeys=[null,...C.DENOMS.slice().reverse()];
  const viewport=window.KanadeViewport,mobile=viewport.mobile;
  let renderedScore=null,renderedLayout=null,renderedMeasure=null;
  let verticalNavigationTick=null;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let scoreScrollFrame=0,scoreTransition=null;
  let ensemble=null,partIndex=0;
  let rosterPart=null, rosterGroup="すべて", replacing=false, pendingEnsemble=null;
 const I=window.KanadeInstruments,S=window.KanadeSamples;
 const instrumentCatalog=I.catalog;
 let instrumentLanguage='en';
 try{if(localStorage.getItem('kanade.instrumentLanguage')==='ja')instrumentLanguage='ja';}catch(_){}
 const catalogName=item=>instrumentLanguage==='ja'?item.name:item.english;
 const matchInstrument=I.match;
 function instrumentDisplay(name){
   const match=matchInstrument(name);
   return match?catalogName(match[1])+name.slice(match[0].length):name;
 }
  let score=C.createScore(), selected=null, activeMeasure=0, den=4, dots=0, alter='auto', octave=4, chordMode=false;
  let caret={mi:0,index:0},editMode='entry',lastPointer=null,previewStep='C',lastEnteredId=null;
  let mobileDraft=null,mobileChord=null,mobileDragPitch=null,voiceScope=null;
  let pointerOctaveShift=0,keyboardGhost=false,pendingTieId=null;
  let tupletEnabled=false,tupletNext=null;
  let tupletPreference={actual:3,normal:2,unit:8};
  let selectionRange=null,rangeAnchor=null,clipboard=null,preferMeasureClipboard=false,overwriteMode=false;
  const isEntryMode=()=>$('scoreOverview').hidden?editMode==='entry':overviewMode==='entry';
  const isOverwriteEntry=()=>overwriteMode&&isEntryMode();
  let overviewMode='select',overviewExtend=false,overviewDocument=null,overviewPasteTarget=null;
  let onLocalChange=null,rangeDirection=null;
  const undo=[], redo=[]; let toastTimer=null;
  const sound=new window.KanadeAudio.Engine(playing=>{
    arrangementUI?.playing(playing);transport?.playing(playing);
  });
  function showToast(message,err=false) {
    $('statusText').textContent=message;
    const t=$('toast');t.textContent=message;t.style.background=err?'#a84b4b':'#253b52';t.classList.remove('hidden');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.add('hidden'),3200);
  }
  function canonicalPart(){return voiceScope?.part||score;}
  function documentScore(){return ensemble||canonicalPart();}
  function endVoiceScope(){
    if(!voiceScope)return;
    score=voiceScope.part;voiceScope=null;
  }
  function setVoiceScope(mi){
    const part=score,bar=part.measures[mi];
    voiceScope={mi,part};
    const measures=part.measures.slice();
    measures[mi]={...bar,events:bar.voice2||[],voice2:bar.events};
    score={...part,measures};
  }
  function toggleVoiceScope(){
    if(rangeDirection||!$('scoreOverview').hidden)return;
    const mi=caret.mi;
    const tick=C.eventSpans(score,mi)[caret.index]?.start??0;
    if(voiceScope)endVoiceScope();else setVoiceScope(mi);
    const spans=C.eventSpans(score,mi),index=spans.findIndex(span=>span.end>tick);
    focusEntry(mi,Math.max(0,index));focusScore();
  }
  function loadScore(next,index=0){
    voiceScope=null;
    ensemble=next.ensembleParts?next:null;
    partIndex=ensemble?Math.min(index,next.ensembleParts.length):0;
    score=ensemble?C.scoreParts(ensemble)[partIndex]:next;
  }
  function snapshot(label=''){
    return {score:canonicalPart(),ensemble,partIndex,selected:voiceScope?null:selected,activeMeasure,caret:voiceScope?{mi:caret.mi,index:0}:{...caret},selectionRange:voiceScope?null:selectionRange,rangeAnchor:voiceScope?null:rangeAnchor,label};
  }
  function recordUndo(label){
    undo.push(snapshot(label));
    if(undo.length>100)undo.shift();
    redo.length=0;
  }
  function persist() {
    if(window.KanadeCollab?.active){$('saveLabel').textContent='共同編集';return;}
    try {localStorage.setItem(STORAGE,JSON.stringify(documentScore()));$('saveLabel').textContent='自動保存済み';}
    catch(_){$('saveLabel').textContent='未保存';$('statusText').textContent='自動保存に失敗しました。ファイル保存してください。';}
  }
  function getSelected() {
    if(!selected) return null;
    for(let mi=0;mi<score.measures.length;mi++) {
      const index=score.measures[mi].events.findIndex(e=>e.id===selected);
      if(index>=0) return {mi,index,event:score.measures[mi].events[index]};
    }
    return null;
  }
  function selectedIds(notesOnly=false) {
    if(selectionRange)return B.entries(score,selectionRange.start,selectionRange.end,false)
      .filter(s=>!notesOnly||s.event.type==='note').map(s=>s.event.id);
    const found=getSelected();return found&&(!notesOnly||found.event.type==='note')?[found.event.id]:[];
  }
  function commitBatch(next,label) {
    commit(next,label,selected,activeMeasure,{...caret},selectionRange);
    const pitch=getSelected()?.event.pitches[0];if(pitch){previewStep=pitch.step;setOctave(pitch.octave);}
  }
  function selectAll() {
    if(voiceScope)return selectMeasure();
    const first=B.slot(score,{mi:0,index:0});rangeAnchor={start:first.start,end:first.end};
    const mi=score.measures.length-1;focusEntry(mi,C.eventSpans(score,mi).length-1,true);
  }
  function selectMeasure() {
    const first=B.slot(score,{mi:caret.mi,index:0});rangeAnchor={start:first.start,end:first.end};
    focusEntry(caret.mi,C.eventSpans(score,caret.mi).length-1,true);
  }
  function selectSingle() {
    if(!selectionRange||!rangeAnchor){focusEntry(caret.mi,caret.index);return;}
    const {mi,tick}=C.locateTick(C.measureOffsets(score),rangeAnchor.start);
    const index=C.eventSpans(score,mi).findIndex(span=>span.start===tick);
    focusEntry(mi,Math.max(0,index));
  }
  function selectToEdge(end) {
    const slot=B.slot(score,caret);
    rangeAnchor={start:slot.start,end:slot.end};
    const offsets=C.measureOffsets(score);
    const start=voiceScope?offsets[voiceScope.mi]:0;
    const stop=voiceScope?offsets[voiceScope.mi+1]:offsets.at(-1);
    selectionRange=end?{start:slot.start,end:stop}:{start,end:slot.end};
    render();
    const boundary=voiceScope?(end?'小節末':'小節頭'):(end?'曲末':'曲頭');
    $('statusText').textContent='現在の音符から'+boundary+'まで選択';
  }
  function editBounds() {
    return selectionRange||B.slot(score,caret);
  }
  function copySelection(cut=false) {
    const bounds=editBounds(),fragment=B.copyRange(score,bounds.start,bounds.end);
    const next=cut?B.clearRange(score,bounds.start,bounds.end):score;
    clipboard=fragment;preferMeasureClipboard=false;
    const [first,last]=measureBounds(),offsets=C.measureOffsets(score);
    if(!cut&&!voiceScope&&selectionRange?.start===offsets[first]&&selectionRange.end===offsets[last+1])
      arrangementUI?.copyMeasures(Array.from({length:last-first+1},(_,i)=>i+first),{quiet:true});
    if(cut)commitBatch(next,'範囲を切り取り');
    $('pasteSelection').disabled=false;
    refreshOverviewControls();
    if(!$('scoreOverview').hidden)$('overviewFeedback').textContent='コピー元 · '+score.instrument;
  }
  function canPasteSelection(){return !!clipboard||preferMeasureClipboard&&!!arrangementUI?.readClipboard();}
  function copyWholeMeasures(){
    const [first,last]=measureBounds(),order=Array.from({length:last-first+1},(_,i)=>i+first);
    arrangementUI.copyMeasures(order);
    render();showToast(order.length+' 小節を全パートまとめてコピーしました');
  }
  function pasteWholeMeasures(){
    if(voiceScope)throw Error('第1声部に戻ってから小節を貼り付けてください');
    const clip=arrangementUI.readClipboard();if(!clip)return;
    const document=editionDocument();
    applyArrangedScore(A.insert(document,clip,caret.mi),'小節を貼り付け',caret.mi);
  }
  function pasteSelection() {
    if(preferMeasureClipboard&&arrangementUI?.readClipboard())return pasteWholeMeasures();
    if(!clipboard)return;
    const at=selectionRange?selectionRange.start:B.slot(score,caret).start;
    const pasted=B.pasteRange(score,clipboard,at),mi=C.locateTick(C.measureOffsets(score),at).mi;
    commit(pasted.score,'貼り付け',pasted.firstId,mi,{mi,index:0},{start:pasted.start,end:pasted.end});
    const first=B.slot(score,caret);rangeAnchor={start:first.start,end:first.end};
    if(!$('scoreOverview').hidden)$('overviewFeedback').textContent=score.instrument+'に貼り付けました';
  }
  function measureBounds() {
    const offsets=C.measureOffsets(score);
    return selectionRange?[C.locateTick(offsets,selectionRange.start).mi,C.locateTick(offsets,selectionRange.end-1).mi]:[caret.mi,caret.mi];
  }
  function selectionLabel() {
    const [first,last]=measureBounds();return first===last?`${first+1}小節`:`${first+1}〜${last+1}小節`;
  }
  function insertMeasureBefore() {
    const [mi]=measureBounds();commit(B.insertMeasures(score,mi),'小節を挿入',null,mi,{mi,index:0});
  }
  function duplicateMeasures() {
    const [first,last]=measureBounds(),next=B.duplicateMeasures(score,first,last),mi=last+1,offsets=C.measureOffsets(next);
    const range={start:offsets[mi],end:offsets[mi+last-first+1]};
    commit(next,'小節を複製',next.measures[mi].events[0]?.id||null,mi,{mi,index:0},range,{duplicateFrom:first});
    const anchor=B.slot(score,caret);rangeAnchor={start:anchor.start,end:anchor.end};
  }
  function removeSelectedMeasures() {
    const [first,last]=measureBounds(),next=B.removeMeasures(score,first,last),mi=Math.min(first,next.measures.length-1);
    commit(next,'小節を削除',null,mi,{mi,index:0});
  }
  function resizeSelected(denFor,dotsFor,label) {
    const focusTime=B.slot(score,caret).start;
    const spans=selectionRange?B.entries(score,selectionRange.start,selectionRange.end,false):[];
    if(!selectionRange){
      const found=getSelected();
      if(found)commit(C.changeDuration(score,found.event.id,denFor(found.event),dotsFor(found.event),{overwriteTuplet:true}),label,found.event.id,found.mi);
      return;
    }
    let next=score;
    for(const span of spans.slice().reverse())next=C.changeDuration(next,span.event.id,denFor(span.event),dotsFor(span.event));
    let end=selectionRange.end;const ids=new Set(spans.map(s=>s.event.id)),offsets=C.measureOffsets(next);
    for(let mi=0;mi<next.measures.length;mi++)for(const span of C.eventSpans(next,mi,false))if(ids.has(span.event.id))end=Math.max(end,offsets[mi]+span.end);
    const {mi,tick}=C.locateTick(offsets,focusTime),positions=C.eventSpans(next,mi);
    const index=positions.findIndex(s=>s.end>tick);
    let anchorAfter=rangeAnchor;
    if(rangeAnchor){const {mi:anchorMi,tick}=C.locateTick(offsets,rangeAnchor.start),span=C.eventSpans(next,anchorMi).find(s=>s.start===tick);if(span)anchorAfter={start:rangeAnchor.start,end:offsets[anchorMi]+span.end};}
    commit(next,label,selected,activeMeasure,{mi,index:index<0?positions.length-1:index},{start:selectionRange.start,end});
    rangeAnchor=anchorAfter;
  }
  function commit(next,label,selectedId=selected,measureIndex=activeMeasure,caretAfter=null,rangeAfter=null,options={}) {
    if(window.KanadeCollab?.blocked)throw Error('同期の確認を先に完了してください');
    if(next===score)return;
    const previousScore=documentScore(),scope=voiceScope;
    let editedPart=next;
    if(scope){
      const {mi,part}=scope,current=score.measures[mi],edited=next.measures[mi];
      if(options.document||next.measures.length!==score.measures.length||edited?.id!==current.id||
        next.measures.some((bar,index)=>index!==mi&&bar!==score.measures[index])||
        edited.directions!==current.directions||edited.time!==current.time||edited.voice2!==current.voice2){
        throw Error('第2声部はこの小節内で編集できます。小節全体の操作は第1声部で行ってください。');
      }
      const measures=part.measures.slice(),bar={...part.measures[mi]};
      if(edited.events.length)bar.voice2=edited.events;else delete bar.voice2;
      measures[mi]=bar;editedPart={...next,measures};
    }
    let nextDocument=options.document||(ensemble?C.replaceScorePart(ensemble,partIndex,editedPart,options):editedPart);
    if(!options.document&&!previousScore.bassPart&&previousScore.measures.some(bar=>bar.repeatStart||bar.repeatEnd||bar.volta)&&
      (previousScore.measures.length!==nextDocument.measures.length||previousScore.measures.some((bar,index)=>bar.id!==nextDocument.measures[index].id))){
      nextDocument=A.repairRepeats(nextDocument);
    }
    const linkCount=nextDocument.sceneLinks?.length||0;
    nextDocument=A.reconcileLinks(previousScore,nextDocument);
    const detached=linkCount-(nextDocument.sceneLinks?.length||0);
    const errors=C.validateScore(nextDocument);if(errors.length) throw new Error(errors[0]);
    mobileDraft=null;mobileChord=null;tupletNext=null;
    const sounding=next.measures.flatMap(m=>m.events).find(e=>e.id===selectedId);
    const before=score.measures.flatMap(m=>m.events).find(e=>e.id===selectedId);
    const audition=sounding?.type==='note'&&(!before||JSON.stringify(before.pitches)!==JSON.stringify(sounding.pitches));
    // Core edits return a new score; retain the immutable previous version.
    recordUndo(label);
    stopAudioForEdit();lastEnteredId=null;pendingTieId=null;keyboardGhost=false;selectionRange=rangeAfter?{...rangeAfter}:null;if(!selectionRange)rangeAnchor=null;loadScore(nextDocument,partIndex);if(scope)setVoiceScope(scope.mi);selected=selectedId;activeMeasure=Math.min(measureIndex,score.measures.length-1);
    if(selectedId){const found=getSelected();if(found)caret={mi:found.mi,index:found.index};}
    else caret=caretAfter||{mi:activeMeasure,index:0};
    persist();render();revealCaret();$('statusText').textContent=label+' · 保存済み';
    onLocalChange?.(previousScore,documentScore());transport?.edit();
    if(detached)showToast('編集した箇所のシーンリンクを解除しました');
    if(audition&&!(sound.playing&&transport?.isLoop()))sound.audition(sounding.pitches,C.soundName(score),C.soundingOffset(score)).catch(e=>showToast(e.message,true));
  }
  function attempt(fn) {try {fn();}catch(e){
    render();const message=e instanceof Error?e.message:String(e);
    if(!$('scoreOverview').hidden)$('overviewFeedback').textContent=message;else showToast(message,true);
  }}
  function restore(state,target) {
    mobileDraft=null;mobileChord=null;tupletNext=null;
    target.push(snapshot());
    selectionRange=state.selectionRange||null;rangeAnchor=state.rangeAnchor||null;
    lastEnteredId=null;pendingTieId=null;keyboardGhost=false;loadScore(state.ensemble||state.score,state.partIndex);selected=state.selected;activeMeasure=state.activeMeasure;caret=state.caret||{mi:activeMeasure,index:0};
    stopAudioForEdit();persist();render();revealCaret();transport?.edit();
  }
  function undoAction(){if(window.KanadeCollab?.active)return window.KanadeCollab.undo();if(undo.length)restore(undo.pop(),redo);else showToast('元に戻せる操作がありません');}
  function redoAction(){if(window.KanadeCollab?.active)return window.KanadeCollab.redo();if(redo.length)restore(redo.pop(),undo);else showToast('やり直せる操作がありません');}
  function selectDuration(d){den=d;renderTools();updateGhost();refreshOverviewControls();}
  function setAlter(a){alter=a;renderTools();updateGhost();}
  function setOctave(v){octave=Math.max(0,Math.min(8,v));$('octaveVal').textContent=String(octave);updateGhost();}
  function durationNeighbor(event,delta){
    const next=C.DENOMS[C.DENOMS.indexOf(event.den)+delta];
    if(!next)return null;
    const mark=event.tuplet;
    if(mark&&C.durationTicks(next,event.dots)>(mark.actual-mark.index)*C.durationTicks(C.tupletUnit(event)))return null;
    return next;
  }
  function stepSelectedDuration(delta){
    const event=getSelected()?.event,next=event&&durationNeighbor(event,delta);
    if(next)resizeSelected(()=>next,e=>e.dots,'音価を変更');
  }
  function renderDesktopEdit(){
    const bar=$('desktopEdit'),found=getSelected(),event=found?.event;
    const inOverview=!$('scoreOverview').hidden;
    const container=$(inOverview?'desktopEditOverview':'desktopEditHome');
    if(bar.parentElement!==container)container.append(bar);
    const slot=B.slot(score,caret),beat=1+(slot.start-C.measureOffsets(score)[caret.mi])/(C.WHOLE/C.timeAt(score,caret.mi).den);
    const info=selectionRange?selectionLabel()+'を選択':
      event?C.eventLabel(event).split('  ')[0]+' · '+(found.mi+1)+'小節':
      `${caret.mi+1}小節 · ${Number(beat.toFixed(2))}拍`;
    const output=$('desktopSelection');
    if(output.textContent!==info)output.textContent=info;
    const duration=$('desktopDuration');
    duration.value=String(event?.den??den);duration.disabled=!event||!!selectionRange||!!rangeDirection;
    const note=event?.type==='note',notesSelected=selectionRange?selectedIds(true).length>0:note;
    const lastIndex=C.eventSpans(score,caret.mi).length-1;
    const blocked=!!rangeDirection;
    const disabled={
      previous:caret.mi===0&&caret.index===0,next:willAppendBar(caret.mi,caret.index)&&score.measures.length>=500||
        blocked&&caret.mi===score.measures.length-1&&caret.index>=lastIndex,
      dot:(!event&&!selectionRange)||blocked,lower:!notesSelected||blocked,higher:!notesSelected||blocked,
      rest:!event&&!selectionRange||blocked,tie:!note||!!selectionRange||blocked,
      slur:!notesSelected||blocked,erase:(!event&&!selectionRange)||blocked
    };
    for(const button of bar.querySelectorAll('button'))button.disabled=!!disabled[button.dataset.desktopEdit];
    bar.querySelector('[data-desktop-edit="dot"]').setAttribute('aria-pressed',String(!!event?.dots));
  }
  function setupDesktopEdit(){
    const bar=$('desktopEdit'),duration=$('desktopDuration');
    duration.innerHTML=C.DENOMS.map((value,index)=>`<option value="${value}">${R.durationName(value)} [${7-index}]</option>`).join('');
    duration.onchange=()=>attempt(()=>resizeSelected(()=>Number(duration.value),event=>event.dots,'音価を変更'));
    const actions={previous:()=>moveCaret(-1),next:()=>moveCaret(1),dot:()=>cycleDots(),
      lower:()=>noteStep(selected,-1),higher:()=>noteStep(selected,1),rest:toggleSelectedRest,
      tie:toggleSelectedTie,slur:()=>toggleDirection('slur'),erase:()=>deleteSelected()};
    bar.onclick=event=>{
      const action=event.target.closest('[data-desktop-edit]')?.dataset.desktopEdit;
      if(action){attempt(actions[action]);focusScore();}
    };
    bar.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')event.stopPropagation();});
  }
  function renderTools() {
    const name=C.soundName(score),percussion=window.KanadePercussion.preset(name),map=$('soundMap'),status=S.status(name),builtIn=window.KanadeAudio.localSounds[name];
    map.hidden=!percussion;
    $('soundDescription').textContent=builtIn&&status.kind==='builtIn'?builtIn:status.label+(status.substitute?' · '+status.substitute:'');
    $('soundPreview').disabled=status.kind==='missing';
    if(percussion&&map.dataset.instrument!==name){
      map.dataset.instrument=name;
      $('percussionPads').innerHTML=percussion.pads.map(([step,label,icon])=>`<button data-drum-step="${step}" title="${label}を入力（${step}）">${window.KanadeIcons.svg(icon||percussion.icon)}<span>${label}<kbd>${step}</kbd></span></button>`).join('');
    }
    if(!$('durations').children.length)$('durations').innerHTML=C.DENOMS.map((d,i)=>`<button data-den="${d}" class="${d===den?'active':''}" title="1/${d}音符 [${7-i}]" aria-keyshortcuts="${7-i}"><span class="glyph">${R.toolGlyph(d)}</span><small>${d===1?'全':d===2?'2分':d===4?'4分':d===8?'8分':d+'分'} <kbd>[${7-i}]</kbd></small></button>`).join('');
    $('durations').querySelectorAll('[data-den]').forEach(b=>b.classList.toggle('active',Number(b.dataset.den)===den));
    $('dotBtn').classList.toggle('active',dots>0);
    $('dotBtn').querySelector('.music-symbol').textContent=dots?'♩.':'♩';
    $('accidentals').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.alter===alter));
    $('chordBtn').setAttribute('aria-pressed',String(chordMode));
    $('entryModeBtn').classList.toggle('active',editMode==='entry');
    $('selectModeBtn').classList.toggle('active',editMode==='select');
    $('entryModeBtn').setAttribute('aria-pressed',String(editMode==='entry'));
    $('selectModeBtn').setAttribute('aria-pressed',String(editMode==='select'));
    $('currentDuration').textContent=R.durationName(den,dots);
    $('overwriteIndicator').hidden=!overwriteMode||editMode!=='entry';
    $('octaveVal').textContent=String(octave);
    $('scoreHost').classList.toggle('entry-active',editMode==='entry');
    updateTupletButton();
    if(mobile.matches)renderMobile();else renderDesktopEdit();
  }
  const symbols=C.Symbols;
  function toggleArticulation(mark) {
    const ids=selectedIds(true);if(!ids.length)throw Error('記号を付ける音符を選んでください');
    const notes=score.measures.flatMap(m=>m.events).filter(event=>ids.includes(event.id));
    const remove=notes.every(event=>event.articulations?.includes(mark));
    const next=B.transform(score,ids,event=>{
      const marks=new Set(event.articulations);
      if(remove)marks.delete(mark);else marks.add(mark);
      if(marks.size)event.articulations=[...marks];else delete event.articulations;
      return event;
    });
    commitBatch(next,symbols.notes[mark].label+(remove?'を外す':'を追加'));
  }
  let meterTarget=null;
  const meterLabel=time=>time.num+'/'+time.den;
  function readMeter(){
    const text=$('meterSequence').value.normalize('NFKC').trim();
    const sequence=text.split(/\s*[+→,、]\s*/).map(item=>{
      const match=/^(\d{1,2})\s*\/\s*(2|4|8|16)$/.exec(item);
      if(!match)throw Error('4/4 や 4/4 + 3/4 の形で入力してください');
      const time={num:Number(match[1]),den:Number(match[2])};C.measureTicks(time);return time;
    });
    if(sequence.length>16)throw Error('1パターンに指定できる拍子は16個までです');
    return sequence;
  }
  function openMeter(){
    const [mi,last]=measureBounds();
    meterTarget={mi,scoreId:score.id,barId:score.measures[mi].id};
    if($('commandPalette').open)closeCommands();
    const form=$('meterForm');
    form.elements.meterScope.value=last>mi?'count':'one';
    $('meterCount').value=String(Math.max(1,Math.min(500-mi,last>mi?last-mi+1:2)));
    $('meterCount').max=String(500-mi);
    $('meterSequence').value=meterLabel(C.timeAt(score,mi));
    const saved=$('meterSaved'),sequence=score.meterTail?.sequence;
    saved.hidden=!(sequence?.length>1);
    if(!saved.hidden){
      saved.dataset.meterPreset=sequence.map(meterLabel).join(' + ');
      saved.textContent='保存中のパターン';
      saved.title=sequence.map(meterLabel).join(' → ');
    }
    $('meterLocation').textContent=`${mi+1} 小節目から · 現在 ${meterLabel(C.timeAt(score,mi))}`;
    refreshMeter();
    $('meterDialog').showModal();
  }
  function refreshMeter(){
    const scope=$('meterForm').elements.meterScope.value;
    $('meterCountRow').hidden=scope!=='count';
    $('meterCount').disabled=scope!=='count';
    $('meterError').textContent='';
    try{
      const sequence=readMeter();
      const count=scope==='tail'?null:scope==='count'?$('meterCount').valueAsNumber:1;
      const shown=Array.from({length:Math.min(count??Math.max(3,sequence.length),8)},(_,i)=>meterLabel(sequence[i%sequence.length]));
      const last=count===null?' · 以降も繰り返し':sequence.length>1&&count>8?' …':'';
      $('meterPreview').textContent=shown.length?shown.join(' → ')+last:'';
    }catch(e){$('meterPreview').textContent='';}
  }
  function setupMeter(){
    $('timeSelect').onclick=$('overviewMeter').onclick=openMeter;
    const form=$('meterForm');
    form.oninput=refreshMeter;
    for(const button of form.querySelectorAll('[data-meter-preset]'))button.onclick=()=>{
      $('meterSequence').value=button.dataset.meterPreset;
      if(button.dataset.meterPreset.includes('+')&&form.elements.meterScope.value==='one')form.elements.meterScope.value='tail';
      refreshMeter();
    };
    form.onsubmit=event=>{
      event.preventDefault();
      try{
        const {mi,scoreId,barId}=meterTarget;
        if(score.id!==scoreId||score.measures[mi]?.id!==barId)throw Error('楽譜が更新されました。小節を選び直してください');
        const scope=form.elements.meterScope.value,sequence=readMeter();
        const count=scope==='tail'?null:scope==='count'?$('meterCount').valueAsNumber:1;
        if(editionDocument().bassPart&&window.KanadeCollab?.activePart==='bass')throw Error('このルームではメロディー側で拍子を設定してください');
        const next=C.setMeter(score,mi,sequence,count);
        const index=Math.min(caret.index,C.eventSpans(next,mi).length-1);
        commit(next,`${mi+1}小節目から拍子を変更`,null,mi,{mi,index});
        $('meterDialog').close();
      }catch(error){$('meterError').textContent=error.message;}
    };
  }
  function directionTarget() {
    const position=selectionRange?.start??B.slot(score,caret).start;
    return C.locateTick(C.measureOffsets(score),position);
  }
  function renderRangeDirection(){
    if(rangeDirection&&(rangeDirection.part!==score.id||score.measures[rangeDirection.mi]?.id!==rangeDirection.barId))rangeDirection=null;
    const draft=rangeDirection;
    $('rangeDirectionBar').hidden=!draft;
    if(draft){
      const span=C.eventSpans(score,caret.mi)[caret.index];
      const valid=span?.event.type==='note'&&(caret.mi>draft.mi||caret.mi===draft.mi&&span.start>draft.tick);
      $('rangeDirectionStatus').textContent=symbols.byKey[draft.key].label+(mobile.matches?' · 終点の音符をタップ':' · 終点をクリック、または ← → と Enter');
      $('rangeDirectionApply').disabled=!valid;
      $('rangeDirectionRemove').hidden=!draft.existing;
    }
  }
  function openRangeDirection(mi,tick,key){
    if(voiceScope)throw Error('スラー・クレッシェンドなどの範囲は第1声部で指定してください');
    const span=C.eventSpans(score,mi,false).find(s=>s.start===tick&&s.event.type==='note');
    const existing=score.measures[mi].directions?.find(mark=>mark.key===key&&mark.tick===tick);
    if(!span&&!existing)throw Error('開始位置の音符を選んでください');
    if($('symbolPalette').open)$('symbolPalette').close();
    if($('commandPalette').open)closeCommands();
    rangeDirection={mi,tick,key,existing,part:score.id,barId:score.measures[mi].id};
    const end=existing&&C.directionEnd(score,mi,existing);
    const endSpan=end&&C.eventSpans(score,end.mi,false).find(s=>s.start===end.tick&&s.event.type==='note');
    if(endSpan)focusEntry(end.mi,endSpan.index);
    else if(span)focusEntry(mi,span.index);
    renderRangeDirection();
    ($('scoreOverview').hidden?$('scoreHost'):$('overviewScore')).focus({preventScroll:true});
  }
  function finishRangeDirection(mi,index){
    const draft=rangeDirection,span=C.eventSpans(score,mi)[index];
    if(!draft||draft.part!==score.id||score.measures[draft.mi]?.id!==draft.barId)
      throw Error('楽譜が更新されました。記号を選び直してください');
    if(span?.event.type!=='note')throw Error('終点には音符を選んでください');
    const next=C.setDirectionRange(score,draft.mi,draft.key,draft.tick,mi,span.start);
    commit(next,symbols.byKey[draft.key].label+'の終点を設定',span.event.id,mi);
    rangeDirection=null;renderRangeDirection();
  }
  function rangeDirectionHit(target){
    const mark=target.closest('[data-direction-edit]');
    if(!mark)return false;
    const mi=Number(mark.dataset.directionBar),part=mark.closest('[data-engraved-part]');
    if(!part||selectOverviewPart(Number(part.dataset.engravedPart),mi))
      attempt(()=>openRangeDirection(mi,Number(mark.dataset.directionStart),mark.dataset.directionEdit));
    return true;
  }
  function toggleDirection(key,text) {
    const preset=symbols.byKey[key],{mi,tick}=directionTarget();
    if(C.isRangeDirection(key)){
      const offsets=C.measureOffsets(score);
      if(selectionRange){
        const notes=B.entries(score,selectionRange.start,selectionRange.end,false).filter(s=>s.event.type==='note');
        if(notes.length<2)throw Error('開始と終点の音符を含む範囲を選んでください');
        const start=notes[0],last=notes.at(-1);
        if($('symbolPalette').open)$('symbolPalette').close();
        commitBatch(C.setDirectionRange(score,start.mi,key,start.start-offsets[start.mi],last.mi,last.start-offsets[last.mi]),preset.label+'を追加');
      }else openRangeDirection(mi,tick,key);
      return;
    }
    const next=C.changeDirections(score,mi,marks=>{
      const existing=marks.findIndex(mark=>mark.tick===tick&&mark.key===key&&(key!=='custom'||mark.text===text));
      if(existing>=0){marks.splice(existing,1);return marks;}
      return [...marks,{key,tick,...(text?{text}:{})}];
    });
    commitBatch(next,preset.label+'を変更');
  }
  let symbolType='note',symbolCategory='';
  function openSymbols(type) {
    symbolType=type;symbolCategory='';
    $('symbolSearch').value='';$('symbolCustomText').value='';
    renderSymbols();
    if(!$('symbolPalette').open)$('symbolPalette').showModal();
  }
  function renderSymbols() {
    const isNote=symbolType==='note',categories=$('symbolCategories'),results=$('symbolResults');
    const groups=isNote?symbols.noteGroups.map(([name,items])=>[name,items.map(([key])=>({key,...symbols.notes[key]}))]):
      [...new Set(symbols.directions.filter(mark=>!['custom','chordSymbol'].includes(mark.key)).map(mark=>mark.group))].map(name=>[name,symbols.directions.filter(mark=>mark.group===name&&mark.key!=='chordSymbol')]);
    if(!symbolCategory)symbolCategory=groups[0][0];
    $('symbolHeading').textContent=isNote?'音符記号の詳細':'指示記号の詳細';
    const {mi,tick}=directionTarget(),position=`${mi+1}小節目・${Number((tick/C.TPQ+1).toFixed(3))}拍`;
    $('symbolContext').textContent=isNote?(selectionRange?'選択範囲の音符に適用':'選んだ音符に適用'):`${position}に配置。松葉とスラーは終点の音符を選べます。`;
    categories.replaceChildren();
    for(const [name] of groups){
      const button=document.createElement('button');button.type='button';button.textContent=name;
      button.setAttribute('aria-pressed',String(name===symbolCategory));
      button.onclick=()=>{symbolCategory=name;$('symbolSearch').value='';renderSymbols();};categories.append(button);
    }
    const query=normalizeQuery($('symbolSearch').value).trim();
    const items=(query?groups.flatMap(([,list])=>list).filter(mark=>normalizeQuery(mark.label+' '+mark.key).includes(query)):
      groups.find(([name])=>name===symbolCategory)[1]);
    const active=isNote?(getSelected()?.event.articulations||[]):(score.measures[mi].directions||[]).filter(mark=>mark.tick===tick);
    results.replaceChildren();
    for(const mark of items){
      const button=document.createElement('button');button.type='button';
      if(isNote){const glyph=document.createElement('span');glyph.className='symbol-glyph';glyph.textContent=typeof mark.glyph==='number'?String.fromCodePoint(mark.glyph):mark.glyph;button.append(glyph);}
      button.append(document.createTextNode(mark.label));
      button.setAttribute('aria-pressed',String(isNote?active.includes(mark.key):active.some(item=>item.key===mark.key)));
      button.disabled=isNote&&!selectedIds(true).length;
      button.onclick=()=>{attempt(()=>isNote?toggleArticulation(mark.key):toggleDirection(mark.key));renderSymbols();};
      results.append(button);
    }
    if(!items.length)results.textContent='該当する記号がありません';
    $('symbolPlaced').hidden=isNote||!active.length;
    $('symbolPlacedList').replaceChildren();
    if(!isNote)for(const mark of active){
      const button=document.createElement('button');button.type='button';button.textContent=(mark.text||symbols.byKey[mark.key].label)+(C.isRangeDirection(mark.key)?'の終点を変更':'を外す');
      button.onclick=()=>{attempt(()=>toggleDirection(mark.key,mark.text));if($('symbolPalette').open)renderSymbols();};$('symbolPlacedList').append(button);
    }
    $('symbolCustom').hidden=isNote;
  }
  function clearMobileDraft(){
    if(!mobileDraft)return;
    mobileDraft=null;renderMobile();updateGhost();
  }
  const mobilePitchLabel=pitch=>C.eventLabel({type:'note',den:4,dots:0,pitches:[pitch]}).split('  ')[0];
  function refreshMobileChord(){
    renderMobile();updateGhost();
  }
  function toggleMobileChord(){
    if(mobileChord){mobileChord=null;refreshMobileChord();return;}
    const found=getSelected(),event=found?.event;
    if((!mobileDraft&&event?.type!=='note')||selectionRange||rangeDirection)return;
    const {mi,tick}=mobileDraft||{mi:found.mi,tick:C.eventSpans(score,found.mi)[found.index].start};
    const pitches=mobileDraft?[C.normalPitch({...mobileDraft,alter:alter==='auto'?C.keyAlter(mobileDraft.step,score.key):Number(alter)})]:
      event.pitches.map(pitch=>({...pitch}));
    mobileChord={score,mi,tick,pitches,active:pitches[0].id,adding:true,eventId:mobileDraft?null:event.id};
    refreshMobileChord();
  }
  function editMobileChordPitch(pitch,{add=false,quiet=false}={}){
    const draft=mobileChord;
    const original=draft.pitches.find(item=>item.id===draft.active);
    const edited=C.normalPitch(add?pitch:{...original,...pitch,id:original.id});
    if(draft.pitches.some(item=>(add||item.id!==edited.id)&&C.pitchMidi(item)===C.pitchMidi(edited))){
      if(!quiet)showToast('その音は和音に入っています',true);
      return;
    }
    if(add&&draft.pitches.length>=12)throw Error('和音は12音までです');
    draft.pitches=C.normalizeChord(add?[...draft.pitches,edited]:draft.pitches.map(item=>item.id===edited.id?edited:item));
    draft.active=edited.id;
    refreshMobileChord();
  }
  function applyMobileChord(){
    const draft=mobileChord;
    if(!draft||draft.score!==score)return;
    const {mi,tick,pitches,eventId}=draft;
    if(eventId){
      const found=getSelected();
      if(found?.event.id!==eventId)return;
      if(JSON.stringify(found.event.pitches)===JSON.stringify(pitches)){toggleMobileChord();return;}
      const next=C.changeEvent(score,eventId,note=>({...note,pitches}));
      commit(next,'和音を変更',eventId,mi);return;
    }
    const event=C.makeNote(pitches[0],den,dots);
    event.pitches=pitches;
    if(tupletEnabled)writeInlineTuplet(event,{mi,tick});
    else commitInput(C.placeAcrossBars(score,mi,tick,event,{overwrite:isOverwriteEntry()}),'和音を入力');
  }
  function deleteMobileChordPitch(){
    const draft=mobileChord;
    if(draft.pitches.length<=1)return;
    const index=draft.pitches.findIndex(pitch=>pitch.id===draft.active);
    draft.pitches=draft.pitches.filter(pitch=>pitch.id!==draft.active);
    draft.active=draft.pitches[Math.min(index,draft.pitches.length-1)].id;
    draft.adding=false;refreshMobileChord();
  }
  function renderMobileChord(){
    const draft=mobileChord,editor=$('mobileChordEditor');
    editor.hidden=!draft;
    if(!draft)return;
    const list=$('mobileChordPitches'),focused=document.activeElement?.dataset.mobileChordPitch;
    list.replaceChildren(...draft.pitches.map(pitch=>{
      const button=document.createElement('button');
      button.type='button';button.dataset.mobileChordPitch=pitch.id;button.textContent=mobilePitchLabel(pitch);
      button.setAttribute('aria-pressed',String(pitch.id===draft.active));return button;
    }));
    if(focused)[...list.children].find(button=>button.dataset.mobileChordPitch===focused)?.focus({preventScroll:true});
    const adding=$('mobileChordAdd');
    adding.setAttribute('aria-pressed',String(draft.adding));
    adding.disabled=draft.pitches.length>=12;
    $('mobileChordRemove').disabled=draft.pitches.length<=1;
  }
  function changeMobilePitch(delta,start){
    const current=mobileChord?mobileChord.pitches.find(pitch=>pitch.id===mobileChord.active):mobileDraft;
    if(!current){noteStep(selected,delta);return;}
    start??=C.diatonicNumber(current);
    const pitch=Math.max(7,Math.min(69,start+delta));
    const step=C.STEPS[pitch%7],nextOctave=Math.floor(pitch/7)-1;
    if(current.step===step&&current.octave===nextOctave)return;
    if(mobileChord){editMobileChordPitch({step,octave:nextOctave},{quiet:true});return;}
    Object.assign(mobileDraft,{step,octave:nextOctave});
    renderMobile();updateGhost();
  }
  function mobileDuration(delta) {
    const found=getSelected();
    const editingTuplet=found?.event.tuplet&&found.event.id!==lastEnteredId&&!nextTupletSlot();
    const inputOnly=!!mobileDraft||tupletEnabled&&!editingTuplet||isOverwriteEntry()&&!selectionRange&&!found?.event.tuplet;
    const current=inputOnly?den:found?.event.den||den;
    const index=C.DENOMS.indexOf(current),next=C.DENOMS[Math.max(0,Math.min(C.DENOMS.length-1,index+delta))];
    if(next===current)return;
    if(!inputOnly&&(found||selectionRange))resizeSelected(()=>next,e=>e.dots,'音価を変更');
    selectDuration(next);
  }
  function mobileAccidental(value) {
    if(mobileChord){
      const pitch=mobileChord.pitches.find(item=>item.id===mobileChord.active);
      editMobileChordPitch({alter:value==='auto'?C.keyAlter(pitch.step,score.key):Number(value)});return;
    }
    const found=getSelected();
    if(!mobileDraft&&found?.event.type==='note'){
      if(found.event.pitches.length!==1)return;
      commit(C.changeEvent(score,found.event.id,n=>{
        n.pitches[0].alter=value==='auto'?C.keyAlter(n.pitches[0].step,score.key):Number(value);
        return n;
      }),'臨時記号を変更',found.event.id,found.mi);
    }else setAlter(value);
  }
  function renderMobile() {
    const dock=$('mobileEditor'),draft=mobileDraft,chord=mobileChord,found=getSelected(),event=draft?null:found?.event;
    renderMobileChord();
    const note=event?.type==='note',canPitch=note||!!selectionRange;
    const tuplet=event?.tuplet;
    const overwrite=isOverwriteEntry()&&!selectionRange&&!tuplet;
    const inputDuration=overwrite||tupletEnabled;
    const duration=inputDuration?den:event?.den||den,points=inputDuration?dots:event?.dots??dots;
    const pitch=note?event.pitches.length===1?C.eventLabel(event).split('  ')[0]:'和音':'';
    const label=R.durationName(duration,points,overwrite?'note':event?.type||'note');
    const summary=selectionRange?`${selectionLabel()}を選択`:`${caret.mi+1}/${score.measures.length}小節 · ${pitch?pitch+' · ':''}${label}${event?'':'で入力'}`;
    renderMobileMeasureNav();
    const beat=draft?1+draft.tick/(C.WHOLE/C.timeAt(score,draft.mi).den):0;
    const status=chord?(chord.adding?'五線で音を追加':'五線で音を変更'):
      draft?`${Number(beat.toFixed(2))}拍 · ${draft.step}${draft.octave} · ${label}`:
      tuplet&&!selectionRange?summary+' · '+tuplet.actual+'連符':overwrite?summary+' · 上書き':summary;
    if($('mobileSelection').textContent!==status)$('mobileSelection').textContent=status;
    const button=name=>dock.querySelector(`[data-mobile-action="${name}"]`);
    button('shorter').disabled=duration===C.DENOMS.at(-1);
    const longer=C.DENOMS[C.DENOMS.indexOf(duration)-1];
    const remaining=tuplet&&!tupletEnabled?(tuplet.actual-tuplet.index)*C.durationTicks(C.tupletUnit(event)):Infinity;
    button('longer').disabled=!longer||C.durationTicks(longer,points)>remaining;
    button('higher').disabled=button('lower').disabled=!chord&&!draft&&!canPitch;
    button('addNote').textContent=chord||draft?'確定':'＋音符';
    button('eraseNote').textContent=chord||draft?'取消':'消去';
    button('eraseNote').setAttribute('aria-label',chord||draft?'入力を取り消す':'選択した音符・休符を消去');
    button('previous').disabled=caret.mi===0&&caret.index===0;
    const addsBar=willAppendBar(caret.mi,caret.index);
    button('next').disabled=!!rangeDirection&&caret.mi===score.measures.length-1&&caret.index>=C.eventSpans(score,caret.mi).length-1||addsBar&&score.measures.length>=500;
    button('next').setAttribute('aria-label',addsBar&&!rangeDirection?'次の小節を追加':'次の音符・休符');
    button('next').title=addsBar&&!rangeDirection?'次の小節を追加':'';
    for(const dot of dock.querySelectorAll('[data-mobile-action="dot"]')){
      dot.setAttribute('aria-pressed',String(points>0));
      dot.textContent=points===2?'複付点':'付点';
    }
    button('deleteNote').disabled=!!chord||!event&&!selectionRange;
    button('eraseNote').disabled=!chord&&!draft&&!event&&!selectionRange;
    button('paste').disabled=!canPasteSelection();
    button('stem').disabled=!canPitch;
    const capacity=500-score.measures.length;
    const [first,last]=measureBounds();
    const count=$('mobileMeasureCount');
    count.max=String(Math.max(1,capacity));count.disabled=capacity===0;
    button('addMeasure').disabled=button('addManyMeasures').disabled=button('insertBefore').disabled=capacity===0;
    button('countDown').disabled=button('countUp').disabled=capacity===0;
    button('duplicateMeasure').disabled=capacity<last-first+1;
    button('removeMeasures').disabled=score.measures.length===1&&!score.measures[0].events.length;
    button('chord').disabled=!chord&&(!draft&&!note||!!selectionRange||!!rangeDirection);
    button('chord').setAttribute('aria-pressed',String(!!chord));
    button('tie').disabled=button('addRest').disabled=!!chord;
    if(draft)button('tie').disabled=true;
    button('toggleRest').disabled=!!draft||!!chord;
    $('mobileOctave').textContent=(draft?.octave??octave)+' オクターブ';
    for(const control of dock.querySelectorAll('[data-mobile-art]')){
      control.disabled=!canPitch;
      control.setAttribute('aria-pressed',String(!!event?.articulations?.includes(control.dataset.mobileArt)));
    }
    const target=directionTarget();
    for(const control of dock.querySelectorAll('[data-mobile-direction]')){
      control.setAttribute('aria-pressed',String(!!score.measures[target.mi].directions?.some(mark=>mark.key===control.dataset.mobileDirection&&mark.tick===target.tick)));
    }
    for(const control of dock.querySelectorAll('[data-mobile-alter]')){
      control.disabled=score.clef==='percussion'||(!chord&&note&&event.pitches.length>1);
      const chordPitch=chord?.pitches.find(pitch=>pitch.id===chord.active);
      const value=chordPitch?String(chordPitch.alter):note?String(event.pitches[0].alter):alter;
      control.setAttribute('aria-pressed',String(control.dataset.mobileAlter===value));
    }
  }
  function renderMobileMeasureNav() {
    const current=caret.mi+1,total=score.measures.length;
    $('mobileMeasurePrev').disabled=current<=1;
    $('mobileMeasureNext').disabled=current>=total;
  }
  function setupMobileMeasureNav() {
    function go(delta) {
      const target=caret.mi+delta;
      if(target<0||target>=score.measures.length)return;
      chordMode=false;
      focusEntry(target,0);
      showScoreTransition($('scoreHost'));
    }
    $('mobileMeasurePrev').onclick=()=>go(-1);
    $('mobileMeasureNext').onclick=()=>go(1);
    $('scoreScroll').addEventListener('kanade-measure-flick',event=>go(event.detail));
  }
  function switchPart(index,measure=caret.mi){
    if(!ensemble||index<0||index>ensemble.ensembleParts.length)return;
    loadScore(ensemble,index);
    chordMode=false;lastPointer=null;
    const pitch=score.clef==='bass'?['F',3]:['C',4];
    previewStep=pitch[0];octave=pitch[1];
    focusEntry(Math.min(measure,score.measures.length-1),0);
    showScoreTransition($('scoreHost'));
  }
  function renderEnsemble(){
    const parts=ensemble?C.scoreParts(ensemble):[canonicalPart()];
    $('ensembleActive').hidden=!ensemble;
    const selector=$('ensemblePart');
    const signature=JSON.stringify(parts.map(part=>[part.id,instrumentDisplay(part.instrument)]));
    if(selector.dataset.signature!==signature){
      selector.dataset.signature=signature;
      selector.replaceChildren(...parts.map((part,index)=>new Option(instrumentDisplay(part.instrument),String(index))));
    }
    selector.value=String(partIndex);
    $('ensemblePrev').disabled=partIndex===0;
    $('ensembleNext').disabled=partIndex===parts.length-1;
    $('ensemblePads').hidden=!window.KanadePercussion.preset(C.soundName(score));
    if(!$('ensembleDialog').open)return;
    renderRoster(parts);
  }
  const hasMusic=part=>part.measures.some(bar=>bar.events.length||bar.voice2?.length||bar.directions?.length);
  const partToken=part=>part.measures[0].id;
  const lookupInstrument=I.profile;
  const writtenFifths=I.fifths;
  const newKey=(key,fifths)=>((key+fifths+18)%12)-6;
  function renderRoster(parts){
    const index=parts.findIndex(part=>partToken(part)===rosterPart);
    const part=parts[index], detail=$('ensembleDetails'), list=$('ensembleList');
    if(!part){rosterPart=null;replacing=false;pendingEnsemble=null;}
    $('ensembleSummary').textContent=`${parts.length} / 32 パート · ${score.measures.length} 小節`;
    $('ensembleUndo').disabled=$('undoBtn').disabled;
    const rows=parts.map(part=>[partToken(part),instrumentDisplay(part.instrument),lookupInstrument(part)?.group||'その他',hasMusic(part)]);
    const signature=JSON.stringify([rows,index,partIndex]);
    if(list.dataset.signature!==signature){
      list.dataset.signature=signature;
      const focused=document.activeElement?.dataset.rosterToken;
      list.replaceChildren(...rows.map(([token,name,group,written],i)=>{
        const button=document.createElement('button');button.type='button';button.className='ensemble-roster-item';
        button.dataset.rosterToken=token;button.setAttribute('aria-pressed',String(i===index));
        for(const [tag,value] of [['span',String(i+1).padStart(2,'0')],['strong',name],['small',i===partIndex?'編集中':written?group+' · 入力済み':group]]){
          const text=document.createElement(tag);text.textContent=value;button.append(text);
        }
        button.onclick=()=>{rosterPart=token;pendingEnsemble=null;replacing=false;renderEnsemble();};
        return button;
      }));
      if(focused)Array.from(list.children).find(button=>button.dataset.rosterToken===focused)?.focus({preventScroll:true});
    }
    detail.hidden=!part;
    if(part){
      $('ensembleDetailName').textContent=instrumentDisplay(part.instrument);
      const bars=part.measures.filter(bar=>bar.events.length||bar.voice2?.length||bar.directions?.length).length;
      $('ensembleDetailInfo').textContent=bars?`${bars} 小節に入力あり`:'未入力';
      if($('ensembleName').dataset.part!==rosterPart||document.activeElement!==$('ensembleName')){
        $('ensembleName').value=instrumentDisplay(part.instrument);$('ensembleName').dataset.part=rosterPart;
      }
      $('ensembleUp').disabled=index===0;
      $('ensembleDown').disabled=index===parts.length-1;
      $('ensembleRemove').disabled=parts.length===1;
      $('ensembleReplace').setAttribute('aria-pressed',String(replacing));
    }
    $('ensembleConfirm').hidden=!pendingEnsemble;
    if(pendingEnsemble){
      $('ensembleConfirmText').textContent=pendingEnsemble.text;
      $('ensembleConfirmAction').textContent=pendingEnsemble.label;
    }
    renderInstrumentLibrary(parts,part);
    renderPresets(parts);
    renderRosterSound(part);
  }
  const normalizeInstrumentQuery=value=>value.normalize('NFKD').replace(/\p{Mark}/gu,mark=>mark==='\u3099'||mark==='\u309a'?mark:'').normalize('NFC').toLowerCase()
    .replace(/[ぁ-ゖ]/g,char=>String.fromCharCode(char.charCodeAt(0)+0x60)).replace(/[\s・-]/g,'');
  const instrumentAliases={
    alto:'alto sax saxophone サックス',tenor:'tenor sax saxophone サックス',baritone:'baritone sax saxophone サックス',
    mallets:'marimba vibraphone xylophone glockenspiel マリンバ ビブラフォン 木琴 鉄琴',
    basses:'bass drum 大太鼓 バスドラ',snare:'snare drum 小太鼓',baritoneHorn:'marching baritone'
  };
  function renderInstrumentLibrary(parts,part){
    $('ensembleLibraryHeading').textContent=replacing?'楽器を差し替え':'楽器を追加';
    $('ensembleCancelReplace').hidden=!replacing;
    const query=normalizeInstrumentQuery($('ensembleSearch').value);
    const filters=$('ensembleFilters');
    for(const button of filters.children)button.setAttribute('aria-pressed',String(button.textContent===rosterGroup));
    const available=instrumentCatalog.filter(item=>(rosterGroup==='すべて'||item.group===rosterGroup)&&
      normalizeInstrumentQuery([item.name,item.english,item.key,item.group,item.sound,instrumentAliases[item.key]||''].join(' ')).includes(query));
    const keys=parts.map(part=>lookupInstrument(part)?.key);
    const isMarching=keys.some(key=>['mellophone','tenors','baritoneHorn'].includes(key));
    const candidates=isMarching?[
      ['tenors','バッテリーに中音域を追加'],['basses','バッテリーに低音を追加'],['cymbals','金属打楽器を追加'],['mallets','鍵盤打楽器を追加'],['mellophone','金管の中音域を追加'],
      ['baritone','木管の低音を追加'],['timpani','ピットに音程のある打楽器を追加']
    ]:[
      ['flute','木管に高音域を追加'],['clarinet','木管の中音域を追加'],['trumpet','金管に高音域を追加'],['tuba','金管の低音を追加'],['snare','リズムを支える打楽器を追加'],['horn','金管の中音域を追加'],['timpani','音程のある打楽器を追加'],['mallets','鍵盤打楽器を追加'],
      ['piccolo','木管の最高音域を追加'],['contrabass','低音に弦楽器の音色を追加'],['piano','鍵盤で和声を補強']
    ];
    const suggestions=candidates.filter(([key])=>!keys.includes(key)).slice(0,3);
    const signature=JSON.stringify([available.map(item=>item.key),suggestions,replacing,partToken(part||parts[0]),keys,parts.length,!!query,rosterGroup,instrumentLanguage,available.map(item=>S.status(item.sound).kind)]);
    const catalog=$('ensembleCatalog'), suggested=$('ensembleSuggestions');
    if(catalog.dataset.signature===signature)return;
    catalog.dataset.signature=signature;
    function instrumentButton(item,hint){
      const button=document.createElement('button');button.type='button';button.className='ensemble-instrument-card';
      button.disabled=replacing?lookupInstrument(part)?.key===item.key&&part.clef===item.clef&&C.soundName(part)===item.sound:parts.length>=32;
      const name=document.createElement('strong'),note=document.createElement('span');
      name.textContent=catalogName(item);note.textContent=hint;button.append(name,note);
      const audio=document.createElement('span'),status=S.status(item.sound);
      audio.className='ensemble-sound-badge';audio.dataset.kind=status.kind;audio.textContent=status.label;
      if(status.substitute)audio.title=status.substitute+'で再生';
      button.append(audio);
      button.setAttribute('aria-label',catalogName(item)+(replacing?'に変更':'を追加')+' · '+hint+' · '+status.label);
      button.onclick=()=>chooseRosterInstrument(item);
      return button;
    }
    catalog.replaceChildren(...available.map(item=>instrumentButton(item,item.group+' · '+C.TRANSPOSITIONS[item.transposition].label)));
    if(!available.length)catalog.textContent='該当する楽器がありません';
    suggested.hidden=replacing||!!query||rosterGroup!=='すべて'||!suggestions.length;
    const heading=document.createElement('h4');heading.textContent='編成に合わせた候補';
    suggested.replaceChildren(heading,...suggestions.map(([key,hint])=>instrumentButton(instrumentCatalog.find(item=>item.key===key),hint)));
  }
  function currentRoster(){
    const parts=C.scoreParts(documentScore());
    const index=parts.findIndex(part=>partToken(part)===rosterPart);
    return {parts,index,part:parts[index]};
  }
  function commitRoster(parts,active,label,token=rosterPart){
    const [first,...ensembleParts]=parts,doc=documentScore();
    pendingEnsemble=null;replacing=false;rosterPart=token;
    const next={...first,id:doc.id,...(doc.publication?{publication:doc.publication}:{})};
    if(ensemble||ensembleParts.length)next.ensembleParts=ensembleParts;
    else if(doc.bassPart)next.bassPart=doc.bassPart;
    saveEnsemble(next,active,label);
  }
  function askRoster(part,text,label,run){
    pendingEnsemble={token:partToken(part),measures:part.measures,text,label,run};
    renderEnsemble();
    $('ensembleCancel').focus();
  }
  function chooseRosterInstrument(item){
    changeEnsemble(()=>{
      if(!replacing){addInstruments([item.key],false,true);return;}
      const {part}=currentRoster();
      if(!part)return;
      const apply=()=>changeEnsemble(()=>{
        const {parts,index,part}=currentRoster();
        if(!part)return;
        const previousOffset=writtenFifths[part.transposition]||0;
        parts[index]={...part,instrument:item.name,instrumentKey:item.key,customInstrumentName:false,clef:item.clef,staffLines:item.staffLines,
          sound:item.sound,transposition:item.transposition,key:item.clef==='percussion'?0:newKey(part.key,item.fifths-previousOffset)};
        commitRoster(I.numberParts(parts,[index]),partIndex,catalogName(item)+'に変更');
      });
      if(hasMusic(part)){
        askRoster(part,`${item.name}に変更します。入力済みの音符・休符と記号を保持し、音部記号と移調設定、再生音色を更新します。`,'変更を適用',apply);
      }else apply();
    });
  }
  function changeEnsemble(action){
    try {
      if(window.KanadeCollab?.blocked)throw Error('共同編集の同期を確認してください');
      if(window.KanadeCollab?.sharedScore?.bassPart)throw Error('旧形式の共同編集ルームはファイルに保存してから編成を変更してください');
      action();
    }catch(error){$('ensembleFeedback').textContent=error.message;}
  }
  function saveEnsemble(next,index,label){
    const previous=documentScore(),measure=caret.mi;
    if(previous.clipBank&&!next.clipBank)next={...next,clipBank:previous.clipBank};
    if(previous.sceneLinks&&!next.sceneLinks)next={...next,sceneLinks:previous.sceneLinks};
    next=A.reconcileLinks(previous,next);
    const errors=C.validateScore(next);
    if(errors.length)throw Error(errors[0]);
    recordUndo(label);stopAudioForEdit();loadScore(next,index);
    focusEntry(Math.min(measure,score.measures.length-1),0);
    persist();onLocalChange?.(previous,next);transport?.edit();
    $('ensembleFeedback').textContent=label;
  }
  const preservingRoster=doc=>!!ensemble||!!doc.bassPart||doc.instrument!=='ピアノ'||!!doc.instrumentKey||
    !!doc.customInstrumentName||doc.clef!=='treble'||(doc.staffLines||5)!==5||!!C.soundingOffset(doc)||C.soundName(doc)!=='ピアノ'||hasMusic(doc);
  function addInstruments(entries,useEmptyFirst=false,selectAdded=false,presetName){
    const doc=documentScore(),preserving=!useEmptyFirst||preservingRoster(doc);
    const parts=preserving?C.scoreParts(doc):[];
    if(doc.bassPart)parts.push(window.KanadeSync.part(doc,'bass'));
    if(parts.length+entries.length>32)throw Error('編成は32パートまでです');
    const measureCount=Math.max(doc.measures.length,doc.bassPart?.measures.length||0),firstAdded=parts.length;
    for(const entry of entries){
      const item=typeof entry==='string'?I.byKey.get(entry):null;
      const profile=item?{instrument:item.name,instrumentKey:item.key,clef:item.clef,sound:item.sound,
        transposition:item.transposition,staffLines:item.staffLines}:entry;
      const first=!parts.length,fifths=writtenFifths[profile.transposition]||0;
      parts.push({...C.createScore(),...profile,id:first?doc.id:C.uid(),
        key:profile.clef==='percussion'?0:newKey(doc.key,fifths-(writtenFifths[doc.transposition]||0)),
        title:doc.title,composer:doc.composer,time:doc.time,tempo:doc.tempo,...(doc.meterTail?{meterTail:doc.meterTail}:{}),
        measures:first?doc.measures:Array.from({length:measureCount},(_,mi)=>({id:C.uid(),events:[],
          ...(doc.measures[mi]?.time?{time:doc.measures[mi].time}:{}),...A.repeatMarks(doc.measures[mi]||{})}))});
    }
    const numbered=I.numberParts(parts,entries.map((_,index)=>firstAdded+index));
    const aligned=numbered.map(part=>({...part,measures:[...part.measures,
      ...Array.from({length:measureCount-part.measures.length},()=>({id:C.uid(),events:[]}))]}));
    const [first,...ensembleParts]=aligned;
    pendingEnsemble=null;replacing=false;
    if(selectAdded)rosterPart=partToken(aligned.at(-1));
    else if(!preserving)rosterPart=partToken(first);
    saveEnsemble({...first,ensembleParts,...(doc.publication?{publication:doc.publication}:{})},preserving?Math.min(partIndex,aligned.length-1):0,`${presetName?presetName+' · ':''}${entries.length}パートを追加`);
    if(selectAdded){
      const row=$('ensembleList').lastElementChild;
      if(row)$('ensembleList').scrollTop=row.offsetTop-$('ensembleList').offsetTop;
    }
  }
  const presetStorage='kanade.ensemble.presets.v1';
  const presetState={favorites:[],custom:[]};
  let presetFilter='すべて';
  function partTemplate(part){
    const {instrument,clef,staffLines,sound,transposition,notehead,printName,shortName,customInstrumentName}=part;
    return {instrument,instrumentKey:lookupInstrument(part)?.key,clef,staffLines,sound:sound||C.soundName(part),
      transposition,notehead,printName,shortName,customInstrumentName};
  }
  function initPresets(){
    try{
      const saved=JSON.parse(localStorage.getItem(presetStorage)||'{}');
      if(Array.isArray(saved.favorites))presetState.favorites=saved.favorites.filter(id=>typeof id==='string').slice(0,80);
      if(Array.isArray(saved.custom))presetState.custom=saved.custom.filter(entry=>
        entry&&typeof entry.id==='string'&&typeof entry.name==='string'&&Array.isArray(entry.parts)&&entry.parts.length>0&&entry.parts.length<=32&&
        entry.parts.every(part=>part&&!C.validateScore({...C.createScore(),...part},true).length)).slice(0,40);
    }catch(_){}
  }
  function savePresets(){
    localStorage.setItem(presetStorage,JSON.stringify(presetState));
  }
  function updatePresets(patch,message){
    const previous={...presetState};
    Object.assign(presetState,patch);
    try{savePresets();$('ensembleFeedback').textContent=message;}catch(_){
      Object.assign(presetState,previous);$('ensembleFeedback').textContent='このブラウザにプリセットを保存できません';
    }
    renderEnsemble();
  }
  function renderPresets(parts){
    const filters=$('ensemblePresetFilters'),list=$('ensemblePresetList');
    const signature=JSON.stringify([presetFilter,presetState,parts.length,preservingRoster(documentScore())]);
    if(list.dataset.signature===signature)return;
    list.dataset.signature=signature;
    const focused=document.activeElement?.dataset.presetControl;
    for(const button of filters.children)button.setAttribute('aria-pressed',String(button.textContent===presetFilter));
    const presets=[...presetState.custom,...I.templates].filter(preset=>
      presetFilter==='すべて'||(presetFilter==='お気に入り'?presetState.favorites.includes(preset.id):
        presetFilter==='自作'?!!preset.parts:preset.category===presetFilter));
    list.replaceChildren(...presets.map(preset=>{
      const row=document.createElement('div');row.className='ensemble-preset-row';
      const count=(preset.parts||preset.keys).length;
      const apply=document.createElement('button');apply.type='button';apply.className='ensemble-preset-apply';
      apply.dataset.presetControl=preset.id;
      const name=document.createElement('strong');name.textContent=preset.name;
      const detail=document.createElement('span');detail.textContent=`${preset.category||'自作'} · ${count}パート`;
      apply.append(name,detail);
      apply.disabled=(preservingRoster(documentScore())?parts.length:0)+count>32;
      if(apply.disabled)apply.title='追加すると32パートを超えます';
      apply.onclick=()=>changeEnsemble(()=>addInstruments(preset.parts||preset.keys,true,false,preset.name));
      const favorite=document.createElement('button');favorite.type='button';favorite.className='ensemble-preset-star';
      favorite.dataset.presetControl=preset.id+':star';
      const marked=presetState.favorites.includes(preset.id);
      favorite.textContent=marked?'★':'☆';
      favorite.setAttribute('aria-label',preset.name+(marked?'をお気に入りから外す':'をお気に入りに追加'));
      favorite.setAttribute('aria-pressed',String(marked));
      favorite.onclick=()=>updatePresets({favorites:marked?presetState.favorites.filter(id=>id!==preset.id):
        [...presetState.favorites,preset.id]},marked?'お気に入りから外しました':'お気に入りに追加しました');
      row.append(apply,favorite);
      if(preset.parts){
        const remove=document.createElement('button');remove.type='button';remove.textContent='×';
        remove.setAttribute('aria-label',preset.name+'を自作プリセットから削除');
        remove.onclick=()=>updatePresets({custom:presetState.custom.filter(entry=>entry.id!==preset.id),
          favorites:presetState.favorites.filter(id=>id!==preset.id)},'自作プリセットを削除しました');
        row.append(remove);
      }
      return row;
    }));
    if(!presets.length)list.textContent=presetFilter==='お気に入り'?'☆でお気に入りに追加できます':'保存した自作プリセットはありません';
    if(focused)[...list.querySelectorAll('[data-preset-control]')].find(button=>button.dataset.presetControl===focused)?.focus({preventScroll:true});
  }
  function setupPresets(){
    initPresets();
    const filters=$('ensemblePresetFilters');
    for(const label of ['すべて','お気に入り','自作',...new Set(I.templates.map(preset=>preset.category))]){
      const button=document.createElement('button');button.type='button';button.textContent=label;
      button.onclick=()=>{presetFilter=label;renderEnsemble();};
      filters.append(button);
    }
    $('ensembleSavePreset').onsubmit=event=>{
      event.preventDefault();
      const input=$('ensemblePresetName'),name=input.value.trim();
      if(!name)return;
      if(presetState.custom.length>=40){$('ensembleFeedback').textContent='自作プリセットは40件まで保存できます';return;}
      const parts=C.scoreParts(documentScore()).map(partTemplate);
      const preset={id:C.uid(),name,parts};
      presetFilter='自作';
      updatePresets({custom:[preset,...presetState.custom]},`「${name}」を保存しました`);
      if(presetState.custom.includes(preset))input.value='';
    };
  }
  function renderRosterSound(part){
    const widget=$('ensembleSound'),field=$('ensembleSoundFile');
    const name=part?C.soundName(part):'';
    widget.hidden=!part||!S.canInstall(name);
    if(widget.hidden)return;
    if(widget.dataset.sound!==name){
      widget.dataset.sound=name;widget.open=false;field.value='';$('ensembleSoundFeedback').textContent='';
    }
    const status=S.status(name);
    $('ensembleSoundStatus').textContent=status.label+(status.substitute?' · '+status.substitute:'')+' · 音源設定';
    $('ensembleSoundPitch').hidden=I.bySound.get(name).clef==='percussion';
    $('ensembleSoundPreview').disabled=status.kind==='missing';
    $('ensembleSoundRemove').hidden=status.kind!=='installed';
    $('ensembleSoundInstall').textContent=status.kind==='installed'?'音源を差し替え':'音源を追加';
  }
  function setupRosterSound(){
    const root=$('ensembleSoundRoot'),steps=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
    for(let midi=12;midi<120;midi++)root.add(new Option(steps[midi%12]+(Math.floor(midi/12)-1),String(midi)));
    root.value='60';
    const feedback=$('ensembleSoundFeedback'),file=$('ensembleSoundFile'),form=$('ensembleSoundForm');
    function update(){
      renderTools();renderEnsemble();
    }
    S.ready().then(update);
    async function manage(remove){
      const {part}=currentRoster();
      if(!part||form.dataset.busy)return;
      const name=C.soundName(part),sample=file.files[0],midi=Number(root.value);
      form.dataset.busy='true';
      $('ensembleSoundInstall').disabled=$('ensembleSoundRemove').disabled=true;
      feedback.textContent=remove?'削除中…':'読み込み中…';
      try{
        stopAudio();
        if(remove)await S.remove(name);
        else await S.install(await sound.ready(),name,sample,midi);
        stopAudio();sound.invalidateSamples(name);update();
        if($('ensembleSound').dataset.sound===name){
          file.value='';
          feedback.textContent=remove?'追加音源を削除しました':'音源を追加しました';
        }
      }catch(error){
        if($('ensembleSound').dataset.sound===name)feedback.textContent=error.message;
      }finally{
        delete form.dataset.busy;
        $('ensembleSoundInstall').disabled=$('ensembleSoundRemove').disabled=false;
      }
    }
    form.onsubmit=event=>{event.preventDefault();manage(false);};
    $('ensembleSoundRemove').onclick=()=>manage(true);
    $('ensembleSoundPreview').onclick=()=>{
      const {part}=currentRoster();
      if(!part)return;
      const name=C.soundName(part),midi=I.bySound.get(name)?.clef==='bass'?48:60;
      stopAudio();
      sound.audition([P.fromMidi(midi,0)],name,0).catch(error=>{feedback.textContent=error.message;});
    };
  }
  function setupEnsemble(){
    setupPresets();setupRosterSound();
    const filters=$('ensembleFilters');
    for(const group of ['すべて',...new Set(instrumentCatalog.map(item=>item.group))]){
      const button=document.createElement('button');button.type='button';button.textContent=group;
      button.onclick=()=>{rosterGroup=group;renderEnsemble();};filters.append(button);
    }
    $('ensembleSearch').oninput=renderEnsemble;
    $('ensembleOpen').onclick=()=>{
      $('ensembleFeedback').textContent='';$('ensembleSearch').value='';rosterGroup='すべて';
      rosterPart=partToken(score);pendingEnsemble=null;replacing=false;
      $('ensembleDialog').showModal();renderEnsemble();
    };
    $('ensembleRename').onsubmit=event=>{
      event.preventDefault();
      changeEnsemble(()=>{
        const {parts,index,part}=currentRoster(),name=$('ensembleName').value.trim();
        if(!part||!name||name===instrumentDisplay(part.instrument))return;
        parts[index]={...part,instrument:name,instrumentKey:lookupInstrument(part)?.key,customInstrumentName:true,sound:C.soundName(part)};
        commitRoster(parts,partIndex,'パート名を変更');
      });
    };
    $('ensembleEdit').onclick=()=>{
      const {index}=currentRoster();
      if(index<0)return;
      $('ensembleDialog').close();
      if(index!==partIndex)switchPart(index);
    };
    $('ensembleReplace').onclick=()=>{
      replacing=true;pendingEnsemble=null;rosterGroup='すべて';$('ensembleSearch').value='';
      renderEnsemble();
      $('ensembleLibraryHeading').scrollIntoView({block:'nearest'});
    };
    $('ensembleCancelReplace').onclick=()=>{replacing=false;pendingEnsemble=null;renderEnsemble();};
    $('ensembleCancel').onclick=()=>{pendingEnsemble=null;renderEnsemble();(replacing?$('ensembleReplace'):$('ensembleRemove')).focus();};
    $('ensembleConfirmAction').onclick=()=>{
      const {part}=currentRoster(),pending=pendingEnsemble;
      if(!pending)return;
      pendingEnsemble=null;renderEnsemble();
      if(!part||partToken(part)!==pending.token||JSON.stringify(part.measures)!==JSON.stringify(pending.measures)){
        $('ensembleFeedback').textContent='パートが更新されました。内容を確認してからもう一度操作してください。';return;
      }
      pending.run();
    };
    $('ensembleUndo').onclick=()=>{
      pendingEnsemble=null;replacing=false;undoAction();
      if(!currentRoster().part)rosterPart=partToken(score);
      renderEnsemble();$('ensembleFeedback').textContent='';
    };
    function move(delta){
      changeEnsemble(()=>{
        const {parts,index,part}=currentRoster(),to=index+delta;
        if(!part||!parts[to])return;
        const active=partIndex===index?to:partIndex===to?index:partIndex;
        const [moved]=parts.splice(index,1);parts.splice(to,0,moved);
        if(to===0||index===0){
          const other=to||index;
          [parts[0],parts[other]]=[{...parts[0],id:parts[other].id},{...parts[other],id:parts[0].id}];
        }
        commitRoster(parts,active,'パートの順番を変更');
        const button=delta<0?$('ensembleUp'):$('ensembleDown');
        if(button.disabled)Array.from($('ensembleList').children).find(row=>row.dataset.rosterToken===rosterPart)?.focus();
      });
    }
    $('ensembleUp').onclick=()=>move(-1);$('ensembleDown').onclick=()=>move(1);
    $('ensembleRemove').onclick=()=>changeEnsemble(()=>{
      const {parts,index,part}=currentRoster();
      if(!part||parts.length<2)return;
      const apply=()=>changeEnsemble(()=>{
        const {parts,index,part}=currentRoster();
        if(!part||parts.length<2)return;
        parts.splice(index,1);
        const next=Math.min(index,parts.length-1);
        const active=partIndex===index?next:partIndex-(partIndex>index?1:0);
        commitRoster(parts,active,part.instrument+'を削除',partToken(parts[next]));
      });
      if(hasMusic(part))askRoster(part,`${part.instrument}と入力済みの譜面を削除しますか？`,'削除する',apply);
      else apply();
    });
    $('ensemblePart').onchange=e=>switchPart(Number(e.target.value));
    $('ensemblePrev').onclick=()=>switchPart(partIndex-1);
    $('ensembleNext').onclick=()=>switchPart(partIndex+1);
    $('ensembleFull').onclick=openOverview;
    $('ensemblePads').onclick=()=>{
      window.KanadeWorkspace.openPanel('soundSettings');
      $('soundMap').open=true;
    };
    setupOverviewEditing();
  }
  function selectOverviewPart(part,mi){
    const target=engravingParts()[part];
    if(!target?.measures[mi])return false;
    if(target.id!==score.id){
      if(ensemble)loadScore(ensemble,part);
      else if(!window.KanadeCollab?.selectPart(part===0?'melody':'bass')||target.id!==score.id)return false;
      overviewExtend=false;selectionRange=null;rangeAnchor=null;chordMode=false;
    }
    return true;
  }
  function setupOverviewEditing(){
    const host=$('overviewScore');
    $('overviewBack').onclick=closeOverview;
    $('overviewCommands').onclick=toggleCommands;
    $('overviewTuplet').onclick=()=>attempt(toggleTuplet);
    $('overviewTupletSettings').onclick=openTupletSettings;
    function mode(value){
      overviewMode=value;overviewExtend=false;
      if(value==='entry'){selectionRange=null;rangeAnchor=null;chordMode=false;}
      else{tupletEnabled=false;tupletNext=null;}
      updateTupletButton();refreshOverview();
    }
    $('overviewSelect').onclick=()=>mode('select');
    $('overviewEntry').onclick=()=>{mode('entry');focusScore();};
    $('overviewDuration').onchange=event=>attempt(()=>{
      const value=Number(event.target.value);
      if(overviewMode==='select'&&(selected||selectionRange))resizeSelected(()=>value,e=>e.dots,'音価を変更');
      selectDuration(value);refreshOverviewControls();
      if(overviewMode==='entry')focusScore();
    });
    $('overviewRest').onclick=()=>insert('rest');
    $('overviewHigher').onclick=()=>noteStep(selected,1);
    $('overviewLower').onclick=()=>noteStep(selected,-1);
    $('overviewDelete').onclick=()=>attempt(()=>deleteSelected());
    $('overviewUndo').onclick=undoAction;
    $('overviewBar').onclick=()=>{overviewMode='select';selectMeasure();};
    $('overviewExtend').onclick=()=>{overviewMode='select';overviewExtend=!overviewExtend;refreshOverviewControls();};
    $('overviewCopy').onclick=()=>attempt(()=>copySelection());
    $('overviewPaste').onclick=()=>attempt(pasteSelection);
    $('overviewMultiPaste').onclick=openOverviewTargets;
    $('overviewTargetForm').onsubmit=submitOverviewTargets;
    host.onclick=event=>{
      if(rangeDirectionHit(event.target))return;
      const cell=event.target.closest('[data-engraved-hit]');
      if(!cell)return;
      const part=Number(cell.closest('[data-engraved-part]').dataset.engravedPart);
      const mi=Number(cell.dataset.engravedHit),index=Number(cell.dataset.slot);
      if(rangeDirection){
        if(engravingParts()[part]?.id!==rangeDirection.part){showToast('同じパートの音符を選んでください',true);return;}
        attempt(()=>finishRangeDirection(mi,index));return;
      }
      if(!selectOverviewPart(part,mi))return;
      $('overviewFeedback').textContent='';
      const span=C.eventSpans(score,mi)[index];
      if(!span)return;
      const canEnter=overviewMode==='entry'&&(nextTupletSlot()||overwriteMode||span.event.type!=='note')&&!event.shiftKey;
      if(!canEnter){
        focusEntry(mi,index,(overviewExtend||event.shiftKey)&&caret.mi<score.measures.length&&
          Number(host.dataset.selectedPart)===part);
        refreshOverviewControls();
      }else{
        const svg=cell.ownerSVGElement,point=svg.createSVGPoint(),matrix=cell.getScreenCTM();
        if(!matrix)return;
        point.x=event.clientX;point.y=event.clientY;
        const position=point.matrixTransform(matrix.inverse()),top=Number(cell.dataset.top);
        const grid=cell.dataset.grid.split(',').map(item=>item.split(':').map(Number));
        const boundary=grid.findIndex(([,x])=>x>=position.x);
        const nextIndex=boundary<0?grid.length-1:Math.max(1,boundary);
        const [t0,x0]=grid[nextIndex-1],[t1,x1]=grid[nextIndex];
        const raw=t0+(t1-t0)*Math.max(0,Math.min(1,(position.x-x0)/Math.max(1,x1-x0)));
        const tick=overwriteMode&&!span.implicit?span.start:C.snapInputTick(score,mi,raw,den,dots);
        const dn=Math.max(7,Math.min(69,C.CLEFS[score.clef].bottom+Math.round((C.staffBounds(score,top).last-position.y)/6)));
        const single=score.clef==='percussion'&&score.staffLines===1;
        placeNoteAt({mi,tick,step:single?'C':C.STEPS[dn%7],octave:single?4:Math.floor(dn/7)-1});
      }
      host.focus({preventScroll:true});
    };
    $('scoreOverview').addEventListener('close',()=>{overviewDocument=null;overviewPasteTarget=null;});
  }
  function refreshOverviewControls(){
    if($('scoreOverview').hidden)return;
    const host=$('overviewScore'),parts=engravingParts();
    const index=parts.findIndex(part=>part.id===score.id);
    const found=getSelected(),canPitch=found?.event.type==='note'||!!selectionRange;
    host.dataset.mode=overviewMode;host.dataset.selectedPart=String(index);
    $('overviewSelect').setAttribute('aria-pressed',String(overviewMode==='select'));
    $('overviewEntry').setAttribute('aria-pressed',String(overviewMode==='entry'));
    $('overviewEntry').textContent=overwriteMode?'音符入力（上書き）':'音符入力';
    $('overviewExtend').setAttribute('aria-pressed',String(overviewExtend));
    $('overviewDuration').value=String(overviewMode==='select'&&found?found.event.den:den);
    $('overviewHigher').disabled=$('overviewLower').disabled=!canPitch;
    $('overviewDelete').disabled=!found&&!selectionRange;
    $('overviewUndo').disabled=$('undoBtn').disabled;
    $('overviewPaste').disabled=!canPasteSelection();
    $('overviewMultiPaste').disabled=!clipboard||!ensemble||parts.length<2;
    const slot=B.slot(score,caret),offsets=C.measureOffsets(score);
    const beat=1+(slot.start-offsets[caret.mi])/(C.WHOLE/C.timeAt(score,caret.mi).den);
    $('overviewPosition').textContent=instrumentDisplay(score.instrument)+' · '+(selectionRange?selectionLabel()+'を選択':`${caret.mi+1} 小節目 · ${Number(beat.toFixed(2))} 拍目`);
    for(const old of host.querySelectorAll('.overview-selected'))old.classList.remove('overview-selected');
    if(index<0)return;
    if(selectionRange){
      const slots=new Set(B.entries(score,selectionRange.start,selectionRange.end).map(span=>span.mi+':'+span.index));
      for(const cell of host.querySelectorAll(`[data-engraved-part="${index}"] [data-engraved-hit]`)){
        if(slots.has(cell.dataset.engravedHit+':'+cell.dataset.slot))cell.classList.add('overview-selected');
      }
    }else host.querySelector(`[data-engraved-part="${index}"] [data-engraved-hit="${caret.mi}"][data-slot="${caret.index}"]`)?.classList.add('overview-selected');
  }
  function openOverviewTargets(){
    if(!clipboard||!ensemble)return;
    const parts=C.scoreParts(ensemble),{mi,tick}=C.locateTick(C.measureOffsets(score),editBounds().start);
    overviewPasteTarget={tick,cap:C.barTicks(score,mi),measureId:score.measures[mi].id,partId:score.id,fragment:clipboard};
    const list=$('overviewTargetList');
    list.replaceChildren(list.querySelector('legend'),...parts.map((part,index)=>{
      const label=document.createElement('label'),input=document.createElement('input');
      input.type='checkbox';input.name='part';input.value=part.id;input.disabled=index===partIndex;
      label.append(input,document.createTextNode(part.instrument));return label;
    }));
    const beat=1+tick/(C.WHOLE/C.timeAt(score,mi).den);
    $('overviewTargetPosition').textContent=`${mi+1} 小節目 · ${Number(beat.toFixed(2))} 拍目から貼り付け範囲を置き換えます。`;
    $('overviewTargetError').textContent='';
    $('overviewTargets').showModal();
  }
  function submitOverviewTargets(event){
    event.preventDefault();
    const target=overviewPasteTarget;
    if(!target||!ensemble)return;
    try{
      const parts=C.scoreParts(ensemble),source=parts.find(part=>part.id===target.partId);
      const mi=source?.measures.findIndex(bar=>bar.id===target.measureId)??-1;
      if(mi<0||source.id!==score.id)throw Error('貼り付け位置が変わりました。総譜から選び直してください');
      const cap=C.barTicks(score,mi);
      if(cap!==target.cap)throw Error('拍子が変わりました。貼り付け位置を選び直してください');
      const at=C.measureOffsets(score)[mi]+target.tick;
      const selectedParts=new Set(new FormData(event.currentTarget).getAll('part'));
      const indexes=parts.map((part,index)=>selectedParts.has(part.id)?index:-1).filter(index=>index>=0&&index!==partIndex);
      if(!indexes.length)throw Error('貼り付け先を選んでください');
      let document=ensemble;
      for(const index of indexes){
        const part=C.scoreParts(document)[index];
        try{
          const next=B.pasteRange(part,target.fragment,at).score;
          document=C.replaceScorePart(document,index,next);
        }catch(error){throw Error(part.instrument+' · '+error.message);}
      }
      commit(C.scoreParts(document)[partIndex],`${indexes.length}パートに貼り付け`,selected,activeMeasure,{...caret},selectionRange,{document});
      $('overviewTargets').close();
      $('overviewFeedback').textContent=`${indexes.length}パートに貼り付けました`;
    }catch(error){$('overviewTargetError').textContent=error.message;}
  }
  function engravingParts() {
    const fullScore=editionDocument();
    const parts=fullScore.ensembleParts?C.scoreParts(fullScore):fullScore.bassPart?
      ['melody','bass'].map(part=>window.KanadeSync.part(fullScore,part)):[fullScore];
    return parts.map(part=>({...part,instrument:instrumentDisplay(part.instrument),sound:C.soundName(part)}));
  }
  function editionDocument(){return window.KanadeCollab?.sharedScore||documentScore();}
  function printableScore(parts,edition,namespace){
    return (namespace==='overview'?R.engrave(parts,{edition,paginate:true,namespace,interactive:true}):
      R.printPages(parts,edition,namespace)).join('');
  }
  function refreshOverview() {
    arrangementUI?.refresh();
    if($('scoreOverview').hidden)return;
    const doc=editionDocument();
    if(doc!==overviewDocument){
      $('overviewScore').innerHTML=printableScore(engravingParts(),doc.publication,'overview');
      overviewDocument=doc;
    }
    refreshOverviewControls();
  }
  function openOverview() {
    if(voiceScope){endVoiceScope();focusEntry(caret.mi,0);}
    mobileChord=null;clearMobileDraft();
    tupletEnabled=false;tupletNext=null;updateTupletButton();
    document.activeElement?.blur();
    overviewMode='select';overviewExtend=false;$('overviewFeedback').textContent='';
    $('scoreOverview').hidden=false;
    document.querySelector('.shell').classList.add('overview-active');
    refreshOverview();renderDesktopEdit();
    $('overviewScore').focus({preventScroll:true});
    revealOverviewCaret();
    showScoreTransition($('overviewScore'));
  }
  function closeOverview(){
    tupletEnabled=false;tupletNext=null;updateTupletButton();
    stopScoreScroll();
    $('scoreOverview').hidden=true;
    document.querySelector('.shell').classList.remove('overview-active');
    $('scoreOverview').dispatchEvent(new Event('close'));renderDesktopEdit();
    showScoreTransition($('scoreHost'));
    if(!$('commandPalette').open)$('ensembleFull').focus({preventScroll:true});
  }
  const publicationTextFields=['subtitle','series','composerAlt','comment','credit','copyright','footerText'];
  const publicationLayoutFields=['cover','notes','align','paper','names','width','footerStyle','footerAlign','footerScope','pageStart'];
  let publicationBaseline=null,publicationFrame=0;
  function publicationInputs(){return $('publicationForm').elements;}
  function draftPublication(){
    const inputs=publicationInputs(),edition={};
    for(const name of publicationTextFields){
      const value=inputs.namedItem(name).value.trim();if(value)edition[name]=value;
    }
    for(const name of publicationLayoutFields){
      const value=inputs.namedItem(name).value;
      if(value&&value!=='auto'&&(name!=='align'||value!=='center'))edition[name]=['width','pageStart'].includes(name)?Number(value):value;
    }
    if($('publicationRosterMode').value==='custom')edition.instrumentation=inputs.namedItem('instrumentation').value.trim();
    return edition;
  }
  function draftParts(parts){
    const inputs=publicationInputs();
    const rows=Array.from($('publicationPartNames').children);
    return parts.map(part=>{
      const row=rows.find(candidate=>part.measures.some(bar=>bar.id===candidate.dataset.measure))||
        rows.find(candidate=>candidate.dataset.id===part.id&&candidate.querySelector('strong').textContent===instrumentDisplay(part.instrument));
      const next={...part,title:inputs.namedItem('title').value.trim()||'新しい楽譜',composer:inputs.namedItem('composer').value.trim()};
      if(row)for(const field of ['printName','shortName']){
        const input=row.querySelector('[data-field="'+field+'"]');
        const value=input.value.trim();
        if(value===input.defaultValue)continue;
        if(value)next[field]=value;else delete next[field];
      }
      return next;
    });
  }
  function previewPublication(){
    cancelAnimationFrame(publicationFrame);
    publicationFrame=requestAnimationFrame(()=>{
      if(!$('publicationDialog').open)return;
      const parts=draftParts(engravingParts()),edition=draftPublication(),mode=$('publicationPage').value;
      const host=$('publicationPreview');
      const front=edition.footerScope==='all'?R.frontMatter(parts,edition).length:0;
      const pages=mode==='score'?R.engrave(parts,{edition,paginate:true,namespace:'publication',firstPageOnly:true,pageOffset:front}):
        front?R.printPages(parts,edition,'publication').slice(0,front).filter(page=>mode==='cover'?page.includes(' 表紙"'):page.includes('aria-label="作曲者コメント・編成表"')):
          R.frontMatter(parts,edition,mode);
      if(pages.length)host.innerHTML=pages.join('');
      else host.textContent='現在のページ設定では出力されません。';
    });
  }
  function openPublication(){
    leaveScoreFor($('publicationDialog'));
    const doc=editionDocument(),edition=doc.publication||{},parts=engravingParts(),inputs=publicationInputs();
    publicationBaseline={id:doc.id,title:doc.title,composer:doc.composer,edition:JSON.stringify(doc.publication)};
    for(const name of ['title','composer'])inputs.namedItem(name).value=doc[name];
    for(const name of publicationTextFields)inputs.namedItem(name).value=edition[name]||'';
    for(const name of publicationLayoutFields)inputs.namedItem(name).value=edition[name]??(['width','pageStart'].includes(name)?'':name==='align'?'center':'auto');
    $('publicationRosterMode').value=edition.instrumentation===undefined?'auto':'custom';
    $('publicationRosterCustom').hidden=edition.instrumentation===undefined;
    inputs.namedItem('instrumentation').value=edition.instrumentation??R.instrumentationText(parts);
    $('publicationPartNames').replaceChildren(...(doc.bassPart?parts.slice(0,1):parts).map(part=>{
      const row=document.createElement('div');row.className='publication-part-row';row.dataset.id=part.id;row.dataset.measure=part.measures[0].id;
      const name=document.createElement('strong');name.textContent=instrumentDisplay(part.instrument);row.append(name);
      for(const [field,labelText] of [['printName','正式名'],['shortName','略称']]){
        const label=document.createElement('label');label.textContent=labelText;
        const input=document.createElement('input');input.dataset.field=field;input.maxLength=120;
        input.defaultValue=part[field]||'';input.placeholder=field==='printName'?part.instrument:'自動';
        input.setAttribute('aria-label',part.instrument+'の'+labelText);
        label.append(input);row.append(label);
      }
      return row;
    }));
    $('publicationFooterCustom').hidden=inputs.namedItem('footerStyle').value!=='custom';
    $('publicationStatus').textContent='';
    $('publicationPage').value='score';
    $('publicationDialog').showModal();previewPublication();
  }
  const returnToScore=new WeakSet();
  function leaveScoreFor(page){
    if($('scoreOverview').hidden)return;
    returnToScore.add(page);
    closeOverview();
  }
  function printDocument(namespace){
    const parts=engravingParts(),edition=editionDocument().publication||{};
    const target=$('printPreviewDialog').open?$('previewPrintTarget').value:'score';
    if(target==='score')return {html:printableScore(parts,edition,namespace),paper:R.paperSize(parts,edition)};
    const choices=target==='parts'?parts:[parts[Number(target)]||parts[0]];
    const partEdition={...edition,paper:edition.paper==='a3'?'a3':'a4',names:'hide'};
    const html=choices.flatMap((part,index)=>R.engrave([part],{paginate:true,namespace:namespace+'-part-'+index,
      edition:{...partEdition,subtitle:[edition.subtitle,part.printName||part.instrument].filter(Boolean).join(' · ')}})).join('');
    return {html,paper:partEdition.paper};
  }
  function previewParts(){
    const parts=engravingParts();
    const target=$('printPreviewDialog').open?$('previewPrintTarget').value:'score';
    if(target==='score'||target==='parts')return target==='parts'?parts.map(part=>[part]):[parts];
    return [[parts[Number(target)]||parts[0]]];
  }
  function refreshPrintPreview(){
    const host=$('printPreviewPages');
    if(window.KanadeVerovio?.isEnabled()){
      host.textContent='刻譜を準備しています';
      $('printPreviewInfo').textContent='Verovioでページを刻譜しています';
      Promise.all(previewParts().map(parts=>window.KanadeVerovio.exportMarkup(parts))).then(results=>{
        if(!window.KanadeVerovio.isEnabled()||!$('printPreviewDialog').open)return;
        host.innerHTML=results.flatMap(result=>result.svgs).join('');
        host.dataset.paper='verovio';
        const pages=results.reduce((sum,result)=>sum+result.pages,0);
        const ms=results.reduce((sum,result)=>sum+result.ms,0);
        $('printPreviewInfo').textContent=`刻譜 · ${pages}ページ · ${ms}ms`;
      }).catch(error=>{host.textContent=error.message||'刻譜を用意できませんでした';});
      return;
    }
    const {html,paper}=printDocument('proof');
    host.innerHTML=html;host.dataset.paper=paper;
    $('printPreviewInfo').textContent=paper.toUpperCase()+' · '+host.childElementCount+'ページ';
  }
  function openPrintPreview(){
    const page=$('printPreviewDialog'),target=$('previewPrintTarget');
    leaveScoreFor(page);
    const parts=engravingParts();
    target.replaceChildren(new Option('総譜','score'),...(parts.length>1?[new Option('全パート譜（1つのPDF）','parts')]:[]),
      ...parts.map((part,index)=>new Option(part.instrument,String(index))));
    page.showModal();refreshPrintPreview();page.scrollTop=0;
  }
  function printPdf(){
    document.activeElement?.blur();
    window.print();
  }
  function setupPublication(){
    $('overviewPublication').onclick=$('menuPublication').onclick=openPublication;
    $('overviewPrint').onclick=$('menuPrintPreview').onclick=openPrintPreview;
    $('overviewPdf').onclick=$('previewPdf').onclick=printPdf;
    $('previewPrintTarget').onchange=refreshPrintPreview;
    for(const page of [$('publicationDialog'),$('printPreviewDialog')])page.addEventListener('close',()=>{
      if(page.id==='printPreviewDialog')$('printPreviewPages').replaceChildren();
      if(returnToScore.delete(page))openOverview();
    });
    $('publicationPage').onchange=previewPublication;
    $('publicationForm').oninput=event=>{
      if(event.target.name==='footerStyle')$('publicationFooterCustom').hidden=event.target.value!=='custom';
      if(event.target===$('publicationRosterMode'))$('publicationRosterCustom').hidden=event.target.value!=='custom';
      previewPublication();
    };
    $('publicationReset').onclick=()=>{
      const inputs=publicationInputs();
      for(const name of publicationLayoutFields)inputs.namedItem(name).value=['width','pageStart'].includes(name)?'':name==='align'?'center':'auto';
      $('publicationFooterCustom').hidden=true;
      previewPublication();
    };
    $('publicationForm').onsubmit=event=>{
      event.preventDefault();
      try{
        if(window.KanadeCollab?.blocked)throw Error('共同編集の同期を確認してください');
        const doc=editionDocument(),local=documentScore();
        if(doc.id!==local.id)throw Error('主譜を開いてから変更を保存してください');
        if(doc.id!==publicationBaseline.id||doc.title!==publicationBaseline.title||doc.composer!==publicationBaseline.composer||
          JSON.stringify(doc.publication)!==publicationBaseline.edition)throw Error('作品情報が更新されました。画面を開き直してください');
        const parts=draftParts(doc.ensembleParts?C.scoreParts(doc):[doc]),[first,...ensembleParts]=parts;
        const edition=draftPublication(),next={...first};
        if(Object.keys(edition).length)next.publication=edition;else delete next.publication;
        if(doc.clipBank)next.clipBank=doc.clipBank;
        if(doc.sceneLinks)next.sceneLinks=doc.sceneLinks;
        if(doc.ensembleParts)next.ensembleParts=ensembleParts;
        else if(local.bassPart)next.bassPart=local.bassPart;
        else delete next.bassPart;
        const errors=C.validateScore(next);
        if(errors.length)throw Error(errors[0]);
        recordUndo('表紙・レイアウトを変更');
        loadScore(next,partIndex);
        activeMeasure=Math.min(activeMeasure,score.measures.length-1);
        caret={mi:activeMeasure,index:Math.min(caret.index,C.eventSpans(score,activeMeasure).length-1)};
        persist();render();
        onLocalChange?.(doc.bassPart&&!local.bassPart?window.KanadeSync.part(doc,'melody'):doc,next);
        $('publicationDialog').close();
        $('statusText').textContent='表紙・レイアウトを保存';
      }catch(error){$('publicationStatus').textContent=error.message;}
    };
  }
  function adjustMeasureCount(delta) {
    const input=$('mobileMeasureCount'),current=input.valueAsNumber;
    input.value=String(Math.max(1,Math.min(Number(input.max),(Number.isInteger(current)?current:1)+delta)));
  }
  function addMobileMeasures(count) {
    const capacity=500-score.measures.length;
    if(!Number.isInteger(count)||count<1||count>capacity)throw Error(`追加する小節数は1〜${capacity}の整数で入力してください`);
    const [,last]=measureBounds(),mi=last+1;
    commit(B.insertMeasures(score,mi,count),`${count}小節を追加`,null,mi,{mi,index:0});
  }
  function showMobileTools(open){
    $('mobileTools').hidden=!open;
    const button=$('mobileEditor').querySelector('[data-mobile-action="collapse"]');
    button.textContent=open?'閉じる':'詳細';
    button.setAttribute('aria-expanded',String(open));
    if(!open){
      $('entryBar').classList.remove('mobile-expanded');
      $('mobileEditor').querySelector('[data-mobile-action="settings"]').setAttribute('aria-expanded','false');
    }
  }
  function setupMobile() {
    const dock=$('mobileEditor'),pad=$('mobileSwipe');
    setupMobileMeasureNav();
    setupPublication();
    $('mobileOverview').onclick=$('menuOverview').onclick=openOverview;
    window.addEventListener('beforeprint',()=>{
      const {html,paper}=printDocument('print');
      $('engravedPageSize').textContent='@page{size:'+paper.toUpperCase()+' portrait;margin:10mm}';
      document.body.classList.toggle('engraving-a3',paper==='a3');
      $('engravedPrint').innerHTML=html;
      document.body.classList.add('engraving-print');
    });
    window.addEventListener('afterprint',()=>{
      document.body.classList.remove('engraving-print','engraving-a3');
      $('engravedPageSize').textContent='';
      $('engravedPrint').replaceChildren();
    });
    const actions={
      chordAdd:()=>{mobileChord.adding=true;refreshMobileChord();},
      chordRemove:deleteMobileChordPitch,
      meter:openMeter,previous:()=>moveCaret(-1),next:()=>moveCaret(1),shorter:()=>mobileDuration(1),longer:()=>mobileDuration(-1),
      lower:()=>changeMobilePitch(-1),higher:()=>changeMobilePitch(1),dot:()=>cycleDots(!!mobileDraft||tupletEnabled||isOverwriteEntry()&&!selectionRange),toggleRest:toggleSelectedRest,tuplet:toggleTuplet,tupletSettings:openTupletSettings,tie:toggleSelectedTie,
      addNote:()=>mobileChord?applyMobileChord():insert('note',undefined,true,mobileDraft),addRest:()=>insert('rest',undefined,true,mobileDraft),
      octDown:()=>{if(mobileChord||mobileDraft)changeMobilePitch(-7);else{setOctave(octave-1);renderMobile();}},
      octUp:()=>{if(mobileChord||mobileDraft)changeMobilePitch(7);else{setOctave(octave+1);renderMobile();}},
      chord:toggleMobileChord,chordComposer:()=>openChordComposer(),performance:()=>performancePanel.open(),loop:()=>transport.toggleLoop(),
      countDown:()=>adjustMeasureCount(-1),countUp:()=>adjustMeasureCount(1),
      addMeasure:()=>addMobileMeasures(1),addManyMeasures:()=>addMobileMeasures($('mobileMeasureCount').valueAsNumber),
      insertBefore:insertMeasureBefore,duplicateMeasure:duplicateMeasures,removeMeasures:removeSelectedMeasures,
      deleteNote:()=>deleteSelected(),eraseNote:()=>mobileChord?toggleMobileChord():mobileDraft?clearMobileDraft():deleteSelected(),commands:openCommands,noteSymbols:()=>openSymbols('note'),directionSymbols:()=>openSymbols('direction'),selectMeasure,selectSingle,selectToStart:()=>selectToEdge(false),selectToEnd:()=>selectToEdge(true),
      copy:()=>{copySelection();renderMobile();showToast('コピーしました');},paste:pasteSelection,stem:()=>flipStem(),
      undo:undoAction,redo:redoAction,
      settings:button=>{
        const open=$('entryBar').classList.toggle('mobile-expanded');
        button.setAttribute('aria-expanded',String(open));
      },
      collapse:()=>showMobileTools($('mobileTools').hidden)
    };
    dock.addEventListener('click',e=>{
      const button=e.target.closest('button');if(!button)return;
      const den=button.dataset.mobileDen;
      if(den){selectDuration(Number(den));renderMobile();updateGhost();return;}
      const {mobileAction,mobileTab,mobileArt,mobileAlter,mobilePitch,mobileDirection,mobileChordPitch}=button.dataset;
      if(mobileChordPitch&&mobileChord){
        mobileChord.active=mobileChordPitch;mobileChord.adding=false;refreshMobileChord();
      }else if(mobileTab){
        for(const tab of dock.querySelectorAll('[data-mobile-tab]'))tab.setAttribute('aria-pressed',String(tab===button));
        for(const pane of dock.querySelectorAll('[data-mobile-pane]'))pane.hidden=pane.dataset.mobilePane!==mobileTab;
      }else if(mobileAction)attempt(()=>actions[mobileAction](button));
      else if(mobilePitch){
        if(mobileChord){
          const pitch=mobileChord.pitches.find(item=>item.id===mobileChord.active);
          attempt(()=>editMobileChordPitch({step:mobilePitch,octave:pitch.octave,alter:C.keyAlter(mobilePitch,score.key)},{add:mobileChord.adding}));
        }else if(mobileDraft){
          mobileDraft.step=mobilePitch;renderMobile();updateGhost();
        }else insert('note',mobilePitch,true);
      }
      else if(mobileArt)attempt(()=>toggleArticulation(mobileArt));
      else if(mobileDirection)attempt(()=>toggleDirection(mobileDirection));
      else if(mobileAlter!==undefined)attempt(()=>mobileAccidental(mobileAlter));
    });
    let start=null;
    pad.addEventListener('pointerdown',e=>{
      if(!e.isPrimary||e.button!==0)return;
      start={id:e.pointerId,x:e.clientX,y:e.clientY};pad.setPointerCapture(e.pointerId);
    });
    pad.addEventListener('pointerup',e=>{
      if(start?.id!==e.pointerId)return;
      const dx=e.clientX-start.x,dy=e.clientY-start.y;
      start=null;
      if(Math.max(Math.abs(dx),Math.abs(dy))<16)return;
      attempt(()=>Math.abs(dx)>=Math.abs(dy)?mobileDuration(dx>0?-1:1):changeMobilePitch(dy>0?-1:1));
    });
    pad.addEventListener('lostpointercapture',()=>{start=null;});
    $('scoreScroll').addEventListener('kanade-pitch-drag',event=>{
      let pitch=mobileChord?.pitches.find(item=>item.id===mobileChord.active)||mobileDraft;
      if(!pitch){
        const found=getSelected();
        if(found?.event?.type==='note'&&found.event.pitches.length===1)pitch=found.event.pitches[0];
      }
      const {phase,dy}=event.detail;
      if(phase==='start'&&pitch){mobileDragPitch=C.diatonicNumber(pitch);event.preventDefault();}
      if(!pitch){mobileDragPitch=null;return;}
      else if(phase!=='start'&&mobileDragPitch!==null){
        const steps=phase==='cancel'?0:Math.round(Math.abs(dy)/14)*Math.sign(-dy);
        changeMobilePitch(steps,mobileDragPitch);
        if(phase!=='move')mobileDragPitch=null;
      }
    });
    const menu=$('mobileMenu'),menubar=$('appMenubar');
    const closeMenu=()=>{
      menu.setAttribute('aria-expanded','false');
      menubar.classList.remove('mobile-menu-open');
      for(const item of menubar.querySelectorAll('.app-menu[open]'))item.open=false;
    };
    menu.onclick=()=>{
      if(menubar.classList.contains('mobile-menu-open'))closeMenu();
      else{menu.setAttribute('aria-expanded','true');menubar.classList.add('mobile-menu-open');}
    };
    menubar.addEventListener('click',e=>{
      const item=e.target.closest('button');
      if(mobile.matches&&item&&item.id!=='exportBtn')closeMenu();
    });
    document.addEventListener('pointerdown',e=>{
      if(menubar.classList.contains('mobile-menu-open')&&!e.target.closest('#appMenubar,#mobileMenu'))closeMenu();
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&menubar.classList.contains('mobile-menu-open')&&!menubar.querySelector('.app-menu[open]')){
        closeMenu();menu.focus();
      }
    },true);
    $('mobilePlay').onclick=play;
    mobile.addEventListener('change',()=>{mobileDraft=null;mobileChord=null;closeMenu();showMobileTools(false);if($('commandPalette').open)closeCommands();render();revealCaret();});
  }
  function renderInspector() {
    const host=$('inspectorBody'),found=getSelected();
    if(selectionRange){
      const ids=selectedIds(true);
      host.replaceChildren();
      const title=document.createElement('div');title.className='selected-name';title.textContent='範囲選択';host.append(title);
      const summary=document.createElement('p');summary.className='selected-meta';summary.textContent=`${selectionLabel()} · ${ids.length} 音符`;host.append(summary);
      const row=document.createElement('div');row.className='range-actions';
      for(const [label,steps]of [['−8度',-7],['−1段',-1],['＋1段',1],['＋8度',7]]){
        const button=document.createElement('button');button.textContent=label;button.disabled=!ids.length;button.onclick=()=>noteStep(selected,steps);row.append(button);
      }
      host.append(row);const hint=document.createElement('p');hint.className='info-copy';hint.textContent='↑↓・Shift+↑↓でまとめて移調。Ctrl+C / X / Vでコピー・切り取り・貼り付け。Deleteは拍を保って消去します。';host.append(hint);return;
    }
    if(!found) {
      const span=C.eventSpans(score,caret.mi)[caret.index];
      const slot=span?' · '+R.durationName(span.event.den,span.event.dots,span.event.type):'';
      host.innerHTML='<p class="placeholder">入力カーソル：'+(caret.mi+1)+' 小節目'+slot+'<br><br>← → で音符・休符間を移動できます。五線をクリックすると、薄い音符の位置に入力します。</p>';return;
    }
    const e=found.event;
    host.innerHTML='';
    const heading=document.createElement('div');heading.className='selected-name';heading.textContent=C.eventLabel(e);host.appendChild(heading);
    const summary=document.createElement('p');summary.className='selected-meta';summary.textContent=`${found.mi+1} 小節目 · ${found.index+1} 番目のイベント`;host.appendChild(summary);
    function field(text,element) {const wrap=document.createElement('div');wrap.className='field-line';const lab=document.createElement('label');lab.textContent=text;wrap.append(lab,element);host.appendChild(wrap);return element;}
    if(e.type==='note') {
      if(e.pitches.length===1) {
        const p=e.pitches[0];const step=document.createElement('select');C.STEPS.forEach(st=>{const o=document.createElement('option');o.value=st;o.textContent=st;step.appendChild(o);});step.value=p.step;
        step.addEventListener('change',()=>attempt(()=>commit(C.changeEvent(score,e.id,n=>{n.pitches[0].step=step.value;return n;}),'音名を変更')));field('音名',step);
        const acc=document.createElement('select');[[-2,'𝄫 ダブルフラット'],[-1,'♭ フラット'],[0,'♮ ナチュラル'],[1,'♯ シャープ'],[2,'𝄪 ダブルシャープ']].forEach(([v,txt])=>{const o=document.createElement('option');o.value=v;o.textContent=txt;acc.appendChild(o);});acc.value=String(p.alter);
        acc.addEventListener('change',()=>attempt(()=>commit(C.changeEvent(score,e.id,n=>{n.pitches[0].alter=Number(acc.value);return n;}),'臨時記号を変更')));field('変化記号',acc);
        const oct=document.createElement('input');oct.type='number';oct.min='0';oct.max='8';oct.value=p.octave;
        oct.addEventListener('change',()=>attempt(()=>commit(C.changeEvent(score,e.id,n=>{n.pitches[0].octave=Number(oct.value);return n;}),'オクターブを変更')));field('オクターブ',oct);
      }
      const marks=document.createElement('div');marks.className='range-actions';
      for(const [mark,{label}] of Object.entries(symbols.notes).slice(0,4)){
        const button=document.createElement('button');button.textContent=label;
        button.setAttribute('aria-pressed',String(!!e.articulations?.includes(mark)));
        button.onclick=()=>attempt(()=>toggleArticulation(mark));marks.append(button);
      }
      const details=document.createElement('button');details.textContent='記号の詳細';
      details.onclick=()=>openSymbols('note');marks.append(details);
      field('奏法記号',marks);
      const lyric=document.createElement('input');lyric.type='text';lyric.placeholder='歌詞（1音節）';lyric.maxLength=100;lyric.value=e.lyric||'';
      lyric.addEventListener('change',()=>attempt(()=>commit(C.changeEvent(score,e.id,n=>{n.lyric=lyric.value;return n;}),'歌詞を変更')));field('歌詞',lyric);
    }
    const del=document.createElement('button');del.className='delete';del.textContent='× この音符・休符を削除';del.onclick=()=>attempt(deleteSelected);host.appendChild(del);
  }
  function render() {
    verticalNavigationTick=null;
    if(mobileChord&&(mobileChord.score!==score||mobileChord.mi!==caret.mi||selectionRange||rangeDirection))mobileChord=null;
    if(mobileDraft&&(!mobile.matches||!isEntryMode()||mobileDraft.mi!==caret.mi||selectionRange||
      (renderedScore&&renderedScore!==score)))mobileDraft=null;
    const selection={eventId:selected,caret,range:selectionRange,ids:selectionRange?new Set(selectedIds()):null,voiceMeasure:voiceScope?.mi};
    const layout=viewport.layout(),host=$('scoreHost');
    const measure=mobile.matches?playbackDisplay??caret.mi:null;
    const previousVoice=host.dataset.voiceMeasure||'';
    host.dataset.voiceMeasure=voiceScope?String(voiceScope.mi):'';
    const useVerovio=window.KanadeVerovio?.isEnabled()&&!voiceScope;
    if(useVerovio){
      if(!host.querySelector('.verovio-pages')&&!host.querySelector('svg'))R.mount(host,score,selection,layout,measure);
      window.KanadeVerovio.sync(host,score,selection);
      renderedLayout=layout;renderedMeasure=measure;
    }else if(previousVoice!==host.dataset.voiceMeasure||layout!==renderedLayout||measure!==renderedMeasure||!renderedScore||(measure!==null&&renderedScore!==score)||host.dataset.renderer==='verovio'){
      if(host.dataset.renderer==='verovio')delete host.dataset.renderer;
      R.mount(host,score,selection,layout,measure);
      if(measure!==renderedMeasure)$('scoreScroll').scrollTop=0;
      renderedLayout=layout;renderedMeasure=measure;
    }else if(renderedScore!==score){
      if(!R.updateScore(host,renderedScore,score,selection,layout))R.mount(host,score,selection,layout);
    }else R.updateSelection(host,score,selection,layout);
    renderedScore=score;
    const voiceButton=$('voiceToggle');
    voiceButton.setAttribute('aria-pressed',String(!!voiceScope));
    voiceButton.textContent=voiceScope?`第2声部 · ${voiceScope.mi+1}小節`:canonicalPart().measures[caret.mi]?.voice2?.length?'第2声部を編集':'＋ 第2声部';
    $('titleInput').value=score.title;$('composerInput').value=score.composer;
    const time=C.timeAt(score,caret.mi);
    $('timeSelect').textContent='拍子 '+time.num+'/'+time.den;
    if(![...$('keySelect').options].some(option=>option.value===String(score.key))){
      $('keySelect').add(new Option(score.key>0?`♯ ${score.key}つ`:`♭ ${-score.key}つ`,String(score.key)));
    }
    $('keySelect').value=String(score.key);$('clefSelect').value=score.clef;$('tempoInput').value=score.tempo;$('instrument').value=[...$('instrument').options].some(option=>option.value===C.soundName(score))?C.soundName(score):'その他';
    $('keySelect').disabled=score.clef==='percussion';$('transposition').disabled=score.clef==='percussion';
    $('partName').value=instrumentDisplay(score.instrument);$('staffLines').value=String(score.staffLines||5);$('transposition').value=score.transposition||'concert';$('notehead').value=score.notehead||'normal';
    $('measureCount').textContent=`${score.measures.length} 小節 · ${score.measures.reduce((n,m)=>n+m.events.length,0)} 音符/休符`;
    $('undoBtn').disabled=window.KanadeCollab?.active?!window.KanadeCollab.canUndo():!undo.length;$('redoBtn').disabled=window.KanadeCollab?.active?!window.KanadeCollab.canRedo():!redo.length;
    if(mobile.matches){
      $('undoMobile').disabled=$('undoBtn').disabled;
      $('redoMobile').disabled=$('redoBtn').disabled;
      for(const button of $('mobileEditor').querySelectorAll('[data-mobile-den]'))button.setAttribute('aria-pressed',String(Number(button.dataset.mobileDen)===den));
    }
    $('removeMeasure').disabled=score.measures.length===1&&!score.measures[0].events.length;
    $('pasteSelection').disabled=!canPasteSelection();
    $('selectionInfo').textContent=selectionRange?`${selectionLabel()}を選択`:getSelected()?'音符・休符を選択':'カーソル位置から編集';
    renderTools();renderInspector();updateGhost();renderEnsemble();refreshOverview();renderRangeDirection();transport?.refresh();
  }
  function setMode(mode) {
    mobileDraft=null;mobileChord=null;
    if(mode==='select'){tupletEnabled=false;tupletNext=null;}
    const hadRange=!!selectionRange;editMode=mode;pendingTieId=null;keyboardGhost=false;pointerOctaveShift=0;
    if(mode==='entry'){selectionRange=null;rangeAnchor=null;if(hadRange)render();}
    if(mode==='select')lastPointer=null;
    renderTools();updateGhost();
    $('statusText').textContent=mode==='entry'?'音符入力モード：五線をクリックして配置':'選択モード：音符・休符をクリックして選択';
  }
  function focusEntry(mi,index,extend=false,smooth=false) {
    if(voiceScope&&mi!==voiceScope.mi){endVoiceScope();extend=false;}
    mobileDraft=null;mobileChord=null;tupletNext=null;
    const anchor=extend?(rangeAnchor||B.slot(score,caret)):null;
    lastEnteredId=null;pendingTieId=null;keyboardGhost=false;
    const spans=C.eventSpans(score,mi),position=Math.min(Math.max(index,0),Math.max(spans.length-1,0));
    caret={mi,index:position};activeMeasure=mi;
    if(extend){const end=B.slot(score,caret);rangeAnchor={start:anchor.start,end:anchor.end};selectionRange={start:Math.min(anchor.start,end.start),end:Math.max(anchor.end,end.end)};}
    else{selectionRange=null;rangeAnchor=null;}
    const span=spans[position];
    selected=span&&!span.implicit?span.event.id:null;
    if(mobile.matches&&selected){den=span.event.den;dots=span.event.dots;}
    if(span&&span.event.type==='note'){
      const pitch=span.event.pitches[0];previewStep=pitch.step;octave=pitch.octave;
    }
    render();revealCaret(smooth);
    $('statusText').textContent=(mi+1)+' 小節目 · '+(span?R.durationName(span.event.den,span.event.dots,span.event.type):'終端')+' · ← → で移動';
  }
  function focusScore() {
    ($('scoreOverview').hidden?$('scoreHost'):$('overviewScore')).focus({preventScroll:true});
  }
  function goToMeasure(number,part) {
    const mi=number-1;
    const target=part===undefined?score:engravingParts()[part];
    if(!Number.isSafeInteger(number)||!target?.measures[mi]||rangeDirection)return false;
    if(part!==undefined&&!selectOverviewPart(part,mi))return false;
    overviewExtend=false;chordMode=false;lastPointer=null;
    focusEntry(mi,0,false,true);
    focusScore();
    return true;
  }
  function moveOverviewPart(delta) {
    if($('scoreOverview').hidden||rangeDirection)return;
    const parts=engravingParts(),index=parts.findIndex(part=>part.id===score.id);
    const part=index+delta,mi=caret.mi;
    if(index<0||!parts[part]?.measures[mi])return;
    const tick=verticalNavigationTick??C.eventSpans(score,mi)[caret.index]?.start??0;
    if(!selectOverviewPart(part,mi))return;
    const spans=C.eventSpans(score,mi);
    const slot=spans.findIndex(span=>span.end>tick);
    focusEntry(mi,slot<0?spans.length-1:slot,false,true);
    // Keep the original rhythmic position when a staff has a longer note or rest.
    verticalNavigationTick=tick;
    focusScore();
  }
  function openMeasureJump() {
    const dialog=$('measureJumpDialog');
    if(dialog.open||rangeDirection)return;
    if($('commandPalette').open)closeCommands();
    const overview=!$('scoreOverview').hidden;
    const parts=overview?engravingParts():[score],select=$('measureJumpPart');
    select.replaceChildren(...parts.map((part,index)=>new Option(part.instrument,index)));
    select.selectedIndex=Math.max(0,parts.findIndex(part=>part.id===score.id));
    $('measureJumpPartRow').hidden=parts.length<2;
    $('measureJumpInput').value=String(caret.mi+1);
    updateMeasureJump();
    dialog.showModal();
    $('measureJumpInput').select();
  }
  function updateMeasureJump() {
    const index=Number($('measureJumpPart').value);
    const target=$('scoreOverview').hidden?score:engravingParts()[index];
    const limit=target?.measures.length??score.measures.length;
    $('measureJumpHint').textContent='1〜'+limit+'小節';
    $('measureJumpError').textContent='';
  }
  function setupMeasureJump() {
    const dialog=$('measureJumpDialog'),input=$('measureJumpInput'),part=$('measureJumpPart');
    $('measureJump').onclick=openMeasureJump;
    $('overviewJump').onclick=openMeasureJump;
    part.onchange=updateMeasureJump;
    input.oninput=()=>{$('measureJumpError').textContent='';};
    $('measureJumpForm').onsubmit=event=>{
      event.preventDefault();
      const value=normalizeQuery(input.value).trim();
      const number=/^\d+$/.test(value)?Number(value):NaN;
      const index=$('scoreOverview').hidden?undefined:Number(part.value);
      if(!goToMeasure(number,index)){
        $('measureJumpError').textContent=$('measureJumpHint').textContent+'の番号を入力してください。';
        input.focus();input.select();return;
      }
      dialog.close();
    };
    dialog.addEventListener('close',()=>focusScore());
  }
  function stopScoreScroll(){
    if(scoreScrollFrame)cancelAnimationFrame(scoreScrollFrame);
    scoreScrollFrame=0;
  }
  function showScoreTransition(host){
    scoreTransition?.cancel();
    if(!reducedMotion.matches){
      scoreTransition=host.animate?.([{opacity:.84},{opacity:1}],{
        duration:145,easing:'cubic-bezier(.22,.68,.34,1)'
      });
    }
  }
  function revealScoreCell(host,cell,margin,smooth){
    stopScoreScroll();
    if(!cell)return;
    const box=cell.getBoundingClientRect(),view=host.getBoundingClientRect();
    const startX=host.scrollLeft,startY=host.scrollTop;
    const left=view.left+host.clientLeft,top=view.top+host.clientTop;
    const right=left+host.clientWidth,bottom=top+host.clientHeight;
    const dx=box.left<left+margin?box.left-left-margin:Math.max(0,box.right-right+margin);
    const dy=box.top<top+margin?box.top-top-margin:Math.max(0,box.bottom-bottom+margin);
    const endX=Math.max(0,Math.min(startX+dx,host.scrollWidth-host.clientWidth));
    const endY=Math.max(0,Math.min(startY+dy,host.scrollHeight-host.clientHeight));
    if(endX===startX&&endY===startY)return;
    // Bound animated travel so a distant jump arrives without a long sweep.
    if(!smooth||reducedMotion.matches||mobile.matches||
      Math.abs(endX-startX)>host.clientWidth||Math.abs(endY-startY)>host.clientHeight){
      host.scrollTo({left:endX,top:endY,behavior:'instant'});
      return;
    }
    const start=performance.now(),duration=160;
    const frame=now=>{
      const progress=Math.max(0,Math.min(1,(now-start)/duration));
      const eased=progress*progress*(3-2*progress);
      host.scrollTo({left:startX+(endX-startX)*eased,top:startY+(endY-startY)*eased,behavior:'instant'});
      scoreScrollFrame=progress<1?requestAnimationFrame(frame):0;
    };
    scoreScrollFrame=requestAnimationFrame(frame);
  }
  function revealOverviewCaret(smooth=false){
    if($('scoreOverview').hidden)return;
    const host=$('overviewScore');
    const cell=host.querySelector(`[data-engraved-part="${host.dataset.selectedPart}"] [data-engraved-hit="${caret.mi}"][data-slot="${caret.index}"]`);
    revealScoreCell(host,cell,12,smooth);
  }
  function revealCaret(smooth=false) {
    if(!$('scoreOverview').hidden){revealOverviewCaret(smooth);return;}
    const slot=$('scoreHost').querySelector(`[data-measure="${caret.mi}"][data-event-index="${caret.index}"]`);
    revealScoreCell($('scoreScroll'),slot,24,smooth);
  }
  function willAppendBar(mi,index){
    if(mi!==score.measures.length-1)return false;
    const bar=score.measures[mi];
    return index>=Math.max(0,bar.events.length-1);
  }
  function moveCaret(delta,extend=false,append=true) {
    let {mi,index}=caret;
    const found=getSelected();if(found){mi=found.mi;index=found.index;}
    const spans=C.eventSpans(score,mi);
    if(delta>0&&voiceScope&&index>=spans.length-1&&mi===score.measures.length-1){
      if(append&&!extend){moveMeasure(1);return;}
      focusEntry(mi,spans.length-1,extend);return;
    }
    if(delta>0&&append&&!extend&&!rangeDirection&&!voiceScope&&willAppendBar(mi,index)){
      const added=C.addMeasure(score),target=added.measures.length-1;
      commit(added,'小節を追加',null,target,{mi:target,index:0});return;
    }
    let next=index+delta;
    if(next<0){if(mi===0){focusEntry(0,0,extend);return;}mi--;next=C.eventSpans(score,mi).length-1;}
    else if(next>=spans.length){
      if(mi>=score.measures.length-1){
        if(extend)focusEntry(mi,spans.length-1,true);
        return;
      }
      mi++;next=0;
    }
    focusEntry(mi,next,extend);
  }
  function moveMeasure(delta,extend=false) {
    const target=Math.max(0,caret.mi+delta);
    if(target>=score.measures.length) {
      if(extend){focusEntry(caret.mi,C.eventSpans(score,caret.mi).length-1,true);return;}
      if(voiceScope)endVoiceScope();
      const next=C.addMeasure(score);
      commit(next,'小節を追加',null,target,{mi:target,index:0});
    }else focusEntry(target,0,extend,!extend);
  }
  function toggleSelectedRest() {
    const found=getSelected();
    const pitch={step:previewStep,octave,alter:alter==='auto'?C.keyAlter(previewStep,score.key):Number(alter)};
    if(selectionRange){
      commitBatch(B.transform(score,selectedIds(),e=>C.flipNoteRest(e,pitch)),'音符・休符を切り替え');return;
    }
    if(found)commit(C.toggleNoteRest(score,found.event.id,pitch),'音符・休符を切り替え',found.event.id,found.mi);
    else {
      const span=C.eventSpans(score,caret.mi)[caret.index];if(!span)return;
      const result=C.placeEventAt(score,caret.mi,span.start,C.makeNote(pitch,span.event.den,span.event.dots));
      commit(result.score,'休符を音符に変更',result.eventId,result.measureIndex);
    }
  }
  function canUseTie(found){
    if(found?.event.type!=='note'||selectionRange)return false;
    const next=C.nextWrittenEvent(score,found.mi,found.index)?.event;
    return next?.type==='note'?C.samePitches(found.event,next):isEntryMode();
  }
  function toggleSelectedTie(){
    const found=getSelected();
    if(!found||found.event.type!=='note'||selectionRange)throw new Error('タイを始める音符を1つ選んでください');
    const next=C.nextWrittenEvent(score,found.mi,found.index);
    if(next?.event.type==='note'){
      commit(C.toggleTie(score,found.mi,found.index),'タイを切り替え',found.event.id,found.mi);
      return;
    }
    if(!isEntryMode())throw new Error('タイでつなぐ同じ高さの音符を続けて入力してください');
    pendingTieId=pendingTieId===found.event.id?null:found.event.id;
    showToast(pendingTieId?'タイを予約しました。同じ音を続けて入力します':'タイの予約を解除しました');
  }
  function commitInput(result,label){
    const from=pendingTieId&&getSelected();
    let next=result.score,missed=false;
    if(from&&from.event.id===pendingTieId&&next.measures[from.mi]?.events[from.index]?.id===pendingTieId){
      const span=C.nextWrittenEvent(next,from.mi,from.index);
      if(span&&C.samePitches(from.event,span.event))next=C.toggleTie(next,from.mi,from.index);
      else missed=true;
    }
    commit(next,label,result.eventId,result.measureIndex);
    lastEnteredId=result.eventId;
    if(missed)showToast('タイの予約を解除しました。同じ高さの隣り合う音符をつなげます');
  }
  function addPitch(step=previewStep) {
    let found=getSelected();
    if(!found||found.event.type!=='note') {
      const spans=C.eventSpans(score,caret.mi,false).slice(0,caret.index);
      const previous=spans.reverse().find(s=>s.event.type==='note');
      if(!previous)return;
      found={mi:caret.mi,event:previous.event};
    }
    const pitch={step,octave,alter:alter==='auto'?C.keyAlter(step,score.key):Number(alter)};
    if(found.event.pitches.some(p=>C.pitchMidi(p)===C.pitchMidi(pitch)))return;
    commit(C.addChordPitch(score,found.event.id,pitch),'和音に音を追加',found.event.id,found.mi);
  }
  function changePitchSemitone(delta) {
    if(selectionRange){commitBatch(B.transpose(score,selectedIds(true),delta,true),'範囲を半音移動');return;}
    const found=getSelected();
    if(!tupletEnabled&&found?.event.type==='note')commit(C.changeSemitone(score,found.event.id,delta),'半音移動',found.event.id,found.mi);
    else setAlter(String(Math.max(-2,Math.min(2,(alter==='auto'?C.keyAlter(previewStep,score.key):Number(alter))+delta))));
  }
  function flipStem(reset=false) {
    const ids=selectedIds(true);if(!ids.length)return;
    const next=B.transform(score,ids,e=>{
      if(reset)delete e.stemDirection;
      else {
        const center=e.pitches.reduce((sum,p)=>sum+R.diatonicY(p,0,score.clef,score.staffLines||5),0)/e.pitches.length;
        const down=e.stemDirection?e.stemDirection==='down':score.clef==='percussion'&&score.staffLines===1?false:center<=24;e.stemDirection=down?'up':'down';
      }
      return e;
    });
    commitBatch(next,reset?'符幹を自動に戻す':'符幹を反転');
  }
  function cycleDots(toolOnly=false) {
    if(selectionRange&&!toolOnly){resizeSelected(e=>e.den,e=>(e.dots+1)%3,'範囲の付点を変更');return;}
    const found=getSelected();
    if(found&&!toolOnly) {
      const nextDots=(found.event.dots+1)%3;
      commit(C.changeDuration(score,found.event.id,found.event.den,nextDots,{overwriteTuplet:true}),'付点を変更',found.event.id,found.mi);
      dots=nextDots;
    }else dots=(dots+1)%3;
    renderTools();updateGhost();
  }
  function toggleBeam(reset=false) {
    const ids=selectedIds(true).filter(id=>score.measures.some(m=>m.events.some(e=>e.id===id&&e.den>=8)));if(!ids.length)return;
    commitBatch(B.transform(score,ids,e=>{if(reset)delete e.beamBreak;else e.beamBreak=!e.beamBreak;return e;}),reset?'連桁を自動に戻す':'連桁の区切りを変更');
  }
  const commands=[
    ['すべて選択','select all subete',selectAll,'Ctrl+A'],
    ['現在の小節を選択','select measure shosetsu',selectMeasure,''],
    ['音符・休符を1つ選択','select note rest',selectSingle,''],
    ['現在の音符から曲頭まで選択','select to beginning',()=>selectToEdge(false),''],
    ['現在の音符から曲末まで選択','select to end',()=>selectToEdge(true),''],
    ['選択音符・休符を消去','delete note rest erase',()=>deleteSelected(),'Delete'],
    ['音符記号の詳細','notation articulation ornament',()=>openSymbols('note'),''],
    ['指示記号の詳細','direction dynamics tempo expression',()=>openSymbols('direction'),''],
    ['強弱記号 ff','fortissimo',()=>toggleDirection('ff'),''],
    ['速度記号 rit.','ritardando',()=>toggleDirection('速度:rit.'),''],
    ['強弱記号 クレッシェンド','crescendo hairpin',()=>toggleDirection('crescendo'),''],
    ['スラー','slur',()=>toggleDirection('slur'),'S'],
    ['小節を1つ追加','append measure 小節を追加 小節追加',()=>addMobileMeasures(1),''],
    ['小節をまとめて追加','batch add measures',()=>{
      if(mobile.matches){showMobileTools(true);$('mobileEditor').querySelector('[data-mobile-tab="measures"]').click();}
      else {const count=window.prompt('追加する小節数','4');if(count!==null)addMobileMeasures(Number(count));}
    },''],
    ['全体譜・自動整形','engraving overview',openOverview,''],
    ['刻譜表示を切り替える','verovio engraving bravura',toggleVerovio,''],
    ['共同編集・QR招待','collaboration invite',()=>window.KanadeWorkspace.openPanel('collabPanel'),''],
    ['コピー','copy kopi',()=>copySelection(),'Ctrl+C'],
    ['切り取り','cut kiritori',()=>copySelection(true),'Ctrl+X'],
    ['貼り付け','paste haritsuke',pasteSelection,'Ctrl+V'],
    ['小節を手前に挿入','insert measure shosetsu',insertMeasureBefore,''],
    ['選択小節を複製','duplicate measure fukusei',duplicateMeasures,''],
    ['選択小節を削除','delete measure sakujo',removeSelectedMeasures,''],
    ['ピアノロールを開く','piano roll daw keyboard 音高 グリッド',()=>arrangementUI.open('roll'),''],
    ['タイムラインを開く','daw tracks arrangement 小節ブロック',()=>arrangementUI.open(),''],
    ['セッションを開く','session clips ブロック',()=>arrangementUI.open('session'),''],
    ['演奏・MIDI鍵盤で入力','midi keyboard performance step 鍵盤',()=>performancePanel.open('step'),''],
    ['リアルタイム録音入力','record quantize MIDI performance',()=>performancePanel.open('record'),''],
    ['コード名から和音を入力','chord symbol jazz harmony',()=>performancePanel.open('chord'),''],
    ['コードで作曲','chord composer pad タイムライン 初心者',()=>openChordComposer(),''],
    ['ポップ進行を入力','pop chord progression 王道 komuro',()=>openPopProgression(),''],
    ['音符入力モード','note entry onpu',()=>setCommandMode('entry'),'N'],
    ['選択モード','select sentaku',()=>setCommandMode('select'),'V'],
    ['現在の音高で音符を入力','insert note',()=>insert('note',undefined,true),''],
    ['選択中の音価を短く','shorten selected duration',()=>stepSelectedDuration(1),''],
    ['選択中の音価を長く','lengthen selected duration',()=>stepSelectedDuration(-1),''],
    ['選択中の付点を切り替え','toggle selected dot',()=>cycleDots(),''],
    ['入力音価を短く','shorten duration',()=>mobileDuration(1),''],
    ['入力音価を長く','lengthen duration',()=>mobileDuration(-1),''],
    ['音高を一段上げる','pitch up',()=>noteStep(selected,1),'↑'],
    ['音高を一段下げる','pitch down',()=>noteStep(selected,-1),'↓'],
    ['付点を切り替え','dot',()=>cycleDots(isEntryMode()&&!selectionRange),'.'],
    ['連符入力を切り替え','tuplet triplet 三連符 3連符 5連符 renpu',toggleTuplet,'U'],
    ['連符設定を変更','tuplet settings triplet renpu',openTupletSettings,'Shift+U'],
    ['タイを付ける・外す','tie tai',toggleSelectedTie,'T'],
    ['休符を入力','rest kyufu',()=>insert('rest'),'0'],
    ['音符・休符を切り替え','toggle note rest onpu kyufu',toggleSelectedRest,'R'],
    ['1オクターブ上げる','octave up oku',()=>noteStep(selected,7),'9'],
    ['1オクターブ下げる','octave down oku',()=>noteStep(selected,-7),'8'],
    ['半音上げる','semitone sharp hanon',()=>changePitchSemitone(1),'＋'],
    ['半音下げる','semitone flat hanon',()=>changePitchSemitone(-1),'－'],
    ['符幹を反転','flip stem fukan',()=>flipStem(),'L'],
    ['符幹を自動に戻す','reset stem fukan',()=>flipStem(true),'Shift+L'],
    ['連桁の区切りを切り替え','beam break renkoh renketa',()=>toggleBeam(),'/'],
    ['連桁を自動に戻す','reset beam renkoh renketa',()=>toggleBeam(true),'Shift+/'],
    ['拍子・変拍子を設定','meter time signature',openMeter,''],
    ['小節番号へ移動','go to bar measure jump 小節ジャンプ',openMeasureJump,'Alt+G'],
    ['上のパートへ','previous staff part',()=>moveOverviewPart(-1),'Alt+↑'],
    ['下のパートへ','next staff part',()=>moveOverviewPart(1),'Alt+↓'],
    ['次の小節へ','next measure shosetsu',()=>moveMeasure(1),'Ctrl+→'],
    ['前の小節へ','previous measure shosetsu',()=>moveMeasure(-1),'Ctrl+←'],
    ['楽譜の先頭へ','first beginning gakufu',()=>focusEntry(0,0),'Ctrl+Home'],
    ['再生・一時停止','play playback pause saisei',play,'Space'],
    ['選択位置から再生','play from selection saisei',()=>document.querySelector('[data-transport-action="from"]').click(),''],
    ['選択範囲をループ','loop playback range renzoku',()=>transport.toggleLoop(),''],
    ['再生ミキサー','mix mixer solo mute pan saisei',()=>transport.open(),''],
    ['演奏を停止','stop teishi',stopAudio,'■'],
    ['元に戻す','undo modosu',undoAction,'Ctrl+Z'],
    ['やり直し','redo yarinaoshi',redoAction,'Ctrl+Y'],
    ['楽譜を保存','save hozon',save,'Ctrl+S'],
    ['譜面を幅に合わせる','zoom fit haba',()=>window.KanadeViewport.action('fit'),''],
    ['譜面を100%で表示','zoom reset 100',()=>window.KanadeViewport.action('actual'),'Ctrl+0'],
    ['手のひらツール','hand pan tenohira',()=>window.KanadeViewport.toggleHand(),'H'],
    ['楽譜の設定','settings clef staff transpose settei',()=>window.KanadeWorkspace.openPanel('scoreSettings'),''],
    ['再生音源を変更','sound instrument ongen',()=>window.KanadeWorkspace.openPanel('soundSettings'),''],
    ['音符の詳細を表示／閉じる','properties inspector shousai',()=>window.KanadeWorkspace.toggleInspector(),''],
    ['操作ガイド','help guide sousa',()=>window.KanadeWorkspace.openPanel('helpPanel'),''],
    ['AI相談を表示','ai chat ollama soudan 吹奏楽 相談',()=>window.KanadeAgentUI?.toggle(),'Ctrl+J'],
    ['楽譜ファイルを開く','open hiraku',()=>$('openBtn').click(),''],
    ['WAV音声を書き出す','wav export',()=>exportAs('wav'),''],
    ['MP3音声を書き出す','mp3 export',()=>exportAs('mp3'),''],
    ['動画・音声を開く','mp4 webm video audio',()=>$('mediaOpen').click(),''],
    ['MIDIファイルを書き出す','midi export',()=>exportAs('midi'),''],
    ['MusicXMLを書き出す','export musicxml kakidashi',()=>exportAs('musicxml'),''],
    ['SVG画像を書き出す','export svg gazo kakidashi',()=>exportAs('svg'),''],
    ['印刷プレビュー','print preview insatsu',openPrintPreview,''],
    ['PDF出力','pdf export',printPdf,''],
    ['作品情報・表紙','表紙 タイトル 作曲者 コメント 編成表 layout cover',openPublication,''],
  ];
  const recentLimit=6;
  const commandsByName=new Map(commands.map(command=>[command[0],command]));
  let recentCommands=[];
  try {
    const stored=JSON.parse(localStorage.getItem(RECENT_COMMAND_STORAGE));
    if(Array.isArray(stored))recentCommands=[...new Set(stored.filter(name=>commandsByName.has(name)))].slice(0,recentLimit);
  }catch(_){/* History is optional when browser storage is unavailable. */}
  function rememberCommand(command){
    const name=command[0];
    if(commandsByName.get(name)!==command)return;
    recentCommands=[name,...recentCommands.filter(item=>item!==name)].slice(0,recentLimit);
    try{localStorage.setItem(RECENT_COMMAND_STORAGE,JSON.stringify(recentCommands));}
    catch(_){/* History remains available for this session. */}
  }
  function paletteContext(){
    const found=getSelected(),entry=found?.event;
    const [first,last]=measureBounds();
    const count=score.measures.length;
    const structural=!editionDocument().bassPart;
    const selectedNotes=selectionRange?selectedIds(true).length:0;
    const slots=selectionRange?B.entries(score,selectionRange.start,selectionRange.end).length:0;
    const offsets=C.measureOffsets(score);
    const wholeMeasures=selectionRange&&selectionRange.start===offsets[first]&&selectionRange.end===offsets[last+1];
    const rangeMarks=['スラー','強弱記号 クレッシェンド'];
    const copy=['コピー','切り取り',...(canPasteSelection()?['貼り付け']:[])];
    const measureCommands=[
      '小節番号へ移動','拍子・変拍子を設定',
      ...(structural&&count<500?['小節を手前に挿入','小節を1つ追加']:[]),
      ...(structural&&count+last-first+1<=500?['選択小節を複製']:[]),
      ...(structural&&(count>1||score.measures[first].events.length||score.measures[first].directions?.length)?['選択小節を削除']:[])
    ];
    const label=selectionRange?
      (wholeMeasures?selectionLabel()+'を選択':selectionLabel()+' · 音符・休符 '+slots+'個を選択'):
      (caret.mi+1)+'小節 · '+(entry?C.eventLabel(entry):'入力位置');
    const entryDuration=[
      ...(entry&&durationNeighbor(entry,1)?['選択中の音価を短く']:[]),
      ...(entry&&durationNeighbor(entry,-1)?['選択中の音価を長く']:[]),
      '選択中の付点を切り替え'
    ];
    let names;
    if(wholeMeasures)names=[...copy,...measureCommands,...(selectedNotes>=2?rangeMarks:[])];
    else if(selectionRange)names=[...copy,...(selectedNotes>=2?rangeMarks:[]),'選択音符・休符を消去'];
    else if(entry)names=[
      ...entryDuration,'音符・休符を切り替え',
      ...(entry.type==='note'?['音高を一段上げる','音高を一段下げる',...rangeMarks,'音符記号の詳細',...(canUseTie(found)?['タイを付ける・外す']:[])]:[]),
      ...copy,'選択音符・休符を消去','現在の小節を選択'
    ];
    else names=[...(canPasteSelection()?['貼り付け']:[]),'現在の音高で音符を入力','休符を入力','現在の小節を選択',...measureCommands];
    return {label,names};
  }
  let commandMatches=[],commandIndex=0,commandCategory='よく使う',commandOpener=null;
  const commandGroups={
    '選択中':null,
    '最近使った':null,
    'よく使う':/消去|記号|コピー|貼り付け|元に戻す|保存|小節を1つ追加|全体譜|共同編集/,
    '音符・記号':/リアルタイム|MIDI|コード|音符|休符|音高|音価|記号|半音|符幹|連桁|オクターブ|付点|連符|タイ|スラー/,
    '選択・小節':/選択|小節|拍子|コピー|切り取り|貼り付け|曲頭|曲末/,
    '表示・再生':/ピアノロール|タイムライン|セッション|表示|再生|楽譜の設定|音源|全体譜|幅に合わせる|先頭|手のひら|小節番号|パートへ/,
    '保存・共有':/保存|書き出す|開く|共同編集/
  };
  const normalizeQuery=s=>s.normalize('NFKD').replace(/\p{Mark}/gu,mark=>mark==='\u3099'||mark==='\u309a'?mark:'').normalize('NFC').toLowerCase();
  function setCommandMode(mode) {
    if($('scoreOverview').hidden)setMode(mode);
    else $(mode==='entry'?'overviewEntry':'overviewSelect').click();
  }
  function toggleCommands() {
    if($('commandPalette').open)closeCommands();else openCommands();
  }
  function openCommands() {
    const palette=$('commandPalette'),search=$('commandSearch');
    if(palette.open)return;
    commandOpener=document.activeElement;
    search.value='';commandIndex=0;commandCategory=mobile.matches?'よく使う':'選択中';
    renderCommands();
    if(mobile.matches)palette.showModal();else palette.show();
    (mobile.matches?$('commandClose'):search).focus({preventScroll:true});
  }
  function runCommand(index) {
    const command=commandMatches[index];if(!command)return;
    closeCommands();
    attempt(()=>{command[2]();rememberCommand(command);});
  }
  function closeCommands(restoreFocus=true) {
    const palette=$('commandPalette');
    if(!palette.open)return;
    palette.close();
    const scoreFocus=$('scoreOverview').hidden?$('scoreHost'):$('overviewScore');
    if(restoreFocus){
      const target=mobile.matches&&commandOpener?.getClientRects().length?commandOpener:scoreFocus;
      target.focus({preventScroll:true});
    }
    commandOpener=null;
  }
  function updateCommandSelection(scroll=false) {
    const search=$('commandSearch'),results=$('commandResults');
    const active=commandMatches.length?results.children[commandIndex]:null;
    const previous=results.querySelector('[aria-selected="true"]');
    if(previous!==active)previous?.setAttribute('aria-selected','false');
    if(!active){search.removeAttribute('aria-activedescendant');return;}
    active.setAttribute('aria-selected','true');
    search.setAttribute('aria-activedescendant',active.id);
    if(scroll){
      const row=active.getBoundingClientRect(),list=results.getBoundingClientRect();
      if(row.top<list.top)results.scrollTop+=row.top-list.top;
      else if(row.bottom>list.bottom)results.scrollTop+=row.bottom-list.bottom;
    }
  }
  function availableCommands(){
    if(!$('scoreOverview').hidden&&engravingParts().length>1)return commands;
    return commands.filter(command=>command[3]!=='Alt+↑'&&command[3]!=='Alt+↓');
  }
  function renderCommands() {
    const query=normalizeQuery($('commandSearch').value).trim().replace(/\s+/g,' ');
    const context=paletteContext(),available=availableCommands();
    $('commandContext').textContent=context.label;
    $('commandContext').hidden=!!query||commandCategory!=='選択中';
    for(const button of $('commandCategories').children){
      button.setAttribute('aria-pressed',String(button.textContent===commandCategory&&!query));
    }
    const jump=/^(?:b\s*(\d+)|(\d+)\s*小節(?:目)?)$/.exec(query);
    if(jump){
      const number=Number(jump[1]??jump[2]);
      commandMatches=number>=1&&number<=score.measures.length&&!rangeDirection?
        [[number+'小節目へ移動','',()=>goToMeasure(number),'']]:[];
    }else if(query){
      const words=query.split(' ');
      const symbolCommands=[
        ...Object.entries(symbols.notes).map(([key,mark])=>[mark.label,key,()=>toggleArticulation(key),'']),
        ...symbols.directions.filter(mark=>!['custom','chordSymbol'].includes(mark.key)).map(mark=>[mark.label,mark.key,()=>toggleDirection(mark.key),''])
      ];
      commandMatches=[...available,...symbolCommands].map(command=>{
        const name=normalizeQuery(command[0]),shortcut=normalizeQuery(command[3]);
        const all=name+' '+normalizeQuery(command[1])+' '+shortcut;
        if(!words.every(word=>all.includes(word)))return null;
        const rank=name===query||shortcut===query?0:name.startsWith(query)?1:name.includes(query)?2:3;
        return {command,rank};
      }).filter(Boolean).sort((a,b)=>a.rank-b.rank).map(({command})=>command);
    }else if(commandCategory==='選択中')commandMatches=context.names.map(name=>commandsByName.get(name));
    else if(commandCategory==='最近使った')commandMatches=recentCommands.map(name=>commandsByName.get(name)).filter(command=>available.includes(command));
    else commandMatches=available.filter(command=>commandGroups[commandCategory].test(command[0]));
    commandIndex=Math.min(commandIndex,Math.max(0,commandMatches.length-1));
    const results=$('commandResults');results.replaceChildren();
    if(!commandMatches.length){const p=document.createElement('p');p.textContent=!query&&commandCategory==='最近使った'?'パレットで実行した操作がここに表示されます':'該当する操作がありません';results.append(p);}
    commandMatches.forEach((c,index)=>{
      const button=document.createElement('button');button.type='button';button.id='command-option-'+index;
      button.setAttribute('role','option');button.setAttribute('aria-selected',String(index===commandIndex));button.tabIndex=-1;
      const name=document.createElement('span');name.textContent=c[0];button.append(name);
      if(c[3]){const key=document.createElement('kbd');key.textContent=c[3];button.append(key);}
      button.onclick=()=>runCommand(index);results.append(button);
    });
    results.scrollTop=0;
    updateCommandSelection();
  }
  function svgCoordinates(event) {
    const host=$('scoreHost');
    let svg=event.target?.closest?.('svg')||host.querySelector('svg');
    if(host.dataset.renderer==='verovio')svg=svg?.querySelector('svg.definition-scale')||host.querySelector('svg.definition-scale')||svg;
    if(!svg)return null;
    const ctm=svg.getScreenCTM();if(!ctm)return null;
    const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
    const position=point.matrixTransform(ctm.inverse());
    return {x:position.x,y:position.y,svg};
  }
  function inputPosition(point) {
    if(!point)return null;
    const engraved=$('scoreHost').dataset.renderer==='verovio'&&window.KanadeVerovio?.hitTest;
    const hit=engraved
      ?window.KanadeVerovio.hitTest($('scoreHost'),point,score,den,dots,{drum:{step:previewStep,octave},octaveShift:pointerOctaveShift,overwrite:isOverwriteEntry(),onset:point.onset})
      :R.hitTest(score,point.x,point.y,den,dots,{step:previewStep,octave},viewport.layout(),{overwrite:isOverwriteEntry(),onset:point.onset,octaveShift:pointerOctaveShift});
    const pending=nextTupletSlot();
    return hit&&pending?{...hit,mi:pending.mi,tick:pending.tick}:hit;
  }
  function pointerPosition(event) {
    const point=svgCoordinates(event);if(!point)return null;
    const written=event.target.closest('[data-event-tick][data-implicit="0"]');
    if(written)point.onset=Number(written.dataset.eventTick);
    return point;
  }
  function syncVerovioButtons(){
    const on=!!window.KanadeVerovio?.isEnabled();
    for(const button of document.querySelectorAll('[data-verovio-toggle]')){
      button.setAttribute('aria-pressed',String(on));
      button.textContent=button.id==='verovioToggle'?(on?'従来の譜面に戻す':'刻譜で表示（Verovio）'):(on?'従来':'刻譜');
      button.title=on?'従来の五線描画に戻す':'Verovioで刻譜する';
    }
  }
  function toggleVerovio(){
    if(!window.KanadeVerovio)return;
    const next=!window.KanadeVerovio.isEnabled();
    window.KanadeVerovio.setEnabled(next);
    try{localStorage.setItem(window.KanadeVerovio.storageKey(),next?'verovio':'classic');}
    catch(error){console.warn('Renderer setting is unavailable',error);}
    renderedScore=null;syncVerovioButtons();render();
  }
  function updateGhost() {
    const host=$('scoreHost');
    if(host.dataset.renderer==='verovio'&&window.KanadeVerovio?.paintGhost){
      let ghost=null;
      if(mobile.matches&&mobileDraft&&editMode==='entry'&&!selectionRange){
        ghost=window.KanadeVerovio.ghostAt(host,score,mobileDraft,den,dots,isOverwriteEntry());
      }else if(mobile.matches&&editMode==='entry'&&!selectionRange&&!rangeDirection&&!host.classList.contains('pitch-dragging')&&lastPointer){
        ghost=inputPosition(lastPointer);
      }else if(!mobile.matches&&editMode==='entry'&&!selectionRange&&!rangeDirection&&!host.classList.contains('pitch-dragging')){
        if(lastPointer)ghost=inputPosition(lastPointer);
        else if(keyboardGhost){
          const overwrite=isOverwriteEntry(),cursor=inputCursor(overwrite,false),cap=C.barTicks(score,cursor.mi);
          ghost=window.KanadeVerovio.ghostAt(host,score,{mi:cursor.mi+Number(cursor.tick===cap),tick:cursor.tick%cap,step:previewStep,octave},den,dots,overwrite);
        }
      }
      host.classList.toggle('placing',!!ghost);
      if(ghost)window.KanadeVerovio.paintGhost(host,ghost,den);
      else host.querySelectorAll('#kanade-verovio-ghost').forEach(node=>node.remove());
      return;
    }
    const layer=host.querySelector('#kanade-ghost-layer');if(!layer)return;
    const dimmed=host.querySelector('[data-mobile-chord-edit]');
    if(dimmed)dimmed.removeAttribute('data-mobile-chord-edit');
    if(mobile.matches&&mobileChord){
      const {mi,tick,pitches,active,eventId}=mobileChord;
      const original=eventId&&host.querySelector(`.score-note[data-note-id="${CSS.escape(eventId)}"]`);
      if(original)original.setAttribute('data-mobile-chord-edit','');
      const event=eventId?getSelected()?.event:null;
      layer.innerHTML=R.chordDraftMarkup(score,viewport.layout(),mi,tick,pitches,active,event?.den??den,event?.dots??dots);
      return;
    }
    let ghost=null;
    if(mobile.matches&&mobileDraft){
      const {mi,tick}=mobileDraft;
      ghost=R.cursorPreview(score,viewport.layout(),mi,tick,mobileDraft,den,dots,isOverwriteEntry());
      if(ghost&&tick+C.durationTicks(den,dots)>C.barTicks(score,mi)){
        const cap=C.barTicks(score,mi),overwrite=isOverwriteEntry();
        ghost.valid=overwrite||!C.eventSpans(score,mi,false).some(span=>span.event.type==='note'&&span.end>tick&&span.start<cap);
      }
    }else if(!mobile.matches&&editMode==='entry'&&!selectionRange&&!rangeDirection&&!host.classList.contains('pitch-dragging')){
      if(lastPointer)ghost=inputPosition(lastPointer);
      else if(keyboardGhost){
        const overwrite=isOverwriteEntry(),{mi,tick}=inputCursor(overwrite,false),cap=C.barTicks(score,mi);
        ghost=R.cursorPreview(score,viewport.layout(),mi+Number(tick===cap),tick%cap,{step:previewStep,octave},den,dots,overwrite);
      }
    }
    host.classList.toggle('placing',!!ghost);
    const pending=nextTupletSlot();
    if(pending&&ghost){
      ghost=R.cursorPreview(score,viewport.layout(),pending.mi,pending.tick,ghost,den,dots,true);
      if(ghost){
        const {index}=pending;
        ghost.valid=index+C.durationTicks(den,dots)/C.durationTicks(tupletPreference.unit)<=tupletPreference.actual;
      }
    }
    if(ghost&&voiceScope?.mi===ghost.mi)ghost.x+=8;
    const guide=ghost&&mobileDraft?`<circle class="mobile-pitch-guide" cx="${ghost.x}" cy="${ghost.y}" r="11"/>`:'';
    layer.innerHTML=ghost?guide+R.ghostMarkup(score,ghost,den,dots,'note',alter):'';
  }
  function placeNoteAt(hit,fromKeyboard=false) {
    if(!hit)return;
    attempt(()=>{
      const pitch={step:hit.step,alter:alter==='auto'?C.keyAlter(hit.step,score.key):Number(alter),octave:hit.octave};
      const event=C.makeNote(pitch,den,dots);
      if(chordMode) {
        if(!selected)throw new Error('先に和音を追加する音符を選択してください');
        commit(C.addChordPitch(score,selected,pitch),'和音に音を追加');return;
      }
      if(tupletEnabled){
        if(fromKeyboard){lastPointer=null;pointerOctaveShift=0;}
        previewStep=hit.step;octave=hit.octave;
        writeInlineTuplet(event,hit);return;
      }
      const result=C.placeAcrossBars(score,hit.mi,hit.tick,event,{overwrite:isOverwriteEntry()});
      previewStep=hit.step;octave=hit.octave;
      if(fromKeyboard){lastPointer=null;pointerOctaveShift=0;}
      commitInput(result,'五線に'+R.durationName(den,dots)+'を入力');
    });
  }
  function updateTupletButton(){
    const {actual,unit}=tupletPreference;
    $('tupletButtonLabel').textContent=actual+'連符';
    for(const button of [$('tupletBtn'),$('overviewTuplet'),...document.querySelectorAll('[data-mobile-action="tuplet"]')]){
      button.setAttribute('aria-pressed',String(tupletEnabled));
      button.title=`${actual}連符（${tupletPreference.normal}個分） · 基準 ${R.durationName(unit)} [U]`;
      if(button.id!=='tupletBtn')button.textContent=actual+'連符';
    }
  }
  function toggleTuplet(){
    if(rangeDirection)return;
    if(tupletEnabled){
      tupletEnabled=false;tupletNext=null;keyboardGhost=false;
      renderTools();updateGhost();focusScore();return;
    }
    if(!isEntryMode())setCommandMode('entry');
    chordMode=false;tupletEnabled=true;keyboardGhost=true;dots=0;
    selectDuration(tupletPreference.unit);
    focusScore();
  }
  function nextTupletSlot(){
    const next=tupletNext;
    return tupletEnabled&&next?.scoreId===score.id&&next.bar===score.measures[next.mi]?next:null;
  }
  function writeInlineTuplet(event,position){
    const {actual,normal,unit}=tupletPreference;
    const pending=nextTupletSlot();
    const cap=C.barTicks(score,position.mi);
    const mi=pending?.mi??position.mi+Number(position.tick===cap);
    const tick=pending?.start??position.tick%cap;
    const target=mi===score.measures.length?C.addMeasure(score):score;
    const spans=pending?C.eventSpans(target,mi,false):[];
    const group=pending?C.tupletGroupAt(spans,spans.findIndex(span=>span.start===pending.tick)):[];
    const index=pending?group.findIndex(span=>span.start===pending.tick):0;
    const base=pending?group.map(span=>span.event):Array.from({length:actual},()=>C.makeRest(unit));
    const events=C.replaceTupletEntry(base,index,event,unit,actual,normal);
    const result=C.placeTuplet(target,mi,tick,unit,actual,events,{overwrite:!!pending||isOverwriteEntry(),normal});
    const entered=C.eventSpans(result.score,mi,false).find(span=>span.event.id===event.id);
    commitInput({...result,eventId:event.id},`${actual}連符に${event.type==='note'?'音符':'休符'}を入力`);
    if(C.tupletEnd(entered.event)<actual){
      tupletNext={scoreId:score.id,bar:score.measures[mi],mi,start:tick,tick:entered.end,index:C.tupletEnd(entered.event)};
      keyboardGhost=true;updateGhost();
    }
  }
  function tupletSettings(){
    const choice=$('tupletCount').value,unit=Number($('tupletDuration').value);
    const advanced=choice==='custom',actual=advanced?$('tupletCustomCount').valueAsNumber:Number(choice);
    const normal=advanced?$('tupletCustomNormal').valueAsNumber:C.TUPLETS[actual];
    return {actual,normal,unit};
  }
  function renderTupletPreview(){
    const custom=$('tupletCount').value==='custom';
    $('tupletCustom').hidden=!custom;
    $('tupletCustomCount').disabled=$('tupletCustomNormal').disabled=!custom;
    const {actual,normal,unit}=tupletSettings();
    const quarters=normal*4/unit;
    const valid=C.validTupletRatio(actual,normal)&&quarters<=30;
    $('tupletStart').disabled=!valid;
    const previewHost=$('tupletPreview'),caption=$('tupletPreviewCaption');
    if(!valid){
      previewHost.replaceChildren();
      caption.textContent=C.validTupletRatio(actual,normal)?'連符が1小節に収まるよう、基準の音価か長さを小さくしてください。':
        `個数は7〜${C.MAX_TUPLET_COUNT}、何個分の長さにするかは1〜${C.MAX_TUPLET_COUNT}の整数で指定してください。`;
      return;
    }
    const time=quarters>15?{num:Math.ceil(quarters/2),den:2}:{num:Math.ceil(quarters),den:4};
    const sample=C.withSettings(C.createScore(),{time});
    const notes=Array.from({length:actual},()=>C.makeNote({step:'G',octave:4,alter:0},unit));
    const {score:preview}=C.placeTuplet(sample,0,0,unit,actual,notes,{normal});
    const extraWidth=Math.max(0,actual-12)*19;
    const layout=extraWidth?{...R.MOBILE,width:R.MOBILE.width+extraWidth,staffContent:R.MOBILE.staffContent+extraWidth}:R.MOBILE;
    previewHost.style.setProperty('--preview-min-width',extraWidth?`${layout.width*.75}px`:'0');
    previewHost.innerHTML=R.render(preview,null,layout,0,'tuplet-preview');
    caption.textContent=`${R.durationName(unit)}${actual}個を${normal}個分の長さで演奏 · 4分音符${quarters}個分`;
  }
  function openTupletSettings(){
    const dialog=$('tupletDialog');
    if(dialog.open)return;
    if($('commandPalette').open)closeCommands();
    const {actual,normal,unit}=tupletPreference,custom=actual>=7;
    $('tupletCount').value=custom?'custom':String(actual);
    $('tupletCustomCount').value=custom?String(actual):'7';
    $('tupletCustomNormal').value=custom?String(normal):'4';
    $('tupletDuration').value=String(unit);
    renderTupletPreview();
    dialog.showModal();
  }
  function setupTuplet(){
    const dialog=$('tupletDialog');
    $('tupletDuration').replaceChildren(...C.DENOMS.map(value=>new Option(R.durationName(value),value)));
    $('tupletCount').onchange=$('tupletDuration').onchange=renderTupletPreview;
    $('tupletCustomCount').max=$('tupletCustomNormal').max=String(C.MAX_TUPLET_COUNT);
    $('tupletCustomCount').oninput=$('tupletCustomNormal').oninput=renderTupletPreview;
    const preset=unit=>{
      $('tupletCount').value='3';$('tupletDuration').value=String(unit);renderTupletPreview();
    };
    $('tupletOneBeat').onclick=()=>preset(8);
    $('tupletTwoBeats').onclick=()=>preset(4);
    $('tupletSetup').onsubmit=event=>{
      event.preventDefault();
      if($('tupletStart').disabled)return;
      tupletPreference=tupletSettings();tupletNext=null;
      try{localStorage.setItem(TUPLET_STORAGE,JSON.stringify(tupletPreference));}catch(e){console.warn('Tuplet settings are unavailable',e);}
      if(tupletEnabled){dots=0;selectDuration(tupletPreference.unit);}
      else updateTupletButton();
      dialog.close();
    };
    dialog.addEventListener('close',()=>focusScore());
    updateTupletButton();
  }
  function inputCursor(overwrite,advance){
    const found=getSelected(),mi=found?.mi??caret.mi;
    const spans=C.eventSpans(score,mi),span=spans[found?.index??caret.index];
    const after=found&&(found.event.id===lastEnteredId||(!overwrite&&(advance||found.event.type==='note')));
    return {mi,tick:span?(after?span.end:span.start):C.usedTicks(score.measures[mi])};
  }
  function insert(kind,step,advance=false,position=null) {
    attempt(()=>{
      if(step)previewStep=step;
      const inputStep=position?.step??previewStep;
      const pitch={step:inputStep,alter:alter==='auto'?C.keyAlter(inputStep,score.key):Number(alter),octave:position?.octave??octave};
      if(chordMode) {
        if(kind==='rest')throw new Error('和音モード中は休符を追加できません');
        if(!selected)throw new Error('先に和音を追加する音符を選択してください');
        commit(C.addChordPitch(score,selected,pitch),'和音に音を追加');return;
      }
      const ev=kind==='rest'?C.makeRest(den,dots):C.makeNote(pitch,den,dots);
      const overwrite=isOverwriteEntry()&&!selectionRange,{mi,tick}=position||inputCursor(overwrite,advance);
      if(tupletEnabled){
        if(position){previewStep=pitch.step;octave=pitch.octave;}
        writeInlineTuplet(ev,{mi,tick});return;
      }
      const result=C.placeAcrossBars(score,mi,tick,ev,{overwrite});
      if(position){previewStep=pitch.step;octave=pitch.octave;}
      commitInput(result,kind==='rest'?'休符を入力':'音符を入力');
    });
  }
  function deleteSelected(keyboard=false,forward=false) {
    if(selectionRange){
      const next=B.clearRange(score,selectionRange.start,selectionRange.end);
      const after={mi:caret.mi,index:Math.min(caret.index,C.eventSpans(next,caret.mi).length-1)};
      commit(next,'範囲を消去',null,after.mi,after,selectionRange);
      return;
    }
    const mi=caret.mi;
    let found=getSelected();
    if(keyboard&&!found){
      // From an implicit rest, Backspace can remove the preceding written event.
      const events=score.measures[mi].events,index=Math.min(caret.index-1,events.length-1);
      if(index>=0)found={mi,index,event:events[index]};
    }
    if(!found){if(!keyboard)showToast('削除する音符・休符を選択してください');return;}
    if(found.event.type==='rest'&&found.event.tuplet){
      moveCaret(1,false,false);return;
    }
    const next=C.deleteEvent(score,found.event.id),bar=next.measures[found.mi];
    if(found.event.type==='note'&&!bar.events.some(e=>e.type==='note')){
      if(bar.events.some(e=>e.tuplet))bar.events=[];
      else bar.events.splice(found.index,1);
    }
    // After note deletion, prefer the previous note. After rest deletion, stay at the edited beat.
    const events=next.measures[found.mi].events;
    let previous=Math.min(found.index-1,events.length-1);
    while(previous>=0&&events[previous].type!=='note')previous--;
    const after={mi:found.mi,index:Math.min(found.index,C.eventSpans(next,found.mi).length-1)};
    const target=forward||found.event.type==='rest'?events[after.index]:events[previous];
    commit(next,'音符・休符を削除',target?.id||null,found.mi,after);
  }
  function setupPitchDrag(){
    const host=$('scoreHost');
    let drag=null,suppressClick=false;
    const stop=()=>{
      const current=drag;
      drag=null;host.classList.remove('pitch-dragging');
      if(current&&host.hasPointerCapture(current.pointer))host.releasePointerCapture(current.pointer);
      return current;
    };
    host.addEventListener('pointerdown',event=>{
      suppressClick=false;
      if(event.pointerType!=='mouse'||event.button!==0||mobile.matches||viewport.gesturing||rangeDirection||
        event.shiftKey||event.ctrlKey||event.metaKey||event.altKey||chordMode||isOverwriteEntry())return;
      const target=event.target.closest('[data-event-type="note"][data-implicit="0"]');
      if(!target)return;
      const point=svgCoordinates(event);
      if(!point)return;
      const mi=Number(target.dataset.measure),index=Number(target.dataset.eventIndex);
      const span=C.eventSpans(score,mi,false)[index],note=span?.event;
      if(note?.type!=='note')return;
      if(host.dataset.renderer==='verovio'){
        const head=target.querySelector('.notehead')||target;
        let box;try{box=head.getBBox();}catch{return;}
        if(point.x<box.x-20||point.x>box.x+box.width+20||point.y<box.y-20||point.y>box.y+box.height+20)return;
        const space=Number(point.svg?.dataset.staffSpace||host.dataset.staffSpace)||12;
        drag={pointer:event.pointerId,startY:point.y,clientX:event.clientX,clientY:event.clientY,mi,index,note,
          score,steps:0,started:false,engraved:true,space,node:target};
        return;
      }
      const geometry=R.measureGeometry(score,mi,viewport.layout());
      const onset=geometry.notesStart+span.start/geometry.cap*geometry.usable;
      const nearPitch=note.pitches.some(pitch=>Math.abs(R.diatonicY(pitch,geometry.top,score.clef,score.staffLines||5)-point.y)<=15);
      if(Math.abs(onset-point.x)>18||!nearPitch)return;
      drag={pointer:event.pointerId,startY:point.y,clientX:event.clientX,clientY:event.clientY,mi,index,note,
        score,steps:0,started:false};
    });
    host.addEventListener('pointermove',event=>{
      if(drag?.pointer!==event.pointerId)return;
      const point=svgCoordinates(event);
      if(!point)return;
      const dx=event.clientX-drag.clientX,dy=event.clientY-drag.clientY;
      if(!drag.started){
        if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)){stop();return;}
        if(Math.abs(dy)<5||Math.abs(dy)<Math.abs(dx))return;
        drag.started=true;host.setPointerCapture(event.pointerId);
        host.classList.add('pitch-dragging');
      }
      const numbers=drag.note.pitches.map(C.diatonicNumber);
      const min=7-Math.min(...numbers),max=69-Math.max(...numbers);
      const stepSize=drag.engraved?(drag.space/2):6;
      drag.steps=Math.max(min,Math.min(max,Math.round((drag.startY-point.y)/stepSize)));
      if(drag.engraved){
        if(score!==drag.score||!drag.node.isConnected){stop();updateGhost();return;}
        drag.node.setAttribute('transform',drag.steps?`translate(0 ${-drag.steps*stepSize})`:'');
        return;
      }
      if(score!==drag.score){stop();updateGhost();return;}
      const span=C.eventSpans(score,drag.mi,false)[drag.index];
      const geometry=R.measureGeometry(score,drag.mi,viewport.layout());
      host.querySelector('#kanade-ghost-layer').innerHTML=R.pitchDragMarkup(score,geometry,span.start,drag.note,drag.steps);
    });
    const finish=(event,apply)=>{
      if(drag?.pointer!==event.pointerId)return;
      const current=stop();
      if(!current.started)return;
      suppressClick=true;lastPointer=null;updateGhost();
      if(!apply||score!==current.score)return;
      const {mi,index,note,steps}=current;
      if(!steps){focusEntry(mi,index);return;}
      attempt(()=>{
        const changed=B.transpose(score,[note.id],steps);
        commit(changed,'ドラッグで音高を変更',note.id,mi);
        const pitch=getSelected().event.pitches[0];previewStep=pitch.step;setOctave(pitch.octave);
      });
    };
    host.addEventListener('pointerup',event=>finish(event,true));
    host.addEventListener('pointercancel',event=>finish(event,false));
    host.addEventListener('lostpointercapture',event=>finish(event,false));
    host.addEventListener('pointerleave',()=>{if(drag&&!drag.started)stop();});
    host.addEventListener('click',event=>{
      if(suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}
    },true);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&drag?.started){
        finish({pointerId:drag.pointer},false);event.preventDefault();event.stopImmediatePropagation();
      }
    },true);
  }
  function setupScoreContext(){
    const menu=$('scoreContextMenu');
    let returnFocus=null;
    function close(focus=false){
      if(!menu.matches(':popover-open'))return;
      menu.hidePopover();
      if(focus)returnFocus?.focus({preventScroll:true});
    }
    const actions={measure:selectMeasure,copy:()=>copySelection(),paste:pasteSelection,
      copyBars:copyWholeMeasures,pasteBars:pasteWholeMeasures,
      shorter:()=>stepSelectedDuration(1),longer:()=>stepSelectedDuration(-1),
      lower:()=>noteStep(selected,-1),higher:()=>noteStep(selected,1),rest:toggleSelectedRest,
      tie:toggleSelectedTie,slur:()=>toggleDirection('slur'),crescendo:()=>toggleDirection('crescendo'),
      meter:openMeter,duplicate:duplicateMeasures,
      erase:()=>deleteSelected(),clear:()=>{selectMeasure();deleteSelected();},insert:insertMeasureBefore,remove:removeSelectedMeasures};
    for(const host of [$('scoreHost'),$('overviewScore')]){
      host.addEventListener('contextmenu',event=>{
        const hit=event.target.closest('[data-engraved-hit],[data-measure]');
        if(!hit)return;
        event.preventDefault();
        const overview=host.id==='overviewScore';
        const mi=Number(overview?hit.dataset.engravedHit:hit.dataset.measure);
        const index=Number((overview?hit.dataset.slot:hit.dataset.eventIndex)||0);
        if(overview&&!selectOverviewPart(Number(hit.closest('[data-engraved-part]').dataset.engravedPart),mi))return;
        const slot=B.slot(score,{mi,index});
        if(!selectionRange||slot.start>=selectionRange.end||slot.end<=selectionRange.start)focusEntry(mi,index);
        const found=getSelected(),entry=found?.event;
        const noteTarget=overview||!hit.hasAttribute('data-measure-zone');
        const [first,last]=measureBounds(),offsets=C.measureOffsets(score);
        const wholeMeasures=selectionRange&&selectionRange.start===offsets[first]&&selectionRange.end===offsets[last+1];
        const noteMenu=!mobile.matches&&!wholeMeasures&&!!((noteTarget&&entry)||selectionRange);
        $('scoreContextNotes').hidden=!noteMenu;
        $('scoreContextMeasures').hidden=noteMenu;
        $('scoreContextErase').hidden=!noteMenu&&!mobile.matches;
        $('scoreContextLabel').textContent=selectionRange?selectionLabel()+'を選択':entry?C.eventLabel(entry):'';
        $('scoreContextMeasureLabel').textContent=selectionRange?selectionLabel():(mi+1)+'小節';
        const noteCount=selectedIds(true).length;
        const structural=!editionDocument().bassPart;
        const disabled={shorter:!entry||!!selectionRange||!durationNeighbor(entry,1),
          longer:!entry||!!selectionRange||!durationNeighbor(entry,-1),lower:!noteCount,higher:!noteCount,
          rest:!entry&&!selectionRange,tie:!canUseTie(found),
          slur:noteCount<(selectionRange?2:1),crescendo:noteCount<(selectionRange?2:1),
          paste:!canPasteSelection(),pasteBars:!arrangementUI.readClipboard()||!!voiceScope,erase:!selected&&!selectionRange,
          clear:!score.measures[mi].events.length,insert:!structural||score.measures.length>=500,
          duplicate:!structural||score.measures.length+last-first+1>500,
          remove:!structural||score.measures.length===1&&!score.measures[mi].events.length&&!score.measures[mi].directions?.length};
        for(const button of menu.querySelectorAll('button'))button.disabled=!!disabled[button.dataset.scoreAction];
        returnFocus=host;
        const container=overview?$('scoreOverview'):document.body;
        if(menu.parentElement!==container){close();container.append(menu);}
        if(!menu.matches(':popover-open'))menu.showPopover();
        const viewport=window.visualViewport;
        const width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
        const left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;
        menu.style.maxHeight=Math.max(44,height-12)+'px';
        const box=menu.getBoundingClientRect();
        menu.style.left=Math.max(left+4,Math.min(event.clientX,left+width-box.width-4))+'px';
        menu.style.top=Math.max(top+4,Math.min(event.clientY,top+height-box.height-4))+'px';
        menu.querySelector('button:not(:disabled):not([hidden] button)')?.focus({preventScroll:true});
      });
    }
    menu.addEventListener('click',event=>{
      const action=event.target.closest('[data-score-action]')?.dataset.scoreAction;
      if(action){close(true);attempt(actions[action]);}
    });
    menu.addEventListener('keydown',event=>{
      if(event.key==='Tab'){close(true);return;}
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
      if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      const buttons=[...menu.querySelectorAll('button:not(:disabled):not([hidden] button)')],index=buttons.indexOf(document.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:
        (index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
      buttons[next]?.focus();
    });
    document.addEventListener('pointerdown',event=>{if(!event.target.closest('#scoreContextMenu'))close();});
    $('scoreOverview').addEventListener('close',()=>close());
    window.addEventListener('resize',()=>close());
  }
  function deleteAtCursor(){
    if(voiceScope){deleteSelected(true,true);return;}
    const mi=caret.mi,cap=C.barTicks(score,mi),offsets=C.measureOffsets(score);
    const wholeSelected=!selectionRange||(selectionRange.start===offsets[mi]&&selectionRange.end===offsets[mi+1]);
    if(wholeSelected&&!editionDocument().bassPart&&score.measures.length>1&&engravingParts().every(part=>{
      const bar=part.measures[mi];
      return !bar?.directions?.length&&!bar?.voice2?.length&&(!bar?.events.length||
        (bar.events.length===1&&bar.events[0].type==='rest'&&C.usedTicks(bar)===cap));
    })){
      const next=C.removeMeasure(score,mi),target=Math.min(mi,next.measures.length-1);
      commit(next,'空小節を削除',null,target,{mi:target,index:0});
      return;
    }
    deleteSelected(true,true);
  }
  function download(content,filename,type) {
    const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function baseName(){return (score.title||'kanade').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,80);}
  function save() {
    // Commit a pending title, lyric or setting before serializing the score.
    document.activeElement?.blur();
    download(JSON.stringify(window.KanadeCollab?.sharedScore||documentScore(),null,2)+'\n',baseName()+'.kanade.json','application/json;charset=utf-8');showToast('プロジェクトを保存しました');
  }
  let exportingAudio=false;
  async function exportAudio(kind){
    if(exportingAudio){showToast('音声を書き出し中です');return;}
    exportingAudio=true;
    const name=baseName(),parts=engravingParts(),mix=transport.exportMix();
    try{
      const blob=await window.KanadeAudioExport.render(parts,mix,kind,message=>showToast(message));
      download(blob,name+'.'+kind,blob.type);
      showToast(kind.toUpperCase()+'を書き出しました');
    }catch(error){showToast(error.message||'音声を書き出せませんでした',true);}
    finally{exportingAudio=false;}
  }
  function exportAs(kind) {
    attempt(()=>{
      document.activeElement?.blur();
      $('exportMenu').classList.add('hidden');$('exportBtn').setAttribute('aria-expanded','false');
      if(kind==='wav'||kind==='mp3'){exportAudio(kind);return;}
      if(kind==='midi') download(window.KanadeMIDIExport.encode(engravingParts()),baseName()+'.mid','audio/midi');
      else if(kind==='musicxml') download(Ex.musicXMLScore(engravingParts()),baseName()+'.musicxml','application/vnd.recordare.musicxml+xml;charset=utf-8');
      else if(kind==='svg'){
        if(window.KanadeVerovio?.isEnabled()){
          window.KanadeVerovio.exportMarkup(engravingParts()).then(result=>{
            download(result.svgs.join(''),baseName()+'.svg','image/svg+xml;charset=utf-8');
            showToast(`刻譜SVGを書き出しました（${result.ms}ms）`);
          }).catch(error=>showToast(error.message||'刻譜を書き出せませんでした',true));
          return;
        }
        download(R.engrave(engravingParts(),{edition:editionDocument().publication})[0],baseName()+'.svg','image/svg+xml;charset=utf-8');
      }
      else if(kind==='ksl') download(Ex.ksl(score),baseName()+'.ksl','text/plain;charset=utf-8');
      else if(kind==='print') {openPrintPreview();return;}
      else if(kind==='pdf') {printPdf();return;}
      showToast('書き出しました：'+kind);
    });
  }
  let pendingImport=null,fileRead=0;
  function loadImportedScore(imported){
    const errors=C.validateScore(imported);if(errors.length)throw Error(errors[0]);
    undo.length=0;redo.length=0;stopAudio();selectionRange=null;rangeAnchor=null;
    loadScore(imported);selected=null;activeMeasure=0;caret={mi:0,index:0};persist();render();
    showToast('楽譜を読み込みました');
  }
  function showImport({score:imported,warnings}){
    pendingImport=imported;
    $('scoreImportSummary').textContent=`${imported.title} · ${C.scoreParts(imported).length}パート · ${imported.measures.length}小節`;
    const list=$('scoreImportWarnings');
    list.replaceChildren(...warnings.map(message=>{
      const item=document.createElement('li');item.textContent=message;return item;
    }));
    list.hidden=!warnings.length;
    $('scoreImportDialog').showModal();
  }
  async function openFile(file) {
    if(window.KanadeCollab?.active){showToast('別の楽譜を開く前に共同編集から退出してください');return;}
    if(!file)return;
    const request=++fileRead,compressed=/\.mxl$/i.test(file.name),musicxml=compressed||/\.(?:musicxml|xml)$/i.test(file.name);
    try{
      const limit=musicxml?window.KanadeMusicXMLContainer.MAX_BYTES:5*1024*1024;
      if(file.size>limit)throw Error('ファイルの上限は'+(limit/1024/1024)+' MBです');
      const contents=compressed?await window.KanadeMusicXMLContainer.unpack(await file.arrayBuffer()):await file.text();
      if(request!==fileRead)return;
      if(window.KanadeCollab?.active)throw Error('別の楽譜を開く前に共同編集から退出してください');
      if(musicxml||contents.trimStart().startsWith('<'))showImport(window.KanadeMusicXMLImport.parse(contents));
      else loadImportedScore(JSON.parse(contents));
    }catch(error){if(request===fileRead)showToast(error.message,true);}
  }
  function setupFileTools(){
    const importer=$('scoreImportDialog');
    importer.addEventListener('close',()=>{pendingImport=null;});
    $('scoreImportSave').onclick=save;
    $('scoreImportApply').onclick=()=>attempt(()=>{
      if(!pendingImport)return;
      if(window.KanadeCollab?.active)throw Error('別の楽譜を開く前に共同編集から退出してください');
      loadImportedScore(pendingImport);importer.close();
    });
    const dialog=$('mediaDialog'),picker=$('mediaFile'),video=$('mediaVideo'),audio=$('mediaAudio');
    let player=null,url=null;
    $('mediaOpen').onclick=()=>{if(!dialog.open)dialog.show();};
    $('mediaClose').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>player?.pause());
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape')dialog.close();event.stopPropagation();});
    picker.onchange=()=>{
      const file=picker.files[0];picker.value='';
      if(!file)return;
      if(player){player.pause();player.removeAttribute('src');player.load();player.hidden=true;}
      if(url)URL.revokeObjectURL(url);
      player=file.type.startsWith('audio/')||/\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(file.name)?audio:video;
      url=URL.createObjectURL(file);player.src=url;player.hidden=false;
      $('mediaFeedback').textContent=file.name;
    };
    for(const element of [video,audio])element.addEventListener('error',()=>{
      if(element===player&&element.getAttribute('src'))$('mediaFeedback').textContent='この形式を再生できません。動画はMP4、音声はMP3またはWAVでお試しください。';
    });
  }
  function noteStep(id,by) {
    if(selectionRange){attempt(()=>commitBatch(B.transpose(score,selectedIds(true),by),'範囲を移調'));return;}
    const found=getSelected();if(!found||found.event.type!=='note')return;
    attempt(()=>{
      const next=C.changeEvent(score,id,e=>{
        e.pitches=C.normalizeChord(e.pitches.map(p=>{
          const dn=C.diatonicNumber(p)+by;
          return {...p,step:C.STEPS[((dn%7)+7)%7],octave:Math.floor(dn/7)-1};
        }));return e;
      });
      commit(next,Math.abs(by)===7?'オクターブを変更':'音高を変更');
      const p=getSelected().event.pitches[0];previewStep=p.step;setOctave(p.octave);
    });
  }
  function clearPlaybackMarks(){
    if(playbackPaint)for(const {line,dot} of playbackPaint.tracks){line.remove();dot.remove();}
    playbackPaint=null;
  }
  function clearPlaybackProgress(){
    arrangementUI?.progress(null);clearPlaybackMarks();
    if(playbackDisplay!==null){playbackDisplay=null;render();}
  }
  function playbackProgress({measure,tick},{follow}){
    if(!$('arrangement').hidden){arrangementUI?.progress({measure,tick});return;}
    const overview=!$('scoreOverview').hidden,host=overview?$('overviewScore'):$('scoreHost');
    if(!overview&&mobile.matches&&follow&&playbackDisplay!==measure&&score.measures[measure]){
      playbackDisplay=measure;render();
    }
    if(!playbackPaint||playbackPaint.host!==host||playbackPaint.measure!==measure||
      !playbackPaint.tracks[0]?.line.isConnected){
      clearPlaybackMarks();
      const namespace='http://www.w3.org/2000/svg';
      const groups=[...host.querySelectorAll(`[data-render-measure="${measure}"][data-playback-grid]`)];
      if(!groups.length)return;
      const tracks=groups.map(group=>{
        const top=Number(group.dataset.playbackTop);
        const line=document.createElementNS(namespace,'line'),dot=document.createElementNS(namespace,'circle');
        line.setAttribute('class','playback-line');line.setAttribute('y1',top-12);line.setAttribute('y2',top+60);
        dot.setAttribute('class','playback-point');dot.setAttribute('r','3.5');dot.setAttribute('cy',top-12);
        group.append(line,dot);
        return {line,dot,grid:group.dataset.playbackGrid.split(',').map(pair=>pair.split(':').map(Number)),group};
      });
      playbackPaint={host,measure,tracks};
      if(follow){
        const container=overview?host:$('scoreScroll');
        const group=tracks.find(({group})=>group.closest('[data-engraved-part]')?.dataset.engravedPart===host.dataset.selectedPart)?.group||tracks[0].group;
        revealScoreCell(container,group,12,true);
      }
    }
    for(const {line,dot,grid} of playbackPaint.tracks){
      let index=grid.findIndex(([position])=>position>tick);if(index<0)index=grid.length-1;
      const [b,x2]=grid[index],[a,x1]=grid[Math.max(0,index-1)];
      const x=a===b?x1:x1+(x2-x1)*Math.max(0,Math.min(1,(tick-a)/(b-a)));
      line.setAttribute('x1',x);line.setAttribute('x2',x);dot.setAttribute('cx',x);
    }
  }
  function stopAudio(){if(transport)transport.stop();else sound.stop();}
  function stopAudioForEdit(){if(!transport?.isLoop())stopAudio();}
  function play(){transport.toggle(!$('scoreOverview').hidden);}
  function setupTransport(){
    transport=window.KanadeTransport.setup({
      sound,document:editionDocument,parts:engravingParts,partId:()=>score.id,
      selection:()=>selectionRange,beatLength:mi=>C.WHOLE/C.timeAt(score,mi).den,
      cursor:()=>({mi:caret.mi,tick:C.eventSpans(score,caret.mi)[caret.index]?.start??0}),
      progress:playbackProgress,clearProgress:clearPlaybackProgress,
      beforePlay:()=>{if(performancePanel.isRecording())throw Error('入力録音を停止してから再生してください');},
      error:message=>showToast(message,true),openSource:()=>window.KanadeWorkspace.openPanel('soundSettings'),
      state:({playing,paused})=>{
        const text=playing?'❚❚ <span>一時停止</span>':paused?'▶ <span>再開</span>':'▶ <span>再生</span>';
        const button=$('playBtn'),mobilePlay=$('mobilePlay');
        if(button.innerHTML!==text)button.innerHTML=text;
        const label=playing?'一時停止':paused?'再開':'再生';
        mobilePlay.textContent=playing?'❚❚':'▶';
        mobilePlay.setAttribute('aria-label',label);
        for(const node of [button,mobilePlay])node.setAttribute('aria-pressed',String(playing));
      }
    });
  }
  function applyArrangedScore(next,label,mi){
    if(window.KanadeCollab?.sharedScore?.bassPart)throw Error('旧形式の共同編集ルームは、楽譜を保存して開き直すとタイムラインで編集できます');
    if(window.KanadeCollab?.active&&editionDocument().id!==documentScore().id)
      throw Error('楽譜の同期を確認してから編集してください');
    const part=C.scoreParts(next)[partIndex];
    commit({...part},label,null,mi,{mi,index:0},null,{document:next});
  }
  function setupArrangement(){
    arrangementUI=window.KanadeArrangementUI.setup({
      document:editionDocument,name:instrumentDisplay,
      canUndo:()=>window.KanadeCollab?.active?window.KanadeCollab.canUndo():!!undo.length,
      undo:undoAction,
      stop:stopAudio,leave:stopAudioForEdit,play:(parts,loop)=>{stopAudio();return sound.play(parts,{loop});},
      sessionLaunch:(changes,options)=>{
        if(!sound.sessionPlayer)stopAudio();
        return sound.launchClips(changes,options);
      },
      loop:(first,last)=>transport.loopMeasures(first,last),
      measureCopied:()=>{preferMeasureClipboard=true;},
      noteClipboard:fragment=>{
        if(fragment){clipboard=fragment;preferMeasureClipboard=false;render();}
        return clipboard;
      },
      rollApply:(index,part,label,mi)=>{
        const doc=editionDocument();
        const next=doc.ensembleParts?C.replaceScorePart(doc,index,part):
          index===0?{...doc,measures:part.measures,...(part.meterTail?{meterTail:part.meterTail}:{})}:
          {...doc,measures:[...doc.measures,...part.measures.slice(doc.measures.length).map(bar=>({id:C.uid(),time:bar.time,events:[]}))],bassPart:part,
            ...(part.meterTail?{meterTail:part.meterTail}:{})};
        applyArrangedScore(next,label,mi);
      },
      rollAudition:(index,midi,clip)=>{
        if(sound.playing)return;
        const part=clip||A.parts(editionDocument())[index];
        sound.audition([P.fromMidi(midi,part.key)],C.soundName(part),C.soundingOffset(part)).catch(e=>showToast(e.message,true));
      },
      rollPlay:({part,measure,tick})=>transport.playAt(measure,tick,A.parts(editionDocument())[part].id),
      enter:()=>{
        if(performancePanel.isRecording()){showToast('録音を停止してからタイムラインを開いてください',true);return null;}
        performancePanel.hide();
        if(!$('scoreOverview').hidden)closeOverview();
        if(rangeDirection){showToast('範囲記号の編集を終えてからタイムラインを開いてください',true);return null;}
        const position={part:partIndex,measure:caret.mi,tick:C.eventSpans(score,caret.mi)[caret.index]?.start??0,
          midi:getSelected()?.event.pitches[0]?C.pitchMidi(getSelected().event.pitches[0]):60,voice:voiceScope?2:1};
        if(voiceScope){endVoiceScope();focusEntry(caret.mi,0);}
        stopAudioForEdit();
        return position;
      },
      apply:applyArrangedScore,
      openScore:(part,mi,tick=0,voice=1)=>{
        const selectedMeasure=Math.min(mi,score.measures.length-1);
        if(ensemble&&part!==partIndex)switchPart(part,selectedMeasure);
        if(voice===2)setVoiceScope(selectedMeasure);
        const spans=C.eventSpans(score,selectedMeasure);
        const index=spans.findIndex(span=>span.end>tick);
        focusEntry(selectedMeasure,Math.max(0,index),false,true);
        focusScore();
      }
    });
  }
  function performanceTarget(){
    const overwrite=isOverwriteEntry(),{mi,tick}=mobileDraft||inputCursor(overwrite,true);
    return {score,mi,tick,overwrite,voice:voiceScope?.mi??null,offset:C.soundingOffset(score)};
  }
  function checkPerformanceInput(){
    if(!$('scoreOverview').hidden)throw Error('パート譜に戻って入力してください');
    if(rangeDirection||selectionRange||mobileChord)throw Error('範囲・和音の編集を終えてから入力してください');
    if(document.querySelector('dialog[open]'))throw Error('開いているダイアログを閉じてください');
  }
  function chordContextForAssist(){
    const Pop=window.KanadePopProgression;
    if(!Pop)return {prev:['I'],fifths:score.key||0,mode:'major'};
    const bar=score.measures[caret.mi];
    const tick=C.eventSpans(score,caret.mi)[caret.index]?.start??0;
    const marks=(bar?.directions||[]).filter(mark=>mark.key==='chordSymbol').sort((a,b)=>a.tick-b.tick);
    const symbols=marks.filter(mark=>mark.tick<=tick).slice(-2).map(mark=>mark.text);
    const mode=(score.key||0)<0?'minor':'major';
    const prev=symbols.map(text=>Pop.symbolToRoman(text,score.key||0,mode)).filter(Boolean);
    return {prev:prev.length?prev:['I'],fifths:score.key||0,mode};
  }
  function setupPopProgression(){
    if(!window.KanadePopProgressionUI)return;
    popProgressionUI=window.KanadePopProgressionUI.setup({
      partCount:()=>C.scoreParts(documentScore()).length,
      measureCount:()=>score.measures.length,
      concertKey:()=>window.KanadeAgent.keyLabel(score.key),
      commit:args=>{
        checkPerformanceInput();
        const out=window.KanadePopProgression.applyDocument(documentScore(),{...args,mode:(score.key||0)<0?'minor':'major'});
        commit(out.document,out.summary,selected,activeMeasure,{...caret},selectionRange,{document:out.document,focusPart:out.focusPart});
      }
    });
  }
  function openPopProgression(){
    setupPopProgression();
    const ui=popProgressionUI;
    if(!ui)return;
    ui.refresh?.();
    ui.open();
  }
  function setupChordComposer(){
    if(!window.KanadeChordComposerUI)return;
    chordComposerUI=window.KanadeChordComposerUI.setup({
      keyLabel:()=>window.KanadeAgent.keyLabel(score.key),
      partCount:()=>C.scoreParts(documentScore()).length,
      fifths:()=>score.key||0,
      mode:()=>(score.key||0)<0?'minor':'major',
      previewChord:symbol=>{
        try{
          stopAudio();
          sound.audition(P.chordPitches(symbol,4),C.soundName(score),C.soundingOffset(score)).catch(()=>{});
        }catch(_){}
      },
      commit:args=>{
        checkPerformanceInput();
        const out=window.KanadeChordComposer.applyTimelineDocument(documentScore(),{...args,mode:(score.key||0)<0?'minor':'major'});
        commit(out.document,out.summary,selected,activeMeasure,{...caret},selectionRange,{document:out.document,focusPart:out.focusPart});
      }
    });
  }
  function openChordComposer(){
    setupChordComposer();
    const ui=chordComposerUI;
    if(!ui)return;
    ui.refreshParts?.();
    ui.open();
  }
  function setupPerformance(){
    performancePanel=window.KanadePerformancePanel.setup({
      chordAssistEnabled:()=>chordAssistEnabled,
      chordContext:chordContextForAssist,
      focus:focusScore,
      target:performanceTarget,
      ready:()=>sound.ready(),
      monitor:midi=>{
        try{sound.audition([P.fromMidi(midi,score.key)],C.soundName(score),0).catch(()=>{});}catch(_){}
      },
      matches:(target,checkPosition)=>{
        const current=performanceTarget();
        return target.score===current.score&&target.voice===current.voice&&
          (!checkPosition||target.mi===current.mi&&target.tick===current.tick);
      },
      insert:(pitches,label)=>{
        checkPerformanceInput();
        const {mi,tick,overwrite}=performanceTarget(),event=C.makeNote(pitches[0],den,dots);
        event.pitches=C.normalizeChord(pitches);
        previewStep=pitches[0].step;octave=pitches[0].octave;
        if(tupletEnabled){writeInlineTuplet(event,{mi,tick});return;}
        commitInput(C.placeAcrossBars(score,mi,tick,event,{overwrite}),label);
      },
      symbol:text=>{
        checkPerformanceInput();
        if(voiceScope)throw Error('コード名は第1声部で記譜してください');
        const {mi,index}=caret,tick=C.eventSpans(score,mi)[index]?.start??0;
        const bar=score.measures[mi];
        if(bar.directions?.some(mark=>mark.key==='chordSymbol'&&mark.tick===tick&&mark.text===text))return;
        const next=C.changeDirections(score,mi,marks=>[
          ...marks.filter(mark=>mark.key!=='chordSymbol'||mark.tick!==tick),{key:'chordSymbol',tick,text}
        ]);
        commit(next,'コード名を記譜',selected,mi,{...caret});
      },
      record:(target,groups)=>{
        checkPerformanceInput();
        const origin=C.measureOffsets(score)[target.mi]+target.tick;
        const result=P.writeTake(score,origin,groups,{
          overwrite:target.overwrite,limitMeasure:target.voice,offset:target.offset
        });
        if(result)commitInput(result,'リアルタイム演奏を入力');
      },
      check:checkPerformanceInput
    });
  }
  function setupEvents() {
    setupFileTools();
    $('voiceToggle').onclick=toggleVoiceScope;
    $('instrumentLanguage').value=instrumentLanguage;
    $('instrumentLanguage').onchange=event=>{
      instrumentLanguage=event.target.value;overviewDocument=null;
      try{localStorage.setItem('kanade.instrumentLanguage',instrumentLanguage);}catch(_){}
      render();
    };
    $('chordComposerOpen')?.addEventListener('click',()=>attempt(openChordComposer));
    $('popProgressionOpen')?.addEventListener('click',()=>attempt(openPopProgression));
    const chordAssist=$('chordAssistToggle');
    if(chordAssist){
      chordAssist.checked=chordAssistEnabled;
      chordAssist.addEventListener('change',()=>{
        chordAssistEnabled=chordAssist.checked;
        try{localStorage.setItem('kanade.chordAssist.v1',chordAssistEnabled?'on':'off');}catch(_){}
      });
    }
    for(const [id,icon] of Object.entries({commandBtn:'search',newBtn:'new',openBtn:'open',saveBtn:'save',selectMeasure:'select',copySelection:'copy',cutSelection:'cut',pasteSelection:'paste',insertMeasureBefore:'insert',duplicateMeasures:'duplicate',removeMeasure:'trash'})){
      const node=$(id);if(id==='saveBtn')node.querySelector('[aria-hidden]')?.remove();node.insertAdjacentHTML('afterbegin',window.KanadeIcons.svg(icon));
    }
    $('stopBtn').setAttribute('aria-label','停止');
    const soundNames=new Set([...Object.keys(S.presets),...Object.keys(window.KanadeAudio.localSounds),
      ...window.KanadePercussion.presets.map(kit=>kit.name),...instrumentCatalog.map(item=>item.sound)]);
    $('instrument').replaceChildren(new Option('その他','その他'),...Array.from(soundNames,name=>new Option(name,name)));
    $('transposition').innerHTML=Object.entries(C.TRANSPOSITIONS).map(([key,t])=>`<option value="${key}">${t.label}</option>`).join('');
    $('soundPreview').innerHTML=window.KanadeIcons.svg('speaker')+'音色を試聴';
    $('soundPreview').onclick=()=>{stopAudio();sound.audition(getSelected()?.event.type==='note'?getSelected().event.pitches:[{step:'C',octave:4,alter:0}],C.soundName(score),C.soundingOffset(score)).catch(e=>showToast(e.message,true));};
    $('percussionPads').onclick=e=>{const pad=e.target.closest('[data-drum-step]');if(!pad)return;setOctave(4);alter='0';chordMode=false;insert('note',pad.dataset.drumStep);};
    $('copySelection').onclick=()=>attempt(()=>copySelection());
    $('cutSelection').onclick=()=>attempt(()=>copySelection(true));
    $('pasteSelection').onclick=()=>attempt(pasteSelection);
    $('selectMeasure').onclick=selectMeasure;
    $('selectSingle').onclick=selectSingle;
    $('selectToStart').onclick=()=>selectToEdge(false);
    $('selectToEnd').onclick=()=>selectToEdge(true);
    $('insertMeasureBefore').onclick=()=>attempt(insertMeasureBefore);
    $('duplicateMeasures').onclick=()=>attempt(duplicateMeasures);
    $('commandBtn').onclick=toggleCommands;
    $('commandClose').onclick=()=>closeCommands();
    for(const name of Object.keys(commandGroups)){
      const button=document.createElement('button');button.type='button';button.textContent=name;
      button.onclick=()=>{commandCategory=name;$('commandSearch').value='';commandIndex=0;renderCommands();};
      $('commandCategories').append(button);
    }
    document.addEventListener('pointerdown',e=>{
      if(!mobile.matches&&$('commandPalette').open&&!e.target.closest('#commandPalette,#commandBtn,#overviewCommands'))closeCommands(false);
    });
    $('deleteNoteMenu').onclick=()=>attempt(()=>deleteSelected());
    $('symbolSearch').oninput=renderSymbols;
    $('symbolCustom').onsubmit=e=>{
      e.preventDefault();const input=$('symbolCustomText'),text=input.value.trim();if(!text)return;
      attempt(()=>toggleDirection('custom',text));input.value='';renderSymbols();
    };
    $('commandSearch').oninput=()=>{commandIndex=0;renderCommands();};
    $('commandPalette').addEventListener('keydown',e=>{
      if(e.isComposing||e.keyCode===229){e.stopPropagation();return;}
      if((e.key==='ArrowUp'||e.key==='ArrowDown')&&e.target===$('commandSearch')){
        e.preventDefault();commandIndex=Math.max(0,Math.min(commandMatches.length-1,commandIndex+(e.key==='ArrowDown'?1:-1)));updateCommandSelection(true);
      }else if(e.key==='Enter'&&e.target===$('commandSearch')){e.preventDefault();runCommand(commandIndex);}
      else if(e.key==='Escape'||((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='k')){e.preventDefault();closeCommands();}
      e.stopPropagation();
    });
    $('durations').addEventListener('click',e=>{
      const button=e.target.closest('button[data-den]');
      if(button){selectDuration(Number(button.dataset.den));focusScore();}
    });
    $('dotBtn').addEventListener('click',()=>attempt(()=>cycleDots(isEntryMode()&&!selectionRange)));
    $('accidentals').addEventListener('click',e=>{const b=e.target.closest('button[data-alter]');if(b)setAlter(b.dataset.alter);});
    $('pitchButtons').addEventListener('click',e=>{const b=e.target.closest('button[data-step]');if(b)insert('note',b.dataset.step);});
    $('octUp').onclick=()=>setOctave(octave+1);$('octDown').onclick=()=>setOctave(octave-1);
    $('restBtn').onclick=()=>insert('rest');$('chordBtn').onclick=()=>{chordMode=!chordMode;renderTools();};
    setupMobile();setupScoreContext();setupTuplet();setupDesktopEdit();setupPitchDrag();
    for(const button of document.querySelectorAll('[data-verovio-toggle]'))button.onclick=toggleVerovio;
    $('scoreHost').addEventListener('kanade-engraved',()=>{updateGhost();revealCaret();});
    $('tupletBtn').onclick=()=>attempt(toggleTuplet);
    $('tupletSettingsBtn').onclick=openTupletSettings;
    $('tieBtn').onclick=()=>attempt(toggleSelectedTie);
    $('overwriteMode').checked=overwriteMode;
    $('overwriteMode').onchange=event=>{
      overwriteMode=event.target.checked;lastEnteredId=null;
      try{localStorage.setItem(OVERWRITE_STORAGE,overwriteMode?'1':'0');}catch(e){console.warn('Input settings are unavailable',e);}
      renderTools();updateGhost();refreshOverviewControls();
    };
    $('entryModeBtn').onclick=()=>{setMode('entry');focusScore();};
    $('selectModeBtn').onclick=()=>setMode('select');
    for(const host of [$('scoreScroll'),$('overviewScore')]){
      host.addEventListener('pointerdown',stopScoreScroll,{capture:true});
      host.addEventListener('wheel',stopScoreScroll,{passive:true,capture:true});
    }
    reducedMotion.addEventListener('change',()=>{
      if(!reducedMotion.matches)return;
      scoreTransition?.cancel();
      if(scoreScrollFrame)revealCaret();
    });
    window.addEventListener('blur',stopScoreScroll);
    $('scoreScroll').addEventListener('kanade-viewchange',()=>{stopScoreScroll();lastPointer=null;updateGhost();});
    $('scoreHost').addEventListener('pointermove',e=>{
      if($('scoreHost').classList.contains('pitch-dragging'))return;
      if(window.KanadeViewport?.gesturing){lastPointer=null;updateGhost();return;}
      lastPointer=pointerPosition(e);updateGhost();
    });
    $('scoreHost').addEventListener('pointerleave',()=>{
      lastPointer=null;pointerOctaveShift=0;updateGhost();
    });
    $('scoreHost').addEventListener('click',e=>{
      if(rangeDirectionHit(e.target))return;
      const event=e.target.closest('[data-event-index]');
      const measure=e.target.closest('[data-measure]');
      if(!measure)return;
      const mi=Number(measure.dataset.measure);
      if(rangeDirection){if(event)attempt(()=>finishRangeDirection(mi,Number(event.dataset.eventIndex)));return;}
      if(voiceScope&&mi!==voiceScope.mi){
        focusEntry(mi,Number(event?.dataset.eventIndex||0),false);return;
      }
      if(mobile.matches&&mobileChord){
        const hit=inputPosition(pointerPosition(e));
        if(hit){
          const {step,octave}=hit;
          const alterValue=alter==='auto'?C.keyAlter(step,score.key):Number(alter);
          attempt(()=>editMobileChordPitch({step,octave,alter:alterValue},{add:mobileChord.adding}));
        }
        return;
      }
      const filling=!!nextTupletSlot();
      if(!filling&&(event?.hasAttribute('data-tuplet-slot')||(mobile.matches&&event&&event.dataset.implicit==='0'&&!chordMode))){
        focusEntry(mi,Number(event.dataset.eventIndex),e.shiftKey);return;
      }
      const point=inputPosition(pointerPosition(e));
      if(editMode==='entry'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&point) {
        if(!filling&&!overwriteMode&&event&&event.dataset.implicit==='0'&&event.dataset.eventType==='note') {
          focusEntry(mi,Number(event.dataset.eventIndex));return;
        }
        if(mobile.matches&&!chordMode){
          mobileDraft={mi:point.mi,tick:point.tick,step:point.step,octave:point.octave};
          selectionRange=null;rangeAnchor=null;selected=null;lastEnteredId=null;pendingTieId=null;
          const spans=C.eventSpans(score,point.mi);
          caret={mi:point.mi,index:spans.findIndex(span=>span.end>mobileDraft.tick)};activeMeasure=point.mi;
          render();
        }else placeNoteAt(point);
        return;
      }
      if(event)focusEntry(mi,Number(event.dataset.eventIndex),e.shiftKey);
      else {selectionRange=null;rangeAnchor=null;caret={mi,index:0};selected=null;activeMeasure=mi;render();}
    });
    $('rangeDirectionCancel').onclick=()=>{rangeDirection=null;render();};
    $('rangeDirectionApply').onclick=()=>attempt(()=>finishRangeDirection(caret.mi,caret.index));
    $('rangeDirectionRemove').onclick=()=>attempt(()=>{
      const draft=rangeDirection;
      if(!draft?.existing||score.id!==draft.part||score.measures[draft.mi]?.id!==draft.barId)return;
      const next=C.changeDirections(score,draft.mi,marks=>marks.filter(mark=>mark.key!==draft.key||mark.tick!==draft.tick));
      commitBatch(next,symbols.byKey[draft.key].label+'を外す');
      rangeDirection=null;render();
    });
    $('addMeasure').onclick=()=>attempt(()=>{const next=C.addMeasure(score);commit(next,'小節を追加',null,next.measures.length-1);});
    $('removeMeasure').onclick=()=>attempt(removeSelectedMeasures);
    $('undoBtn').onclick=undoAction;$('redoBtn').onclick=redoAction;
    $('newBtn').onclick=()=>{if(!window.confirm('新しい楽譜を作りますか？ 現在の楽譜は先に保存してください。'))return;undo.length=0;redo.length=0;stopAudio();selectionRange=null;rangeAnchor=null;loadScore(C.createScore());selected=null;activeMeasure=0;caret={mi:0,index:0};persist();render();showToast('新しい楽譜を作成しました');};
    $('demoBtn').onclick=()=>attempt(()=>{
      if(!window.confirm('サンプル譜を表示しますか？ 現在の楽譜は先に保存してください。'))return;
      let demo=C.withSettings(C.createScore(),{title:'Kanade サンプル',composer:'Kanade',tempo:112});
      const notes=[['C',4],['D',4],['E',4],['F',4],['G',4],['A',4],['B',4],['C',5]];
      for(const [st,oct] of notes) {
        const mi=demo.measures.length-1;
        const result=C.insertEvent(demo,mi,demo.measures[mi].events.length,C.makeNote({step:st,alter:0,octave:oct},4));demo=result.score;
      }
      undo.length=0;redo.length=0;stopAudio();selectionRange=null;rangeAnchor=null;loadScore(demo);selected=null;activeMeasure=0;caret={mi:0,index:0};persist();render();showToast('サンプル譜を表示しました');
    });
    $('saveBtn').onclick=save;$('openBtn').onclick=()=>$('importFile').click();
    $('importFile').onchange=e=>{openFile(e.target.files?.[0]);e.target.value='';};
    $('exportBtn').onclick=()=>{const menu=$('exportMenu');menu.classList.toggle('hidden');$('exportBtn').setAttribute('aria-expanded',String(!menu.classList.contains('hidden')));};
    $('exportMenu').onclick=e=>{const b=e.target.closest('[data-export]');if(b)exportAs(b.dataset.export);};
    document.addEventListener('click',e=>{if(!e.target.closest('.menuwrap')){$('exportMenu').classList.add('hidden');$('exportBtn').setAttribute('aria-expanded','false');}});
    $('titleInput').addEventListener('change',e=>attempt(()=>commit(C.withSettings(score,{title:e.target.value}),'曲名を変更')));
    $('composerInput').addEventListener('change',e=>attempt(()=>commit(C.withSettings(score,{composer:e.target.value}),'作曲者を変更')));
    $('partName').addEventListener('change',e=>attempt(()=>commit(C.withSettings(score,{instrument:e.target.value,instrumentKey:lookupInstrument(score)?.key,customInstrumentName:true,sound:C.soundName(score)}),'パート名を変更')));
    $('instrument').addEventListener('change',e=>attempt(()=>commit(C.withSettings(score,{sound:e.target.value}),'再生音源を変更')));
    $('staffLines').addEventListener('change',e=>attempt(()=>commit(C.withSettings(score,{staffLines:Number(e.target.value)}),'譜線数を変更')));
    $('transposition').addEventListener('change',e=>attempt(()=>commit(C.withSettings(score,{transposition:e.target.value}),'記譜と実音の移調を変更')));
    $('notehead').addEventListener('change',e=>attempt(()=>commit(C.withSettings(score,{notehead:e.target.value}),'符頭を変更')));
    setupMeter();setupMeasureJump();
    $('keySelect').addEventListener('change',e=>attempt(()=>commit(C.withSettings(score,{key:Number(e.target.value)}),'調号を変更')));
    $('clefSelect').addEventListener('change',e=>attempt(()=>commit(C.withSettings(score,{clef:e.target.value}),'音部記号を変更')));
    $('tempoInput').addEventListener('change',e=>attempt(()=>commit(C.withSettings(score,{tempo:Number(e.target.value)}),'テンポを変更')));
    $('playBtn').onclick=play;$('stopBtn').onclick=stopAudio;
    document.addEventListener('keydown',e=>{
      const target=e.target;
      const editing=['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable;
      const inAgent=!!target.closest?.('#agentPanel');
      if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='j'&&!e.repeat&&!e.isComposing){
        e.preventDefault();window.KanadeAgentUI?.toggle();return;
      }
      if(inAgent){
        if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='s'){e.preventDefault();save();return;}
        if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='k'){e.preventDefault();toggleCommands();return;}
        return;
      }
      if(!$('arrangement').hidden){
        if(!editing&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}
        return;
      }
      if($('measureJumpDialog').open||target.closest('#measureJumpDialog')||$('meterDialog').open||$('tupletDialog').open||target.closest('#scoreContextMenu')||e.isComposing||e.keyCode===229||$('printPreviewDialog').open||$('publicationDialog').open)return;
      if(rangeDirection&&!editing&&!e.ctrlKey&&!e.altKey&&!e.metaKey){
        if(e.key==='Escape'){e.preventDefault();$('rangeDirectionCancel').click();return;}
        if(e.key==='Enter'&&target.tagName!=='BUTTON'){e.preventDefault();attempt(()=>finishRangeDirection(caret.mi,caret.index));return;}
        if(!['ArrowLeft','ArrowRight','Home','End','Enter',' ','Tab'].includes(e.key)){e.preventDefault();return;}
      }
      if(!$('scoreOverview').hidden){
        if($('overviewTargets').open||$('publicationDialog').open)return;
        if(e.key==='Escape'&&!$('commandPalette').open){e.preventDefault();closeOverview();return;}
        if(target.tagName==='BUTTON'&&(e.key==='Enter'||e.key===' '))return;
        if(!editing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&['n','v'].includes(e.key.toLowerCase())){
          e.preventDefault();$(e.key.toLowerCase()==='n'?'overviewEntry':'overviewSelect').click();return;
        }
      }
      if((e.ctrlKey||e.metaKey)&&!e.altKey) {
        if(e.key.toLowerCase()==='k'){e.preventDefault();toggleCommands();return;}
        if(!editing&&['a','c','x','v'].includes(e.key.toLowerCase())){
          e.preventDefault();attempt(()=>{const key=e.key.toLowerCase();if(key==='a')selectAll();else if(key==='v')pasteSelection();else copySelection(key==='x');});return;
        }
        if(editing&&['z','y'].includes(e.key.toLowerCase()))return;
        if(!editing&&['ArrowLeft','ArrowRight','Home','End','Enter'].includes(e.key)) {
          e.preventDefault();attempt(()=>{
            if(e.key==='Enter')addPitch();
            else if(e.key==='Home')focusEntry(0,0,e.shiftKey);
            else if(e.key==='End'){const mi=score.measures.length-1;focusEntry(mi,C.eventSpans(score,mi).length-1,e.shiftKey);}
            else moveMeasure(e.key==='ArrowRight'?1:-1,e.shiftKey);
          });return;
        }
        if(e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redoAction():undoAction();return;}
        if(e.key.toLowerCase()==='y'){e.preventDefault();redoAction();return;}
        if(e.key.toLowerCase()==='s'){e.preventDefault();save();return;}
        return;
      }
      if(!editing&&e.altKey&&!e.ctrlKey&&!e.metaKey) {
        if(!e.shiftKey&&e.code==='KeyG'){e.preventDefault();if(!e.repeat)openMeasureJump();return;}
        if(!e.shiftKey&&!$('scoreOverview').hidden&&['ArrowUp','ArrowDown'].includes(e.key)){
          e.preventDefault();moveOverviewPart(e.key==='ArrowUp'?-1:1);return;
        }
        if(e.key==='Enter'){e.preventDefault();insert('rest');return;}
        if(e.key.toLowerCase()==='n'){e.preventDefault();setAlter('0');return;}
      }
      if(!editing&&e.altKey&&!e.ctrlKey&&!e.metaKey&&/^[1-7]$/.test(e.key)) {
        e.preventDefault();
        const value=durationKeys[Number(e.key)];
        if(selected||selectionRange)attempt(()=>resizeSelected(()=>value,()=>0,'音価を変更'));
        else showToast('音価を変更したい音符・休符を選択してください');
        return;
      }
      if(editing||e.altKey||e.metaKey||e.ctrlKey)return;
      if(e.key==='/'||e.key==='?'){e.preventDefault();attempt(()=>toggleBeam(e.shiftKey));return;}
      if(e.key==='Home'||e.key==='End') {
        e.preventDefault();focusEntry(caret.mi,e.key==='Home'?0:C.eventSpans(score,caret.mi).length-1,e.shiftKey);return;
      }
      if(e.key.toLowerCase()==='s'){e.preventDefault();if(!e.repeat)attempt(()=>toggleDirection('slur'));return;}
      if(e.key.toLowerCase()==='t'){e.preventDefault();attempt(toggleSelectedTie);return;}
      if(e.key.toLowerCase()==='u'){e.preventDefault();if(!e.repeat)attempt(e.shiftKey?openTupletSettings:toggleTuplet);return;}
      if(e.key.toLowerCase()==='r'){e.preventDefault();if(tupletEnabled)insert('rest');else attempt(toggleSelectedRest);return;}
      if(e.key.toLowerCase()==='l'){e.preventDefault();attempt(()=>flipStem(e.shiftKey));return;}
      if(['+','=','-'].includes(e.key)||['NumpadAdd','NumpadSubtract'].includes(e.code)) {
        e.preventDefault();attempt(()=>changePitchSemitone(e.key==='-'||e.code==='NumpadSubtract'?-1:1));return;
      }
      if(e.key==='Delete'||e.key==='Backspace'){
        if(target.closest('dialog'))return;
        e.preventDefault();
        attempt(e.key==='Delete'?deleteAtCursor:()=>deleteSelected($('scoreOverview').hidden));
        return;
      }
      if(e.key==='Escape'){e.preventDefault();selectionRange=null;rangeAnchor=null;chordMode=false;render();setMode('select');return;}
      if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
        e.preventDefault();if(!e.repeat||!willAppendBar(caret.mi,caret.index))attempt(()=>moveCaret(e.key==='ArrowRight'?1:-1,e.shiftKey));return;
      }
      if(!e.shiftKey&&(e.key==='8'||e.key==='9')){
        e.preventDefault();
        noteStep(selected,e.key==='8'?-7:7);
        return;
      }
      if(e.key==='ArrowUp'||e.key==='ArrowDown'){
        e.preventDefault();
        const direction=e.key==='ArrowUp'?1:-1;
        if(tupletEnabled||e.shiftKey&&isEntryMode()&&!selectionRange){
          const pointer=lastPointer&&inputPosition(lastPointer);
          keyboardGhost=!pointer;
          if(pointer){
            pointerOctaveShift+=Math.max(0,Math.min(8,pointer.octave+direction))-pointer.octave;
            previewStep=pointer.step;
          }
          if(tupletEnabled&&!e.shiftKey){
            lastPointer=null;keyboardGhost=true;
            const pitch=(pointer?.octave??octave)+1;
            const number=Math.max(7,Math.min(69,pitch*7+C.STEPS.indexOf(previewStep)+direction));
            previewStep=C.STEPS[number%7];setOctave(Math.floor(number/7)-1);
          }else setOctave((pointer?.octave??octave)+direction);
          if(mobile.matches)renderMobile();
          const message=`入力音域 · ${octave}オクターブ`;
          $('statusText').textContent=message;
          if(!$('scoreOverview').hidden)$('overviewFeedback').textContent=message;
        }else if(selectionRange||getSelected()?.event.type==='note'){
          noteStep(selected,direction*(e.shiftKey?7:1));
        }else{
          const n=(octave+1)*7+C.STEPS.indexOf(previewStep)+direction*(e.shiftKey?7:1);
          const clipped=Math.max(7,Math.min(69,n));
          previewStep=C.STEPS[clipped%7];setOctave(Math.floor(clipped/7)-1);
        }
        return;
      }
      if(e.key==='Enter'){
        e.preventDefault();
        if(e.repeat)return;
        const ghost=!e.shiftKey&&!mobile.matches&&$('scoreOverview').hidden&&isEntryMode()&&
          !selectionRange&&$('scoreHost').classList.contains('placing')&&inputPosition(lastPointer);
        if(ghost)placeNoteAt(ghost,true);
        else insert(e.shiftKey?'rest':'note',previewStep);
        return;
      }
      if(e.key.toLowerCase()==='n'){e.preventDefault();setMode('entry');focusScore();return;}
      if(e.key.toLowerCase()==='v'){e.preventDefault();setMode('select');return;}
      if(e.key===' '){e.preventDefault();play();return;}
      const letter=e.key.toUpperCase();
      if(C.STEPS.includes(letter)&&e.key.length===1){e.preventDefault();if(e.shiftKey)attempt(()=>addPitch(letter));else insert('note',letter);return;}
      if(e.key===','||e.key==='0'){e.preventDefault();insert('rest');return;}
      if(e.key==='.'||e.key==='>') {e.preventDefault();attempt(()=>cycleDots(e.shiftKey||(isEntryMode()&&!selectionRange)));return;}
      if(/^[1-7]$/.test(e.key)) {e.preventDefault();selectDuration(durationKeys[Number(e.key)]);}
    });
  }
  function init() {
    try {const saved=localStorage.getItem(STORAGE);if(saved){const s=JSON.parse(saved);if(!C.validateScore(s).length)loadScore(s);}}catch(e){console.warn('Autosave is unavailable',e);}
    try{window.KanadeVerovio?.setEnabled(localStorage.getItem(window.KanadeVerovio.storageKey())!=='classic');}catch(e){console.warn('Renderer setting is unavailable',e);}
    syncVerovioButtons();
    if(mobile.matches){showMobileTools(true);renderMobile();}
    try{overwriteMode=localStorage.getItem(OVERWRITE_STORAGE)==='1';}catch(e){console.warn('Input settings are unavailable',e);}
    try{
      const preset=JSON.parse(localStorage.getItem(TUPLET_STORAGE));
      if(preset){
        const {actual,unit}=preset,normal=preset.normal??C.TUPLETS[actual];
        if(C.validTupletRatio(actual,normal)&&C.DENOMS.includes(unit)&&normal*4/unit<=30)tupletPreference={actual,normal,unit};
      }
    }catch(e){console.warn('Tuplet settings are unavailable',e);}
    if(['トロンボーン','ユーフォニアム'].includes(score.instrument))octave=3;
    setOctave(octave);setupPerformance();setupPopProgression();setupArrangement();setupTransport();setupEvents();setupEnsemble();render();window.__kanadeReady=true;
  }
  // Available only when the local development server injects its flag.
  // Preserve the complete editing session across source-code reloads.
  if(window.__KANADE_DEV__) window.__kanadeDev={
    capture:()=>({version:1,score:C.copy(documentScore()),partIndex,selected,activeMeasure,caret:{...caret},
      den,dots,alter,octave,chordMode,editMode,previewStep,lastEnteredId,selectionRange,rangeAnchor,clipboard:C.copy(clipboard),
      undo:C.copy(undo),redo:C.copy(redo),
      view:window.KanadeViewport?.capture(),scrollTop:$('scoreScroll').scrollTop,scrollLeft:$('scoreScroll').scrollLeft}),
    restore:s=>{
      if(s.version!==1||C.validateScore(s.score).length)throw new Error('Incompatible development snapshot');
      selectionRange=s.selectionRange||null;rangeAnchor=s.rangeAnchor||null;clipboard=s.clipboard||null;
      loadScore(s.score,s.partIndex);selected=s.selected;activeMeasure=s.activeMeasure;caret=s.caret;
      den=s.den;dots=s.dots;alter=s.alter;octave=s.octave;chordMode=s.chordMode;
      editMode=s.editMode;previewStep=s.previewStep;lastPointer=null;lastEnteredId=s.lastEnteredId||null;
      undo.splice(0,undo.length,...s.undo);redo.splice(0,redo.length,...s.redo);
      persist();render();setOctave(octave);
      if(s.view)window.KanadeViewport?.restore(s.view);
      $('scoreScroll').scrollTop=s.scrollTop;$('scoreScroll').scrollLeft=s.scrollLeft;
    }
  };
  init();
  window.KanadeSession={
    get:()=>C.copy(documentScore()),
    refreshOverview,
    getClef:()=>score.clef,
    canUndo:()=>!!undo.length,
    canRedo:()=>!!redo.length,
    subscribe:callback=>{onLocalChange=callback;},
    instrumentName:instrumentDisplay,
    position:()=>arrangementUI?.presence()||{partId:score.id,measureId:score.measures[caret.mi]?.id,index:caret.index,
      view:$('scoreOverview').hidden?'part':'overview'},
    refresh:()=>render(),
    applyRemote:(next,{keepSelection=false}={})=>{
      const errors=C.validateScore(next);if(errors.length)throw Error(errors[0]);
      const scope=voiceScope,measureId=score.measures[caret.mi]?.id,selectedId=selected;
      endVoiceScope();
      if(!keepSelection||editionDocument().id!==next.id)stopAudio();
      else if(score.id===next.id){
        const old=new Map(score.measures.map(m=>[m.id,m]));
        next={...next,measures:next.measures.map(m=>JSON.stringify(old.get(m.id))===JSON.stringify(m)?old.get(m.id):m)};
      }
      const nextParts=next.ensembleParts?C.scoreParts(next):[next];
      const currentPart=nextParts.findIndex(part=>part.id===score.id);
      const matchingMeasure=nextParts.findIndex(part=>part.measures.some(bar=>bar.id===measureId));
      const nextIndex=currentPart>=0&&nextParts[currentPart].measures.some(bar=>bar.id===measureId)?
        currentPart:matchingMeasure>=0?matchingMeasure:currentPart;
      loadScore(next,Math.max(0,nextIndex));const mi=score.measures.findIndex(m=>m.id===measureId);activeMeasure=mi<0?Math.min(caret.mi,score.measures.length-1):mi;
      if(scope&&keepSelection&&mi>=0&&score.id===scope.part.id&&
        JSON.stringify(score.measures[mi])===JSON.stringify(scope.part.measures[scope.mi])){
        setVoiceScope(mi);selected=selectedId;
      }
      caret={mi:activeMeasure,index:Math.min(caret.index,C.eventSpans(score,activeMeasure).length-1)};
      if(!keepSelection||!getSelected())selected=null;selectionRange=null;rangeAnchor=null;lastPointer=null;undo.length=0;redo.length=0;
      persist();render();transport?.edit();
    }
  };
  // AI edits use commit/save paths. applyRemote drops undo and is not an agent entry.
  if(window.KanadeAgent?.attach)window.kanadeAgent=window.KanadeAgent.attach({
    getDocument:()=>documentScore(),
    apply(next,label,focusPart){
      if(window.KanadeCollab?.active||window.KanadeCollab?.blocked)throw Error('共同編集中はAIから楽譜を変更できません。退出してから実行してください。');
      if(voiceScope)endVoiceScope();
      const errors=C.validateScore(next);if(errors.length)throw Error(errors[0]);
      const parts=C.scoreParts(next);
      partIndex=Number.isInteger(focusPart)?Math.max(0,Math.min(focusPart,parts.length-1)):Math.min(partIndex,parts.length-1);
      const part=parts[partIndex],mi=Math.min(caret.mi,part.measures.length-1);
      commit(part,label,null,mi,{mi,index:0},null,{document:next});
    },
    undoAi(count){
      if(window.KanadeCollab?.active)throw Error('共同編集中は、共同編集の元に戻すを使ってください');
      if(!Number.isInteger(count)||count<1)throw Error('取り消す件数が不正です');
      if(undo.length<count)throw Error('取り消せるAIの変更がありません');
      for(let i=0;i<count;i++)if(!String(undo[undo.length-1-i].label||'').startsWith('AI:'))throw Error('その後に手作業の編集があるため、まとめては戻せません');
      for(let i=0;i<count;i++)undoAction();
      showToast('AIの変更を取り消しました');
    },
    download(xml,filename){download(xml,filename,'application/vnd.recordare.musicxml+xml;charset=utf-8');}
  });
})();
