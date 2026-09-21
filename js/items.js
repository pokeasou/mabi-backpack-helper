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

  // ---------- 物品種類（側欄用）：跟倉庫計算器共用 js/kinds.js 的種類與進階順序 ----------
  const { FAMILIES, kindOf } = window.ItemKinds;
  for (const it of allItems) {
    const k = kindOf(it.name, [...it.categories][0]); // 成品用它的生產分類決定種類（料理／武器／防具…），材料用名稱
    it.kind = k.f; it.kindOrder = k.t;
  }
  const kindCounts = new Map();
  for (const it of allItems) kindCounts.set(it.kind, (kindCounts.get(it.kind) || 0) + 1);

  // kind：'全部' 或種類序號（字串）；category／subCategory 是正文上方的「製作分類」篩選，跟側欄種類可以疊加
  const state = { query: '', kind: '全部', category: '全部', subCategory: null, sortMode: 'tier' };

  // 製作分類顯示順序：固定順序，不是資料裡的字母排序
  const CATEGORY_ORDER = ['多用途製作', '布料加工', '木材加工', '皮革加工', '金屬加工', '藥品加工', '藥品製作', '食材加工', '食物製作', '武器製作', '防具製作'];
  const orderedCategories = CATEGORY_ORDER.filter(c => data.categories.includes(c))
    .concat(data.categories.filter(c => !CATEGORY_ORDER.includes(c)));

  // 排序方式：依種類進階順序（預設）→ 製作等級由低到高 → 製作等級由高到低，按鈕依序切換
  const SORT_MODES = ['tier', 'levelAsc', 'levelDesc'];
  const SORT_LABEL = { tier: '排序：種類進階順序', levelAsc: '排序：製作等級 由低到高 ↑', levelDesc: '排序：製作等級 由高到低 ↓' };

  // 側欄只用來切換種類（分頁）；製作分類與子分類篩選一律用正文區塊上方的篩選器
  function renderSidebar() {
    const rows = [['全部', '全部種類', allItems.length]];
    FAMILIES.forEach((f, i) => { const n = kindCounts.get(i) || 0; if (n) rows.push([String(i), f.name, n]); });
    $('categories').innerHTML = rows.map(([v, label, n]) =>
      `<button type="button" class="cat-main ${state.kind === v ? 'active' : ''}" data-kind="${v}"><span>${esc(label)}</span><span>${number(n)}</span></button>`
    ).join('');
  }

  // ---------- 取得方式：js/acquisition.js（整理自客戶端資料，沒載入這支檔案就當作沒有資料） ----------
  const acqData = window.ITEM_ACQUISITION?.items || {};
  const stripSuffix = name => name.replace(/\([^)]*\)$/, ''); // 「鐵錠(礦石)」這種消歧義尾巴拿掉再查
  const acqOf = name => acqData[name] || acqData[stripSuffix(name)] || null;

  // 卡片上的取得方式短標籤；完全沒有標籤代表來源待確認
  function acqTags(it) {
    const a = acqOf(it.name);
    const tags = [];
    if (a?.g) tags.push('採集');
    if (a?.s) tags.push('商店');
    if (a?.f) tags.push('釣魚');
    if (a?.m) tags.push('掉落');
    if (a?.h) tags.push('分解');
    if (it.isCraftable) tags.push('製作');
    return tags;
  }

  const cardHtml = it => {
    const tags = acqTags(it);
    const tagHtml = tags.length
      ? tags.map(t => `<span class="acq-tag">${t}</span>`).join('')
      : '<span class="acq-tag acq-tag-unknown">來源待確認</span>';
    return `
      <a class="item-card" href="items.html?item=${encodeURIComponent(it.name)}">
        <span class="item-card-zh">${esc(it.name)}${it.notImplemented ? '<span class="ni-tag">未實裝</span>' : ''}</span>
        <span class="item-card-tags">${tagHtml}</span>
      </a>`;
  };

  // 詳情頁的取得方式列：採集／商店／釣魚／怪物掉落／提示（製作與加工由下面的配方區塊呈現）
  function acqRowsHtml(a) {
    const row = (method, body) => `<div class="acq-row"><span class="acq-method">${method}</span><div class="acq-body">${body}</div></div>`;
    const mapText = (p = [], unknown) => p.length ? `${esc(p.join('、'))}${unknown ? '，其他地圖待確認' : ''}` : (unknown ? '地圖待確認' : '');
    const req = (skill, lv) => skill ? `<span class="acq-req">${esc(skill)}${lv ? ' Lv.' + lv : ''}</span>` : '';
    const rows = [];
    for (const g of a.g || []) {
      rows.push(row('採集', `<div>${esc(g.w || '採集點')}${req(g.k, g.l)}</div><div class="acq-sub">地圖：${mapText(g.p, g.u) || '地圖待確認'}</div>`));
    }
    if (a.s?.length) {
      rows.push(row('商店', `<ul class="acq-shops">${a.s.map(s => `<li><b>${esc(s.p || '地圖待確認')}</b>${s.w.length ? '　' + esc(s.w.join('、')) : ''}</li>`).join('')}</ul>`));
    }
    if (a.f) {
      rows.push(row('釣魚', `<div>垂釣${req('釣魚', a.f.l)}</div><div class="acq-sub">地圖：${mapText(a.f.p, a.f.u) || '地圖待確認'}</div>`));
    }
    if (a.m) {
      const more = a.m.n > a.m.w.length ? `　等共 ${number(a.m.n)} 種怪物` : `（共 ${number(a.m.n)} 種）`;
      rows.push(row('怪物掉落', `<div>${esc(a.m.w.join('、'))}${more}</div><div class="acq-sub">地圖：${mapText(a.m.p, true)}　僅表示掉落表包含此素材，非保證掉落</div>`));
    }
    for (const h of a.h || []) rows.push(row('分解', `<div>${esc(h)}</div>`));
    return rows.join('');
  }

  // ---------- 清單瀏覽畫面 ----------
  function renderBrowse() {
    document.title = '素材圖鑑｜瑪奇M 背包小救星';
    const q = norm(state.query);
    // 先依「種類＋搜尋字串」篩出基底，製作分類列的筆數就是從這份基底算的
    const base = allItems.filter(it =>
      (state.kind === '全部' || String(it.kind) === state.kind) && (!q || norm(it.name).includes(q)));
    const list = base.filter(it =>
      (state.category === '全部' || it.categories.has(state.category)) && (!state.subCategory || it.subCategory === state.subCategory));

    const lvl = it => it.level ?? -1; // 純素材沒有製作等級，視為最基礎的一層
    const byName = (a, b) => a.name.localeCompare(b.name, 'zh-Hant');
    const compareTier = (a, b) => a.kind - b.kind || a.kindOrder - b.kindOrder || lvl(a) - lvl(b) || byName(a, b);
    const compareLevel = (a, b) => lvl(a) - lvl(b) || compareTier(a, b);
    list.sort(state.sortMode === 'levelAsc' ? compareLevel : state.sortMode === 'levelDesc' ? (a, b) => -compareLevel(a, b) : compareTier);

    // 「全部種類」＋種類進階排序時，依種類分區顯示；其他情況一整片卡片
    let gridHtml;
    if (!list.length) {
      gridHtml = '<div class="empty"><h3>沒有符合的物品</h3><p>換個關鍵字，或清除篩選試試。</p></div>';
    } else if (state.sortMode === 'tier' && state.kind === '全部') {
      const groups = new Map();
      for (const it of list) { if (!groups.has(it.kind)) groups.set(it.kind, []); groups.get(it.kind).push(it); }
      gridHtml = [...groups].map(([k, items]) =>
        `<section class="item-kind-group"><h3>${esc(FAMILIES[k].name)}<span>${number(items.length)} 筆</span></h3><div class="item-grid">${items.map(cardHtml).join('')}</div></section>`
      ).join('');
    } else {
      gridHtml = `<div class="item-grid">${list.map(cardHtml).join('')}</div>`;
    }

    const kindName = state.kind === '全部' ? null : FAMILIES[Number(state.kind)].name;
    const filterNote = [kindName, state.category !== '全部' ? state.category : null, state.subCategory].filter(Boolean).map(esc).join('　');
    const scopeText = filterNote ? `目前範圍：${filterNote}　<button type="button" id="clear-scope-items">清除篩選</button>` : '';

    // 製作分類篩選列：放在正文上方，只列出目前種類裡實際有的製作分類
    const catCounts = new Map();
    for (const it of base) for (const c of it.categories) catCounts.set(c, (catCounts.get(c) || 0) + 1);
    const presentCats = orderedCategories.filter(c => catCounts.get(c));
    const catPickerHtml = presentCats.length
      ? `<div id="catPicker" class="level-picker subcat-picker">${['全部', ...presentCats].map(c => {
          const active = c === '全部' ? state.category === '全部' : state.category === c;
          const count = c === '全部' ? base.length : catCounts.get(c);
          return `<button type="button" class="${active ? 'active' : ''}" aria-pressed="${active}" data-category="${esc(c)}">${c === '全部' ? '全部製作分類' : esc(c)}（${number(count)}）</button>`;
        }).join('')}</div>`
      : '';

    // 子分類揀選器：跟生產配方頁一樣放在正文上方
    const currentSubs = subCategoriesOf(state.category);
    let subcatPickerHtml = '';
    if (state.category !== '全部' && currentSubs.length) {
      const pickerBase = base.filter(it => it.categories.has(state.category));
      const pickerCounts = new Map(); for (const it of pickerBase) if (it.subCategory) pickerCounts.set(it.subCategory, (pickerCounts.get(it.subCategory) || 0) + 1);
      subcatPickerHtml = `<div id="subcatPicker" class="level-picker subcat-picker">${['全部', ...currentSubs].map(s => {
        const val = s === '全部' ? '' : s;
        const active = s === '全部' ? !state.subCategory : state.subCategory === s;
        const count = s === '全部' ? pickerBase.length : (pickerCounts.get(s) || 0);
        return `<button type="button" class="${active ? 'active' : ''}" aria-pressed="${active}" data-category="${esc(state.category)}" data-subcategory="${esc(val)}">${s === '全部' ? '全部' : esc(s)}（${number(count)}）</button>`;
      }).join('')}</div>`;
    }

    const title = state.subCategory || (state.category !== '全部' ? state.category : (kindName || '全部物品'));
    $('contentInner').innerHTML = `
      <div class="intro">
        <div>
          <p class="eyebrow">ITEM CATALOG / 台服實測版</p>
          <h1>素材圖鑑</h1>
          <p>查一個物品：從哪裡取得、能拿來做什麼。輸入名稱搜尋，或用左側種類瀏覽。</p>
        </div>
      </div>
      <div class="result-bar"><h2>${esc(title)}</h2><span>${number(list.length)} 筆</span></div>
      ${catPickerHtml}
      ${subcatPickerHtml}
      <div id="active-filter"><span>${scopeText}</span><button type="button" id="sortToggle">${SORT_LABEL[state.sortMode]}</button></div>
      ${gridHtml}
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
    const acq = acqOf(it.name);
    if (acq) {
      acquisitionHtml += `<div class="acq-list">${acqRowsHtml(acq)}</div>
        <p class="acq-note">取得方式整理自台港澳客戶端資料，僅表示資料中有此來源，實際開放狀況、商店庫存與掉落機率以遊戲內為準。</p>`;
    } else if (!it.isCraftable) {
      acquisitionHtml += `<div class="item-empty-state">這個物品的取得來源目前尚未確認。</div>`;
    }

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
    const leaveDetail = () => { if (new URLSearchParams(location.search).get('item')) history.replaceState(null, '', 'items.html'); };
    if (b.dataset.kind !== undefined) {
      // 換種類：製作分類與子分類篩選一起重設，避免停在這個種類裡根本沒有的分類
      state.kind = b.dataset.kind; state.category = '全部'; state.subCategory = null;
      leaveDetail(); renderSidebar(); renderBrowse();
    }
    else if (b.dataset.subcategory) {
      state.category = b.dataset.category;
      state.subCategory = state.subCategory === b.dataset.subcategory ? null : b.dataset.subcategory;
      leaveDetail(); renderSidebar(); renderBrowse();
    }
    else if (b.dataset.category) {
      state.category = b.dataset.category; state.subCategory = null;
      leaveDetail(); renderSidebar(); renderBrowse();
    }
    else if (b.id === 'clear-scope-items') { state.kind = '全部'; state.category = '全部'; state.subCategory = null; renderSidebar(); renderBrowse(); }
    else if (b.id === 'sortToggle') { state.sortMode = SORT_MODES[(SORT_MODES.indexOf(state.sortMode) + 1) % SORT_MODES.length]; renderBrowse(); }
  });

  window.addEventListener('popstate', render);

  $('build-meta').textContent = `資料版本：${data.meta?.retrieved || ''}`;

  const p0 = new URLSearchParams(location.search);
  state.query = p0.get('q') || '';
  $('search').value = state.query;
  render();
})();
