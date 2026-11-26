/* Lazy-loaded import hub: mobile entry, OMR review, script orchestration. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  let omrLoaded=false,depsReady=false;

  function loadScript(src){
    return new Promise((resolve,reject)=>{
      if(document.querySelector(`script[data-kanade-import="${src}"]`))return resolve();
      const node=document.createElement('script');
      node.src=src;
      node.defer=true;
      node.dataset.kanadeImport=src;
      node.onload=()=>resolve();
      node.onerror=()=>reject(Error('取り込みモジュールの読み込みに失敗しました'));
      document.head.appendChild(node);
    });
  }

  async function ensureCore(){
    if(depsReady)return;
    await Promise.all([
      loadScript('src/midi-import.js'),
      loadScript('src/import-pipeline.js'),
      loadScript('src/import-export.js')
    ]);
    depsReady=true;
  }

  async function ensureOmr(){
    await ensureCore();
    if(omrLoaded)return;
    await loadScript('src/omr-recognize.js');
    omrLoaded=true;
  }

  async function decodeImage(bytes,mime){
    if(typeof createImageBitmap==='function'&&mime){
      const bitmap=await createImageBitmap(new Blob([bytes],{type:mime}));
      const canvas=document.createElement('canvas');
      canvas.width=bitmap.width;
      canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(bitmap,0,0);
      return ctx.getImageData(0,0,canvas.width,canvas.height);
    }
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(new Blob([bytes],{type:mime||'image/jpeg'}));
      const image=new Image();
      image.onload=()=>{
        const canvas=document.createElement('canvas');
        const max=2400;
        const scale=Math.min(1,max/Math.max(image.width,image.height));
        canvas.width=Math.round(image.width*scale);
        canvas.height=Math.round(image.height*scale);
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.drawImage(image,0,0,canvas.width,canvas.height);
        URL.revokeObjectURL(url);
        resolve(ctx.getImageData(0,0,canvas.width,canvas.height));
      };
      image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('画像を開けませんでした'));};
      image.src=url;
    });
  }

  const hub={
    hooks:{openParsed:null,toast:null,attempt:null},
    lastRecognition:null,
    attach(hooks){Object.assign(hub.hooks,hooks);},
    async readScoreFile(file){
      await ensureCore();
      const parsed=await root.KanadeImportPipeline.readFile(file);
      if(parsed.kind===root.KanadeImportPipeline.kinds.image||parsed.kind===root.KanadeImportPipeline.kinds.pdf){
        return hub.readImagePayload(parsed);
      }
      return parsed;
    },
    async readImagePayload(parsed){
      await ensureOmr();
      let bytes=parsed.bytes,mime=parsed.mime||'image/jpeg';
      if(parsed.kind===root.KanadeImportPipeline.kinds.pdf){
        bytes=root.KanadeOMR.extractPdfImage(bytes);
        mime='image/jpeg';
      }
      const image=await decodeImage(bytes,mime);
      const recognition=root.KanadeOMR.recognizeRGBA(image);
      hub.lastRecognition=recognition;
      hub.openOmrReview(recognition);
      return {kind:'omr',pending:true,warnings:recognition.warnings};
    },
    openOmrReview(recognition){
      if(recognition.bitmap?.data?.length)hub.lastRecognition=recognition;
      const source=hub.lastRecognition||recognition;
      const dialog=$('scoreOmrDialog');
      const canvas=$('scoreOmrCanvas');
      const list=$('scoreOmrNotes');
      const {bitmap,notes,staff,warnings}=source;
      dialog.dataset.staff=JSON.stringify({spacing:staff.spacing,lines:staff.lines});
      canvas.width=bitmap.width;
      canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d');
      const img=ctx.createImageData(bitmap.width,bitmap.height);
      for(let i=0;i<bitmap.data.length;i++){
        const v=bitmap.data[i]?0:255;
        const o=i*4;
        img.data[o]=img.data[o+1]=img.data[o+2]=v;
        img.data[o+3]=255;
      }
      ctx.putImageData(img,0,0);
      for(const note of notes){
        ctx.strokeStyle='#e24b4b';
        ctx.lineWidth=2;
        ctx.strokeRect(note.x-4,note.y-4,8,8);
      }
      list.replaceChildren(...notes.map((note,index)=>{
        const row=document.createElement('li');
        const pitch=CeventLabel(note.pitch);
        row.innerHTML=`<label><input type="checkbox" data-omr-index="${index}" checked> ${pitch} · ${note.den}分</label>
          <button type="button" data-omr-shift="${index}" data-dir="-1">♭1</button>
          <button type="button" data-omr-shift="${index}" data-dir="1">♯1</button>`;
        return row;
      }));
      $('scoreOmrWarnings').replaceChildren(...warnings.map(message=>{
        const li=document.createElement('li');li.textContent=message;return li;
      }));
      hub.omrNotes=notes.map(note=>({...note,pitch:{...note.pitch}}));
      dialog.showModal();
    },
    reviewedScore(label){
      if(!hub.omrNotes?.length)throw Error('取り込む音符がありません');
      const selected=hub.omrNotes.filter((_,index)=>{
        const box=$('scoreOmrNotes')?.querySelector(`[data-omr-index="${index}"]`);
        return !box||box.checked;
      });
      return root.KanadeOMR.scoreFromNotes(selected,{title:label});
    },
    commitOmr(label='写真から取り込み'){
      const score=hub.reviewedScore(label);
      return {score,warnings:[
        '簡易OMRの結果です。譜面上で音符を直してから演奏・書き出しをおすすめします。',
        '高精度な読み取りは Audiveris（GPL）や oemer などをローカルで実行し、MusicXML を取り込んでください。'
      ]};
    },
    async exportReviewed(kind,{preferShare=true}={}){
      await ensureCore();
      if(!root.KanadeExport)await loadScript('src/musicxml.js');
      const MidiExport=root.KanadeMIDIExport;
      if(!MidiExport)await loadScript('src/midi-export.js');
      const title=$('scoreOmrTitle')?.value||'写真から取り込み';
      const score=hub.reviewedScore(title);
      const pkg=root.KanadeImportExport.packageScore(score,kind);
      const result=await root.KanadeImportExport.deliver(pkg,{
        preferShare,
        download:hub.hooks.download
      });
      const label=kind==='midi'?'MIDI':'MusicXML';
      if(result.method==='share')hub.hooks.toast?.(label+'を共有シートで送信できます');
      else if(result.method==='download')hub.hooks.toast?.(label+'を書き出しました：'+result.filename);
      return result;
    }
  };

  function CeventLabel(pitch){
    const C=root.KanadeCore;
    const label=C.eventLabel({type:'note',den:4,dots:0,pitches:[C.normalPitch(pitch)]});
    return label.split('  ')[0];
  }

  function setupUi(){
    const chooser=$('scoreImportChooser');
    if(!chooser)return;
    $('importHubClose')?.addEventListener('click',()=>chooser.close());
    $('importCameraBtn')?.addEventListener('click',()=>$('importCamera')?.click());
    $('importGalleryBtn')?.addEventListener('click',()=>$('importGallery')?.click());
    $('importScoreFileBtn')?.addEventListener('click',()=>$('importScoreFile')?.click());
    const route=async file=>{
      if(!file)return;
      try{
        const parsed=await hub.readScoreFile(file);
        if(parsed.pending)return;
        hub.hooks.openParsed?.(parsed);
      }catch(error){hub.hooks.toast?.(error.message,true);}
    };
    for(const id of ['importCamera','importGallery','importScoreFile']){
      $(id)?.addEventListener('change',event=>{
        const file=event.target.files?.[0];
        event.target.value='';
        route(file);
        chooser.close();
      });
    }
    const omr=$('scoreOmrDialog');
    omr?.addEventListener('click',event=>{
      const shift=event.target.closest('[data-omr-shift]');
      if(!shift||!hub.omrNotes)return;
      const index=Number(shift.dataset.omrShift);
      const dir=Number(shift.dataset.dir);
      const note=hub.omrNotes[index];
      if(!note)return;
      const C=root.KanadeCore;
      note.pitch=C.normalPitch({...note.pitch,alter:Math.max(-1,Math.min(1,(note.pitch.alter||0)+dir))});
      hub.openOmrReview({...hub.lastRecognition,notes:hub.omrNotes});
    });
    $('scoreOmrApply')?.addEventListener('click',()=>hub.hooks.attempt?.(()=>{
      const result=hub.commitOmr($('scoreOmrTitle')?.value||'写真から取り込み');
      hub.hooks.openParsed?.(result);
      omr.close();
    }));
    $('scoreOmrCancel')?.addEventListener('click',()=>omr.close());
    $('scoreOmrExportMidi')?.addEventListener('click',()=>hub.hooks.attempt?.(()=>hub.exportReviewed('midi')));
    $('scoreOmrExportMusicXml')?.addEventListener('click',()=>hub.hooks.attempt?.(()=>hub.exportReviewed('musicxml')));
  }

  setupUi();
  root.KanadeImportHub={...hub,ensureCore,ensureOmr};
})(globalThis);