/* Development only: CSS replacement and score-aware full reload for scripts/HTML. */
(() => {
  const key = 'kanade.dev.reload.v1';
  try {
    const raw = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    if (raw) window.__kanadeDev?.restore(JSON.parse(raw));
  } catch (error) { console.warn('Development state could not be restored', error); }

  const badge = document.createElement('div');
  badge.id = 'kanade-dev-status';
  badge.setAttribute('role', 'status');
  badge.style.cssText = 'margin-top:14px;padding-top:10px;border-top:1px solid #dce3ec;color:#788ba0;font:11px/1.6 sans-serif;';
  badge.textContent = '開発モード · 接続中';
  (document.getElementById('helpPanel') || document.body).append(badge);
  const printStyle = document.createElement('style');
  printStyle.textContent = '@media print { #kanade-dev-status { display:none !important; } }';
  document.head.append(printStyle);
  let version, instanceId, pending = false, reloading = false;
  function reload() {
    // Allow composition and field editing to finish before replacing the page.
    if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) {
      pending = true; badge.textContent = '更新待ち · 入力欄を離れると反映'; return;
    }
    if (reloading) return;
    try {
      const snapshot = window.__kanadeDev?.capture();
      if (!snapshot) throw new Error('No editor snapshot available');
      sessionStorage.setItem(key, JSON.stringify(snapshot));
      reloading = true;
      location.reload();
    } catch (error) {
      badge.textContent = '自動反映を停止 · 楽譜を保存して再読み込み';
      console.warn('Reload cancelled to preserve your score', error);
    }
  }
  document.addEventListener('focusout', () => setTimeout(() => {
    if (pending) { pending = false; reload(); }
  }, 0));
  const events = new EventSource('/__dev/events');
  events.onerror = () => { badge.textContent = '開発サーバー停止 · 再接続を待っています'; };
  events.onmessage = event => {
    const update = JSON.parse(event.data);
    if (update.type === 'hello') {
      badge.textContent = '開発モード · 保存すると自動反映';
      if (version !== undefined && (version !== update.version || instanceId !== update.instanceId)) reload();
      version = update.version; instanceId = update.instanceId; return;
    }
    version = update.version;
    if (update.files.every(file => file.endsWith('.css'))) {
      for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
        const url = new URL(link.href);
        if (update.files.includes(decodeURIComponent(url.pathname).slice(1))) {
          const next = link.cloneNode();
          url.searchParams.set('dev', String(Date.now())); next.href = url.href;
          next.onload = () => link.remove(); next.onerror = () => next.remove();
          link.after(next);
        }
      }
      badge.textContent = '開発モード · スタイルを反映しました';
    } else reload();
  };
})();
