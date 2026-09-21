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
})();
