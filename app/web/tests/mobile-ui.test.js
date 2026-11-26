const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');

test('viewport meta supports safe-area on phones',()=>{
 assert.match(html,/name="viewport"[^>]*viewport-fit=cover/);
 assert.match(html,/width=device-width/);
});

test('mobile dock exposes score import entry points',()=>{
 assert.match(html,/data-mobile-tab="import"/);
 assert.match(html,/id="mobileImportOpen"/);
 assert.match(html,/id="scoreImportChooser"/);
 assert.match(html,/id="scoreOmrExportMidi"/);
 assert.match(html,/id="scoreOmrExportMusicXml"/);
 assert.match(html,/id="scoreOmrMode"/);
 assert.match(html,/id="scoreOmrPcBtn"/);
 assert.match(html,/id="scoreOmrMlEnable"/);
 assert.match(html,/id="importCamera"/);
 assert.match(html,/capture="environment"/);
});

test('mobile note palette exposes durations, undo, and engraving toggle',()=>{
 for(const id of ['mobileEditor','mobileTools','undoMobile','redoMobile'])assert.ok(html.includes(`id="${id}"`),id);
 assert.match(html,/class="mobile-duration-bar"/);
 assert.match(html,/class="mobile-utility-bar"/);
 for(const den of ['1','2','4','8','16'])assert.match(html,new RegExp(`data-mobile-den="${den}"`));
 assert.ok((html.match(/data-verovio-toggle/g)||[]).length>=2,'engraving toggle on mobile');
 assert.match(html,/id="agentMobile"/);
});

test('manifest stays installable',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../manifest.webmanifest'),'utf8'));
 assert.equal(manifest.display,'standalone');
 assert.ok(manifest.icons.length>=2);
 assert.match(manifest.start_url,/^\.\/index\.html$/);
});