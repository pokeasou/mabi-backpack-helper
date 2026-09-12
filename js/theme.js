// ===================================================================
// 瑪奇M 背包小救星 - 深色／淺色模式切換
// 實際套用是在 <head> 裡的一小段內嵌 script（避免翻頁那一瞬間先閃一次錯的顏色）
// 這裡只負責綁定右上角切換鈕的點擊事件
// ===================================================================
'use strict';
(() => {
  const KEY = 'mabi-theme';
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(KEY, next); } catch (e) { /* 瀏覽器封鎖本機儲存時，只是這次不記住選擇，不影響切換本身 */ }
  });
})();
