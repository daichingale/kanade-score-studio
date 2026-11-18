/* FluidR3 GM samples, locally packaged, CC BY 3.0. See samples/ATTRIBUTION.md. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.KanadeSamples=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const presets=Object.assign(Object.create(null),{
  'ピアノ':{file:'acoustic_grand_piano',program:1},
  'トロンボーン':{file:'trombone',program:58,sustain:true},
  'ユーフォニアム':{file:'tuba',program:59,sustain:true,description:'チューバ音源で代用'},
  'トランペット':{file:'trumpet',program:57,sustain:true},
  'フルート':{file:'flute',program:74,sustain:true},
  'クラリネット':{file:'clarinet',program:72,sustain:true},
  'ヴァイオリン':{file:'violin',program:41,sustain:true},
  'ホルン':{file:'french_horn',program:61,sustain:true},
  'アルトサックス':{file:'alto_sax',program:66,sustain:true},
  'テナーサックス':{file:'tenor_sax',program:67,sustain:true},
  'チューバ':{file:'tuba',program:59,sustain:true},
  'オーボエ':{file:'oboe',program:69,sustain:true},
  'ファゴット':{file:'bassoon',program:71,sustain:true},
 });
 const installed=new Set();
 let database,initialRead;
 function openDatabase(){
  if(!database)database=new Promise((resolve,reject)=>{
   if(!root.indexedDB){reject(Error('このブラウザでは追加音源を保存できません'));return;}
   const request=root.indexedDB.open('kanade-local-instrument-samples',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('samples');
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(Error('追加音源の保存先を開けません'));
  });
  return database;
 }
 async function access(mode,operation){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('samples',mode),request=operation(tx.objectStore('samples'));
   tx.oncomplete=()=>resolve(request.result);
   tx.onabort=()=>reject(Error('追加音源にアクセスできません。端末の空き容量やブラウザ設定を確認してください'));
  });
 }
 function ready(){
  return initialRead??=access('readonly',store=>store.getAllKeys())
   .then(keys=>keys.forEach(key=>installed.add(key))).catch(()=>{});
 }
 const profile=name=>root.KanadeInstruments?.bySound.get(name);
 const fallback=name=>profile(name)?.fallback;
 const isGenerated=name=>name==='ティンパニ'||!!root.KanadePercussion?.preset(name);
 const canInstall=name=>!!profile(name)&&!root.KanadePercussion?.preset(name);
 function status(name){
  if(installed.has(name))return {kind:'installed',label:'追加音源あり'};
  const substitute=fallback(name);
  if(substitute)return {kind:'fallback',label:'代用音源あり',substitute};
  if(presets[name]||isGenerated(name))return {kind:'builtIn',label:'内蔵音源あり'};
  if(profile(name))return {kind:'missing',label:'音源追加で再生'};
  return {kind:'synth',label:'簡易シンセ音源'};
 }
 async function install(ctx,name,file,midi){
  if(!canInstall(name)||!Number.isInteger(midi)||midi<12||midi>119)throw Error('楽器と元の音高を指定してください');
  if(!file?.size||file.size>12*1024*1024)throw Error('12 MB以下の音声ファイルを選んでください');
  await ready();
  const bytes=await file.arrayBuffer();
  let buffer;
  try{buffer=await ctx.decodeAudioData(bytes.slice(0));}catch(_){throw Error('音声を読み込めません。WAVまたはMP3を選んでください');}
  if(buffer.duration>30)throw Error('30秒以内の単音サンプルを選んでください');
  await access('readwrite',store=>store.put({bytes,midi},name));
  installed.add(name);
  return {buffer,midi,sustain:false,unpitched:profile(name).clef==='percussion'};
 }
 async function remove(name){
  await ready();
  await access('readwrite',store=>store.delete(name));
  installed.delete(name);
 }
 const nearest=(keys,midi)=>keys.reduce((a,b)=>Math.abs(b-midi)<Math.abs(a-midi)?b:a);
 class Bank{
  constructor(){this.banks=new Map();this.buffers=new Map();}
  async load(name){
   const preset=presets[name];if(!preset)return null;
   let pending=this.banks.get(preset.file);
   if(!pending){pending=root.fetch(`samples/${preset.file}.json`).then(r=>{if(!r.ok)throw Error(`${name}音源を読み込めません`);return r.json();}).then(data=>({samples:data.samples,keys:Object.keys(data.samples).map(Number)}));this.banks.set(preset.file,pending);pending.catch(()=>this.banks.delete(preset.file));}
   // Keep at most three compressed banks; decoded notes have a separate LRU.
   this.banks.delete(preset.file);this.banks.set(preset.file,pending);while(this.banks.size>3)this.banks.delete(this.banks.keys().next().value);
   return pending;
  }
  async prepare(ctx,name,midis){
   await ready();
   if(installed.has(name)){
    const key='user:'+name;
    let pending=this.buffers.get(key);
    if(!pending){
     pending=(async()=>{
      const {bytes,midi}=await access('readonly',store=>store.get(name));
      const buffer=await ctx.decodeAudioData(bytes);
      return {buffer,midi,sustain:false,unpitched:profile(name)?.clef==='percussion'};
     })();
     this.buffers.set(key,pending);
     pending.catch(()=>this.buffers.delete(key));
    }
    const entry=await pending;
    this.buffers.delete(key);this.buffers.set(key,pending);
    while(this.buffers.size>64)this.buffers.delete(this.buffers.keys().next().value);
    return new Map([[entry.midi,entry]]);
   }
   const source=fallback(name)||name;
   if(!presets[source])return null;
   const bank=await this.load(source),{file,sustain}=presets[source];
   const decoded=new Map(await Promise.all([...new Set(midis.map(m=>nearest(bank.keys,m)))].map(async midi=>{
    const key=`${file}:${midi}`;let pending=this.buffers.get(key);
    if(!pending){pending=(async()=>{const raw=root.atob(bank.samples[midi].split(',')[1]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));const buffer=await ctx.decodeAudioData(bytes.buffer);return {buffer,midi,sustain:!!sustain};})();this.buffers.set(key,pending);pending.catch(()=>this.buffers.delete(key));}
    await pending;this.buffers.delete(key);this.buffers.set(key,pending);return [midi,await pending];
   })));
   // 64 decoded pitches covers all notes of one imported bank, with bounded reuse.
   while(this.buffers.size>64)this.buffers.delete(this.buffers.keys().next().value);
   return new Map(midis.map(midi=>[midi,decoded.get(nearest(bank.keys,midi))]));
  }
  invalidate(name){this.buffers.delete('user:'+name);}
 }
 return {presets,nearest,Bank,status,fallback,canInstall,ready,install,remove};
});
