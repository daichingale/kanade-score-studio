(function(root){
  'use strict';
  function wave(buffer){
    const left=buffer.getChannelData(0),right=buffer.getChannelData(1);
    const bytes=new ArrayBuffer(44+left.length*4),view=new DataView(bytes);
    const tag=(offset,text)=>[...text].forEach((letter,i)=>view.setUint8(offset+i,letter.charCodeAt(0)));
    tag(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');
    view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
    view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*4,true);
    view.setUint16(32,4,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,left.length*4,true);
    const pcm=sample=>Math.round(Math.max(-1,Math.min(1,sample))*32767);
    for(let i=0;i<left.length;i++){
      view.setInt16(44+i*4,pcm(left[i]),true);view.setInt16(46+i*4,pcm(right[i]),true);
    }
    return new Blob([bytes],{type:'audio/wav'});
  }
  function mp3(buffer){
    return new Promise((resolve,reject)=>{
      const worker=new Worker('src/mp3-worker.js');
      worker.onmessage=event=>{worker.terminate();resolve(event.data);};
      worker.onerror=()=>{worker.terminate();reject(Error('MP3エンコーダーを読み込めません。WAVでも書き出せます'));};
      const left=buffer.getChannelData(0).slice(),right=buffer.getChannelData(1).slice();
      worker.postMessage({left,right,rate:buffer.sampleRate},[left.buffer,right.buffer]);
    });
  }
  async function render(parts,mix,format,stage){
    const engine=new root.KanadeAudio.Engine();
    const expanded=root.KanadeArrangement.playback(parts);
    const buffer=await engine.renderAudio(expanded,mix,stage);
    stage(format==='mp3'?'MP3に変換中…':'WAVに変換中…');
    return format==='mp3'?mp3(buffer):wave(buffer);
  }
  const api={wave,render};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.KanadeAudioExport=api;
})(globalThis);
