/* Export scores produced by import/OMR using existing MusicXML and MIDI encoders. */
(function(root){
  'use strict';
  const C=root.KanadeCore;

  function safeName(title){
    return (title||'kanade').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,80);
  }

  function packageScore(score,kind){
    const parts=C.scoreParts(score);
    const errors=C.validateScore(score);
    if(errors.length)throw Error(errors[0]);
    const base=safeName(score.title);
    if(kind==='midi'){
      if(!root.KanadeMIDIExport)throw Error('MIDI書き出しを読み込んでいません');
      const blob=root.KanadeMIDIExport.encode(parts);
      return {kind,filename:base+'.mid',blob,mime:'audio/midi'};
    }
    if(kind==='musicxml'){
      if(!root.KanadeExport)throw Error('MusicXML書き出しを読み込んでいません');
      const xml=root.KanadeExport.musicXMLScore(parts);
      return {kind,filename:base+'.musicxml',blob:xml,mime:'application/vnd.recordare.musicxml+xml;charset=utf-8'};
    }
    throw Error('対応していない書き出し形式です');
  }

  async function deliver(pkg,{preferShare=false,download=null}={}){
    const body=pkg.blob instanceof Blob?pkg.blob:new Blob([pkg.blob],{type:pkg.mime});
    const file=new File([body],pkg.filename,{type:pkg.mime});
    if(preferShare&&typeof navigator.share==='function'){
      try{
        if(!navigator.canShare||navigator.canShare({files:[file]})){
          await navigator.share({files:[file],title:pkg.filename});
          return {method:'share',filename:pkg.filename};
        }
      }catch(error){
        if(error?.name==='AbortError')return {method:'cancel'};
      }
    }
    if(download)download(body,pkg.filename,pkg.mime);
    else{
      const url=URL.createObjectURL(body);
      const anchor=document.createElement('a');
      anchor.href=url;
      anchor.download=pkg.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1500);
    }
    return {method:'download',filename:pkg.filename};
  }

  root.KanadeImportExport={safeName,packageScore,deliver};
})(globalThis);