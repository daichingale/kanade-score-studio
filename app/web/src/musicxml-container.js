/* Read only the container manifest and its score from a compressed MusicXML file. */
(function(root){
  'use strict';
  const MAX_BYTES=20*1024*1024;
  const decoder=new TextDecoder('utf-8',{fatal:true});
  async function unpack(buffer){
    const view=new DataView(buffer),size=view.byteLength;
    const u16=offset=>view.getUint16(offset,true),u32=offset=>view.getUint32(offset,true);
    const bad=()=>Error('圧縮 MusicXML のファイル構成を確認してください');
    let end=size-22;
    for(;end>=Math.max(0,size-65557);end--)if(u32(end)===0x06054b50&&end+22+u16(end+20)===size)break;
    if(end<0||end<Math.max(0,size-65557)||u16(end+4)||u16(end+6))throw bad();
    const files=new Map(),count=u16(end+10),directorySize=u32(end+12);
    let offset=u32(end+16);
    if(count>2048||offset+directorySize>end)throw bad();
    for(let i=0;i<count;i++){
      if(offset+46>end||u32(offset)!==0x02014b50)throw bad();
      const length=u16(offset+28),next=offset+46+length+u16(offset+30)+u16(offset+32);
      if(next>end||u16(offset+34))throw bad();
      const name=decoder.decode(new Uint8Array(buffer,offset+46,length));
      if(files.has(name))throw bad();
      files.set(name,{method:u16(offset+10),flags:u16(offset+8),compressed:u32(offset+20),size:u32(offset+24),offset:u32(offset+42)});
      offset=next;
    }
    async function read(name,limit){
      const entry=files.get(name);
      if(!entry||entry.flags&1||entry.size>limit||entry.offset+30>end||u32(entry.offset)!==0x04034b50)throw bad();
      const data=entry.offset+30+u16(entry.offset+26)+u16(entry.offset+28);
      if(data+entry.compressed>end)throw bad();
      const bytes=new Uint8Array(buffer,data,entry.compressed);
      if(entry.method===0){
        if(bytes.length!==entry.size)throw bad();
        return decoder.decode(bytes);
      }
      if(entry.method!==8)throw bad();
      let inflate;
      try{inflate=new DecompressionStream('deflate-raw');}
      catch(_){throw Error('このブラウザでは .mxl を展開できません。非圧縮 MusicXML を開いてください');}
      const reader=new Blob([bytes]).stream().pipeThrough(inflate).getReader();
      const output=new Uint8Array(entry.size);
      let written=0;
      try{
        for(;;){
          const {value,done}=await reader.read();
          if(done)break;
          if(written+value.length>output.length)throw bad();
          output.set(value,written);written+=value.length;
        }
        if(written!==output.length)throw bad();
      }finally{await reader.cancel().catch(()=>{});}
      return decoder.decode(output);
    }
    const manifest=root.KanadeMusicXMLImport.xml(await read('META-INF/container.xml',65536));
    const name=manifest.getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
    if(!name)throw bad();
    return read(name,MAX_BYTES);
  }
  root.KanadeMusicXMLContainer={unpack,MAX_BYTES};
})(globalThis);
