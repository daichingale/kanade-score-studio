/* OMR mode orchestration: PC > on-device ML > classical pipeline. */
(function(root){
  'use strict';
  const MODES=['auto','pc','ml','classic'];
  const KEY='kanade.omr.mode.v1';

  function loadMode(){
    try{
      const raw=localStorage.getItem(KEY);
      const mode=raw?JSON.parse(raw).mode:'auto';
      return MODES.includes(mode)?mode:'auto';
    }catch{return 'auto';}
  }

  function saveMode(mode){
    if(!MODES.includes(mode))mode='auto';
    try{localStorage.setItem(KEY,JSON.stringify({mode,at:Date.now()}));}catch{}
    return mode;
  }

  async function capabilities(){
    const caps={classic:true,ml:false,pc:false};
    if(root.KanadeOmrMlRuntime)caps.ml=await root.KanadeOmrMlRuntime.ready().catch(()=>false);
    if(root.KanadeOmrPcClient){
      const pc=await root.KanadeOmrPcClient.discover();
      caps.pc=Boolean(pc?.status?.oemer||pc?.status?.audiveris);
      caps.pcDetail=pc;
    }
    return caps;
  }

  async function resolveMode(requested=loadMode()){
    const caps=await capabilities();
    if(requested==='pc'&&caps.pc)return 'pc';
    if(requested==='ml'&&caps.ml)return 'ml';
    if(requested==='classic')return 'classic';
    if(caps.pc)return 'pc';
    if(caps.ml)return 'ml';
    return 'classic';
  }

  function musicXmlToRecognition(musicxml,{method='pc'}={}){
    const parser=root.KanadeMusicXMLImport||null;
    if(!parser)throw Error('MusicXML モジュールが未読込です');
    const {score}=parser.parse(musicxml);
    const notes=root.KanadeOmrFixture.groundTruth(score).map(item=>({
      tick:item.tick+(item.mi||0)*root.KanadeCore.TPQ*4,
      pitch:item.pitch,
      den:item.den,
      dots:item.dots||0,
      confidence:0.93,
      method
    }));
    return {
      notes,
      staff:{lines:[0,0,0,0,0],spacing:10},
      bitmap:{width:1,height:1,data:new Uint8Array([0]),ink:0},
      scoreDraft:score,
      warnings:[
        method==='pc'?'PC 上の Audiveris / oemer による高精度読み取り結果です。':'MusicXML から読み込みました。'
      ],
      method
    };
  }

  async function recognizeImage(imageData,meta={}){
    const mode=await resolveMode(meta.mode);
    if(mode==='pc'){
      const bytes=meta.bytes,mime=meta.mime,filename=meta.filename;
      const result=await root.KanadeOmrPcClient.recognize({bytes,mime,filename,engine:meta.pcEngine||'auto'});
      if(result.musicxml)return musicXmlToRecognition(result.musicxml,{method:'pc'});
      throw Error(result.warnings?.[0]||'PC OMR 結果が空です');
    }
    if(mode==='ml'){
      if(!await root.KanadeOmrMlRuntime.ready()){
        if(!meta.mlConsent)throw Error('ml-consent-required');
        await root.KanadeOmrMlRuntime.enableHighPrecision({uiRoot:meta.uiRoot});
      }
      return {...await root.KanadeOmrMlRuntime.infer(imageData),method:'ml'};
    }
    return {...root.KanadeOMR.recognizeRGBA(imageData,meta),method:meta.mode==='classic'?'classic':'v2'};
  }

  root.KanadeOmrRouter={MODES,loadMode,saveMode,capabilities,resolveMode,recognizeImage,musicXmlToRecognition};
})(globalThis);