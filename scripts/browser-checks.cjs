// Optional full browser check. Pass existing playwright-core and Chromium paths.
const {spawnSync}=require('node:child_process');const path=require('node:path');
const root=path.join(__dirname,'..');
for(const file of ['viewport','workspace','staff-sound','percussion','score-editing','layout','finale','workflow','audio']){
 console.log(`Checking ${file}...`);
 const result=spawnSync(process.execPath,[`tests/${file}.browser.cjs`,...process.argv.slice(2)],{cwd:root,stdio:'inherit',timeout:90000});
 if(result.error){console.error(result.error);process.exit(1);}if(result.status!==0)process.exit(result.status||1);
}
