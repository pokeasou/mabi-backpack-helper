// ===================================================================
// 瑪奇M 背包小救星 - 倉庫計算器
// 輸入持有材料與數量 → 算出目前可完整製作的配方，以及只差一點的配方缺什麼
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

  // ---------- 庫存表格渲染 ----------
  function renderInventory() {
    const keys = Object.keys(inventory);
    if (!keys.length) {
      $('invBody').innerHTML = `<tr><td colspan="3" class="inv-empty">還沒有加入任何材料，上面搜尋並點選要加入的物品。</td></tr>`;
      return;
    }
    keys.sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    $('invBody').innerHTML = keys.map(name => `<tr>
        <td>${esc(name)}</td>
        <td><input type="number" min="0" step="1" value="${inventory[name]}" data-qty="${esc(name)}"></td>
        <td><button type="button" class="remove" data-remove="${esc(name)}">移除</button></td>
      </tr>`).join('');
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
    } else if (removeBtn) {
      delete inventory[removeBtn.dataset.remove];
      saveInventory(); renderInventory();
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
    }
  });

  // ---------- 計算可製作物 ----------
  function calc() {
    const groups = new Map(); // 分類 -> rows[]
    for (const r of data.recipes) {
      if (r.notImplemented) continue; // 未實裝的配方不算
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
      if (!relevant) continue; // 手上完全沒有這個配方用到的任何材料，不列出來洗版
      if (!fullyCraftable) craftCount = 0;
      if (!groups.has(r.category)) groups.set(r.category, []);
      groups.get(r.category).push({ recipe: r, fullyCraftable, craftCount, missing });
    }

    if (!groups.size) {
      $('calcResults').innerHTML = `<div class="empty"><h3>目前的庫存做不出（或差很多）任何收錄的配方</h3><p>先加入幾樣持有的材料，再按一次計算看看。</p></div>`;
      return;
    }

    let html = '';
    for (const [category, rows] of groups) {
      rows.sort((a, b) => (b.fullyCraftable - a.fullyCraftable) || (b.craftCount - a.craftCount));
      html += `<div class="inv-results-group"><h2>${esc(category)}</h2>`;
      for (const row of rows) {
        if (row.fullyCraftable) {
          html += `<div class="inv-row ok">
            <span class="status">✓</span>
            <span class="name">${esc(row.recipe.name)}</span>
            <span class="count">可製作 ${number(row.craftCount)} 個</span>
          </div>`;
        } else {
          html += `<div class="inv-row partial">
            <span class="status">△</span>
            <span class="name">${esc(row.recipe.name)}
              <div class="missing">缺少：${row.missing.map(m => `${esc(m.name)} × ${number(m.short)}`).join('　')}</div>
            </span>
          </div>`;
        }
      }
      html += `</div>`;
    }
    $('calcResults').innerHTML = html;
  }

  $('calcBtn').addEventListener('click', calc);
  $('build-meta').textContent = `資料版本：${data.meta?.retrieved || ''}`;

  renderInventory();
})();
