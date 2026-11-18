/* Small original line icons, kept local and paired with visible text. */
(function(root){
 const paths={
 hand:'<path d="M8 12V5a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-4a1.5 1.5 0 0 1 3 0v8c0 4-3 7-7 7h-1c-2 0-4-1-5-3l-4-6a1.6 1.6 0 0 1 2.5-2z"/>',
 hatClosed:'<path d="M2 10h20M3 13h18M12 3v18m-5 0h10M8 8l4-2 4 2"/>',
 hatOpen:'<path d="M2 8h20M3 15h18M12 2v20m-5 0h10M8 6l4-2 4 2"/>',
 choke:'<circle cx="10" cy="10" r="8"/><path d="M7 10h6M10 7v6m4 4v-5a1 1 0 0 1 2 0v4-7a1 1 0 0 1 2 0v7-5a1 1 0 0 1 2 0v7l-3 4h-4l-3-5"/>',
 snare:'<ellipse cx="12" cy="7" rx="9" ry="3"/><path d="M3 7v10c0 4 18 4 18 0V7M6 9v9m4-8v9m4-9v9m4-10v9M4 2l14 6M20 2 6 8"/>',
 tenors:'<ellipse cx="6" cy="9" rx="4" ry="3"/><ellipse cx="18" cy="9" rx="4" ry="3"/><ellipse cx="8" cy="17" rx="5" ry="4"/><ellipse cx="18" cy="17" rx="4" ry="4"/><circle cx="12" cy="4" r="2"/>',
 bass:'<ellipse cx="10" cy="12" rx="7" ry="10"/><path d="M10 2h5c10 0 10 20 0 20h-5M5 6l10 12M5 18 15 6"/>',
 cymbals:'<ellipse cx="8" cy="12" rx="5" ry="10" transform="rotate(-20 8 12)"/><ellipse cx="17" cy="12" rx="4" ry="9" transform="rotate(20 17 12)"/><path d="M7 10v4m10-4v4"/>',
 search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',new:'<path d="M14 2H5v20h14V7zM14 2v6h5M8 14h8m-4-4v8"/>',
 open:'<path d="M2 6h8l2 3h10l-4 12H2zM2 10h18"/>',save:'<path d="M4 2h14l3 3v17H3V2zM7 2v7h10V2M7 22v-9h10v9"/>',
 copy:'<rect x="8" y="8" width="13" height="14" rx="2"/><path d="M16 8V2H2v14h6"/>',cut:'<circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="m7 16 12-14M17 16 5 2"/>',paste:'<path d="M8 4H4v18h16V4h-4"/><rect x="8" y="2" width="8" height="5" rx="1"/>',
 select:'<path d="M3 2v19l5-6 4 7 4-2-4-7 8-1z"/>',insert:'<path d="M3 3v18m18-18v18M7 12h10m-5-5v10"/>',duplicate:'<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M16 8V3H3v13h5m7-5v7m-3-3h6"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 16h12l1-16M10 10v8m4-8v8"/>',speaker:'<path d="M3 9h4l5-5v16l-5-5H3zM16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>'};
 root.KanadeIcons={svg:name=>`<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.speaker}</svg>`};
})(typeof globalThis!=='undefined'?globalThis:this);
