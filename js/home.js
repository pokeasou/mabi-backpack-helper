// ===================================================================
// 瑪奇M 背包小救星 - 首頁互動邏輯
// 搜尋框送出後導去 database.html，並帶上查詢字串
// ===================================================================
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const data = window.CRAFT_DATA;

  // ---------- Hero 搜尋：送到素材圖鑑（查物品最通用的入口，配方名稱也查得到） ----------
  $('heroSearchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('heroSearchInput').value.trim();
    location.href = 'items.html' + (q ? '?q=' + encodeURIComponent(q) : '');
  });

  // ---------- 熱門查詢：固定給幾個新手最常查的材料，直接連到該物品的圖鑑頁 ----------
  const HOT_PICKS = ['鐵礦石', '牛奶', '原木', '羊毛', '起司'];
  const hotHtml = HOT_PICKS.map(name =>
    `<a href="items.html?item=${encodeURIComponent(name)}">${name}</a>`
  ).join('');
  $('heroHot').insertAdjacentHTML('beforeend', hotHtml);

  // ---------- 最近更新：從資料即時算出來，不是寫死的假資料 ----------
  if (data) {
    const updates = [
      {
        date: data.meta?.retrieved || '',
        desc: `收錄 ${data.recipes.length} 筆配方、${data.materials.length} 筆材料，全部來自玩家實際截圖台服畫面逐字辨識，範圍為${data.meta?.scope || '生產設施 Lv.3 及以下'}。`,
      },
      {
        date: data.meta?.snapshot || '',
        desc: `舊版韓服翻譯資料已從網站移除，改以玩家實測資料為主要內容，準確度更高。`,
      },
    ];
    $('recentUpdates').innerHTML = updates.map(u =>
      `<li><time>${u.date}</time><span class="desc">${u.desc}</span></li>`
    ).join('');
    $('build-meta').textContent = `資料版本：${data.meta?.retrieved || ''}`;
  }
})();
