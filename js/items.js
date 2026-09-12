// ===================================================================
// 瑪奇M 背包小救星 - 素材圖鑑
// 清單瀏覽（?item 沒帶值）／單一物品詳情頁（?item=物品名稱）
// ===================================================================
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const data = window.CRAFT_DATA;
  if (!data?.recipes?.length) {
    $('contentInner').innerHTML = '<div class="empty">資料載入失敗，請確認 js/data.js 是否存在，或重新整理頁面。</div>';
    return;
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s・·]/g, '');
  const number = n => n.toLocaleString('en-US');
  // 技能需求：紫色文字，「Lv.X」加粗
  const skillHtml = req => `<span style="color:#9258C4;">技能需求 ${esc(req).replace(/Lv\.?\s*\d+/g, m => `<b>${m}</b>`)}</span>`;

  // ---------- 把「素材清單」與「配方成品」合併成統一的物品清單 ----------
  // 一個物品可能同時是別的配方要用的材料、也是自己有配方可以做出來的半成品／成品
  const itemsByName = new Map();
  function touch(name) {
    if (!itemsByName.has(name)) itemsByName.set(name, { name, notImplemented: false, isMaterial: false, isCraftable: false, categories: new Set() });
    return itemsByName.get(name);
  }
  for (const m of data.materials) {
    const it = touch(m.name);
    it.notImplemented = m.notImplemented; it.isMaterial = true;
  }
  for (const r of data.recipes) {
    const it = touch(r.name);
    it.notImplemented = it.notImplemented || r.notImplemented; it.isCraftable = true;
    it.categories.add(r.category);
    it.recipeId = r.id; // 這個物品本身的配方（如果有）
    if (r.subCategory) it.subCategory = r.subCategory;
    it.level = r.level ?? null; // 製作等級：這個物品的配方需要幾級加工機，材料本身沒有配方就沒有等級
  }
  const allItems = [...itemsByName.values()];

  // 子分類顯示順序：跟生產配方頁一樣，依遊戲介面實際頁籤順序（不是每個分類都有子分類）
  const SUBCAT_ORDER = {
    '多用途製作': ['項鍊', '戒指', '生活工具', '材料', '營火', '魔法榴彈', '其他'],
    '藥品製作': ['恢復', '強化', '染色劑', '其他'],
    '食物製作': ['簡便', '力量特化', '技巧特化', '智力特化', '共享', '其他'],
  };
  function subCategoriesOf(category) {
    const order = SUBCAT_ORDER[category];
    if (!order) return [];
    const present = new Set(allItems.filter(it => it.categories.has(category) && it.subCategory).map(it => it.subCategory));
    return order.filter(s => present.has(s));
  }

  // ---------- 用於製作：這個物品被用在哪些配方裡（含數量） ----------
  const usage = new Map();
  for (const r of data.recipes) {
    for (const i of r.ingredients) {
      if (!usage.has(i.name)) usage.set(i.name, []);
      usage.get(i.name).push({ recipe: r, quantity: i.quantity });
    }
  }

  // ---------- 分類清單（側欄用） ----------
  const categoryCounts = new Map();
  for (const it of allItems) for (const c of it.categories) categoryCounts.set(c, (categoryCounts.get(c) || 0) + 1);

  const state = { query: '', category: '全部', subCategory: null, expanded: new Set(), sortDesc: false };

  function renderSidebar() {
    $('categories').innerHTML = ['全部', ...data.categories].map(c => {
      const n = c === '全部' ? allItems.length : (categoryCounts.get(c) || 0);
      const label = `<span>${c === '全部' ? '全部分類' : esc(c)}</span><span>${number(n)}</span>`;
      const mainBtn = `<button type="button" class="cat-main ${state.category === c ? 'active' : ''}" data-category="${esc(c)}">${label}</button>`;
      const subs = subCategoriesOf(c);
      if (!subs.length) return mainBtn; // 沒有子分類，不用開合按鈕
      const expanded = state.expanded.has(c);
      const row = `<div class="cat-row">${mainBtn}<button type="button" class="cat-toggle" data-toggle="${esc(c)}" aria-expanded="${expanded}" title="${expanded ? '收合子分類' : '展開子分類'}">${expanded ? '−' : '+'}</button></div>`;
      if (!expanded) return row;
      const subItems = allItems.filter(it => it.categories.has(c));
      const subCounts = new Map(); for (const it of subItems) if (it.subCategory) subCounts.set(it.subCategory, (subCounts.get(it.subCategory) || 0) + 1);
      const subHtml = subs.map((s, i) =>
        `<button type="button" class="sub ${state.category === c && state.subCategory === s ? 'active' : ''}" data-category="${esc(c)}" data-subcategory="${esc(s)}"><span class="branch">${i === subs.length - 1 ? '└' : '├'}</span><span>${esc(s)}</span><span>${number(subCounts.get(s) || 0)}</span></button>`
      ).join('');
      return row + subHtml;
    }).join('');
  }

  // ---------- 清單瀏覽畫面 ----------
  function renderBrowse() {
    document.title = '素材圖鑑｜瑪奇M 背包小救星';
    const q = norm(state.query);
    let list = allItems.filter(it => {
      if (state.category !== '全部' && !it.categories.has(state.category)) return false;
      if (state.category !== '全部' && state.subCategory && it.subCategory !== state.subCategory) return false;
      if (q && !norm(it.name).includes(q)) return false;
      return true;
    });
    // 依「製作等級」由低到高排序：純素材（沒有自己的配方）沒有等級，視為最基礎的一層排最前面，
    // 同等級內再依名稱排序；點右上角按鈕可以整組反過來
    const compareItems = (a, b) => (a.level ?? -1) - (b.level ?? -1) || a.name.localeCompare(b.name, 'zh-Hant');
    list.sort((a, b) => state.sortDesc ? -compareItems(a, b) : compareItems(a, b));

    const cards = list.map(it => `
      <a class="item-card" href="items.html?item=${encodeURIComponent(it.name)}">
        <span class="item-card-zh">${esc(it.name)}${it.notImplemented ? '<span class="ni-tag">未實裝</span>' : ''}</span>
      </a>`).join('');

    const filterNote = [
      state.category !== '全部' ? esc(state.category) : null,
      state.subCategory ? esc(state.subCategory) : null,
    ].filter(Boolean).join('　');
    const scopeText = filterNote ? `目前範圍：${filterNote}　<button type="button" id="clear-scope-items">清除分類篩選</button>` : '';

    $('contentInner').innerHTML = `
      <div class="intro">
        <div>
          <p class="eyebrow">ITEM CATALOG / 台服實測版</p>
          <h1>素材圖鑑</h1>
          <p>查一個物品：從哪裡取得、能拿來做什麼。輸入名稱搜尋，或用左側分類瀏覽。</p>
        </div>
        <div class="stats"><div><strong>${number(allItems.length)}</strong><span>收錄物品</span></div></div>
      </div>
      <div class="result-bar"><h2>${state.subCategory ? esc(state.subCategory) : (state.category === '全部' ? '全部物品' : esc(state.category))}</h2><span>${number(list.length)} 筆</span></div>
      <div id="active-filter"><span>${scopeText}</span><button type="button" id="sortToggle">製作等級：${state.sortDesc ? '由高到低 ↓' : '由低到高 ↑'}</button></div>
      ${list.length ? `<div class="item-grid">${cards}</div>` : '<div class="empty"><h3>沒有符合的物品</h3><p>換個關鍵字，或清除分類篩選試試。</p></div>'}
    `;
  }

  // ---------- 單一物品詳情畫面 ----------
  function renderDetail(name) {
    const it = itemsByName.get(name);
    if (!it) {
      $('contentInner').innerHTML = `<div class="empty"><h3>找不到這個物品</h3><p>可能還沒截圖收錄，或名稱對不上。<br><a href="items.html">回到素材圖鑑清單</a></p></div>`;
      return;
    }
    document.title = `${it.name}｜素材圖鑑｜瑪奇M 背包小救星`;

    // 取得方式：如果這個物品本身就是某個配方的成品，先顯示製作配方；掉落／採集／商店資料目前完全沒有收錄
    let acquisitionHtml = '';
    if (it.isCraftable) {
      const r = data.recipes.find(x => x.id === it.recipeId);
      const metaParts = [];
      if (r.skillRequirement) metaParts.push(skillHtml(r.skillRequirement));
      metaParts.push(r.yield == null ? '產量未記載' : `一次產出 ${r.yield} 個`);
      metaParts.push(r.time ? esc(r.time) : '無需時間');
      acquisitionHtml += `<div class="recipe-source-box">
        <div class="badge">${esc(r.category)}${r.level ? ' · Lv.' + r.level : ''}</div>
        <p style="margin:10px 0 12px;font-size:.85rem;color:var(--text-2);">可在「${esc(r.station || '')}」製作，${metaParts.join('　·　')}。</p>
        <div class="ingredients-label">所需材料</div>
        <div class="ingredients">${r.ingredients.map(i => {
          return `<a class="ingredient" href="items.html?item=${encodeURIComponent(i.name)}"><span>${esc(i.name)}</span><b>× ${i.quantity}</b></a>`;
        }).join('')}</div>
        <p style="margin-top:12px;"><a href="database.html?q=${encodeURIComponent(it.name)}&exact=1">查看完整配方頁面 →</a></p>
      </div>`;
    }
    acquisitionHtml += `<div class="item-empty-state" style="margin-top:${it.isCraftable ? '12px' : '0'};">採集地點、商店購買、任務／掉落等取得方式，目前還沒有截圖收錄，之後補上後會顯示在這裡。</div>`;

    // 用於製作：這個物品被用在哪些配方
    const usedIn = usage.get(it.name) || [];
    const usageHtml = usedIn.length
      ? `<div class="usage-list">${usedIn.map(u => {
          return `<a class="usage-row" href="items.html?item=${encodeURIComponent(u.recipe.name)}">
            <span>${esc(u.recipe.name)}${u.recipe.notImplemented ? '<span class="ni-tag">未實裝</span>' : ''}
              <span style="color:var(--text-3);font-size:.76rem;margin-left:8px;">${esc(u.recipe.category)}${u.recipe.level ? ' · Lv.' + u.recipe.level : ''}</span>
            </span>
            <span class="qty">需要 × ${u.quantity}</span>
          </a>`;
        }).join('')}</div>`
      : `<div class="item-empty-state">目前收錄的配方裡，沒有用到這個物品當材料。</div>`;

    $('contentInner').innerHTML = `
      <p><a href="items.html">← 回到素材圖鑑清單</a></p>
      <div class="item-detail-header">
        <h1>${esc(it.name)}</h1>
        <div class="tags">
          ${[...it.categories].map(c => `<span class="badge">${esc(c)}</span>`).join('')}
          ${it.notImplemented ? '<span class="ni-tag">未實裝</span>' : ''}
        </div>
      </div>
      <div class="item-section">
        <h2>取得方式</h2>
        ${acquisitionHtml}
      </div>
      <div class="item-section">
        <h2>用於製作 <span class="q">（共 ${usedIn.length} 個配方會用到）</span></h2>
        ${usageHtml}
      </div>
      <div class="item-section">
        <h2>相關攻略</h2>
        <div class="item-empty-state">攻略功能尚未上線，之後會把相關的採集路線、製作心得等文章連結放在這裡。</div>
      </div>
    `;
  }

  function render() {
    renderSidebar();
    const p = new URLSearchParams(location.search);
    const itemParam = p.get('item');
    if (itemParam) renderDetail(itemParam);
    else renderBrowse();
  }

  $('search').addEventListener('input', e => {
    state.query = e.target.value;
    // 一開始打字就離開詳情頁、回到清單瀏覽
    if (new URLSearchParams(location.search).get('item')) history.replaceState(null, '', 'items.html');
    renderBrowse();
  });
  $('clear').onclick = () => { state.query = ''; $('search').value = ''; history.replaceState(null, '', 'items.html'); renderBrowse(); $('search').focus(); };

  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.toggle) {
      // 開合按鈕：只切換子分類列表展開/收合，不影響目前的篩選結果
      if (state.expanded.has(b.dataset.toggle)) state.expanded.delete(b.dataset.toggle);
      else state.expanded.add(b.dataset.toggle);
      renderSidebar();
    }
    else if (b.dataset.subcategory) {
      state.category = b.dataset.category;
      state.subCategory = state.subCategory === b.dataset.subcategory ? null : b.dataset.subcategory;
      state.expanded.add(b.dataset.category);
      if (new URLSearchParams(location.search).get('item')) history.replaceState(null, '', 'items.html');
      renderSidebar(); renderBrowse();
    }
    else if (b.dataset.category) {
      state.category = b.dataset.category; state.subCategory = null;
      state.expanded.add(b.dataset.category);
      if (new URLSearchParams(location.search).get('item')) history.replaceState(null, '', 'items.html');
      renderSidebar(); renderBrowse();
    }
    else if (b.id === 'clear-scope-items') { state.category = '全部'; state.subCategory = null; state.expanded.clear(); renderSidebar(); renderBrowse(); }
    else if (b.id === 'sortToggle') { state.sortDesc = !state.sortDesc; renderBrowse(); }
  });

  window.addEventListener('popstate', render);

  $('build-meta').textContent = `資料版本：${data.meta?.retrieved || ''}`;

  const p0 = new URLSearchParams(location.search);
  state.query = p0.get('q') || '';
  $('search').value = state.query;
  render();
})();
