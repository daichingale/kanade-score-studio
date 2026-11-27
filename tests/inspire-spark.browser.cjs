// Optional browser regression: node tests/inspire-spark.browser.cjs <playwright-core path> <chromium path>
const {chromium}=require(process.argv[2]||'playwright-core');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const webRoot=path.join(__dirname,'../app/web');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};

function serve(){
 return new Promise(resolve=>{
  const server=http.createServer((req,res)=>{
   const url=new URL(req.url,'http://127.0.0.1');
   let file=path.join(webRoot,decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!file.startsWith(webRoot)){res.writeHead(403);res.end();return;}
   fs.readFile(file,(error,data)=>{
    if(error){res.writeHead(404);res.end('missing');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(data);
   });
  }).listen(0,'127.0.0.1',()=>resolve(server));
 });
}

(async()=>{
 const server=await serve();
 const port=server.address().port;
 const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
 try{
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error.message||error)));
  await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.KanadeAgentTools&&window.KanadeCore);
  const info=await page.evaluate(()=>({
   spark:!!window.KanadeInspirationSpark,
   tools:!!window.KanadeAgentTools,
   order:[...document.scripts].map(script=>script.getAttribute('src')).filter(src=>/inspiration-spark\.js|agent-tools\.js|pop-progression\.js$/.test(src||''))
  }));
  assert.equal(info.spark,true,'KanadeInspirationSpark must exist after script-tag load');
  assert.deepEqual(info.order,['src/pop-progression.js','src/inspiration-spark.js','src/agent-tools.js']);
  const result=await page.evaluate(()=>{
   const score=KanadeCore.createScore();
   const out=KanadeAgentTools.run(score,'inspireSpark',{mood:'ballad',bars:8,measure:1,seed:3,apply:true});
   const part=KanadeCore.scoreParts(out.document)[0];
   return {
    summary:out.summary,
    measures:part.measures.length,
    noted:part.measures.slice(0,8).filter(bar=>bar.events.some(event=>event.type==='note')).length
   };
  });
  assert.ok(result.measures>=8);
  assert.equal(result.noted,8);
  assert.match(result.summary,/ひらめき|小節/);
  assert.deepEqual(errors,[]);
  console.log('PASS: browser script order loads Spark and inspireSpark writes 8 bars');
  console.log(JSON.stringify({info,result,pageUrl:`http://127.0.0.1:${port}/index.html`}));
 }finally{
  await browser.close();
  server.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
