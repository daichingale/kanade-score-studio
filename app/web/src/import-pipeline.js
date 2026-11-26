/* Unified client-side import routing for Kanade score files and payloads. */
(function(root){
  'use strict';
  const kinds={
    kanade:'kanade-json',musicxml:'musicxml',mxl:'mxl',midi:'midi',image:'image',pdf:'pdf'
  };

  function kindFromName(name=''){
    const lower=name.toLowerCase();
    if(/\.kanade\.json$/.test(lower)||/\.json$/.test(lower))return kinds.kanade;
    if(/\.mxl$/.test(lower))return kinds.mxl;
    if(/\.(?:musicxml|xml)$/.test(lower))return kinds.musicxml;
    if(/\.mid(?:i)?$/.test(lower))return kinds.midi;
    if(/\.pdf$/.test(lower))return kinds.pdf;
    if(/\.(?:png|jpe?g|webp|gif|bmp|heic)$/.test(lower))return kinds.image;
    return null;
  }

  async function readFile(file){
    const kind=kindFromName(file.name)||(file.type?.includes('midi')?kinds.midi:null);
    if(!kind)throw Error('対応していない形式です（MusicXML / MXL / MIDI / Kanade JSON / 画像）');
    if(kind===kinds.midi){
      if(file.size>root.KanadeMIDIImport.MAX_BYTES)throw Error('MIDIの上限を超えています');
      return {kind,...(root.KanadeMIDIImport.parse(await file.arrayBuffer()))};
    }
    if(kind===kinds.mxl){
      const xml=await root.KanadeMusicXMLContainer.unpack(await file.arrayBuffer());
      return {kind,...(root.KanadeMusicXMLImport.parse(xml))};
    }
    if(kind===kinds.musicxml){
      const text=await file.text();
      return {kind,...(root.KanadeMusicXMLImport.parse(text))};
    }
    if(kind===kinds.kanade){
      const C=root.KanadeCore,text=await file.text();
      const score=JSON.parse(text);
      const errors=C.validateScore(score);
      if(errors.length)throw Error(errors[0]);
      return {kind,score,warnings:[]};
    }
    if(kind===kinds.pdf){
      const bytes=new Uint8Array(await file.arrayBuffer());
      return {kind,bytes,warnings:['PDFは1ページ目を画像として解析します。精度は写真取り込みと同じ制限があります。']};
    }
    if(kind===kinds.image){
      return {kind,bytes:new Uint8Array(await file.arrayBuffer()),mime:file.type||'image/jpeg',warnings:[]};
    }
    throw Error('取り込み形式を判別できませんでした');
  }

  root.KanadeImportPipeline={kinds,kindFromName,readFile};
})(globalThis);