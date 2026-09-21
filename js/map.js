// ===================================================================
// 瑪奇M 背包小救星 - 材料地圖
// 左側依「地區 → 附屬地區」瀏覽，右側列出該處可以取得的素材（依物品種類分組）
// 素材來源：js/acquisition.js 的取得方式（採集／商店／釣魚／怪物掉落）反向整理成「地圖 → 素材」
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
  const number = n => n.toLocaleString('en-US');

  // ---------- 地區階層 ----------
  // 依遊戲地圖資料整理：城鎮 → 底下連出去的狩獵場。名稱必須跟取得方式資料裡的「地圖」名稱一致。
  // 沒有素材資料的地點，側欄會淡化顯示、數量標「—」。想調整歸類、加地點，只要改這份清單就好
  const REGIONS = [
    { name: '堤爾克那地區', areas: [
      { name: '堤爾克那', note: '城鎮與周邊的一般野外' },
      { name: '狼之森林', note: '狩獵場' },
      { name: '杜加德走廊' },
      { name: '希德斯特雪原' },
    ] },
    { name: '杜巴頓地區', areas: [
      { name: '杜巴頓', note: '城鎮與周邊的一般野外' },
      { name: '女神庭園', note: '狩獵場' },
      { name: '萊爾特丘陵' },
    ] },
    { name: '庫漢地區', areas: [
      { name: '庫漢', note: '城鎮與周邊的一般野外' },
      { name: '冰霜峽谷', note: '狩獵場' },
      { name: '庫漢團隊副本' },
    ] },
    { name: '班克爾地區', areas: [
      { name: '班克爾', note: '城鎮與周邊的一般野外' },
      { name: '雲海曠野', note: '狩獵場' },
      { name: '雲之荒野', note: '雲海曠野的高難度版本' },
    ] },
  ];

  // ---------- 站上的物品（素材＋配方成品），只收錄站內有的物品，這樣點進去一定有詳情頁 ----------
  const firstCategory = new Map();
  for (const r of data.recipes) if (!firstCategory.has(r.name)) firstCategory.set(r.name, r.category);
  const siteNames = new Set([...data.materials.map(m => m.name), ...data.recipes.map(r => r.name)]);

  // ---------- 種類分組：跟素材圖鑑／倉庫計算器共用 js/kinds.js ----------
  const { FAMILIES, kindOf } = window.ItemKinds;

  // ---------- 取得方式反向索引：地圖 → 物品 → 來源 ----------
  const acqData = window.ITEM_ACQUISITION?.items || {};
  const stripSuffix = name => name.replace(/\([^)]*\)$/, '');
  const byArea = new Map(); // 地圖名 → Map(物品名 → { gather:[], shop:[], fish, drop })
  function recOf(area, name) {
    if (!byArea.has(area)) byArea.set(area, new Map());
    const m = byArea.get(area);
    if (!m.has(name)) m.set(name, { gather: [], shop: [], fish: false, drop: false });
    return m.get(name);
  }
  const mapsOf = list => list || []; // 資料裡還沒對應到地圖的來源（地圖待確認）不列入地圖
  const kindInfo = new Map(); // 物品名 → { f, t }
  for (const name of siteNames) {
    // 「光輝結晶(幽靈螢火蟲)」這種帶括號的是加工品，不是在地圖上拿到的：
    // 只有「去掉括號後的名字不是站內獨立物品」才借用基底名稱的來源（例如「鐵錠(礦石)」）
    const base = stripSuffix(name);
    const a = acqData[name] || (base !== name && !siteNames.has(base) ? acqData[base] : null);
    if (!a) continue;
    const hasSource = a.g || a.s || a.f || a.m;
    if (!hasSource) continue; // 只有「分解」之類提示、沒有地點的，不列入地圖
    kindInfo.set(name, kindOf(name, firstCategory.get(name)));
    for (const g of a.g || []) for (const p of mapsOf(g.p)) recOf(p, name).gather.push(g);
    for (const s of a.s || []) for (const p of mapsOf(s.p ? [s.p] : [])) recOf(p, name).shop.push(...s.w);
    if (a.f) for (const p of mapsOf(a.f.p)) recOf(p, name).fish = a.f;
    if (a.m) for (const p of mapsOf(a.m.p)) recOf(p, name).drop = true;
  }

  // ---------- 取得方式篩選 ----------
  const METHODS = [
    ['gather', '採集', r => r.gather.length > 0],
    ['fish', '釣魚', r => !!r.fish],
    ['drop', '怪物掉落', r => r.drop],
    ['shop', '商店購買', r => r.shop.length > 0],
  ];
  const matchMethod = (rec, key) => key === '全部' || METHODS.find(m => m[0] === key)[2](rec);

  // 內容分成兩區：「蒐集素材」（採集／釣魚／怪物掉落）與「商店購買」（NPC 商店）各自依物品種類分組
  // 同一個素材若兩種方式都拿得到，兩區都會出現
  const ZONES = [
    { key: 'collect', title: '蒐集素材', keys: ['gather', 'fish', 'drop'] },
    { key: 'shop', title: '商店購買', keys: ['shop'] },
  ];
  // 這個素材在指定區塊、依目前的取得方式篩選後，是否屬於該區
  const inZone = (rec, zone, method) =>
    zone.keys.some(k => (method === '全部' || method === k) && matchMethod(rec, k));

  // ---------- 狀態 ----------
  // region：目前選的地區；area：null 代表整個地區（合併底下所有附屬地區），否則是單一附屬地區
  const state = { region: REGIONS[0].name, area: null, method: '全部' };
  const expanded = new Set([REGIONS[0].name]);

  const regionByName = name => REGIONS.find(r => r.name === name);
  const areasOfRegion = region => region.areas.map(a => a.name);
  // 一個地區底下有素材的物品清單（各附屬地區合併，去重）
  function itemsOfAreas(areaNames) {
    const merged = new Map(); // 物品 → { rec: 合併後來源, areas: [出現的附屬地區] }
    for (const an of areaNames) {
      const m = byArea.get(an);
      if (!m) continue;
      for (const [name, rec] of m) {
        if (!merged.has(name)) merged.set(name, { name, rec: { gather: [], shop: [], fish: false, drop: false }, areas: [] });
        const e = merged.get(name);
        e.areas.push({ area: an, rec });
        e.rec.gather.push(...rec.gather); e.rec.shop.push(...rec.shop);
        e.rec.fish = e.rec.fish || rec.fish; e.rec.drop = e.rec.drop || rec.drop;
      }
    }
    return [...merged.values()];
  }
  const countOf = areaNames => itemsOfAreas(areaNames).length;

  // ---------- 側欄 ----------
  function renderSidebar() {
    const html = [];
    for (const r of REGIONS) {
      const names = areasOfRegion(r);
      const open = expanded.has(r.name);
      const isRegion = state.region === r.name && !state.area;
      html.push(`
        <div class="cat-row">
          <button type="button" class="cat-main ${isRegion ? 'active' : ''}" data-region="${esc(r.name)}"><span>${esc(r.name)}</span><span>${number(countOf(names))}</span></button>
          <button type="button" class="cat-toggle" data-toggle="${esc(r.name)}" aria-expanded="${open}" aria-label="${open ? '收合' : '展開'}${esc(r.name)}">${open ? '▾' : '▸'}</button>
        </div>`);
      if (open) {
        for (const a of r.areas) {
          const n = byArea.get(a.name)?.size || 0;
          const active = state.area === a.name;
          html.push(`<button type="button" class="sub ${active ? 'active' : ''} ${n ? '' : 'no-data'}" data-region="${esc(r.name)}" data-area="${esc(a.name)}"><span>└ ${esc(a.name)}</span><span${n ? '' : ' title="目前沒有這個地點的素材資料"'}>${n ? number(n) : '—'}</span></button>`);
        }
      }
    }
    $('areas').innerHTML = html.join('');
  }

  // ---------- 內容 ----------
  function cardHtml(e, singleArea, zone) {
    // 標籤只標這一區的取得方式（商店購買區不需要標籤，整區就是商店）
    const tags = METHODS.filter(m => zone.keys.includes(m[0]) && m[2](e.rec) && (state.method === '全部' || state.method === m[0])).map(m => m[1]);
    const tagHtml = zone.key === 'shop' ? '' : `<span class="item-card-tags">${tags.map(t => `<span class="acq-tag">${t}</span>`).join('')}</span>`;
    let how = '';
    if (singleArea) {
      // 單一地點：直接寫出在這裡怎麼拿（採集點＋所需技能／商店 NPC）
      if (zone.key === 'shop') {
        const npcs = [...new Set(e.rec.shop.map(w => w.split('／').pop()))];
        how = `<span class="map-how"><b>商店</b>${esc(npcs.slice(0, 3).join('、'))}${npcs.length > 3 ? `　等 ${npcs.length} 位` : ''}</span>`;
      } else if (e.rec.gather.length && inZone(e.rec, { keys: ['gather'] }, state.method)) {
        const pts = [...new Set(e.rec.gather.map(g => `${g.w}（${g.k}${g.l ? ` Lv.${g.l}` : ''}）`))];
        how = `<span class="map-how"><b>採集</b>${esc(pts.slice(0, 3).join('、'))}${pts.length > 3 ? `　等 ${pts.length} 處` : ''}</span>`;
      }
    } else {
      // 整個地區：列出是在哪些附屬地區拿得到（只列這一區、篩選後仍符合的）
      const where = e.areas.filter(x => inZone(x.rec, zone, state.method)).map(x => x.area);
      how = `<span class="map-how"><b>出現於</b>${esc(where.join('、'))}</span>`;
    }
    return `
      <a class="item-card map-card" href="items.html?item=${encodeURIComponent(e.name)}">
        <span class="item-card-zh">${esc(e.name)}</span>
        ${how}
        ${tagHtml}
      </a>`;
  }

  // 一個區塊：標題＋依物品種類分組的卡片
  function zoneHtml(zone, entries, singleArea) {
    const groups = new Map();
    for (const e of entries) { const f = kindInfo.get(e.name).f; if (!groups.has(f)) groups.set(f, []); groups.get(f).push(e); }
    const kinds = [...groups].map(([f, items]) =>
      `<section class="item-kind-group"><h3>${esc(FAMILIES[f].name)}<span>${number(items.length)} 筆</span></h3><div class="item-grid">${items.map(e => cardHtml(e, singleArea, zone)).join('')}</div></section>`
    ).join('');
    return `<section class="map-zone"><h2 class="map-zone-head">${esc(zone.title)}<span>${number(entries.length)} 種</span></h2><div class="map-zone-body">${kinds}</div></section>`;
  }

  function render() {
    const region = regionByName(state.region);
    const areaMeta = state.area ? region.areas.find(a => a.name === state.area) : null;
    const areaNames = state.area ? [state.area] : areasOfRegion(region);
    const singleArea = !!state.area;

    const all = itemsOfAreas(areaNames);
    const byKind = (a, b) => {
      const ka = kindInfo.get(a.name), kb = kindInfo.get(b.name);
      return ka.f - kb.f || ka.t - kb.t || a.name.localeCompare(b.name, 'zh-Hant');
    };
    // 兩個區塊各自篩選、排序；標題旁的數量是兩區合併去重後的素材種數
    const zoneEntries = ZONES.map(z => [z, all.filter(e => inZone(e.rec, z, state.method)).sort(byKind)]);
    const total = new Set(zoneEntries.flatMap(([, es]) => es.map(e => e.name))).size;

    // 標題與麵包屑
    const title = state.area || state.region;
    document.title = `${title}｜材料地圖｜瑪奇M 背包小救星`;
    const crumb = state.area ? `${esc(state.region)}　›　` : '';
    const note = areaMeta?.note || (state.area ? '' : `${areaNames.length} 個地點合併顯示，可從左側展開挑選單一地點。`);

    // 取得方式篩選列
    const pickerHtml = all.length
      ? `<div id="methodPicker" class="level-picker subcat-picker">${[['全部', '全部方式'], ...METHODS.map(m => [m[0], m[1]])].map(([key, label]) => {
          const n = key === '全部' ? all.length : all.filter(e => matchMethod(e.rec, key)).length;
          if (key !== '全部' && !n) return '';
          const active = state.method === key;
          return `<button type="button" class="${active ? 'active' : ''}" aria-pressed="${active}" data-method="${key}">${esc(label)}（${number(n)}）</button>`;
        }).join('')}</div>`
      : '';

    // 「蒐集素材」與「商店購買」兩區，各自依物品種類分組；沒有內容的區塊不顯示
    let body;
    if (!all.length) {
      body = `<div class="empty"><h3>目前沒有這個地點的素材資料</h3><p>客戶端資料裡還沒有把素材對應到「${esc(title)}」。之後有資料會再補上。</p></div>`;
    } else {
      body = zoneEntries.filter(([, es]) => es.length).map(([z, es]) => zoneHtml(z, es, singleArea)).join('');
    }

    $('contentInner').innerHTML = `
      <div class="intro">
        <div>
          <p class="eyebrow">MATERIAL MAP / 台服實測版</p>
          <h1>材料地圖</h1>
          <p>選一個地區，看看那裡可以採集、釣魚、掉落或買到哪些素材。點素材可以看完整取得方式與用途。</p>
        </div>
      </div>
      <div class="result-bar"><h2>${crumb ? `<span class="map-crumb">${crumb}</span>` : ''}${esc(title)}</h2><span>${number(total)} 種素材</span></div>
      ${note ? `<p class="map-note">${esc(note)}</p>` : ''}
      ${pickerHtml}
      ${body}`;
  }

  // 同步網址（可以直接分享某個地區的連結），不新增瀏覽紀錄
  function syncUrl() {
    try {
      const p = new URLSearchParams();
      p.set('area', state.area || state.region);
      history.replaceState(null, '', `${location.pathname}?${p}`);
    } catch (e) { /* 某些環境不允許改網址，忽略 */ }
  }
  function refresh() { renderSidebar(); render(); syncUrl(); }

  // ---------- 事件 ----------
  $('areas').addEventListener('click', e => {
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      const name = toggle.dataset.toggle;
      expanded.has(name) ? expanded.delete(name) : expanded.add(name);
      renderSidebar();
      return;
    }
    const btn = e.target.closest('[data-region]');
    if (!btn) return;
    state.region = btn.dataset.region;
    state.area = btn.dataset.area || null;
    state.method = '全部';
    if (regionByName(state.region)) expanded.add(state.region); // 選了地區就順手展開，看得到底下的附屬地區
    refresh();
    // 手機版側欄在內容上方（直向展開），選完地點要自動捲到內容區；桌機版側欄在左邊，捲回頂端即可
    if (window.matchMedia('(max-width: 900px)').matches) $('contentInner').scrollIntoView({ block: 'start' });
    else window.scrollTo({ top: 0 });
  });
  $('contentInner').addEventListener('click', e => {
    const m = e.target.closest('[data-method]');
    if (!m) return;
    state.method = m.dataset.method;
    render();
  });

  // ---------- 由網址決定起始位置：?area=地區名 或 附屬地區名 ----------
  const wanted = new URLSearchParams(location.search).get('area');
  if (wanted) {
    const asRegion = regionByName(wanted);
    const owner = REGIONS.find(r => r.areas.some(a => a.name === wanted));
    if (asRegion) { state.region = asRegion.name; state.area = null; expanded.add(asRegion.name); }
    else if (owner) { state.region = owner.name; state.area = wanted; expanded.add(owner.name); }
  }

  refresh();
})();
