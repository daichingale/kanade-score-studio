const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');

const webRoot=path.join(__dirname,'..');
const indexHtml=fs.readFileSync(path.join(webRoot,'index.html'),'utf8');
const scriptSrcs=[...indexHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match=>match[1]);

// Minimal browser globals needed for the spark/tool scripts (no Node require).
const NEEDED=new Set([
 'src/symbols.js','src/core.js','src/editing.js','src/performance.js','src/instruments.js',
 'src/notation.js','src/percussion.js','src/samples.js','src/musicxml.js',
 'src/agent-arrange.js','src/agent-ensemble.js','src/pop-progression.js',
 'src/inspiration-spark.js','src/agent-tools.js'
]);

function loadBrowserScripts(){
 const {window}=parseHTML('<!doctype html><html><body></body></html>');
 const sandbox={
  console,
  localStorage:{
   store:Object.create(null),
   getItem(key){return Object.prototype.hasOwnProperty.call(this.store,key)?this.store[key]:null;},
   setItem(key,value){this.store[key]=String(value);},
   removeItem(key){delete this.store[key];}
  },
  atob:value=>Buffer.from(value,'base64').toString('binary'),
  btoa:value=>Buffer.from(value,'binary').toString('base64'),
  TextEncoder,TextDecoder,
  setTimeout,clearTimeout,setInterval,clearInterval
 };
 sandbox.window=sandbox;
 sandbox.self=sandbox;
 sandbox.globalThis=sandbox;
 sandbox.document=window.document;
 sandbox.HTMLElement=window.HTMLElement;
 sandbox.Node=window.Node;
 sandbox.navigator={userAgent:'KanadeScriptOrderTest'};
 sandbox.location={href:'http://127.0.0.1/index.html',pathname:'/index.html',origin:'http://127.0.0.1'};
 sandbox.require=undefined;
 vm.createContext(sandbox);
 const loaded=[];
 for(const src of scriptSrcs){
  if(!NEEDED.has(src))continue;
  const file=path.join(webRoot,src);
  const code=fs.readFileSync(file,'utf8');
  vm.runInContext(code,sandbox,{filename:src});
  loaded.push(src);
  if(src==='src/agent-tools.js')break;
 }
 return {sandbox,loaded};
}

test('index.html loads inspiration-spark before agent-tools',()=>{
 const spark=scriptSrcs.indexOf('src/inspiration-spark.js');
 const tools=scriptSrcs.indexOf('src/agent-tools.js');
 const pop=scriptSrcs.indexOf('src/pop-progression.js');
 assert.ok(spark>=0&&tools>=0&&pop>=0);
 assert.ok(pop<spark,`pop-progression (${pop}) should precede inspiration-spark (${spark})`);
 assert.ok(spark<tools,`inspiration-spark (${spark}) should precede agent-tools (${tools})`);
});

test('browser script order exposes KanadeInspirationSpark and inspireSpark writes bars',()=>{
 const {sandbox,loaded}=loadBrowserScripts();
 assert.deepEqual(loaded.filter(src=>/pop-progression|inspiration-spark|agent-tools/.test(src)),[
  'src/pop-progression.js','src/inspiration-spark.js','src/agent-tools.js'
 ]);
 assert.equal(typeof sandbox.KanadeCore,'object');
 assert.equal(typeof sandbox.KanadePopProgression,'object');
 assert.equal(typeof sandbox.KanadeInspirationSpark,'object');
 assert.ok(sandbox.KanadeInspirationSpark);
 assert.equal(typeof sandbox.KanadeAgentTools,'object');
 assert.ok(sandbox.KanadeAgentTools.operations.inspireSpark);
 const score=sandbox.KanadeCore.createScore();
 const out=sandbox.KanadeAgentTools.run(score,'inspireSpark',{mood:'ballad',bars:8,measure:1,seed:11,apply:true});
 assert.ok(out.document);
 assert.match(out.summary,/ひらめき|小節/);
 const part=sandbox.KanadeCore.scoreParts(out.document)[0];
 assert.ok(part.measures.length>=8);
 assert.equal(part.measures.slice(0,8).filter(bar=>bar.events.some(event=>event.type==='note')).length,8);
});
