/* PDF page rasterization — lazy pdf.js when vendored, JPEG fallback otherwise. */
(function(root){
  'use strict';
  let pdfReady=null;

  function loadPdfJs(){
    if(root.pdfjsLib?.getDocument)return Promise.resolve(root.pdfjsLib);
    if(pdfReady)return pdfReady;
    pdfReady=import(new URL('vendor/pdfjs/pdf.min.mjs',document.baseURI||location.href)).then(mod=>{
      const lib=mod.default||mod;
      root.pdfjsLib=lib;
      return lib;
    }).catch(error=>{
      pdfReady=null;
      throw error;
    });
    return pdfReady;
  }

  async function renderFirstPage(bytes,{scale=2}={}){
    try{
      const lib=await loadPdfJs();
      if(lib.GlobalWorkerOptions&&!lib.GlobalWorkerOptions.workerSrc)
        lib.GlobalWorkerOptions.workerSrc='vendor/pdfjs/pdf.worker.min.mjs';
      const doc=await lib.getDocument({data:bytes}).promise;
      const page=await doc.getPage(1);
      const viewport=page.getViewport({scale});
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width);
      canvas.height=Math.ceil(viewport.height);
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      await page.render({canvasContext:ctx,viewport}).promise;
      return ctx.getImageData(0,0,canvas.width,canvas.height);
    }catch(error){
      const fallback=root.KanadeOMR?.extractPdfImage;
      if(fallback){
        const jpeg=fallback(bytes);
        return decodeJpeg(jpeg);
      }
      throw error;
    }
  }

  function decodeJpeg(bytes){
    return new Promise((resolve,reject)=>{
      const blob=new Blob([bytes],{type:'image/jpeg'});
      const url=URL.createObjectURL(blob);
      const image=new Image();
      image.onload=()=>{
        const canvas=document.createElement('canvas');
        canvas.width=image.width;
        canvas.height=image.height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.drawImage(image,0,0);
        URL.revokeObjectURL(url);
        resolve(ctx.getImageData(0,0,canvas.width,canvas.height));
      };
      image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('PDF内画像を描画できませんでした'));};
      image.src=url;
    });
  }

  root.KanadeOmrPdf={renderFirstPage,loadPdfJs};
})(globalThis);