/* Engraves MEI or MusicXML off the UI thread. The toolkit file is unmodified. */
let chain=Promise.resolve();
let toolkitPromise;
function toolkit(){
  if(!toolkitPromise)toolkitPromise=new Promise((resolve,reject)=>{
    try{importScripts(new URL('../vendor/verovio/verovio-toolkit-wasm.js',self.location.href).href);}
    catch(error){reject(error);return;}
    const start=()=>{try{resolve(new verovio.toolkit());}catch(error){reject(error);}};
    if(verovio.module?.calledRun)start();
    else verovio.module.onRuntimeInitialized=start;
    setTimeout(()=>reject(new Error('Verovioの初期化がタイムアウトしました')),20000);
  });
  return toolkitPromise;
}
async function engrave(message){
  const started=performance.now();
  const engine=await toolkit();
  engine.setOptions(message.options||{});
  if(!engine.loadData(message.data))throw new Error('Verovioが楽譜を読めませんでした');
  const pages=engine.getPageCount();
  const svgs=[];
  for(let page=1;page<=pages;page++)svgs.push(engine.renderToSVG(page));
  return {id:message.id,ok:true,svgs,pages,ms:Math.round(performance.now()-started)};
}
self.onmessage=event=>{
  const message=event.data;
  chain=chain.then(()=>engrave(message)).then(result=>self.postMessage(result)).catch(error=>{
    self.postMessage({id:message.id,ok:false,error:error?.message||String(error)});
  });
};
