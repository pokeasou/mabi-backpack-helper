// ===================================================================
// 瑪奇M 背包小救星 - 生產配方頁互動邏輯
// 資料來源：js/data.js（window.CRAFT_DATA，整理自台港澳客戶端資料）
// 只負責「配方名稱搜尋」；材料反查已經併入 items.html（素材圖鑑）
// ===================================================================
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const data = window.CRAFT_DATA;
  if (!data?.recipes?.length) {
    $('results').innerHTML = '<div class="empty">資料載入失敗，請確認 js/data.js 是否存在，或重新整理頁面。</div>';
    return;
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s・·]/g, '');
  const number = n => n.toLocaleString('en-US');
  // 技能需求：所需等級用紫色，「建議 Lv.X」的部分改用金色；「Lv.X」數字都加粗
  const boldLv = s => s.replace(/Lv\.?\s*\d+/g, m => `<b>${m}</b>`);
  const skillHtml = req => {
    const text = esc(req);
    const idx = text.indexOf('建議');
    if (idx === -1) return `<span style="color:#9258C4;">技能需求 ${boldLv(text)}</span>`;
    const required = text.slice(0, idx);
    const suggested = text.slice(idx);
    return `<span style="color:#9258C4;">技能需求 ${boldLv(required)}</span><span style="color:#E3AE44;">${boldLv(suggested)}</span>`;
  };

  // 名稱索引：先查素材清單，查不到再查配方成品名稱（讓半成品當材料用時也能顯示名稱）
  const nameIndex = new Map();
  for (const m of data.materials) nameIndex.set(m.name, { zh: m.zh, notImplemented: m.notImplemented });
  for (const r of data.recipes) if (!nameIndex.has(r.name)) nameIndex.set(r.name, { zh: r.zh, notImplemented: r.notImplemented });

  // 材料層級：材料本身都不是別的配方做出來的 → 第 0 層，材料中含有配方的話，層級 = 該材料層級最高者 + 1
  // 讓「鐵錠」這種基礎素材，永遠排在需要用它加工的「鋼錠」前面，即使兩者設施等級相同也不會前後顛倒
  const recipesByName = new Map(data.recipes.map(r => [r.name, r]));
  // 同名不同配方會加註「(礦石)」「(Lv.3)」等尾巴消歧，這裡建立「去掉尾巴的原名」索引，
  // 這樣配方裡寫的材料名稱（通常沒有消歧尾巴）也能對得到正確的上游配方
  const baseNameIndex = new Map();
  for (const r of data.recipes) {
    const base = r.name.replace(/\([^)]*\)$/, '');
    if (base !== r.name) {
      if (!baseNameIndex.has(base)) baseNameIndex.set(base, []);
      baseNameIndex.get(base).push(r);
    }
  }
  const tierByName = new Map();
  function tierOf(r, visiting) {
    if (tierByName.has(r.name)) return tierByName.get(r.name);
    if (visiting.has(r.name)) return 0; // 避免資料萬一有循環引用時無限遞迴
    visiting.add(r.name);
    let maxSubTier = -1;
    for (const ing of r.ingredients) {
      const subs = recipesByName.has(ing.name) ? [recipesByName.get(ing.name)] : (baseNameIndex.get(ing.name) || []);
      for (const sub of subs) {
        if (sub !== r) maxSubTier = Math.max(maxSubTier, tierOf(sub, visiting));
      }
    }
    const tier = maxSubTier + 1;
    tierByName.set(r.name, tier);
    return tier;
  }
  for (const r of data.recipes) tierOf(r, new Set());

  // 技能需求等級：取「技能需求」文字裡第一個 Lv.N（也就是必要等級，不是後面的「建議」等級），沒有記載的排最後
  const skillLevelOf = r => {
    const m = r.skillRequirement?.match(/Lv\.?\s*(\d+)/);
    return m ? Number(m[1]) : Infinity;
  };

  const state = { query: '', category: '全部', subCategory: null, level: null, exact: false, page: 1, sortDesc: false };
  const perPage = 24;
  const nameMatch = r => !norm(state.query) || norm(r.name).includes(state.exact ? norm(state.query) : norm(state.query)) && (state.exact ? norm(r.name) === norm(state.query) : true);

  // 側欄分類顯示順序：固定順序，不是資料裡的字母排序
  const CATEGORY_ORDER = ['多用途製作', '布料加工', '木材加工', '皮革加工', '金屬加工', '藥品加工', '藥品製作', '食材加工', '食物製作', '武器製作', '防具製作'];
  const orderedCategories = CATEGORY_ORDER.filter(c => data.categories.includes(c))
    .concat(data.categories.filter(c => !CATEGORY_ORDER.includes(c)));

  // 子分類顯示順序：依遊戲介面實際頁籤順序（不是每個分類都有子分類）
  const SUBCAT_ORDER = {
    '多用途製作': ['項鍊', '戒指', '生活工具', '材料', '營火', '魔法榴彈', '其他'],
    '藥品製作': ['恢復', '強化', '染色劑', '其他'],
    '食物製作': ['簡便', '力量特化', '技巧特化', '智力特化', '共享', '其他'],
  };
  function subCategoriesOf(category) {
    const order = SUBCAT_ORDER[category];
    if (!order) return [];
    const present = new Set(data.recipes.filter(r => r.category === category && r.subCategory).map(r => r.subCategory));
    return order.filter(s => present.has(s));
  }

  function sync() {
    $('search').value = state.query;
    $('exact').checked = state.exact;
  }

  function render() {
    const queryMatches = data.recipes.filter(nameMatch);
    const levels = [...new Set(data.recipes.map(r => r.level).filter(l => l != null))].sort((a, b) => a - b);

    // 分類計數：依目前搜尋字串＋等級篩選 算出各分類筆數
    const catBase = queryMatches.filter(r => state.level == null || r.level === state.level);
    const catCounts = new Map(); for (const r of catBase) catCounts.set(r.category, (catCounts.get(r.category) || 0) + 1);
    // 側欄只用來切換分頁（分類），不做子分類開合；子分類篩選一律用正文區塊上方的篩選器
    $('categories').innerHTML = ['全部', ...orderedCategories].map(c => {
      const label = `<span>${c === '全部' ? '全部類別' : esc(c)}</span><span>${number(c === '全部' ? catBase.length : catCounts.get(c) || 0)}</span>`;
      return `<button type="button" class="cat-main ${state.category === c ? 'active' : ''}" aria-pressed="${state.category === c}" data-category="${esc(c)}">${label}</button>`;
    }).join('');

    // 等級揀選器：放在分類標題右側，依目前搜尋字串＋分類／子分類篩選 算出各等級筆數
    const catSubBase = queryMatches.filter(r => (state.category === '全部' || r.category === state.category) && (!state.subCategory || r.subCategory === state.subCategory));
    const lvCounts = new Map(); for (const r of catSubBase) lvCounts.set(r.level, (lvCounts.get(r.level) || 0) + 1);
    $('levelPicker').innerHTML = ['全部', ...levels].map(l =>
      `<button type="button" class="${state.level === (l === '全部' ? null : l) ? 'active' : ''}" aria-pressed="${state.level === (l === '全部' ? null : l)}" data-level="${l === '全部' ? '' : l}">${l === '全部' ? '全部等級' : 'Lv.' + l}（${number(l === '全部' ? catSubBase.length : lvCounts.get(l) || 0)}）</button>`
    ).join('');

    // 子分類揀選器：篩選列的第二排，讓有子分類的類別（例如多用途製作）不用回側欄也能直接切換子分類
    const subcatPickerEl = $('subcatPicker');
    if (subcatPickerEl) {
      const currentSubs = subCategoriesOf(state.category);
      if (state.category !== '全部' && currentSubs.length) {
        const pickerBase = catBase.filter(r => r.category === state.category);
        const pickerCounts = new Map(); for (const r of pickerBase) pickerCounts.set(r.subCategory, (pickerCounts.get(r.subCategory) || 0) + 1);
        subcatPickerEl.hidden = false;
        subcatPickerEl.innerHTML = ['全部', ...currentSubs].map(s => {
          const val = s === '全部' ? '' : s;
          const active = s === '全部' ? !state.subCategory : state.subCategory === s;
          const count = s === '全部' ? pickerBase.length : (pickerCounts.get(s) || 0);
          return `<button type="button" class="${active ? 'active' : ''}" aria-pressed="${active}" data-category="${esc(state.category)}" data-subcategory="${esc(val)}">${s === '全部' ? '全部' : esc(s)}（${number(count)}）</button>`;
        }).join('');
      } else {
        subcatPickerEl.hidden = true;
        subcatPickerEl.innerHTML = '';
      }
    }

    // 排序：先依「加工機等級」（設施等級）由低到高排，同機器等級內再依「技能需求」排，
    // 再同技能等級內依「材料層級」排（基礎素材優先），最後同層級的用名稱排序，讓相似物品自然排在一起
    // 沒有記載設施等級（畫面上不會顯示 Lv.X）視為第 0 級，排在最上方，不是排最後
    // 點右上角的排序按鈕可以整組反過來（由高到低）
    const compareRecipes = (a, b) => (a.level ?? 0) - (b.level ?? 0)
      || skillLevelOf(a) - skillLevelOf(b)
      || tierByName.get(a.name) - tierByName.get(b.name)
      || a.name.localeCompare(b.name, 'zh-Hant');
    const matches = catSubBase
      .filter(r => state.level == null || r.level === state.level)
      .slice()
      .sort((a, b) => state.sortDesc ? -compareRecipes(a, b) : compareRecipes(a, b));
    const pages = Math.max(1, Math.ceil(matches.length / perPage));
    state.page = Math.min(state.page, pages);

    $('result-title').textContent = state.query ? '符合的製作配方' : (state.subCategory || (state.category === '全部' ? '全部製作配方' : state.category));
    $('result-count').textContent = `${number(matches.length)} 筆配方`;
    const filterNote = [
      state.category !== '全部' ? esc(state.category) : null,
      state.subCategory ? esc(state.subCategory) : null,
      state.level != null ? 'Lv.' + state.level : null,
    ].filter(Boolean).join('　');
    const scopeText = filterNote
      ? `目前範圍：${filterNote}　<button id="clear-scope">清除分類／等級篩選（${number(queryMatches.length)}）</button>`
      : (state.query ? `搜尋範圍：全部 ${data.categories.length} 個類別` : '');
    $('active-filter').innerHTML = `<span>${scopeText}</span><button type="button" id="sortToggle">製作等級：${state.sortDesc ? '由高到低 ↓' : '由低到高 ↑'}</button>`;

    if (!matches.length) {
      $('results').innerHTML = `<div class="empty"><h3>目前收錄資料中沒有符合的配方</h3><p>請嘗試縮短關鍵字，或取消精確名稱。想反查某個材料能做什麼，改用<a href="items.html">素材圖鑑</a>。<br>目前只收錄生產設施 Lv.4為止的配方，查無結果不代表遊戲中沒有這個配方。</p><button id="reset">重設搜尋與篩選</button></div>`;
    } else {
      $('results').innerHTML = matches.slice((state.page - 1) * perPage, state.page * perPage).map(r => {
        const metaParts = [];
        if (r.skillRequirement) metaParts.push(skillHtml(r.skillRequirement));
        metaParts.push(r.yield == null ? '產量未記載' : '產量 ' + r.yield + ' 個');
        metaParts.push(r.time ? esc(r.time) : '無需時間');
        return `<article class="recipe"><div><span class="badge">${esc(r.category)}${r.level ? ' · Lv.' + r.level : ''}</span><h3>${RecipeFavorites.starHtml(r.name)}${esc(r.name)}</h3><div class="meta">${metaParts.join('　·　')}</div></div><div><div class="ingredients-label">所需材料 <span>／每次製作</span></div><div class="ingredients">${r.ingredients.map(i => {
          const info = nameIndex.get(i.name);
          const ni = info?.notImplemented;
          return `<a class="ingredient" href="items.html?item=${encodeURIComponent(i.name)}" title="查看「${esc(i.name)}」的素材圖鑑"><span>${esc(i.name)}${ni ? '<span class="ni-tag">未實裝</span>' : ''}</span><b>× ${i.quantity}</b></a>`;
        }).join('')}</div></div></article>`;
      }).join('');
    }

    $('previous').disabled = state.page === 1;
    $('next').disabled = state.page === pages || !matches.length;
    $('page-info').textContent = `${state.page} / ${pages} 頁`;

    const params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    if (state.category !== '全部') params.set('category', state.category);
    if (state.subCategory) params.set('sub', state.subCategory);
    if (state.level != null) params.set('level', state.level);
    if (state.exact) params.set('exact', '1');
    if (location.protocol !== 'file:') history.replaceState(null, '', location.pathname + (params.size ? '?' + params : ''));
  }

  $('notice-date').textContent = data.meta?.snapshot || data.meta?.retrieved || '';
  $('build-meta').textContent = `資料版本：${data.meta?.retrieved || ''}`;

  $('search').addEventListener('input', e => { state.query = e.target.value; state.page = 1; render(); });
  $('exact').addEventListener('change', e => { state.exact = e.target.checked; state.page = 1; render(); });
  $('clear').onclick = () => { state.query = ''; state.exact = false; state.page = 1; sync(); render(); $('search').focus(); };

  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.subcategory) {
      state.category = b.dataset.category;
      state.subCategory = state.subCategory === b.dataset.subcategory ? null : b.dataset.subcategory;
      state.page = 1; render();
    }
    else if (b.dataset.category) {
      state.category = b.dataset.category; state.subCategory = null;
      state.page = 1; render();
    }
    else if ('level' in b.dataset) { state.level = b.dataset.level === '' ? null : Number(b.dataset.level); state.page = 1; render(); }
    else if (b.id === 'clear-scope') { state.category = '全部'; state.subCategory = null; state.level = null; state.page = 1; render(); }
    else if (b.id === 'sortToggle') { state.sortDesc = !state.sortDesc; render(); }
    else if (b.id === 'reset') { Object.assign(state, { category: '全部', subCategory: null, level: null, query: '', exact: false, page: 1 }); sync(); render(); }
  });

  for (const [id, step] of [['previous', -1], ['next', 1]]) {
    $(id).onclick = () => { state.page += step; render(); $('result-title').scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  }

  const p = new URLSearchParams(location.search);
  state.query = p.get('q') || '';
  state.category = data.categories.includes(p.get('category')) ? p.get('category') : '全部';
  state.subCategory = p.get('sub') || null;
  state.level = p.get('level') ? Number(p.get('level')) : null;
  state.exact = p.get('exact') === '1';
  sync();
  render();
})();
