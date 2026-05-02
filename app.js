/* ============================================================
   村田鉄筋㈱ 年間工程表 — メインアプリ
   ============================================================ */
'use strict';

/* ============================================================
   初期ダミーデータ（15件）
   ============================================================ */
const DUMMY_DATA = [
  // ── 受注済み ──────────────────────────────────────────────
  {
    id:1, juchu:'受注済', name:'大阪中央ビル新築工事',
    koujicontent:'鉄筋工事一式', motouke:'大林組',
    address:'大阪府大阪市中央区', tanto:'村田', kubun:'新築',
    quantity:280, unit:'t', zairyou:'SD345', shikyuu:'支給', zaikou:'材工',
    startDate:'2025-04-07', endDate:'2025-09-26', actualEndDate:'',
    status:'施工中', cellColor:'yellow',
    memo:'搬入は北側ゲートより', biko:'1工区・2工区に分かれて施工'
  },
  {
    id:2, juchu:'受注済', name:'南港物流センター増築',
    koujicontent:'鉄筋・型枠工事', motouke:'清水建設㈱',
    address:'大阪府大阪市住之江区', tanto:'田中', kubun:'増築',
    quantity:155, unit:'t', zairyou:'SD390', shikyuu:'支給外', zaikou:'労務',
    startDate:'2025-04-21', endDate:'2025-07-31', actualEndDate:'',
    status:'施工中', cellColor:'white',
    memo:'7月末完了予定', biko:''
  },
  {
    id:3, juchu:'受注済', name:'堺市立小学校改修工事',
    koujicontent:'鉄筋補強工事', motouke:'鹿島建設㈱',
    address:'大阪府堺市堺区', tanto:'村田', kubun:'改修',
    quantity:42, unit:'t', zairyou:'SD295', shikyuu:'支給', zaikou:'材工',
    startDate:'2025-05-12', endDate:'2025-08-08', actualEndDate:'',
    status:'注意', cellColor:'white',
    memo:'夏休み期間中に集中施工', biko:'騒音規制あり'
  },
  {
    id:4, juchu:'受注済', name:'神戸港岸壁改良工事',
    koujicontent:'鉄筋工事一式', motouke:'五洋建設㈱',
    address:'兵庫県神戸市中央区', tanto:'鈴木', kubun:'改修',
    quantity:320, unit:'t', zairyou:'SD345', shikyuu:'支給', zaikou:'材工',
    startDate:'2025-06-02', endDate:'2025-12-19', actualEndDate:'',
    status:'未着手', cellColor:'white',
    memo:'海上作業あり・天候注意', biko:'週休2日工程'
  },
  {
    id:5, juchu:'受注済', name:'阪神電鉄高架橋補強',
    koujicontent:'鉄筋補強・溶接', motouke:'大成建設㈱',
    address:'兵庫県尼崎市', tanto:'村田', kubun:'改修',
    quantity:98, unit:'t', zairyou:'混合', shikyuu:'支給外', zaikou:'材工',
    startDate:'2025-07-14', endDate:'2025-10-31', actualEndDate:'',
    status:'未着手', cellColor:'green',
    memo:'夜間施工あり', biko:'軌道近接工事'
  },
  {
    id:6, juchu:'受注済', name:'豊中市マンション新築',
    koujicontent:'RC造鉄筋工事', motouke:'竹中工務店',
    address:'大阪府豊中市', tanto:'田中', kubun:'新築',
    quantity:185, unit:'t', zairyou:'SD345', shikyuu:'支給', zaikou:'材工',
    startDate:'2025-08-04', endDate:'2026-02-27', actualEndDate:'',
    status:'未着手', cellColor:'yellow',
    memo:'地下2F〜地上15F', biko:''
  },
  {
    id:7, juchu:'受注済', name:'奈良県庁舎耐震補強',
    koujicontent:'鉄筋・アンカー工事', motouke:'西松建設㈱',
    address:'奈良県奈良市', tanto:'鈴木', kubun:'改修',
    quantity:67, unit:'t', zairyou:'SD295', shikyuu:'支給', zaikou:'材工',
    startDate:'2025-04-14', endDate:'2025-06-27', actualEndDate:'2025-06-25',
    status:'完了', cellColor:'white',
    memo:'', biko:'2日早期完了'
  },
  {
    id:8, juchu:'受注済', name:'京都駅前ホテル新築',
    koujicontent:'鉄筋工事（地下躯体）', motouke:'大林組',
    address:'京都府京都市下京区', tanto:'村田', kubun:'新築',
    quantity:410, unit:'t', zairyou:'SD390', shikyuu:'支給', zaikou:'材工',
    startDate:'2025-05-26', endDate:'2025-11-28', actualEndDate:'',
    status:'遅れ', cellColor:'white',
    memo:'地下躯体のみ当社担当', biko:'配筋検査6/15予定'
  },
  {
    id:9, juchu:'受注済', name:'吹田市工場増設工事',
    koujicontent:'鉄骨・鉄筋工事', motouke:'鹿島建設㈱',
    address:'大阪府吹田市', tanto:'田中', kubun:'増築',
    quantity:230, unit:'t', zairyou:'SD345', shikyuu:'支給外', zaikou:'材工',
    startDate:'2025-09-08', endDate:'2026-03-31', actualEndDate:'',
    status:'未着手', cellColor:'white',
    memo:'稼働中工場内施工', biko:''
  },
  {
    id:10, juchu:'受注済', name:'西宮市立病院改修',
    koujicontent:'鉄筋補強工事', motouke:'清水建設㈱',
    address:'兵庫県西宮市', tanto:'鈴木', kubun:'改修',
    quantity:55, unit:'t', zairyou:'SD295', shikyuu:'支給', zaikou:'労務',
    startDate:'2025-10-06', endDate:'2025-12-26', actualEndDate:'',
    status:'未着手', cellColor:'white',
    memo:'感染対策徹底', biko:'稼働中病院内施工'
  },
  // ── 受注の可能性あり ───────────────────────────────────────
  {
    id:11, juchu:'可能性あり', name:'大阪市立図書館新築（予定）',
    koujicontent:'鉄筋工事一式', motouke:'大成建設㈱',
    address:'大阪府大阪市天王寺区', tanto:'村田', kubun:'新築',
    quantity:200, unit:'t', zairyou:'SD345', shikyuu:'支給', zaikou:'材工',
    startDate:'2025-06-16', endDate:'2025-12-12', actualEndDate:'',
    status:'未確定', cellColor:'white',
    memo:'入札参加予定', biko:'受注確度70%'
  },
  {
    id:12, juchu:'可能性あり', name:'高槻市マンション計画',
    koujicontent:'RC造鉄筋工事', motouke:'積水ハウス㈱',
    address:'大阪府高槻市', tanto:'田中', kubun:'新築',
    quantity:140, unit:'t', zairyou:'SD345', shikyuu:'支給', zaikou:'材工',
    startDate:'2025-07-07', endDate:'2025-11-28', actualEndDate:'',
    status:'未確定', cellColor:'white',
    memo:'見積提出済', biko:'受注確度50%'
  },
  {
    id:13, juchu:'可能性あり', name:'神戸市道路橋補強（検討中）',
    koujicontent:'鉄筋・アンカー工事', motouke:'五洋建設㈱',
    address:'兵庫県神戸市', tanto:'鈴木', kubun:'改修',
    quantity:80, unit:'t', zairyou:'混合', shikyuu:'支給外', zaikou:'材工',
    startDate:'2025-08-25', endDate:'2026-01-30', actualEndDate:'',
    status:'未確定', cellColor:'white',
    memo:'現在設計段階', biko:'受注確度30%'
  },
  {
    id:14, juchu:'可能性あり', name:'枚方市複合施設新築',
    koujicontent:'鉄筋工事一式', motouke:'竹中工務店',
    address:'大阪府枚方市', tanto:'村田', kubun:'新築',
    quantity:350, unit:'t', zairyou:'SD390', shikyuu:'支給', zaikou:'材工',
    startDate:'2025-10-20', endDate:'2026-03-20', actualEndDate:'',
    status:'未確定', cellColor:'white',
    memo:'大型案件・優先対応', biko:'受注確度60%'
  },
  {
    id:15, juchu:'可能性あり', name:'奈良市集合住宅計画',
    koujicontent:'RC造鉄筋工事', motouke:'大和ハウス工業',
    address:'奈良県奈良市', tanto:'田中', kubun:'新築',
    quantity:110, unit:'t', zairyou:'SD345', shikyuu:'支給外', zaikou:'材工',
    startDate:'2025-11-17', endDate:'2026-03-31', actualEndDate:'',
    status:'未確定', cellColor:'white',
    memo:'概算見積回答済み', biko:'受注確度40%'
  }
];

/* ============================================================
   状態管理
   ============================================================ */
const state = {
  sites:        [],
  year:         2025,
  startMonth:   4,
  nextId:       100,
  editId:       null,
  deleteId:     null,
  filterTanto:  '',
  filterZairyou:'',
  filterStatus: '',
  searchText:   ''
};

/* ============================================================
   LocalStorage
   ============================================================ */
function save() {
  localStorage.setItem('mr_sites',      JSON.stringify(state.sites));
  localStorage.setItem('mr_year',       state.year);
  localStorage.setItem('mr_startMonth', state.startMonth);
  localStorage.setItem('mr_nextId',     state.nextId);
}

function load() {
  const raw = localStorage.getItem('mr_sites');
  if (raw) {
    try {
      state.sites   = JSON.parse(raw);
      state.nextId  = parseInt(localStorage.getItem('mr_nextId')  || '100');
      state.year    = parseInt(localStorage.getItem('mr_year')    || '2025');
      state.startMonth = parseInt(localStorage.getItem('mr_startMonth') || '4');
    } catch { resetData(); }
  } else {
    resetData();
  }
}

function resetData() {
  state.sites   = JSON.parse(JSON.stringify(DUMMY_DATA));
  state.nextId  = 100;
  state.year    = 2025;
  state.startMonth = 4;
}

/* ============================================================
   月・週列の生成
   ============================================================ */
/** 12か月分の {year, month} 配列 */
function getMonthList() {
  const list = [];
  for (let i = 0; i < 12; i++) {
    const m = ((state.startMonth - 1 + i) % 12) + 1;
    const y = m < state.startMonth ? state.year + 1 : state.year;
    list.push({ year: y, month: m });
  }
  return list;
}

/** 各月を上/中/下/末 の4列に分割 */
function getWeekCols(monthList) {
  const cols = [];
  monthList.forEach(({ year, month }) => {
    const dim = new Date(year, month, 0).getDate(); // days in month
    const ranges = [
      { label:'上', s:1,  e:7 },
      { label:'中', s:8,  e:14 },
      { label:'下', s:15, e:21 },
      { label:'末', s:22, e:dim }
    ];
    ranges.forEach((r, wi) => {
      cols.push({ year, month, wi, label:r.label,
                  startDay:r.s, endDay:r.e,
                  days: r.e - r.s + 1,
                  isMonthStart: wi === 0 });
    });
  });
  return cols;
}

/* ============================================================
   座標計算
   ============================================================ */
const CWIDTH = 28; // 1列のpx幅

/** 工程範囲全体の開始日・終了日 */
function getRangeEdges(weekCols) {
  const fc = weekCols[0];
  const lc = weekCols[weekCols.length - 1];
  return {
    start: new Date(fc.year, fc.month - 1, fc.startDay),
    end:   new Date(lc.year, lc.month - 1, lc.endDay + 1) // 翌日0時
  };
}

function getBarPos(startStr, endStr, weekCols) {
  if (!startStr || !endStr) return null;
  const sd = new Date(startStr), ed = new Date(endStr);
  if (isNaN(sd) || isNaN(ed)) return null;

  const { start: rs, end: re } = getRangeEdges(weekCols);
  if (ed < rs || sd > re) return null;

  const clamped_s = sd < rs ? rs : sd;
  const clamped_e = ed > re ? re : ed;

  const totalMs  = re - rs;
  const totalPx  = weekCols.length * CWIDTH;
  const pxPerMs  = totalPx / totalMs;

  const left  = (clamped_s - rs) * pxPerMs;
  const width = Math.max((clamped_e - clamped_s) * pxPerMs, 3);
  return { left, width };
}

function getTodayPx(weekCols) {
  const now = new Date();
  const { start: rs, end: re } = getRangeEdges(weekCols);
  if (now < rs || now > re) return null;
  const totalMs = re - rs;
  const totalPx = weekCols.length * CWIDTH;
  return ((now - rs) / totalMs) * totalPx;
}

/* ============================================================
   バークラス
   ============================================================ */
function barClass(site) {
  if (site.juchu === '可能性あり') return 'bar-possible';
  switch (site.status) {
    case '完了': return 'bar-complete';
    case '注意': return 'bar-caution';
    case '遅れ': return 'bar-delay';
    case '未確定': return 'bar-uncertain';
    default: return 'bar-normal';
  }
}

/* ============================================================
   フィルタリング
   ============================================================ */
function filtered() {
  return state.sites.filter(s => {
    if (state.filterTanto   && s.tanto    !== state.filterTanto)   return false;
    if (state.filterZairyou && s.zairyou  !== state.filterZairyou) return false;
    if (state.filterStatus  && s.status   !== state.filterStatus)  return false;
    if (state.searchText) {
      const q = state.searchText.toLowerCase();
      if (!(s.name||'').toLowerCase().includes(q) &&
          !(s.koujicontent||'').toLowerCase().includes(q) &&
          !(s.motouke||'').toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

/* ============================================================
   フィルターオプション更新
   ============================================================ */
function updateFilters() {
  const tantos  = [...new Set(state.sites.map(s=>s.tanto).filter(Boolean))].sort();
  const zairyo  = [...new Set(state.sites.map(s=>s.zairyou).filter(Boolean))].sort();

  const selT = document.getElementById('filterTanto');
  const curT = selT.value;
  selT.innerHTML = '<option value="">担当：全員</option>';
  tantos.forEach(t => { const o=document.createElement('option'); o.value=t; o.textContent=t; if(t===curT)o.selected=true; selT.appendChild(o); });

  const selZ = document.getElementById('filterZairyou');
  const curZ = selZ.value;
  selZ.innerHTML = '<option value="">材料：全て</option>';
  zairyo.forEach(z => { const o=document.createElement('option'); o.value=z; o.textContent=z; if(z===curZ)o.selected=true; selZ.appendChild(o); });
}

/* ============================================================
   メインレンダリング
   ============================================================ */
function render() {
  const monthList = getMonthList();
  const weekCols  = getWeekCols(monthList);
  const sites     = filtered();
  const juchu     = sites.filter(s => s.juchu === '受注済');
  const possible  = sites.filter(s => s.juchu === '可能性あり');

  renderLeft(juchu, possible);
  renderRight(juchu, possible, monthList, weekCols);
  updateFilters();
  updatePrintHeader();
  updateStats(juchu, possible);
  syncLeftScroll();

  // 今日日付ラベル更新
  const t = new Date();
  document.getElementById('todayDateLabel').textContent =
    `${t.getFullYear()}/${t.getMonth()+1}/${t.getDate()}`;

  // 年度表示更新
  document.getElementById('yearDisplay').textContent = `${state.year}年度`;
  document.getElementById('startMonth').value = state.startMonth;
}

/* ============================================================
   左パネル描画
   ============================================================ */
function renderLeft(juchu, possible) {
  const tbody = document.getElementById('leftBody');
  tbody.innerHTML = '';
  let no = 1;

  juchu.forEach(s   => tbody.appendChild(makeLeftRow(s, no++)));
  tbody.appendChild(makeSectDivLeft());

  if (possible.length === 0) {
    const tr = document.createElement('tr');
    tr.className = 'data-row';
    const td = document.createElement('td');
    td.colSpan = 8;
    td.style.cssText = 'text-align:center;color:#aaa;font-style:italic;height:30px;font-size:11px;';
    td.textContent = '（受注可能性案件なし）';
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    possible.forEach(s => tbody.appendChild(makeLeftRow(s, no++)));
  }
}

function makeLeftRow(site, no) {
  const tr = document.createElement('tr');
  tr.className = 'data-row';
  tr.dataset.id = site.id;

  // No
  const tdNo = el('td', 'c-no-cell'); tdNo.textContent = no;
  tr.appendChild(tdNo);

  // 現場名
  const tdName = el('td', `c-name-cell bg-${site.cellColor||'white'}`);
  const nameSpan = el('span','name-text');    nameSpan.textContent = site.name;
  const contSpan = el('span','content-text'); contSpan.textContent = site.koujicontent||'';
  // アクションボタン
  const actions = el('div','row-actions');
  const btnEdit = raBtn('✏ 編集', () => openEdit(site.id));
  const btnCopy = raBtn('📋 複製', () => duplicateSite(site.id));
  const btnDel  = raBtn('🗑 削除', () => openDelete(site.id), true);
  actions.append(btnEdit, btnCopy, btnDel);
  tdName.append(nameSpan, contSpan, actions);
  tdName.onclick = () => openEdit(site.id);
  tr.appendChild(tdName);

  // 担当
  const tdT = el('td','c-center'); tdT.textContent = site.tanto||''; tr.appendChild(tdT);
  // 区分
  const tdK = el('td','c-center'); tdK.textContent = site.kubun||''; tr.appendChild(tdK);
  // 数量
  const tdQ = el('td','c-right'); tdQ.textContent = site.quantity ? `${site.quantity}${site.unit}` : ''; tr.appendChild(tdQ);
  // 材料区分
  const tdM = el('td','c-center'); tdM.textContent = site.zairyou||''; tr.appendChild(tdM);
  // 支給
  const tdS = el('td','c-center'); tdS.textContent = site.shikyuu||''; tr.appendChild(tdS);
  // 材工
  const tdZ = el('td','c-center'); tdZ.textContent = site.zaikou||''; tr.appendChild(tdZ);

  return tr;
}

function makeSectDivLeft() {
  const tr = document.createElement('tr');
  tr.className = 'sect-div';
  const td = document.createElement('td');
  td.colSpan = 8;
  td.textContent = '【 受注の可能性がある現場 】';
  tr.appendChild(td);
  return tr;
}

/* ============================================================
   右パネル描画
   ============================================================ */
function renderRight(juchu, possible, monthList, weekCols) {
  const totalW = weekCols.length * CWIDTH;

  /* ── ガントヘッダー ── */
  const ghMonths = document.getElementById('ghMonths');
  const ghWeeks  = document.getElementById('ghWeeks');
  ghMonths.innerHTML = '';
  ghWeeks.innerHTML  = '';

  // 月セル（4列ずつspan）
  monthList.forEach(({ year, month }) => {
    const cell = el('div','gh-month-cell');
    const label = month + '月' + (year !== state.year ? ` ('${String(year).slice(2)})` : '');
    cell.textContent = label;
    cell.style.width = (CWIDTH * 4) + 'px';
    ghMonths.appendChild(cell);
  });

  // 週セル
  weekCols.forEach(col => {
    const cell = el('div','gh-week-cell');
    cell.textContent = col.label;
    cell.style.width = CWIDTH + 'px';
    if (col.isMonthStart) cell.classList.add('month-start');
    ghWeeks.appendChild(cell);
  });

  /* ── ガントボディ ── */
  const ganttBody = document.getElementById('ganttBody');
  ganttBody.innerHTML = '';
  ganttBody.style.width = totalW + 'px';

  const todayPx = getTodayPx(weekCols);

  const addRow = (site) => {
    const row = el('div', 'g-row month-sep');
    row.dataset.id = site.id;
    row.style.cssText = `width:${totalW}px; --cell-w:${CWIDTH}px;`;

    // 工程バー
    const pos = getBarPos(site.startDate, site.endDate, weekCols);
    if (pos) {
      const bar = el('div', `g-bar ${barClass(site)}`);
      bar.style.left  = pos.left + 'px';
      bar.style.width = pos.width + 'px';

      if (site.memo) {
        const txt = el('span','bar-text');
        txt.textContent = site.memo;
        bar.appendChild(txt);
      }

      // ツールチップ
      bar.addEventListener('mouseenter', e => showTip(e, site));
      bar.addEventListener('mousemove',  e => moveTip(e));
      bar.addEventListener('mouseleave', hideTip);
      bar.addEventListener('click',      () => openEdit(site.id));
      row.appendChild(bar);
    }

    ganttBody.appendChild(row);
  };

  const addSect = () => {
    const row = el('div','g-row sect-div-g');
    row.style.width = totalW + 'px';
    ganttBody.appendChild(row);
  };

  const addEmpty = () => {
    const row = el('div','g-row');
    row.style.cssText += `width:${totalW}px; display:flex; align-items:center; justify-content:center; color:#aaa; font-style:italic; font-size:11px;`;
    row.textContent = '（受注可能性案件なし）';
    ganttBody.appendChild(row);
  };

  juchu.forEach(s   => addRow(s));
  addSect();
  if (possible.length === 0) addEmpty();
  else possible.forEach(s => addRow(s));

  /* ── 今日の線 ── */
  const oldLine = document.getElementById('todayLine');
  if (oldLine) oldLine.remove();
  if (todayPx !== null) {
    const line = document.createElement('div');
    line.id = 'todayLine';
    line.className = 'today-line no-print';
    line.style.left = todayPx + 'px';
    const lbl = el('span','today-line-label');
    lbl.textContent = '今日';
    line.appendChild(lbl);
    ganttBody.appendChild(line);
  }
}

/* ============================================================
   スクロール同期（縦方向） — 初回1回だけ登録
   ============================================================ */
let _scrollBound = false;
function syncLeftScroll() {
  if (_scrollBound) return;
  _scrollBound = true;
  const lp = document.getElementById('leftPanel');
  const rp = document.getElementById('rightPanel');
  let lockL = false, lockR = false;
  lp.addEventListener('scroll', () => {
    if (lockL) return;
    lockR = true;
    rp.scrollTop = lp.scrollTop;
    requestAnimationFrame(() => { lockR = false; });
  });
  rp.addEventListener('scroll', () => {
    if (lockR) return;
    lockL = true;
    lp.scrollTop = rp.scrollTop;
    requestAnimationFrame(() => { lockL = false; });
  });
}

/* ============================================================
   ツールチップ
   ============================================================ */
const tipEl = document.getElementById('tooltip');

function showTip(e, s) {
  const sd = s.startDate ? s.startDate.replace(/-/g,'/') : '-';
  const ed = s.endDate   ? s.endDate.replace(/-/g,'/') : '-';
  const ae = s.actualEndDate ? ` → 実:${s.actualEndDate.replace(/-/g,'/')}` : '';
  tipEl.innerHTML =
    `<strong>${s.name}</strong><br>` +
    `${s.koujicontent||''}<br>` +
    `担当：${s.tanto||'-'}　区分：${s.kubun||'-'}<br>` +
    `数量：${s.quantity||'-'}${s.unit||''}&nbsp;&nbsp;${s.zairyou||''}<br>` +
    `工程：${sd} ～ ${ed}${ae}<br>` +
    `ステータス：<strong>${s.status||'-'}</strong>` +
    (s.memo ? `<br>📝 ${s.memo}` : '');
  tipEl.style.display = 'block';
  moveTip(e);
}
function moveTip(e) {
  const x = Math.min(e.clientX + 14, window.innerWidth  - 305);
  const y = Math.min(e.clientY + 14, window.innerHeight - 160);
  tipEl.style.left = x + 'px';
  tipEl.style.top  = y + 'px';
}
function hideTip() { tipEl.style.display = 'none'; }

/* ============================================================
   モーダル制御
   ============================================================ */
function openAdd() {
  state.editId = null;
  document.getElementById('modalTitle').textContent = '現場追加';
  clearForm();
  openOverlay('siteOverlay');
}

function openEdit(id) {
  const s = state.sites.find(x => x.id === id);
  if (!s) return;
  state.editId = id;
  document.getElementById('modalTitle').textContent = '現場編集';
  fillForm(s);
  openOverlay('siteOverlay');
}

function closeEdit() { closeOverlay('siteOverlay'); state.editId = null; }

function openDelete(id) {
  state.deleteId = id;
  const s = state.sites.find(x => x.id === id);
  document.getElementById('delMsg').textContent =
    `「${s ? s.name : ''}」を削除しますか？\nこの操作は元に戻せません。`;
  openOverlay('delOverlay');
}
function closeDelete() { closeOverlay('delOverlay'); state.deleteId = null; }

function openOverlay(id)  { document.getElementById(id).classList.add('open'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('open'); }

/* ============================================================
   フォーム
   ============================================================ */
const FID = {
  name:'f_name', content:'f_content', motouke:'f_motouke', address:'f_address',
  tanto:'f_tanto', kubun:'f_kubun', qty:'f_qty', unit:'f_unit',
  zairyou:'f_zairyou', shikyuu:'f_shikyuu', zaikou:'f_zaikou',
  start:'f_start', end:'f_end', actual:'f_actual',
  status:'f_status', juchu:'f_juchu', color:'f_color',
  memo:'f_memo', biko:'f_biko'
};

function fv(key) { return document.getElementById(FID[key]).value; }
function fs(key, val) { document.getElementById(FID[key]).value = val || ''; }

function clearForm() {
  Object.values(FID).forEach(id => { document.getElementById(id).value = ''; });
  fs('unit','t'); fs('status','未着手'); fs('juchu','受注済'); fs('color','white');
}

function fillForm(s) {
  fs('name',    s.name);       fs('content',  s.koujicontent);
  fs('motouke', s.motouke);    fs('address',  s.address);
  fs('tanto',   s.tanto);      fs('kubun',    s.kubun);
  fs('qty',     s.quantity);   fs('unit',     s.unit);
  fs('zairyou', s.zairyou);    fs('shikyuu',  s.shikyuu);
  fs('zaikou',  s.zaikou);     fs('start',    s.startDate);
  fs('end',     s.endDate);    fs('actual',   s.actualEndDate);
  fs('status',  s.status);     fs('juchu',    s.juchu);
  fs('color',   s.cellColor);  fs('memo',     s.memo);
  fs('biko',    s.biko);
}

function getForm() {
  return {
    name:         fv('name').trim(),
    koujicontent: fv('content').trim(),
    motouke:      fv('motouke').trim(),
    address:      fv('address').trim(),
    tanto:        fv('tanto').trim(),
    kubun:        fv('kubun'),
    quantity:     parseFloat(fv('qty')) || 0,
    unit:         fv('unit'),
    zairyou:      fv('zairyou'),
    shikyuu:      fv('shikyuu'),
    zaikou:       fv('zaikou'),
    startDate:    fv('start'),
    endDate:      fv('end'),
    actualEndDate:fv('actual'),
    status:       fv('status'),
    juchu:        fv('juchu'),
    cellColor:    fv('color'),
    memo:         fv('memo').trim(),
    biko:         fv('biko').trim()
  };
}

function saveSite() {
  const d = getForm();
  if (!d.name)                   return alert('現場名を入力してください。');
  if (!d.startDate || !d.endDate) return alert('工程開始日と終了予定日を入力してください。');
  if (new Date(d.startDate) > new Date(d.endDate))
    return alert('開始日が終了日より後になっています。');

  if (state.editId !== null) {
    const i = state.sites.findIndex(s => s.id === state.editId);
    if (i >= 0) state.sites[i] = { ...state.sites[i], ...d };
  } else {
    state.sites.push({ id: state.nextId++, ...d });
  }

  save(); closeEdit(); render();
}

/* ============================================================
   現場削除・複製
   ============================================================ */
function confirmDelete() {
  if (state.deleteId === null) return;
  state.sites = state.sites.filter(s => s.id !== state.deleteId);
  save(); closeDelete(); render();
}

function duplicateSite(id) {
  const s = state.sites.find(x => x.id === id);
  if (!s) return;
  state.sites.push({
    ...JSON.parse(JSON.stringify(s)),
    id: state.nextId++,
    name: s.name + '（コピー）'
  });
  save(); render();
}

/* ============================================================
   CSV エクスポート
   ============================================================ */
function exportCsv() {
  const hdrs = ['No','現場名','工事内容','元請会社','所在地','担当者','区分',
    '数量','単位','材料区分','支給','材工',
    '開始日','終了予定日','実際の終了日','ステータス','受注区分','セル背景色','工程メモ','備考'];
  const rows = state.sites.map((s,i) => [
    i+1, s.name, s.koujicontent, s.motouke, s.address, s.tanto,
    s.kubun, s.quantity, s.unit, s.zairyou, s.shikyuu, s.zaikou,
    s.startDate, s.endDate, s.actualEndDate, s.status, s.juchu,
    s.cellColor, s.memo, s.biko
  ]);
  const csv = [hdrs,...rows]
    .map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `工程表_${state.year}年度_${fmt(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ============================================================
   CSV インポート
   ============================================================ */
function importCsv(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      let text = e.target.result;
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const newSites = [];
      for (let i = 1; i < lines.length; i++) {
        const v = parseCsvRow(lines[i]);
        if (v.length < 14) continue;
        newSites.push({
          id: state.nextId++,
          name:         v[1]||'', koujicontent: v[2]||'',
          motouke:      v[3]||'', address:      v[4]||'',
          tanto:        v[5]||'', kubun:        v[6]||'',
          quantity:     parseFloat(v[7])||0, unit: v[8]||'t',
          zairyou:      v[9]||'', shikyuu:      v[10]||'',
          zaikou:       v[11]||'', startDate:   v[12]||'',
          endDate:      v[13]||'', actualEndDate:v[14]||'',
          status:       v[15]||'未着手', juchu:  v[16]||'受注済',
          cellColor:    v[17]||'white',  memo:   v[18]||'',
          biko:         v[19]||''
        });
      }
      if (!newSites.length) return alert('有効なデータがありませんでした。');
      if (confirm(`${newSites.length}件をインポートします。\nOK＝追加　キャンセル＝上書き`))
        state.sites = [...state.sites, ...newSites];
      else
        state.sites = newSites;
      save(); render();
      alert(`${newSites.length}件インポートしました。`);
    } catch(err) { alert('CSV読み込みエラー：' + err.message); }
  };
  reader.readAsText(file, 'UTF-8');
}

function parseCsvRow(line) {
  const res = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { res.push(cur); cur = ''; }
      else cur += c;
    }
  }
  res.push(cur);
  return res;
}

/* ============================================================
   ユーティリティ
   ============================================================ */
function el(tag, cls) {
  const e = document.createElement(tag.includes(' ') ? 'div' : tag);
  if (cls) e.className = cls;
  return e;
}

function raBtn(text, onClick, isDanger = false) {
  const b = document.createElement('button');
  b.className = 'ra-btn' + (isDanger ? ' ra-del' : '');
  b.textContent = text;
  b.onclick = e => { e.stopPropagation(); onClick(); };
  return b;
}

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function updatePrintHeader() {
  const today = new Date();
  document.getElementById('printTitle').textContent =
    `${state.year}年度　村田鉄筋株式会社　年間工程表`;
  document.getElementById('printDate').textContent =
    `作成日：${today.getFullYear()}/${today.getMonth()+1}/${today.getDate()}`;
}

/* ============================================================
   統計チップ更新
   ============================================================ */
function updateStats(juchu, possible) {
  const statsBar = document.getElementById('statsBar');
  if (!statsBar) return;
  const total    = juchu.length + possible.length;
  const complete = juchu.filter(s => s.status === '完了').length;
  const delay    = juchu.filter(s => s.status === '遅れ').length;
  const caution  = juchu.filter(s => s.status === '注意').length;

  statsBar.innerHTML = `
    <span class="stat-chip s-total">合計 ${total} 件</span>
    <span class="stat-chip s-juchu">受注済 ${juchu.length} 件</span>
    <span class="stat-chip s-possible">可能性 ${possible.length} 件</span>
    <span class="stat-chip s-complete">完了 ${complete} 件</span>
    ${delay > 0  ? `<span class="stat-chip s-delay">遅れ ${delay} 件</span>` : ''}
    ${caution > 0 ? `<span class="stat-chip s-delay" style="background:#fff8e1;color:#e65100;">注意 ${caution} 件</span>` : ''}
  `;
}

/* ============================================================
   イベントバインディング
   ============================================================ */
function bindEvents() {

  // 年度
  document.getElementById('prevYear').onclick = () => { state.year--; save(); render(); };
  document.getElementById('nextYear').onclick = () => { state.year++; save(); render(); };

  // 開始月
  document.getElementById('startMonth').addEventListener('change', e => {
    state.startMonth = parseInt(e.target.value); save(); render();
  });

  // 現場追加
  document.getElementById('addSiteBtn').onclick = openAdd;

  // モーダル
  document.getElementById('modalSave').onclick   = saveSite;
  document.getElementById('modalCancel').onclick = closeEdit;
  document.getElementById('modalClose').onclick  = closeEdit;
  document.getElementById('siteOverlay').onclick = e => {
    if (e.target.id === 'siteOverlay') closeEdit();
  };

  // 削除
  document.getElementById('delConfirmBtn').onclick = confirmDelete;
  document.getElementById('delCancelBtn').onclick  = closeDelete;
  document.getElementById('delOverlay').onclick = e => {
    if (e.target.id === 'delOverlay') closeDelete();
  };

  // CSV
  document.getElementById('exportCsvBtn').onclick = exportCsv;
  document.getElementById('importCsvBtn').onclick = () => document.getElementById('csvFile').click();
  document.getElementById('csvFile').onchange = e => {
    if (e.target.files[0]) { importCsv(e.target.files[0]); e.target.value = ''; }
  };

  // PDF・印刷
  document.getElementById('exportPdfBtn').onclick = () => window.print();
  document.getElementById('printBtn').onclick     = () => window.print();

  // 検索・フィルター
  document.getElementById('searchInput').addEventListener('input', e => {
    state.searchText = e.target.value; render();
  });
  document.getElementById('filterTanto').addEventListener('change', e => {
    state.filterTanto = e.target.value; render();
  });
  document.getElementById('filterZairyou').addEventListener('change', e => {
    state.filterZairyou = e.target.value; render();
  });
  document.getElementById('filterStatus').addEventListener('change', e => {
    state.filterStatus = e.target.value; render();
  });

  // ESCキー
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeEdit(); closeDelete(); }
  });
}

/* ============================================================
   初期化
   ============================================================ */
function init() {
  load();
  bindEvents();
  render();
}

document.addEventListener('DOMContentLoaded', init);
