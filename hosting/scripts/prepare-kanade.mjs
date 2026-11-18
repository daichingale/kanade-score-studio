import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),pub=path.join(root,'public');
await mkdir(pub,{recursive:true});
await cp(path.join(root,'../app/web'),pub,{recursive:true,filter:source=>!source.includes(path.sep+'tests')});
await writeFile(path.join(root,'app/page.tsx'),"import {redirect} from 'next/navigation';\nexport default function Home(){redirect('/index.html');}\n");
console.log('Kanade assets prepared from canonical app/web');
