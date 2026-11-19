/* Resolve app URLs for GitHub Pages (/kanade-score-studio/) and local dev (/). */
(function(root){
  'use strict';
  function basePath(){
    if(typeof root.__KANADE_BASE__==='string')return root.__KANADE_BASE__;
    const parts=location.pathname.split('/').filter(Boolean);
    if(parts[0]==='kanade-score-studio')return '/kanade-score-studio';
    return '';
  }
  function resolve(path){
    if(typeof path!=='string'||!path.startsWith('/'))return path;
    return `${basePath()}${path}`;
  }
  root.KanadePath={basePath,resolve};
})(typeof globalThis!=='undefined'?globalThis:this);