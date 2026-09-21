// ===================================================================
// 瑪奇 M 背包小救星 - 倉庫計算器
// 左邊輸入持有材料與數量（依材料種類分組），右邊顯示目前可完整製作的配方，
// 以及只差一點的配方還缺什麼（缺少的材料同樣依種類排列）
// （目前只算「直接材料」，還沒有展開中間產物的連鎖生產鏈）
// ===================================================================
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const data = window.CRAFT_DATA;
  if (!data?.recipes?.length) {
    $('calcResults').innerHTML = '<div class="empty">資料載入失敗，請確認 js/data.js 是否存在，或重新整理頁面。</div>';
    return;
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s・·]/g, '');
  const number = n => n.toLocaleString('en-US');

  // ---------- 材料種類：跟素材圖鑑共用 js/kinds.js 的定義 ----------
  const { FAMILIES, kindOf: kindOfItem } = window.ItemKinds;
  const categoryByName = new Map(); // 配方成品名稱 -> 生產分類（成品才能歸到料理／武器／防具等種類）
  for (const r of data.recipes) if (!categoryByName.has(r.name)) categoryByName.set(r.name, r.category);
  const kindOf = name => kindOfItem(name, categoryByName.get(name));
  const compareByKind = (a, b) => {
    const ka = kindOf(a), kb = kindOf(b);
    return ka.f - kb.f || ka.t - kb.t || a.localeCompare(b, 'zh-Hant');
  };

  // 分類固定順序：跟生產配方頁側欄一致
  const CATEGORY_ORDER = ['多用途製作', '布料加工', '木材加工', '皮革加工', '金屬加工', '藥品加工', '藥品製作', '食材加工', '食物製作', '武器製作', '防具製作'];
  const categoryRank = c => { const i = CATEGORY_ORDER.indexOf(c); return i === -1 ? CATEGORY_ORDER.length : i; };

  // ---------- 統一的物品名稱索引（材料清單 + 配方成品），給搜尋加入庫存用 ----------
  const nameIndex = new Map();
  for (const m of data.materials) nameIndex.set(m.name, { name: m.name });
  for (const r of data.recipes) if (!nameIndex.has(r.name)) nameIndex.set(r.name, { name: r.name });
  const allNames = [...nameIndex.values()];

  const STORAGE_KEY = 'mabiInventory';
  let inventory = {}; // { 物品名稱: 持有數量 }
  try {
    inventory = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) { inventory = {}; }

  function saveInventory() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory)); } catch (e) { /* localStorage 被擋掉時，這次操作就不保存，不影響當下使用 */ }
  }

  let hasCalculated = false; // 按過一次「計算」之後，庫存有變動就自動重算，右邊會跟著即時更新

  // ---------- 左側：庫存清單（依材料種類分組） ----------
  function renderInventory() {
    const keys = Object.keys(inventory);
    if (!keys.length) {
      $('invList').innerHTML = `<div class="inv-hint">還沒有加入任何材料，上面搜尋並點選要加入的物品。</div>`;
      return;
    }
    keys.sort(compareByKind);
    const groups = new Map(); // 種類序號 -> 物品名稱[]
    for (const name of keys) {
      const f = kindOf(name).f;
      if (!groups.has(f)) groups.set(f, []);
      groups.get(f).push(name);
    }
    $('invList').innerHTML = [...groups].map(([f, names]) => `
      <div class="inv-group">
        <h3>${esc(FAMILIES[f].name)}<span>${names.length} 項</span></h3>
        ${names.map(name => `<div class="inv-item">
          <span>${esc(name)}</span>
          <input type="number" min="0" step="1" value="${inventory[name]}" data-qty="${esc(name)}" aria-label="${esc(name)} 持有數量">
          <button type="button" class="remove" data-remove="${esc(name)}">移除</button>
        </div>`).join('')}
      </div>`).join('');
  }

  // ---------- 加入物品：搜尋建議 ----------
  $('addSearch').addEventListener('input', e => {
    const q = norm(e.target.value);
    const box = $('addSuggest');
    if (!q) { box.hidden = true; box.innerHTML = ''; return; }
    const matches = allNames.filter(it => norm(it.name).includes(q)).slice(0, 15);
    if (!matches.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = matches.map(it => `<button type="button" data-add="${esc(it.name)}">${esc(it.name)}</button>`).join('');
    box.hidden = false;
  });

  document.addEventListener('click', e => {
    const addBtn = e.target.closest('[data-add]');
    const removeBtn = e.target.closest('[data-remove]');
    if (addBtn) {
      const name = addBtn.dataset.add;
      if (!(name in inventory)) inventory[name] = 1;
      saveInventory(); renderInventory();
      $('addSearch').value = ''; $('addSuggest').hidden = true; $('addSuggest').innerHTML = '';
      if (hasCalculated) calc();
    } else if (removeBtn) {
      delete inventory[removeBtn.dataset.remove];
      saveInventory(); renderInventory();
      if (hasCalculated) calc();
    } else if (!e.target.closest('.inv-add')) {
      $('addSuggest').hidden = true;
    }
  });

  document.addEventListener('input', e => {
    if (e.target.dataset.qty !== undefined) {
      const name = e.target.dataset.qty;
      const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
      inventory[name] = v;
      saveInventory();
      if (hasCalculated) calc();
    }
  });

  // ---------- 右側：計算可製作物 ----------
  function calc() {
    hasCalculated = true;
    const groups = new Map(); // 分類 -> rows[]
    const favRows = [];       // 我的最愛：不管手上有沒有材料，都會列在最上面
    for (const r of data.recipes) {
      if (r.notImplemented) continue; // 未實裝的配方不算
      const isFav = RecipeFavorites.has(r.name);
      let relevant = false;
      let fullyCraftable = true;
      let craftCount = Infinity;
      const missing = [];
      for (const ing of r.ingredients) {
        const owned = inventory[ing.name] || 0;
        if (owned > 0) relevant = true;
        if (owned < ing.quantity) {
          fullyCraftable = false;
          missing.push({ name: ing.name, short: ing.quantity - owned });
        } else {
          craftCount = Math.min(craftCount, Math.floor(owned / ing.quantity));
        }
      }
      if (!relevant && !isFav) continue; // 手上完全沒有這個配方用到的任何材料（而且不是最愛），不列出來洗版
      if (!fullyCraftable) craftCount = 0;
      missing.sort((a, b) => compareByKind(a.name, b.name)); // 缺少的材料依種類與進階順序排列
      const row = { recipe: r, fullyCraftable, craftCount, missing };
      if (isFav) { favRows.push(row); continue; }
      if (!groups.has(r.category)) groups.set(r.category, []);
      groups.get(r.category).push(row);
    }

    if (!groups.size && !favRows.length) {
      $('calcResults').innerHTML = `<div class="empty"><h3>目前的庫存做不出（或差很多）任何收錄的配方</h3><p>先在左邊加入幾樣持有的材料，再按一次計算看看。</p></div>`;
      return;
    }

    // 單一配方的一列：最前面是星號，缺少的材料是連結，點下去直接到該材料的素材圖鑑頁
    const rowHtml = row => {
      const star = RecipeFavorites.starHtml(row.recipe.name);
      if (row.fullyCraftable) {
        return `<div class="inv-row ok">
            ${star}
            <span class="status">✓</span>
            <span class="name">${esc(row.recipe.name)}</span>
            <span class="count">可製作 ${number(row.craftCount)} 個</span>
          </div>`;
      }
      const missingLinks = row.missing.map(m =>
        `<a href="items.html?item=${encodeURIComponent(m.name)}">${esc(m.name)}</a> × ${number(m.short)}`).join('　');
      return `<div class="inv-row partial">
            ${star}
            <span class="status">△</span>
            <span class="name">${esc(row.recipe.name)}
              <div class="missing">缺少：${missingLinks}</div>
            </span>
          </div>`;
    };
    const sortRows = rows => rows.sort((a, b) => (b.fullyCraftable - a.fullyCraftable) || (b.craftCount - a.craftCount));

    let html = '';
    if (favRows.length) {
      html += `<div class="inv-results-group inv-fav-group"><h2><span class="inv-fav-mark">★</span> 我的最愛</h2>${sortRows(favRows).map(rowHtml).join('')}</div>`;
    }
    const orderedGroups = [...groups].sort((a, b) => categoryRank(a[0]) - categoryRank(b[0]));
    for (const [category, rows] of orderedGroups) {
      html += `<div class="inv-results-group"><h2>${esc(category)}</h2>${sortRows(rows).map(rowHtml).join('')}</div>`;
    }
    $('calcResults').innerHTML = html;
  }

  // 星號切換最愛之後，右邊要跟著重排（最愛移到最上面）
  document.addEventListener('favorites-changed', () => { if (hasCalculated) calc(); });

  $('calcBtn').addEventListener('click', calc);
  $('build-meta').textContent = `資料版本：${data.meta?.retrieved || ''}`;

  renderInventory();
  // 已經有最愛配方的話，一進頁面就先算好，最愛會直接排在右邊最上面
  if (RecipeFavorites.all().length) calc();
})();
