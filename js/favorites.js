// ===================================================================
// 瑪奇 M 背包小救星 - 我的最愛（配方星號）
// 生產配方頁、倉庫計算器、素材圖鑑共用；以配方名稱記錄，存在瀏覽器本機（localStorage）
// 點星號會切換最愛，並同步頁面上同一個配方的所有星號；
// 需要跟著重排的頁面（例如倉庫計算器）可以監聽 document 的 'favorites-changed' 事件
// ===================================================================
'use strict';
(() => {
  const KEY = 'mabiFavorites';
  let favs = new Set();
  try { favs = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { favs = new Set(); }

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify([...favs])); } catch (e) { /* 本機儲存被擋掉時，這次只在當下頁面有效，不影響使用 */ }
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const label = on => on ? '從我的最愛移除' : '加入我的最愛';

  function starHtml(name) {
    const on = favs.has(name);
    return `<button type="button" class="fav-star${on ? ' on' : ''}" data-fav="${esc(name)}" aria-pressed="${on}" aria-label="${label(on)}" title="${label(on)}">${on ? '★' : '☆'}</button>`;
  }

  function toggle(name) {
    if (favs.has(name)) favs.delete(name); else favs.add(name);
    save();
    return favs.has(name);
  }

  // 把頁面上同一個配方的星號都更新成目前狀態
  function syncButtons(name) {
    const on = favs.has(name);
    document.querySelectorAll('.fav-star').forEach(btn => {
      if (btn.dataset.fav !== name) return;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', label(on));
      btn.title = label(on);
      btn.textContent = on ? '★' : '☆';
    });
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('.fav-star');
    if (!btn) return;
    e.preventDefault();
    const name = btn.dataset.fav;
    toggle(name);
    syncButtons(name);
    document.dispatchEvent(new CustomEvent('favorites-changed', { detail: { name } }));
  });

  window.RecipeFavorites = { has: name => favs.has(name), all: () => [...favs], starHtml };

  // ---------- 右下角常駐的「我的最愛」方塊：隨時點開就能看到收藏了哪些配方 ----------
  function buildDock() {
    const dock = document.createElement('div');
    dock.className = 'fav-dock';
    dock.innerHTML = `
      <div class="fav-panel" id="favPanel" role="dialog" aria-label="我的最愛" hidden>
        <div class="fav-panel-head">
          <strong><span class="fav-mark">★</span> 我的最愛<span class="fav-count-text"></span></strong>
          <button type="button" class="fav-close" aria-label="關閉">✕</button>
        </div>
        <div class="fav-list"></div>
        <a class="fav-foot" href="inventory.html">到倉庫計算器看看能不能做 →</a>
      </div>
      <button type="button" class="fav-fab" aria-expanded="false" aria-controls="favPanel" aria-label="我的最愛" title="我的最愛">
        <span class="fav-fab-star" aria-hidden="true">★</span><span class="fav-badge" hidden></span>
      </button>`;
    document.body.appendChild(dock);

    const panel = dock.querySelector('.fav-panel');
    const fab = dock.querySelector('.fav-fab');
    const badge = dock.querySelector('.fav-badge');
    const list = dock.querySelector('.fav-list');
    const countText = dock.querySelector('.fav-count-text');

    const recipeInfo = name => {
      const r = window.CRAFT_DATA?.recipes?.find(x => x.name === name); // 資料檔比這支腳本晚載入，所以每次要用才查
      return r ? `${r.category}${r.level ? ' · Lv.' + r.level : ''}` : '';
    };

    function render() {
      const names = [...favs].reverse(); // 最近加入的排最上面
      badge.hidden = !names.length;
      badge.textContent = names.length;
      countText.textContent = names.length ? `（${names.length}）` : '';
      list.innerHTML = names.length
        ? names.map(n => `<div class="fav-item">${starHtml(n)}<a href="items.html?item=${encodeURIComponent(n)}"><span class="fav-item-name">${esc(n)}</span><span class="fav-item-sub">${esc(recipeInfo(n))}</span></a></div>`).join('')
        : '<div class="fav-empty">還沒有最愛的配方。<br>點配方名稱前面的 ☆，就會加進來。</div>';
    }

    const setOpen = open => {
      panel.hidden = !open;
      fab.setAttribute('aria-expanded', String(open));
      if (open) render();
    };

    fab.addEventListener('click', () => setOpen(panel.hidden));
    dock.querySelector('.fav-close').addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); fab.focus(); } });
    // 點方塊外面就收起來；但點頁面上的星號時保持開著，才看得到清單跟著更新
    document.addEventListener('click', e => {
      if (!panel.hidden && !dock.contains(e.target) && !e.target.closest('.fav-star')) setOpen(false);
    });
    document.addEventListener('favorites-changed', render);
    render();
  }

  // 另一個分頁改了最愛時，這個分頁也跟著更新
  window.addEventListener('storage', e => {
    if (e.key !== KEY) return;
    try { favs = new Set(JSON.parse(e.newValue || '[]')); } catch (err) { favs = new Set(); }
    document.querySelectorAll('.fav-star').forEach(btn => syncButtons(btn.dataset.fav));
    document.dispatchEvent(new CustomEvent('favorites-changed', { detail: {} }));
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildDock);
  else buildDock();
})();
