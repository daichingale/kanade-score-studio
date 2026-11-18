const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../src/core');
require('../src/arrangement');require('../src/playback');require('../src/musicxml');require('../src/midi-export');
const Audio=require('../src/audio-export');
const src=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');

test('WAV encoding writes stereo 16-bit PCM with proper clipping and frame order',async()=>{
 const data=[Float32Array.of(.5,-2),Float32Array.of(-.5,2)];
 const blob=Audio.wave({sampleRate:44100,getChannelData:index=>data[index]});
 const wav=Buffer.from(await blob.arrayBuffer());
 assert.equal(wav.toString('ascii',0,4),'RIFF');
 assert.equal(wav.readUInt16LE(22),2);
 assert.equal(wav.readUInt32LE(24),44100);
 assert.equal(wav.readUInt32LE(40),8);
 assert.deepEqual([44,46,48,50].map(offset=>wav.readInt16LE(offset)),[16384,-16383,-32767,32767]);
});

test('MP3 worker encodes real MPEG audio frames with the bundled library',async()=>{
 let result;
 const sandbox=vm.createContext({Blob,self:{postMessage:blob=>{result=blob;}}});
 sandbox.importScripts=()=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../vendor/lamejs.iife.js'),'utf8'),sandbox);
 vm.runInContext(src('mp3-worker.js'),sandbox);
 const wave=Float32Array.from({length:4410},(_,i)=>Math.sin(i*.06)*.3);
 sandbox.self.onmessage({data:{left:wave,right:wave,rate:44100}});
 assert.equal(result.type,'audio/mpeg');
 const data=new Uint8Array(await result.arrayBuffer());
 assert.ok(data.length>1000);
 assert.equal(data[0],255);
 assert.equal(data[1]&224,224);
});

test('MIDI is multitrack and writes the sounding pitch for transposing instruments',async()=>{
 const score={...C.createScore(),instrument:'B♭ Trumpet',sound:'トランペット',transposition:'bb'};
 score.measures[0].events.push(C.makeNote({step:'C',octave:4,alter:0}));
 const file=await global.KanadeMIDIExport.encode([score]);
 const bytes=Buffer.from(await file.arrayBuffer());
 assert.equal(bytes.toString('ascii',0,4),'MThd');
 assert.equal(bytes.readUInt16BE(8),1);
 assert.equal(bytes.readUInt16BE(10),2);
 assert.equal(bytes.readUInt16BE(12),960);
 assert.ok(bytes.indexOf(Buffer.from([192,56]))>13);
 assert.ok(bytes.indexOf(Buffer.from([144,58,75]))>13);
});
