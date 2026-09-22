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

  // ---------- 右側：計算可製作物（分「我的最愛」／「所有道具」兩個分頁） ----------
  const resultState = { tab: 'all' }; // 'fav' 或 'all'；選過分頁之後，重算不會把使用者切回去
  let tabPicked = false; // 使用者是否手動點過分頁；還沒點過的話，第一次算完可以依有沒有最愛自動選一個
  let lastFavRows = [];  // 我的最愛：不管手上有沒有材料，都會列出來
  let lastGroups = [];   // [ [分類, rows[]], ... ]，依生產分類固定順序排列

  const sortRows = rows => rows.sort((a, b) => (b.fullyCraftable - a.fullyCraftable) || (b.craftCount - a.craftCount));

  // 一種材料的標籤：手上數量足夠就用綠色醒目顯示，不夠就用紅色標出還缺多少，並連結到該材料的素材圖鑑頁
  function ingredientTag(ing, owned) {
    if (owned >= ing.quantity) return `<span class="ing ing-ok">${esc(ing.name)} × ${number(ing.quantity)}</span>`;
    return `<span class="ing ing-short"><a href="items.html?item=${encodeURIComponent(ing.name)}">${esc(ing.name)}</a> × ${number(ing.quantity)}（缺 ${number(ing.quantity - owned)}）</span>`;
  }

  // 單一配方的一列：星號、狀態、名稱、可以做幾組；下面固定列出全部材料（已足夠／還缺的都顯示，不是只列缺的）
  function rowHtml(row) {
    const star = RecipeFavorites.starHtml(row.recipe.name);
    const ingredientsHtml = row.recipe.ingredients
      .map(ing => ingredientTag(ing, inventory[ing.name] || 0)).join('');
    return `<div class="inv-row ${row.fullyCraftable ? 'ok' : 'partial'}">
        ${star}
        <span class="status">${row.fullyCraftable ? '✓' : '△'}</span>
        <span class="name">
          <span class="name-line"><span class="name-text">${esc(row.recipe.name)}</span><span class="count">可以做 ${number(row.craftCount)} 組</span></span>
          <div class="ing-list">${ingredientsHtml}</div>
        </span>
      </div>`;
  }

  // 「所有道具」分頁的一個分類區塊：標題（例如「藥品加工」）後面加一個 ▾，可以把底下整組配方收合起來
  function categoryGroupHtml(category, rows) {
    return `<div class="inv-results-group">
        <h2>
          <span class="cat-name">${esc(category)}</span>
          <button type="button" class="group-toggle" aria-expanded="true" aria-label="收合／展開${esc(category)}" title="收合／展開">▾</button>
        </h2>
        <div class="inv-results-group-body">${rows.map(rowHtml).join('')}</div>
      </div>`;
  }

  function calc() {
    hasCalculated = true;
    const groups = new Map(); // 分類 -> rows[]
    const favRows = [];       // 我的最愛：不管手上有沒有材料，都會列出來
    for (const r of data.recipes) {
      if (r.notImplemented) continue; // 未實裝的配方不算
      const isFav = RecipeFavorites.has(r.name);
      let relevant = false;
      let craftCount = Infinity; // 每種材料能做幾組的最小值，就是這個配方目前能做幾組（有任何一種缺，就會被壓到 0）
      const missing = [];
      for (const ing of r.ingredients) {
        const owned = inventory[ing.name] || 0;
        if (owned > 0) relevant = true;
        craftCount = Math.min(craftCount, Math.floor(owned / ing.quantity));
        if (owned < ing.quantity) missing.push({ name: ing.name, short: ing.quantity - owned });
      }
      if (!relevant && !isFav) continue; // 手上完全沒有這個配方用到的任何材料（而且不是最愛），不列出來洗版
      if (!Number.isFinite(craftCount)) craftCount = 0; // 保險：沒有材料欄位的配方不會出現負數或 Infinity
      missing.sort((a, b) => compareByKind(a.name, b.name)); // 缺少的材料依種類與進階順序排列
      const row = { recipe: r, fullyCraftable: missing.length === 0, craftCount, missing };
      if (isFav) { favRows.push(row); continue; }
      if (!groups.has(r.category)) groups.set(r.category, []);
      groups.get(r.category).push(row);
    }
    lastFavRows = sortRows(favRows);
    lastGroups = [...groups].sort((a, b) => categoryRank(a[0]) - categoryRank(b[0]))
      .map(([category, rows]) => [category, sortRows(rows)]);
    if (!tabPicked) resultState.tab = lastFavRows.length ? 'fav' : 'all'; // 還沒手動選過分頁，依有沒有最愛自動選一個
    renderResults();
  }

  // 分頁列：我的最愛／所有道具，各自帶目前的筆數
  function renderTabs() {
    const allCount = lastGroups.reduce((sum, [, rows]) => sum + rows.length, 0);
    $('resultTabs').hidden = false;
    $('resultTabs').innerHTML = [
      ['fav', `我的最愛（${number(lastFavRows.length)}）`],
      ['all', `所有道具（${number(allCount)}）`],
    ].map(([key, label]) => {
      const active = resultState.tab === key;
      return `<button type="button" class="${active ? 'active' : ''}" aria-pressed="${active}" data-tab="${key}">${label}</button>`;
    }).join('');
  }

  function renderResults() {
    renderTabs();
    if (resultState.tab === 'fav') {
      $('calcResults').innerHTML = lastFavRows.length
        ? lastFavRows.map(rowHtml).join('')
        : `<div class="empty"><h3>還沒有加入任何最愛的配方</h3><p>到生產配方頁或素材圖鑑，點配方名稱前面的 ☆ 就會加進來這裡。</p></div>`;
      return;
    }
    $('calcResults').innerHTML = lastGroups.length
      ? lastGroups.map(([category, rows]) => categoryGroupHtml(category, rows)).join('')
      : `<div class="empty"><h3>目前的庫存做不出（或差很多）任何收錄的配方</h3><p>先在左邊加入幾樣持有的材料，再按一次計算看看。</p></div>`;
  }

  $('resultTabs').addEventListener('click', e => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    tabPicked = true;
    resultState.tab = btn.dataset.tab;
    renderResults();
  });

  // 分類標題後面的 ▾：收合／展開這個分類底下整組配方，只影響點到的那一組
  $('calcResults').addEventListener('click', e => {
    const toggle = e.target.closest('.group-toggle');
    if (!toggle) return;
    const group = toggle.closest('.inv-results-group');
    const collapsed = group.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', String(!collapsed));
  });

  // 星號切換最愛之後，右邊要跟著重算（最愛分頁的筆數、所有道具分頁會少一筆）
  document.addEventListener('favorites-changed', () => { if (hasCalculated) calc(); });

  $('calcBtn').addEventListener('click', calc);
  $('build-meta').textContent = `資料版本：${data.meta?.retrieved || ''}`;

  renderInventory();
  // 已經有最愛配方的話，一進頁面就先算好，預設停在「我的最愛」分頁
  if (RecipeFavorites.all().length) calc();
})();
