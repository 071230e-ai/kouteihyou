/* ============================================================
 * 村田鉄筋株式会社 - 年間工程表管理システム
 * フロントエンド ロジック
 *  - 12カ月ローリング表示
 *  - 数量はt統一
 *  - 構造は自由入力
 *  - 受注状況/材料区分の追加
 *  - 集計ページ拡充 + PDF/印刷/CSV
 * ============================================================ */

(function () {
  'use strict';

  // ---------- 定数 ----------
  const STORAGE_KEY = 'murata_tekkin_sites_v1';
  const ROLE_KEY = 'murata_tekkin_role_v1';
  const RANGE_KEY = 'murata_tekkin_range_v2';

  // 材料区分: 「材工」「支給材」の2択に統一
  const MATERIAL_OPTIONS = ['材工', '支給材'];
  const SUPPLY_KEYS = ['支給材'];   // 青系 = 支給材
  const MW_KEYS     = ['材工'];     // 緑系 = 材工

  // 旧データの材料区分値を新スキーマに正規化
  function normalizeMaterial(m) {
    if (!m) return '';
    const v = String(m).trim();
    // 旧 → 新
    if (v === '支給' || v === '支給外' || v === '材料' || v === '支給材') return '支給材';
    if (v === '材工' || v === '労務') return '材工';
    // それ以外(SD345等の自由入力) はデフォルトとして「材工」に寄せる(消失防止のためメモには影響なし)
    return v === '' ? '' : (MATERIAL_OPTIONS.includes(v) ? v : '材工');
  }

  // ---------- 状態 ----------
  let sites = [];
  let editingId = null;
  const today = new Date();
  let startYear = today.getFullYear();
  let startMonth = today.getMonth(); // 0-11

  let currentRole = 'admin';
  let filters = {
    name: '', manager: '', structure: '', material: '', orderStatus: '',
    amountMin: null, amountMax: null
  };
  let listSearch = '';

  // ---------- ストレージ ----------
  function loadSites() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      // 既存データの下位互換マイグレーション
      sites = arr.map(migrateSite);
    } catch (e) {
      console.error('load error', e);
      sites = [];
    }
  }
  function saveSites() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
  }
  // 旧データの構造を新スキーマに変換(エラーにならないように)
  // 注意: shikyuu / zaikou は新スキーマでは使わないため移行時に破棄。
  //       ただし古い JSON に残っていてもエラーにならないように ?? で参照保護。
  function migrateSite(s) {
    if (!s || typeof s !== 'object') return s;
    // 番号(siteNo / no どちらでも受ける、優先は siteNo)
    let siteNo = null;
    const rawNo = (s.siteNo !== undefined && s.siteNo !== null && s.siteNo !== '')
      ? s.siteNo : s.no;
    if (rawNo !== undefined && rawNo !== null && rawNo !== '') {
      const n = Number(rawNo);
      if (isFinite(n) && n > 0) siteNo = Math.floor(n);
    }
    // 材料区分: 既存 zairyou / material / 旧 shikyuu・zaikou フラグから推定
    let material = s.zairyou || s.material;
    if (!material) {
      // 旧フラグから復元
      if (s.shikyuu === true || s.shikyuu === '〇' || s.shikyuu === '○' || s.shikyuu === 1) material = '支給材';
      else if (s.zaikou === true || s.zaikou === '〇' || s.zaikou === '○' || s.zaikou === 1) material = '材工';
      else material = normalizeOldContractType(s.contractType);
    }
    material = normalizeMaterial(material);

    return {
      id: s.id || uid(),
      siteNo: siteNo,                       // 表示順用(任意)
      no: siteNo,                           // 互換用エイリアス(古いコードからの参照保護)
      name: s.name || s.siteName || '',
      manager: s.manager || '',
      // 旧 kubun → structure に移行
      structure: s.structure || s.kubun || '',
      quantity: convertQuantityToT(s.quantity, s.quantityUnit || s.unit),
      // 材料区分(zairyou)に一本化。shikyuu/zaikou は使わない。
      zairyou: material,
      material: material,                   // 互換用エイリアス
      orderStatus: s.orderStatus || '受注済み',
      startDate: s.startDate || '',
      endDate: s.endDate || '',
      actualEndDate: s.actualEndDate || '',
      status: s.status || '',
      cellColor: s.cellColor || '',
      processMemo: s.processMemo || '',
      contractor: s.contractor || s.prime || '',
      address: s.address || '',
      amount: toNumberSafe(s.amount != null ? s.amount : s.contractAmount),
      memo: s.memo || '',
      createdAt: s.createdAt || new Date().toISOString(),
      updatedAt: s.updatedAt || new Date().toISOString()
    };
  }
  // 番号未設定のデータには採番しない(仕様9: 番号なしはリスト末尾に表示)
  // 互換エイリアス維持のためのみ呼ぶ
  function ensureSiteNumbers() {
    sites.forEach(s => {
      if (s.siteNo !== undefined && s.siteNo !== null && s.siteNo !== '') {
        const n = Number(s.siteNo);
        s.siteNo = (isFinite(n) && n > 0) ? Math.floor(n) : null;
      } else {
        s.siteNo = null;
      }
      s.no = s.siteNo; // 互換用
    });
  }
  // 番号順ソート用比較関数
  // - 番号ありが先(若い順)
  // - 番号なしは末尾(その中では id 順 = 登録順)
  // - 同番号は id(=登録時タイムスタンプを含む)で安定ソート
  function compareByNo(a, b) {
    const naRaw = (a.siteNo != null) ? Number(a.siteNo) : (a.no != null ? Number(a.no) : NaN);
    const nbRaw = (b.siteNo != null) ? Number(b.siteNo) : (b.no != null ? Number(b.no) : NaN);
    const aHas = isFinite(naRaw) && naRaw > 0;
    const bHas = isFinite(nbRaw) && nbRaw > 0;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    if (aHas && bHas && naRaw !== nbRaw) return naRaw - nbRaw;
    // 番号なし同士、または同番号 → id 順(登録順)
    return String(a.id || '').localeCompare(String(b.id || ''));
  }
  // 次の番号(新規登録時のデフォルト表示。ユーザーは空にもできる)
  function nextSiteNo() {
    const used = sites.map(s => Number(s.siteNo || s.no)).filter(n => isFinite(n) && n > 0);
    return used.length ? Math.max.apply(null, used) + 1 : 1;
  }
  function convertQuantityToT(q, unit) {
    const n = Number(q);
    if (!isFinite(n)) return 0;
    if (unit === 'kg') return Math.round(n / 10) / 100; // kg → t
    return n;
  }
  function normalizeOldContractType(c) {
    if (!c) return '';
    // 旧スキーマからの移行: contractType の値はそのまま材料区分の候補に
    return c;
  }
  function toNumberSafe(v) {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(String(v).replace(/[^\d.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }

  function loadRange() {
    try {
      const raw = localStorage.getItem(RANGE_KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (typeof v.year === 'number' && typeof v.month === 'number') {
          startYear = v.year;
          startMonth = v.month;
        }
      }
    } catch (e) { /* ignore */ }
  }
  function saveRange() {
    localStorage.setItem(RANGE_KEY, JSON.stringify({ year: startYear, month: startMonth }));
  }

  // ---------- ユーティリティ ----------
  function uid() {
    return 'site_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function fmtAmount(n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return Number(n).toLocaleString('ja-JP');
  }
  function fmtTons(n) {
    if (n === null || n === undefined || isNaN(n)) return '0t';
    return Number(n).toLocaleString('ja-JP', { maximumFractionDigits: 3 }) + 't';
  }
  function parseAmount(str) {
    if (str === null || str === undefined) return NaN;
    const cleaned = String(str).replace(/[^\d.\-]/g, '');
    if (cleaned === '' || cleaned === '-') return NaN;
    return Number(cleaned);
  }
  function toDate(s) {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDateJP(s) {
    const d = toDate(s);
    if (!d) return '';
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  }
  function fmtDateTimeJP(d) {
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function normalizeYM(year, monthIdx) {
    const d = new Date(year, monthIdx, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }
  function buildMonthList(year, monthIdx, count) {
    const arr = [];
    for (let i = 0; i < count; i++) arr.push(normalizeYM(year, monthIdx + i));
    return arr;
  }
  function getRangeStartDate() {
    return new Date(startYear, startMonth, 1, 0, 0, 0);
  }
  function getRangeEndDate() {
    const endYM = normalizeYM(startYear, startMonth + 11);
    const lastDay = new Date(endYM.year, endYM.month + 1, 0);
    return new Date(endYM.year, endYM.month, lastDay.getDate(), 23, 59, 59);
  }
  function getRangeLabel() {
    const endYM = normalizeYM(startYear, startMonth + 11);
    return `${startYear}年${startMonth + 1}月 〜 ${endYM.year}年${endYM.month + 1}月`;
  }

  function showToast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (type || '');
    setTimeout(() => { t.className = 'toast'; }, 2400);
  }

  // 材料区分→工期バーの色クラス
  function barClassByMaterial(material) {
    const m = normalizeMaterial(material);
    if (m === '支給材') return 'bar-supply';
    if (m === '材工') return 'bar-materialwork';
    return 'bar-other';
  }
  // 材料区分→バッジクラス
  function badgeClassByMaterial(material) {
    const m = normalizeMaterial(material);
    if (m === '支給材') return 'badge-supply';
    if (m === '材工') return 'badge-materialwork';
    return 'badge-other';
  }

  // ============================================================
  // 値ごとのタグ色分け(画面・PDF・印刷で同じルール)
  // ============================================================

  // ハッシュ関数(同じ文字列なら必ず同じ数値を返す)
  function hashCode(str) {
    let h = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  // 色パレット: 落ち着いた配色12色(濃いめ・文字白)
  const TAG_PALETTE = [
    'palette-blue',     // 青系
    'palette-green',    // 緑系
    'palette-orange',   // オレンジ系
    'palette-purple',   // 紫系
    'palette-teal',     // ティール
    'palette-brown',    // 茶系
    'palette-navy',     // 紺系
    'palette-pink',     // ピンク系
    'palette-cyan',     // シアン
    'palette-indigo',   // インディゴ
    'palette-olive',    // オリーブ
    'palette-rose'      // ローズ
  ];

  function paletteByValue(val) {
    const v = String(val || '').trim();
    if (!v) return 'palette-gray';
    return TAG_PALETTE[hashCode(v) % TAG_PALETTE.length];
  }

  // 担当者: ハッシュ + よく使う名前は固定色
  const TANTO_FIXED = {
    '村田': 'palette-blue',
    '田中': 'palette-green',
    '鈴木': 'palette-orange',
    '山田': 'palette-navy',
    '佐藤': 'palette-purple',
    '高橋': 'palette-teal',
    '伊藤': 'palette-pink',
    '渡辺': 'palette-indigo'
  };
  function tantoClass(name) {
    const v = String(name || '').trim();
    if (!v) return 'palette-gray';
    // 苗字が固定リストに含まれるか(部分一致)
    for (const k in TANTO_FIXED) {
      if (v.indexOf(k) === 0 || v.indexOf(k) >= 0) return TANTO_FIXED[k];
    }
    return paletteByValue(v);
  }

  // 構造: 値ごとに固定+ハッシュ
  const STRUCTURE_FIXED = {
    'RC造': 'palette-navy',
    'S造': 'palette-purple',
    'SRC造': 'palette-green',
    'WRC造': 'palette-teal',
    '木造基礎': 'palette-brown',
    'マンションRC造': 'palette-navy',
    '物流倉庫S造': 'palette-purple',
    '耐震補強': 'palette-orange',
    '橋梁': 'palette-indigo',
    '土木構造物': 'palette-olive',
    'その他': 'palette-gray'
  };
  function structureClass(s) {
    const v = String(s || '').trim();
    if (!v) return 'palette-gray';
    if (STRUCTURE_FIXED[v]) return STRUCTURE_FIXED[v];
    // 部分一致
    for (const k in STRUCTURE_FIXED) {
      if (v.indexOf(k) >= 0) return STRUCTURE_FIXED[k];
    }
    return paletteByValue(v);
  }

  // 材料区分(2択: 材工 / 支給材)
  function materialClass(m) {
    const v = normalizeMaterial(m);
    if (v === '材工')   return 'tag-zaikou';
    if (v === '支給材') return 'tag-shikyuu';
    return 'palette-gray';
  }

  // ステータス
  const STATUS_FIXED = {
    '未着手': 'tag-status-michakushu',
    '施工中': 'tag-status-sekouchu',
    '完了':   'tag-status-kanryo',
    '注意':   'tag-status-chui',
    '遅れ':   'tag-status-okure',
    '未確定': 'tag-status-mikakutei'
  };
  function statusClass(s) {
    return STATUS_FIXED[s] || 'palette-gray';
  }

  // 受注区分
  function orderClass(o) {
    if (o === '受注済み' || o === '受注済') return 'tag-order-confirmed';
    if (o === '受注可能性' || o === '可能性あり') return 'tag-order-tentative';
    return 'palette-gray';
  }

  // 工期日付からステータスを推定(未指定時)
  function deriveStatus(site) {
    if (site.status) return site.status;
    if (site.orderStatus === '受注可能性') return '未確定';
    const sd = toDate(site.startDate);
    const ed = toDate(site.endDate);
    const now = new Date();
    if (!sd || !ed) return '未着手';
    if (now < sd) return '未着手';
    if (now > ed) return '完了';
    return '施工中';
  }

  // タグHTML生成ヘルパ
  function paramTag(value, cls, opts) {
    if (value === '' || value === null || value === undefined) return '';
    const o = opts || {};
    const extra = o.extra ? ' ' + o.extra : '';
    const title = o.title ? ` title="${escapeAttr(o.title)}"` : '';
    return `<span class="param-tag ${cls}${extra}"${title}>${escapeHtml(value)}</span>`;
  }

  // ---------- タブ切替 ----------
  function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + tab).classList.add('active');
        if (tab === 'schedule') renderSchedule();
        if (tab === 'list') renderList();
        if (tab === 'summary') renderSummary();
      });
    });
  }

  // ---------- 年月セレクタ ----------
  function setupRangeSelectors() {
    const baseYear = new Date().getFullYear();
    const years = [];
    for (let y = baseYear - 5; y <= baseYear + 7; y++) years.push(y);

    const yearOpts = years.map(y => `<option value="${y}">${y}年</option>`).join('');
    const monthOpts = Array.from({ length: 12 }, (_, i) =>
      `<option value="${i}">${i + 1}月</option>`
    ).join('');

    ['scheduleStartYear', 'summaryStartYear'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) sel.innerHTML = yearOpts;
    });
    ['scheduleStartMonth', 'summaryStartMonth'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) sel.innerHTML = monthOpts;
    });

    syncRangeUI();

    ['scheduleStartYear', 'scheduleStartMonth', 'summaryStartYear', 'summaryStartMonth'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        if (id.startsWith('schedule')) {
          startYear = Number(document.getElementById('scheduleStartYear').value);
          startMonth = Number(document.getElementById('scheduleStartMonth').value);
        } else {
          startYear = Number(document.getElementById('summaryStartYear').value);
          startMonth = Number(document.getElementById('summaryStartMonth').value);
        }
        saveRange();
        syncRangeUI();
        renderSchedule();
        renderSummary();
      });
    });

    document.getElementById('btnRangePrev').addEventListener('click', () => shiftRange(-1));
    document.getElementById('btnRangeNext').addEventListener('click', () => shiftRange(1));
    document.getElementById('btnRangeToday').addEventListener('click', () => {
      const now = new Date();
      startYear = now.getFullYear();
      startMonth = now.getMonth();
      saveRange();
      syncRangeUI();
      renderSchedule();
      renderSummary();
    });
  }

  function shiftRange(deltaMonths) {
    const ym = normalizeYM(startYear, startMonth + deltaMonths);
    startYear = ym.year;
    startMonth = ym.month;
    saveRange();
    syncRangeUI();
    renderSchedule();
    renderSummary();
  }

  function syncRangeUI() {
    ['scheduleStartYear', 'summaryStartYear'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) sel.value = String(startYear);
    });
    ['scheduleStartMonth', 'summaryStartMonth'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) sel.value = String(startMonth);
    });
    const label = getRangeLabel();
    ['rangeLabel', 'summaryRangeLabel'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = label;
    });
    // 印刷用ヘッダー
    const sr = document.getElementById('schedulePrintRange');
    if (sr) sr.textContent = `表示期間：${label}`;
    const smr = document.getElementById('summaryPrintRange');
    if (smr) smr.textContent = `表示期間：${label}`;
  }

  // ---------- 権限切替 ----------
  function setupRole() {
    const sel = document.getElementById('roleSelect');
    const stored = localStorage.getItem(ROLE_KEY) || 'admin';
    currentRole = stored;
    sel.value = stored;
    applyRole();
    sel.addEventListener('change', () => {
      currentRole = sel.value;
      localStorage.setItem(ROLE_KEY, currentRole);
      applyRole();
      renderList();
    });
  }
  function applyRole() {
    document.body.classList.toggle('role-viewer', currentRole === 'viewer');
    const regTab = document.querySelector('.tab-btn[data-tab="register"]');
    if (regTab) {
      regTab.style.display = currentRole === 'viewer' ? 'none' : '';
      if (currentRole === 'viewer' && regTab.classList.contains('active')) {
        document.querySelector('.tab-btn[data-tab="schedule"]').click();
      }
    }
  }

  // ---------- フォーム ----------
  function setupForm() {
    const form = document.getElementById('siteForm');
    const amountInput = document.getElementById('amount');

    amountInput.addEventListener('input', () => {
      const cur = amountInput.selectionStart;
      const before = amountInput.value;
      const cleaned = before.replace(/[^\d]/g, '');
      const formatted = cleaned ? Number(cleaned).toLocaleString('ja-JP') : '';
      amountInput.value = formatted;
      const diff = formatted.length - before.length;
      try { amountInput.setSelectionRange(cur + diff, cur + diff); } catch (e) {}
    });

    document.getElementById('startDate').addEventListener('change', () => {
      const sd = document.getElementById('startDate').value;
      const ed = document.getElementById('endDate');
      if (sd && !ed.value) ed.value = sd;
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitForm();
    });

    document.getElementById('btnCancel').addEventListener('click', () => {
      resetForm();
      document.querySelector('.tab-btn[data-tab="schedule"]').click();
    });
  }

  function clearErrors() {
    document.querySelectorAll('.error-msg').forEach(e => e.textContent = '');
    document.querySelectorAll('.form-input').forEach(e => e.classList.remove('has-error'));
  }
  function setError(field, msg) {
    const el = document.querySelector(`.error-msg[data-for="${field}"]`);
    if (el) el.textContent = msg;
    const input = document.getElementById(field);
    if (input) input.classList.add('has-error');
  }

  function submitForm() {
    clearErrors();

    // 番号: 未入力時は自動採番(最大+1)
    const noRaw = document.getElementById('siteNo').value.trim();
    let noValue;
    if (noRaw === '') {
      // 編集中で元の番号があれば維持、新規なら次番号
      if (editingId) {
        const orig = sites.find(s => s.id === editingId);
        noValue = (orig && orig.no) ? Number(orig.no) : nextSiteNo();
      } else {
        noValue = nextSiteNo();
      }
    } else {
      const n = Number(noRaw);
      noValue = (isFinite(n) && n > 0) ? Math.floor(n) : nextSiteNo();
    }

    const data = {
      id: editingId || uid(),
      no: noValue,
      name: document.getElementById('siteName').value.trim(),
      manager: document.getElementById('manager').value.trim(),
      structure: document.getElementById('structure').value.trim(),
      quantity: Number(document.getElementById('quantity').value),
      material: normalizeMaterial(document.getElementById('material').value),
      orderStatus: (document.querySelector('input[name="orderStatus"]:checked') || {}).value || '',
      startDate: document.getElementById('startDate').value,
      endDate: document.getElementById('endDate').value,
      amount: parseAmount(document.getElementById('amount').value),
      memo: document.getElementById('memo').value.trim(),
      updatedAt: new Date().toISOString()
    };

    let ok = true;
    if (!data.name) { setError('siteName', '現場名を入力してください'); ok = false; }
    if (!data.manager) { setError('manager', '現場担当を入力してください'); ok = false; }
    if (!data.structure) { setError('structure', '建物の構造を入力してください'); ok = false; }
    if (!data.quantity || isNaN(data.quantity) || data.quantity <= 0) { setError('quantity', '総数量(t)を入力してください(0より大きい数値)'); ok = false; }
    if (!data.startDate) { setError('startDate', '開始日を入力してください'); ok = false; }
    if (!data.endDate) { setError('endDate', '終了日を入力してください'); ok = false; }
    if (data.startDate && data.endDate && data.startDate > data.endDate) {
      setError('endDate', '終了日は開始日以降にしてください'); ok = false;
    }
    if (!data.material || !MATERIAL_OPTIONS.includes(data.material)) {
      setError('material', '材料区分(材工または支給材)を選択してください'); ok = false;
    }
    if (!data.orderStatus) {
      const errEl = document.querySelector('.error-msg[data-for="orderStatus"]');
      if (errEl) errEl.textContent = '受注状況を選択してください';
      ok = false;
    }
    if (data.amount === null || data.amount === undefined || isNaN(data.amount) || data.amount < 0) { setError('amount', '契約金額を入力してください(0以上の数値)'); ok = false; }

    if (!ok) {
      showToast('入力に不備があります', 'error');
      const firstErr = document.querySelector('.has-error');
      if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (editingId) {
      const idx = sites.findIndex(s => s.id === editingId);
      if (idx >= 0) sites[idx] = Object.assign({}, sites[idx], data);
      showToast('更新しました', 'success');
    } else {
      data.createdAt = new Date().toISOString();
      sites.push(data);
      showToast('登録しました', 'success');
    }
    saveSites();
    resetForm();
    renderSchedule();
    renderList();
    renderSummary();
    updateManagerList();
    document.querySelector('.tab-btn[data-tab="schedule"]').click();
  }

  function resetForm() {
    editingId = null;
    document.getElementById('siteForm').reset();
    document.getElementById('siteId').value = '';
    // 新規登録時は次番号を自動表示(任意で書き換え可)
    const noEl = document.getElementById('siteNo');
    if (noEl) noEl.value = nextSiteNo();
    document.getElementById('saveLabel').textContent = '登録する';
    clearErrors();
  }

  function loadFormForEdit(id) {
    const site = sites.find(s => s.id === id);
    if (!site) return;
    editingId = id;
    document.getElementById('siteId').value = id;
    document.getElementById('siteNo').value = (site.no != null && site.no !== '') ? site.no : '';
    document.getElementById('siteName').value = site.name || '';
    document.getElementById('manager').value = site.manager || '';
    document.getElementById('structure').value = site.structure || '';
    document.getElementById('quantity').value = site.quantity || '';
    document.getElementById('material').value = normalizeMaterial(site.material) || '';
    document.getElementById('startDate').value = site.startDate || '';
    document.getElementById('endDate').value = site.endDate || '';
    const radio = document.querySelector(`input[name="orderStatus"][value="${site.orderStatus}"]`);
    if (radio) radio.checked = true;
    document.getElementById('amount').value = site.amount ? Number(site.amount).toLocaleString('ja-JP') : '';
    document.getElementById('memo').value = site.memo || '';
    document.getElementById('saveLabel').textContent = '更新する';
    clearErrors();
    document.querySelector('.tab-btn[data-tab="register"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function deleteSite(id) {
    const site = sites.find(s => s.id === id);
    if (!site) return;
    if (!confirm(`「${site.name}」を削除します。よろしいですか?`)) return;
    sites = sites.filter(s => s.id !== id);
    saveSites();
    renderSchedule();
    renderList();
    renderSummary();
    updateManagerList();
    showToast('削除しました', 'success');
  }

  function updateManagerList() {
    const dl = document.getElementById('managerList');
    if (!dl) return;
    const managers = Array.from(new Set(sites.map(s => s.manager).filter(Boolean))).sort();
    dl.innerHTML = managers.map(m => `<option value="${escapeHtml(m)}">`).join('');
  }

  // ---------- フィルタ ----------
  function setupFilters() {
    const ids = ['filterName', 'filterManager', 'filterStructure', 'filterMaterial', 'filterOrder', 'filterAmountMin', 'filterAmountMax'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', updateFilters);
      el.addEventListener('change', updateFilters);
    });
    document.getElementById('btnFilterReset').addEventListener('click', () => {
      ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      updateFilters();
    });
    document.getElementById('listSearch').addEventListener('input', (e) => {
      listSearch = e.target.value.trim();
      renderList();
    });
  }
  function updateFilters() {
    filters.name = (document.getElementById('filterName').value || '').trim().toLowerCase();
    filters.manager = (document.getElementById('filterManager').value || '').trim().toLowerCase();
    filters.structure = (document.getElementById('filterStructure').value || '').trim().toLowerCase();
    filters.material = document.getElementById('filterMaterial').value || '';
    filters.orderStatus = document.getElementById('filterOrder').value || '';
    const min = document.getElementById('filterAmountMin').value;
    const max = document.getElementById('filterAmountMax').value;
    filters.amountMin = min === '' ? null : Number(min);
    filters.amountMax = max === '' ? null : Number(max);
    renderSchedule();
  }

  function applyFilters(list) {
    return list.filter(s => {
      if (filters.name && !(s.name || '').toLowerCase().includes(filters.name)) return false;
      if (filters.manager && !(s.manager || '').toLowerCase().includes(filters.manager)) return false;
      if (filters.structure && !(s.structure || '').toLowerCase().includes(filters.structure)) return false;
      if (filters.material && s.material !== filters.material) return false;
      if (filters.orderStatus && s.orderStatus !== filters.orderStatus) return false;
      if (filters.amountMin !== null && Number(s.amount) < filters.amountMin) return false;
      if (filters.amountMax !== null && Number(s.amount) > filters.amountMax) return false;
      return true;
    });
  }

  // ---------- 年間工程表(ガント) ----------
  function renderSchedule() {
    const months = buildMonthList(startYear, startMonth, 12);

    // ヘッダー
    const headRow = document.getElementById('scheduleHeadRow');
    let head = '';
    head += '<th class="col-no col-info">No</th>';
    head += '<th class="col-name col-info">現場名・工事内容</th>';
    head += '<th class="col-manager col-info">担当</th>';
    head += '<th class="col-structure col-info">構造</th>';
    head += '<th class="col-quantity col-info">数量</th>';
    head += '<th class="col-material col-info">材料区分</th>';
    head += '<th class="col-amount col-info">契約金額(円)</th>';
    months.forEach((ym, i) => {
      const isQEnd = ((i + 1) % 3 === 0);
      const isNewYear = (i === 0) || (ym.month === 0);
      const cls = `col-month${isQEnd ? ' q-end' : ''}${isNewYear ? ' month-newyear' : ''}`;
      head += `<th class="${cls}"><span class="month-year">${ym.year}年</span>${ym.month + 1}月</th>`;
    });
    headRow.innerHTML = head;

    // ボディ
    const body = document.getElementById('scheduleBody');
    const filtered = applyFilters(sites);
    const rangeStart = getRangeStartDate();
    const rangeEnd = getRangeEndDate();

    const visible = filtered.filter(s => {
      const sd = toDate(s.startDate);
      const ed = toDate(s.endDate);
      if (!sd || !ed) return false;
      return ed >= rangeStart && sd <= rangeEnd;
    }).sort(compareByNo);

    if (visible.length === 0) {
      body.innerHTML = `<tr class="empty-row"><td colspan="19">表示期間(${getRangeLabel()})に該当する現場がありません。</td></tr>`;
      renderSummaryBar(filtered);
      return;
    }

    let html = '';
    visible.forEach((s, idx) => {
      const barInfo = computeBarSegment(s, months);
      const colorCls = barClassByMaterial(s.material);
      const tentativeCls = (s.orderStatus === '受注可能性') ? ' bar-tentative' : '';
      let row = '<tr class="bar-row">';
      row += `<td class="col-no col-info">${s.no || (idx + 1)}</td>`;
      const stStatus = deriveStatus(s);
      const orderTag = paramTag(s.orderStatus || '', orderClass(s.orderStatus));
      const statusTag = paramTag(stStatus, statusClass(stStatus));
      row += `<td class="col-name col-info" title="${escapeAttr(s.name)}"><div class="name-cell"><span class="site-name-text">${escapeHtml(s.name)}</span><span class="name-tags">${statusTag}${orderTag}</span></div></td>`;
      row += `<td class="col-manager col-info">${paramTag(s.manager || '', tantoClass(s.manager))}</td>`;
      row += `<td class="col-structure col-info" title="${escapeAttr(s.structure || '')}">${paramTag(s.structure || '', structureClass(s.structure))}</td>`;
      row += `<td class="col-quantity col-info">${escapeHtml(fmtTons(s.quantity))}</td>`;
      row += `<td class="col-material col-info">${paramTag(s.material || '', materialClass(s.material))}</td>`;
      row += `<td class="col-amount col-info">${fmtAmount(s.amount)}</td>`;

      for (let i = 0; i < 12; i++) {
        const ym = months[i];
        const isQEnd = ((i + 1) % 3 === 0);
        const isNewYear = (i === 0) || (ym.month === 0);
        const cls = `col-month month-cell${isQEnd ? ' q-end' : ''}${isNewYear ? ' month-newyear' : ''}`;
        let cellInner = '';
        if (barInfo && barInfo.startIndex === i) {
          const widthPct = (barInfo.spanMonths * 100) - (barInfo.startOffsetPct + barInfo.endOffsetPct);
          const leftPct = barInfo.startOffsetPct;
          const dateRange = `${fmtDateJP(s.startDate)}〜${fmtDateJP(s.endDate)}`;
          const tip = `${s.name} / ${dateRange} / ${s.material || ''} / ${s.orderStatus || ''}`;
          // バー内ラベル: 現場名 + 数量 + 材料区分(空白埋めなし、空はスキップ)
          const labelParts = [];
          if (s.name) labelParts.push(s.name);
          const tonsStr = fmtTons(s.quantity);
          if (tonsStr) labelParts.push(tonsStr);
          const mat = normalizeMaterial(s.material);
          if (mat) labelParts.push(mat);
          const barLabel = labelParts.join('　');
          cellInner = `<div class="gantt-bar ${colorCls}${tentativeCls}" style="left:${leftPct}%;width:${widthPct}%;" title="${escapeAttr(tip)}">${escapeHtml(barLabel)}</div>`;
        }
        row += `<td class="${cls}">${cellInner}</td>`;
      }
      row += '</tr>';
      html += row;
    });
    body.innerHTML = html;
    renderSummaryBar(filtered);
  }

  function computeBarSegment(site, months) {
    const sd = toDate(site.startDate);
    const ed = toDate(site.endDate);
    if (!sd || !ed) return null;

    const rangeStart = new Date(months[0].year, months[0].month, 1, 0, 0, 0);
    const lastYM = months[11];
    const lastDay = new Date(lastYM.year, lastYM.month + 1, 0).getDate();
    const rangeEnd = new Date(lastYM.year, lastYM.month, lastDay, 23, 59, 59);

    const segStart = sd < rangeStart ? rangeStart : sd;
    const segEnd = ed > rangeEnd ? rangeEnd : ed;
    if (segEnd < segStart) return null;

    function findMonthIndex(d) {
      for (let i = 0; i < months.length; i++) {
        const m = months[i];
        const mStart = new Date(m.year, m.month, 1);
        const mEndDay = new Date(m.year, m.month + 1, 0).getDate();
        const mEnd = new Date(m.year, m.month, mEndDay, 23, 59, 59);
        if (d >= mStart && d <= mEnd) return i;
      }
      return -1;
    }
    const startIndex = findMonthIndex(segStart);
    const endIndex = findMonthIndex(segEnd);
    if (startIndex < 0 || endIndex < 0) return null;
    const spanMonths = endIndex - startIndex + 1;

    const startYM = months[startIndex];
    const endYM = months[endIndex];
    const startMonthDays = new Date(startYM.year, startYM.month + 1, 0).getDate();
    const endMonthDays = new Date(endYM.year, endYM.month + 1, 0).getDate();

    const startOffsetPct = ((segStart.getDate() - 1) / startMonthDays) * 100;
    const endOffsetPct = ((endMonthDays - segEnd.getDate()) / endMonthDays) * 100;

    return { startIndex, spanMonths, startOffsetPct, endOffsetPct };
  }

  // ---------- サマリーバー(工程表上部) ----------
  function renderSummaryBar(filtered) {
    const rangeStart = getRangeStartDate();
    const rangeEnd = getRangeEndDate();
    const rangeSites = filtered.filter(s => {
      const sd = toDate(s.startDate); const ed = toDate(s.endDate);
      if (!sd || !ed) return false;
      return ed >= rangeStart && sd <= rangeEnd;
    });

    const totalCount = rangeSites.length;
    const totalQty = rangeSites.reduce((a, s) => a + (Number(s.quantity) || 0), 0);
    const totalAmount = rangeSites.reduce((a, s) => a + (Number(s.amount) || 0), 0);
    const confirmedCount = rangeSites.filter(s => s.orderStatus === '受注済み').length;
    const tentativeCount = rangeSites.filter(s => s.orderStatus === '受注可能性').length;

    const bar = document.getElementById('summaryBar');
    bar.innerHTML = `
      <div class="summary-card"><p class="summary-label">期間内 総現場数</p><p class="summary-value">${totalCount}<span class="summary-unit">件</span></p></div>
      <div class="summary-card"><p class="summary-label">受注済み</p><p class="summary-value">${confirmedCount}<span class="summary-unit">件</span></p></div>
      <div class="summary-card"><p class="summary-label">受注可能性</p><p class="summary-value">${tentativeCount}<span class="summary-unit">件</span></p></div>
      <div class="summary-card"><p class="summary-label">期間内 総数量</p><p class="summary-value">${totalQty.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}<span class="summary-unit">t</span></p></div>
      <div class="summary-card"><p class="summary-label">期間内 総契約金額</p><p class="summary-value">¥${fmtAmount(totalAmount)}</p></div>
    `;
  }

  // ---------- 現場一覧 ----------
  function renderList() {
    const tbody = document.getElementById('listBody');
    const term = listSearch.toLowerCase();
    const list = sites.filter(s => {
      if (!term) return true;
      return (s.name || '').toLowerCase().includes(term) ||
             (s.manager || '').toLowerCase().includes(term) ||
             (s.structure || '').toLowerCase().includes(term);
    }).sort(compareByNo);

    if (list.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="10">登録された現場はありません。</td></tr>`;
      return;
    }

    const isAdmin = currentRole === 'admin';
    let html = '';
    list.forEach((s, idx) => {
      const orderBadge = s.orderStatus === '受注可能性'
        ? '<span class="badge badge-tentative">受注可能性</span>'
        : '<span class="badge badge-confirmed">受注済み</span>';
      const stStatus2 = deriveStatus(s);
      html += `
        <tr>
          <td>${s.no || (idx + 1)}</td>
          <td>${escapeHtml(s.name)} ${paramTag(stStatus2, statusClass(stStatus2))}</td>
          <td>${paramTag(s.manager || '', tantoClass(s.manager))}</td>
          <td>${paramTag(s.structure || '', structureClass(s.structure))}</td>
          <td>${escapeHtml(fmtTons(s.quantity))}</td>
          <td>${paramTag(s.material || '', materialClass(s.material))}</td>
          <td>${paramTag(s.orderStatus || '', orderClass(s.orderStatus))}</td>
          <td>${fmtDateJP(s.startDate)}<br>〜 ${fmtDateJP(s.endDate)}</td>
          <td class="td-amount">¥${fmtAmount(s.amount)}</td>
          <td>
            <div class="action-cell">
              ${isAdmin ? `
                <button class="btn btn-secondary btn-sm" data-act="edit" data-id="${s.id}"><i class="fas fa-edit"></i> 編集</button>
                <button class="btn btn-danger btn-sm" data-act="delete" data-id="${s.id}"><i class="fas fa-trash"></i> 削除</button>
              ` : '<span style="color:#95a5a6;font-size:12px">閲覧のみ</span>'}
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;

    tbody.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (btn.dataset.act === 'edit') loadFormForEdit(id);
        else if (btn.dataset.act === 'delete') deleteSite(id);
      });
    });
  }

  // ---------- 集計用データ計算 ----------
  function computeSummary() {
    const months = buildMonthList(startYear, startMonth, 12);
    const rangeStart = getRangeStartDate();
    const rangeEnd = getRangeEndDate();

    const rangeSites = sites.filter(s => {
      const sd = toDate(s.startDate); const ed = toDate(s.endDate);
      if (!sd || !ed) return false;
      return ed >= rangeStart && sd <= rangeEnd;
    }).sort(compareByNo);

    const confirmed = rangeSites.filter(s => s.orderStatus === '受注済み');
    const tentative = rangeSites.filter(s => s.orderStatus === '受注可能性');

    const sumQty = arr => arr.reduce((a, s) => a + (Number(s.quantity) || 0), 0);
    const sumAmt = arr => arr.reduce((a, s) => a + (Number(s.amount) || 0), 0);

    const overall = {
      totalCount: rangeSites.length,
      confirmedCount: confirmed.length,
      tentativeCount: tentative.length,
      totalQty: sumQty(rangeSites),
      confirmedQty: sumQty(confirmed),
      tentativeQty: sumQty(tentative),
      totalAmount: sumAmt(rangeSites),
      confirmedAmount: sumAmt(confirmed),
      tentativeAmount: sumAmt(tentative)
    };

    // 担当者別
    const byManager = groupBy(rangeSites, s => s.manager || '(未設定)');
    // 構造別
    const byStructure = groupBy(rangeSites, s => s.structure || '(未設定)');
    // 材料区分別 (現仕様: 「材工」「支給材」の2択)
    const byMaterial = groupBy(rangeSites, s => normalizeMaterial(s.material) || '(未設定)');

    // 月別
    const monthly = months.map(() => ({ active: 0, qty: 0, amount: 0 }));
    rangeSites.forEach(s => {
      const sd = toDate(s.startDate);
      const ed = toDate(s.endDate);
      if (!sd || !ed) return;
      const segStart = sd < rangeStart ? rangeStart : sd;
      const segEnd = ed > rangeEnd ? rangeEnd : ed;
      const totalDays = Math.floor((segEnd - segStart) / 86400000) + 1;
      const qty = Number(s.quantity) || 0;
      const amt = Number(s.amount) || 0;

      for (let i = 0; i < months.length; i++) {
        const m = months[i];
        const monthFirst = new Date(m.year, m.month, 1);
        const monthLastDay = new Date(m.year, m.month + 1, 0).getDate();
        const monthLast = new Date(m.year, m.month, monthLastDay, 23, 59, 59);
        if (segEnd < monthFirst || segStart > monthLast) continue;
        const a = segStart > monthFirst ? segStart : monthFirst;
        const b = segEnd < monthLast ? segEnd : monthLast;
        const dInMonth = Math.floor((b - a) / 86400000) + 1;
        const ratio = totalDays > 0 ? dInMonth / totalDays : 0;
        monthly[i].active++;
        monthly[i].qty += qty * ratio;
        monthly[i].amount += amt * ratio;
      }
    });

    return { months, overall, byManager, byStructure, byMaterial, monthly };
  }
  function groupBy(arr, keyFn) {
    const map = {};
    arr.forEach(s => {
      const k = keyFn(s);
      if (!map[k]) map[k] = { count: 0, qty: 0, amount: 0 };
      map[k].count++;
      map[k].qty += Number(s.quantity) || 0;
      map[k].amount += Number(s.amount) || 0;
    });
    return Object.entries(map).sort((a, b) => b[1].amount - a[1].amount);
  }
  // ---------- 集計画面 ----------
  function renderSummary() {
    const container = document.getElementById('summaryContent');
    if (!container) return;
    const data = computeSummary();
    const { months, overall, byManager, byStructure, byMaterial, monthly } = data;

    let html = '';

    // 全体サマリー
    html += `
      <div class="summary-section">
        <h3 class="summary-section-title">全体サマリー(${getRangeLabel()})</h3>
        <table class="summary-table">
          <thead>
            <tr>
              <th>区分</th>
              <th class="num">総数</th>
              <th class="num">受注済み</th>
              <th class="num">受注可能性</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>現場数</td>
              <td class="num">${overall.totalCount} 件</td>
              <td class="num">${overall.confirmedCount} 件</td>
              <td class="num">${overall.tentativeCount} 件</td>
            </tr>
            <tr>
              <td>数量(t)</td>
              <td class="num">${overall.totalQty.toLocaleString('ja-JP', { maximumFractionDigits: 2 })} t</td>
              <td class="num">${overall.confirmedQty.toLocaleString('ja-JP', { maximumFractionDigits: 2 })} t</td>
              <td class="num">${overall.tentativeQty.toLocaleString('ja-JP', { maximumFractionDigits: 2 })} t</td>
            </tr>
            <tr>
              <td>契約金額(円)</td>
              <td class="num">¥${fmtAmount(overall.totalAmount)}</td>
              <td class="num">¥${fmtAmount(overall.confirmedAmount)}</td>
              <td class="num">¥${fmtAmount(overall.tentativeAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    // 担当者別
    html += renderBreakdownTable('担当者別 集計', '担当者名', byManager, 'manager');
    // 構造別
    html += renderBreakdownTable('建物構造別 集計', '建物の構造', byStructure, 'structure');
    // 材料区分別
    html += renderBreakdownTable('材料区分別 集計', '材料区分', byMaterial, 'material');

    // ※ 旧仕様の「支給／材工別 集計」(支給/支給外/労務/材料/その他)は削除しました。
    //   現在の材料区分は「材工」「支給材」の2択のため、上記の「材料区分別 集計」で網羅されます。

    // 月別
    const monthRows = monthly.map((d, i) => {
      const m = months[i];
      return `
        <tr>
          <td>${m.year}年${m.month + 1}月</td>
          <td class="num">${d.active} 件</td>
          <td class="num">${d.qty.toLocaleString('ja-JP', { maximumFractionDigits: 2 })} t</td>
          <td class="num">¥${fmtAmount(Math.round(d.amount))}</td>
        </tr>
      `;
    }).join('');
    const monthlyTotalQty = monthly.reduce((a, d) => a + d.qty, 0);
    const monthlyTotalAmt = monthly.reduce((a, d) => a + d.amount, 0);
    html += `
      <div class="summary-section">
        <h3 class="summary-section-title">月別 集計(${getRangeLabel()})</h3>
        <table class="summary-table">
          <thead>
            <tr>
              <th>月</th>
              <th class="num">稼働現場数</th>
              <th class="num">予定数量</th>
              <th class="num">契約金額合計</th>
            </tr>
          </thead>
          <tbody>${monthRows}</tbody>
          <tfoot>
            <tr>
              <td>合計</td>
              <td class="num">—</td>
              <td class="num">${monthlyTotalQty.toLocaleString('ja-JP', { maximumFractionDigits: 2 })} t</td>
              <td class="num">¥${fmtAmount(Math.round(monthlyTotalAmt))}</td>
            </tr>
          </tfoot>
        </table>
        <p style="font-size:12px;color:#95a5a6;margin:8px 0 0">※ 数量・金額は工期日数で月按分した参考値です。</p>
      </div>
    `;

    container.innerHTML = html;
  }

  function renderBreakdownTable(title, keyLabel, entries, tagType) {
    if (!entries || entries.length === 0) {
      return `
        <div class="summary-section">
          <h3 class="summary-section-title">${escapeHtml(title)}</h3>
          <p style="color:#95a5a6">データがありません</p>
        </div>
      `;
    }
    const totalCount = entries.reduce((a, [, v]) => a + v.count, 0);
    const totalQty = entries.reduce((a, [, v]) => a + v.qty, 0);
    const totalAmt = entries.reduce((a, [, v]) => a + v.amount, 0);
    function tagFor(k) {
      if (tagType === 'manager') return paramTag(k, tantoClass(k));
      if (tagType === 'structure') return paramTag(k, structureClass(k));
      if (tagType === 'material') return paramTag(k, materialClass(k));
      return escapeHtml(k);
    }
    const rows = entries.map(([k, v]) => `
      <tr>
        <td>${tagFor(k)}</td>
        <td class="num">${v.count} 件</td>
        <td class="num">${v.qty.toLocaleString('ja-JP', { maximumFractionDigits: 2 })} t</td>
        <td class="num">¥${fmtAmount(v.amount)}</td>
      </tr>
    `).join('');
    return `
      <div class="summary-section">
        <h3 class="summary-section-title">${escapeHtml(title)}</h3>
        <table class="summary-table">
          <thead>
            <tr>
              <th>${escapeHtml(keyLabel)}</th>
              <th class="num">現場数</th>
              <th class="num">数量合計</th>
              <th class="num">契約金額合計</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td>合計</td>
              <td class="num">${totalCount} 件</td>
              <td class="num">${totalQty.toLocaleString('ja-JP', { maximumFractionDigits: 2 })} t</td>
              <td class="num">¥${fmtAmount(totalAmt)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  // ---------- 出力 ----------
  function setupExport() {
    // 印刷ボタン: window.print() 経由(印刷ダイアログ)
    document.getElementById('btnPrint').addEventListener('click', printSchedule);
    document.getElementById('btnSummaryPrint').addEventListener('click', printSummary);
    // 出力タブ内の旧「PDF/印刷」ボタンは印刷ダイアログ用として残す
    document.getElementById('btnExportSummaryPdf').addEventListener('click', () => {
      document.querySelector('.tab-btn[data-tab="summary"]').click();
      setTimeout(printSummary, 200);
    });

    // PDFダウンロードボタン: html2canvas + jsPDF で直接ダウンロード(window.print不使用)
    document.getElementById('btnPdf').addEventListener('click', downloadSchedulePdf);
    document.getElementById('btnSummaryPdf').addEventListener('click', downloadSummaryPdf);
    document.getElementById('btnExportPdf').addEventListener('click', downloadSchedulePdf);
    const btnSummaryPdfMain = document.getElementById('btnExportSummaryPdfMain');
    if (btnSummaryPdfMain) btnSummaryPdfMain.addEventListener('click', downloadSummaryPdf);

    // CSV/Excel/JSON
    document.getElementById('btnSummaryCsv').addEventListener('click', exportSummaryCSV);
    document.getElementById('btnExportCsv').addEventListener('click', exportCSV);
    document.getElementById('btnExportExcel').addEventListener('click', exportExcel);
    document.getElementById('btnExportSummaryCsv').addEventListener('click', exportSummaryCSV);
    document.getElementById('btnExportJson').addEventListener('click', exportJSON);
    document.getElementById('btnImportJson').addEventListener('click', () => {
      document.getElementById('jsonFileInput').click();
    });
    document.getElementById('jsonFileInput').addEventListener('change', importJSON);
  }

  function updatePrintDateLabels() {
    const now = new Date();
    const txt = `作成日：${fmtDateTimeJP(now)}`;
    const a = document.getElementById('schedulePrintDate');
    const b = document.getElementById('summaryPrintDate');
    if (a) a.textContent = txt;
    if (b) b.textContent = txt;
  }

  function printSchedule() {
    document.querySelector('.tab-btn[data-tab="schedule"]').click();
    document.body.classList.remove('print-target-summary');
    document.body.classList.add('print-target-schedule');
    updatePrintDateLabels();
    setTimeout(() => {
      window.print();
      // 印刷ダイアログ後にクリーンアップ
      setTimeout(() => document.body.classList.remove('print-target-schedule'), 800);
    }, 150);
  }
  function printSummary() {
    document.querySelector('.tab-btn[data-tab="summary"]').click();
    renderSummary();
    document.body.classList.remove('print-target-schedule');
    document.body.classList.add('print-target-summary');
    updatePrintDateLabels();
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove('print-target-summary'), 800);
    }, 200);
  }

  // ============================================================
  // PDFダウンロード (html2canvas + jsPDF)
  // - window.print() を使わず、PDFファイルを直接ダウンロードする
  // - PDF専用エリア(#pdfScheduleArea / #pdfSummaryArea)に再描画してから画像化
  // - ファイル名は英数字のみ (例: murata_schedule_2026.pdf)
  // ============================================================

  // PDF生成中ローディング表示
  function showPdfLoading(msg) {
    let ov = document.getElementById('pdfLoadingOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'pdfLoadingOverlay';
      ov.className = 'pdf-loading-overlay';
      ov.innerHTML = `<div class="pdf-loading-box"><i class="fas fa-spinner fa-spin"></i><span id="pdfLoadingMsg"></span></div>`;
      document.body.appendChild(ov);
    }
    document.getElementById('pdfLoadingMsg').textContent = msg || 'PDFを生成中...';
    ov.style.display = 'flex';
  }
  function hidePdfLoading() {
    const ov = document.getElementById('pdfLoadingOverlay');
    if (ov) ov.style.display = 'none';
  }

  // ライブラリのロード待ち(CDNが遅延した場合に備える)
  function ensurePdfLibsLoaded(timeoutMs) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      (function check() {
        const ok = (typeof window.html2canvas === 'function') &&
                   (typeof window.jspdf !== 'undefined' && typeof window.jspdf.jsPDF === 'function');
        if (ok) return resolve();
        if (Date.now() - t0 > (timeoutMs || 8000)) return reject(new Error('PDFライブラリ(html2canvas/jsPDF)のロードに失敗しました'));
        setTimeout(check, 80);
      })();
    });
  }

  // 受注区分→PDFバッジクラス
  function pdfOrderBadgeClass(o) {
    if (o === '受注済み' || o === '受注済') return 'pdf-badge-confirmed';
    if (o === '受注可能性' || o === '可能性あり') return 'pdf-badge-tentative';
    return '';
  }
  // ステータス→PDFバッジクラス
  function pdfStatusBadgeClass(s) {
    if (s === '施工中') return 'pdf-badge-status-progress';
    if (s === '完了')   return 'pdf-badge-status-done';
    if (s === '未着手') return 'pdf-badge-status-pending';
    if (s === '未確定') return 'pdf-badge-status-undecided';
    if (s === '遅れ')   return 'pdf-badge-status-delay';
    if (s === '注意')   return 'pdf-badge-status-attention';
    return 'pdf-badge-status-pending';
  }
  function pdfMaterialBadgeClass(m) {
    const v = normalizeMaterial(m);
    if (v === '材工') return 'pdf-badge-zaikou';
    if (v === '支給材') return 'pdf-badge-shikyuu';
    return '';
  }
  function pdfBarClassByMaterial(material) {
    const m = normalizeMaterial(material);
    if (m === '支給材') return 'bar-supply';
    if (m === '材工')   return 'bar-materialwork';
    return 'bar-other';
  }

  // ========== 工程表PDF専用エリアの再描画 ==========
  // 方針:
  //  - 画面と同じ <table class="schedule-table"> を生成し、画面側CSSをそのまま継承する
  //  - PDF出力時の罫線崩れ対策として .pdf-clone-mode で border-collapse / box-shadow inset 等を上書き
  //  - ガントバーは画面と同じ position:absolute (月セルtd内) で配置する
  function buildSchedulePdfDom() {
    const area = document.getElementById('pdfScheduleArea');
    if (!area) return null;
    const months = buildMonthList(startYear, startMonth, 12);
    const target = getExportTargetSites();
    const rangeLabel = getRangeLabel();
    const createdAt = fmtDateTimeJP(new Date());

    // ----- ヘッダ -----
    let html = '';
    html += `<div class="pdf-header">`;
    html +=   `<div class="pdf-header-left">`;
    html +=     `<div class="pdf-company">村田鉄筋株式会社</div>`;
    html +=     `<div class="pdf-doc-title">年間工程表</div>`;
    html +=   `</div>`;
    html +=   `<div class="pdf-header-right">`;
    html +=     `<div class="pdf-period">表示期間：${escapeHtml(rangeLabel)}</div>`;
    html +=     `<div>作成日：${escapeHtml(createdAt)}</div>`;
    html +=   `</div>`;
    html += `</div>`;

    // ----- 画面と同じ schedule-table を組む -----
    // 列幅: 番号 44 + 名前 240 + 担当 100 + 構造 110 + 数量 90 + 材料 100 + 金額 130 = 814px
    // 月  : 12 * 75 = 900px  ⇒ 合計 1714px (PDF専用エリアは width:1720px に合わせる)
    html += `<div class="pdf-clone-wrapper">`;
    html += `<table class="schedule-table pdf-clone-schedule">`;
    // colgroup で列幅を固定(PDF描画時に列幅が崩れないよう明示)
    html += `<colgroup>`;
    html +=   `<col style="width:32px">`;   // No
    html +=   `<col style="width:44px">`;   // 番号
    html +=   `<col style="width:240px">`;  // 名前
    html +=   `<col style="width:100px">`;  // 担当
    html +=   `<col style="width:110px">`;  // 構造
    html +=   `<col style="width:90px">`;   // 数量
    html +=   `<col style="width:100px">`;  // 材料
    html +=   `<col style="width:130px">`;  // 金額
    for (let i = 0; i < 12; i++) html += `<col style="width:75px">`; // 月セル
    html += `</colgroup>`;

    // ヘッダ行
    html += `<thead><tr>`;
    html +=   `<th class="col-no col-info">No</th>`;
    html +=   `<th class="col-siteno col-info">番号</th>`;
    html +=   `<th class="col-name col-info">現場名・工事内容</th>`;
    html +=   `<th class="col-manager col-info">担当</th>`;
    html +=   `<th class="col-structure col-info">構造</th>`;
    html +=   `<th class="col-quantity col-info">数量</th>`;
    html +=   `<th class="col-material col-info">材料区分</th>`;
    html +=   `<th class="col-amount col-info">契約金額(円)</th>`;
    months.forEach((ym, i) => {
      const isQEnd = ((i + 1) % 3 === 0);
      const isNewYear = (i === 0) || (ym.month === 0);
      const cls = `col-month${isQEnd ? ' q-end' : ''}${isNewYear ? ' month-newyear' : ''}`;
      html += `<th class="${cls}"><span class="month-year">${ym.year}年</span>${ym.month + 1}月</th>`;
    });
    html += `</tr></thead>`;

    // ボディ
    html += `<tbody>`;
    if (target.length === 0) {
      html += `<tr class="empty-row"><td colspan="20" style="text-align:center;padding:30px;color:#6b7a8a;font-size:12px;">表示期間(${escapeHtml(rangeLabel)})に該当する現場がありません。</td></tr>`;
    } else {
      target.forEach((s, idx) => {
        // バーは画面と同じく computeBarSegment (セル内 % 配置) を使用
        const barInfo = computeBarSegment(s, months);
        const colorCls = barClassByMaterial(s.material);
        const tentativeCls = (s.orderStatus === '受注可能性') ? ' bar-tentative' : '';
        const stStatus = deriveStatus(s);
        const orderTag = paramTag(s.orderStatus || '', orderClass(s.orderStatus));
        const statusTag = paramTag(stStatus, statusClass(stStatus));

        let row = '<tr class="bar-row">';
        row += `<td class="col-no col-info">${idx + 1}</td>`;
        row += `<td class="col-siteno col-info">${(s.siteNo != null && s.siteNo !== '') ? s.siteNo : ''}</td>`;
        row += `<td class="col-name col-info" title="${escapeAttr(s.name || '')}"><div class="name-cell"><span class="site-name-text">${escapeHtml(s.name || '')}</span><span class="name-tags">${statusTag}${orderTag}</span></div></td>`;
        row += `<td class="col-manager col-info">${paramTag(s.manager || '', tantoClass(s.manager))}</td>`;
        row += `<td class="col-structure col-info" title="${escapeAttr(s.structure || '')}">${paramTag(s.structure || '', structureClass(s.structure))}</td>`;
        row += `<td class="col-quantity col-info">${escapeHtml(fmtTons(s.quantity))}</td>`;
        row += `<td class="col-material col-info">${paramTag(normalizeMaterial(s.material) || '', materialClass(s.material))}</td>`;
        row += `<td class="col-amount col-info">${fmtAmount(s.amount)}</td>`;

        for (let i = 0; i < 12; i++) {
          const ym = months[i];
          const isQEnd = ((i + 1) % 3 === 0);
          const isNewYear = (i === 0) || (ym.month === 0);
          const cls = `col-month month-cell${isQEnd ? ' q-end' : ''}${isNewYear ? ' month-newyear' : ''}`;
          let cellInner = '';
          if (barInfo && barInfo.startIndex === i) {
            const widthPct = (barInfo.spanMonths * 100) - (barInfo.startOffsetPct + barInfo.endOffsetPct);
            const leftPct = barInfo.startOffsetPct;
            const dateRange = `${fmtDateJP(s.startDate)}〜${fmtDateJP(s.endDate)}`;
            const tip = `${s.name} / ${dateRange} / ${normalizeMaterial(s.material) || ''} / ${s.orderStatus || ''}`;
            // ラベル: 現場名 + 数量 + 材料区分(画面は現場名だけだが、PDFはより情報量を保つ)
            const labelParts = [];
            if (s.name) labelParts.push(s.name);
            labelParts.push(fmtTons(s.quantity));
            const mm = normalizeMaterial(s.material);
            if (mm) labelParts.push(mm);
            const barLabel = labelParts.join('　');
            cellInner = `<div class="gantt-bar ${colorCls}${tentativeCls}" style="left:${leftPct}%;width:${widthPct}%;" title="${escapeAttr(tip)}">${escapeHtml(barLabel)}</div>`;
          }
          row += `<td class="${cls}">${cellInner}</td>`;
        }
        row += '</tr>';
        html += row;
      });
    }
    html += `</tbody>`;
    html += `</table>`;
    html += `</div>`; // pdf-clone-wrapper

    area.innerHTML = html;
    return area;
  }

  // 表示月リスト内での月インデックス取得(無ければ -1)
  function getMonthIndexInPdfRange(dateStr, months) {
    const d = toDate(dateStr);
    if (!d) return -1;
    for (let i = 0; i < months.length; i++) {
      if (months[i].year === d.getFullYear() && months[i].month === d.getMonth()) return i;
    }
    return -1;
  }
  // 工程バーの月インデックス範囲(表示期間でクリッピング)
  // - 開始日が表示期間より前 → startIndex = 0
  // - 終了日が表示期間より後 → endIndex = months.length - 1
  // - 範囲外(完全に外) → null
  function getPdfBarRange(site, months) {
    const sd = toDate(site.startDate);
    const ed = toDate(site.endDate);
    if (!sd || !ed) return null;

    const firstMonth = new Date(months[0].year, months[0].month, 1, 0, 0, 0);
    const lastYM = months[months.length - 1];
    const lastDayNum = new Date(lastYM.year, lastYM.month + 1, 0).getDate();
    const lastMonth = new Date(lastYM.year, lastYM.month, lastDayNum, 23, 59, 59);

    // 完全に表示期間外
    if (ed < firstMonth || sd > lastMonth) return null;

    let startIndex = getMonthIndexInPdfRange(site.startDate, months);
    let endIndex = getMonthIndexInPdfRange(site.endDate, months);

    if (startIndex < 0) {
      // 開始日が表示期間より前 -> 0 にクリップ
      if (sd < firstMonth) startIndex = 0;
    }
    if (endIndex < 0) {
      // 終了日が表示期間より後 -> 末尾にクリップ
      if (ed > lastMonth) endIndex = months.length - 1;
    }
    if (startIndex < 0 || endIndex < 0) return null;
    if (endIndex < startIndex) return null;
    return { startIndex, endIndex };
  }

  // ========== 集計PDF専用エリアの再描画 ==========
  function buildSummaryPdfDom() {
    const area = document.getElementById('pdfSummaryArea');
    if (!area) return null;

    const rangeStart = getRangeStartDate();
    const rangeEnd = getRangeEndDate();
    const filtered = sites.filter(s => {
      const sd = toDate(s.startDate); const ed = toDate(s.endDate);
      if (!sd || !ed) return false;
      return ed >= rangeStart && sd <= rangeEnd;
    });
    const confirmed = filtered.filter(s => s.orderStatus === '受注済み');
    const tentative = filtered.filter(s => s.orderStatus === '受注可能性');
    const sumQty = (arr) => arr.reduce((a, s) => a + (Number(s.quantity) || 0), 0);
    const sumAmt = (arr) => arr.reduce((a, s) => a + (Number(s.amount) || 0), 0);

    // 担当者別
    const byManager = {};
    filtered.forEach(s => {
      const k = s.manager || '(未設定)';
      if (!byManager[k]) byManager[k] = { count: 0, qty: 0, amount: 0 };
      byManager[k].count++;
      byManager[k].qty += Number(s.quantity) || 0;
      byManager[k].amount += Number(s.amount) || 0;
    });
    // 材料区分別
    const byMaterial = { '材工': { count: 0, qty: 0, amount: 0 }, '支給材': { count: 0, qty: 0, amount: 0 } };
    filtered.forEach(s => {
      const m = normalizeMaterial(s.material);
      if (byMaterial[m]) {
        byMaterial[m].count++;
        byMaterial[m].qty += Number(s.quantity) || 0;
        byMaterial[m].amount += Number(s.amount) || 0;
      }
    });
    // ステータス別
    const byStatus = {};
    filtered.forEach(s => {
      const k = deriveStatus(s);
      if (!byStatus[k]) byStatus[k] = 0;
      byStatus[k]++;
    });

    const rangeLabel = getRangeLabel();
    const createdAt = fmtDateTimeJP(new Date());

    let html = '';
    // ヘッダ
    html += `<div class="pdf-header">`;
    html +=   `<div class="pdf-header-left">`;
    html +=     `<div class="pdf-company">村田鉄筋株式会社</div>`;
    html +=     `<div class="pdf-doc-title">年間工程表 集計表</div>`;
    html +=   `</div>`;
    html +=   `<div class="pdf-header-right">`;
    html +=     `<div class="pdf-period">表示期間：${escapeHtml(rangeLabel)}</div>`;
    html +=     `<div>作成日：${escapeHtml(createdAt)}</div>`;
    html +=   `</div>`;
    html += `</div>`;

    // 全体サマリー
    html += `<div class="pdf-summary-section">`;
    html +=   `<h3 class="pdf-summary-title">全体サマリー</h3>`;
    html +=   `<div class="pdf-kpi-grid">`;
    html +=     pdfKpi('総現場数', `${filtered.length}件`, `受注済み: ${confirmed.length} / 可能性: ${tentative.length}`);
    html +=     pdfKpi('総数量', `${fmtTons(sumQty(filtered))}`, `受注済み: ${fmtTons(sumQty(confirmed))}`);
    html +=     pdfKpi('受注済み数量', `${fmtTons(sumQty(confirmed))}`, `${confirmed.length}件`);
    html +=     pdfKpi('受注可能性 数量', `${fmtTons(sumQty(tentative))}`, `${tentative.length}件`);
    html +=   `</div>`;
    html +=   `<div class="pdf-kpi-grid">`;
    html +=     pdfKpi('材工 数量', `${fmtTons(byMaterial['材工'].qty)}`, `${byMaterial['材工'].count}件`);
    html +=     pdfKpi('支給材 数量', `${fmtTons(byMaterial['支給材'].qty)}`, `${byMaterial['支給材'].count}件`);
    html +=     pdfKpi('総契約金額', `¥${fmtAmount(sumAmt(filtered))}`, `受注済み: ¥${fmtAmount(sumAmt(confirmed))}`);
    html +=     pdfKpi('受注可能性 金額', `¥${fmtAmount(sumAmt(tentative))}`, `${tentative.length}件`);
    html +=   `</div>`;
    html += `</div>`;

    // 材料区分別
    html += `<div class="pdf-summary-section">`;
    html +=   `<h3 class="pdf-summary-title">材料区分別 集計</h3>`;
    html +=   `<table class="pdf-stable"><thead><tr>`;
    html +=     `<th style="width:25%">区分</th><th style="width:25%">件数</th><th style="width:25%">数量</th><th style="width:25%">契約金額</th>`;
    html +=   `</tr></thead><tbody>`;
    ['材工', '支給材'].forEach(k => {
      const d = byMaterial[k];
      const cls = pdfMaterialBadgeClass(k);
      html += `<tr>`;
      html += `<td><span class="pdf-badge ${cls}">${escapeHtml(k)}</span></td>`;
      html += `<td style="text-align:right">${d.count}件</td>`;
      html += `<td style="text-align:right">${fmtTons(d.qty)}</td>`;
      html += `<td style="text-align:right">¥${fmtAmount(d.amount)}</td>`;
      html += `</tr>`;
    });
    html +=   `</tbody></table>`;
    html += `</div>`;

    // ステータス別
    html += `<div class="pdf-summary-section">`;
    html +=   `<h3 class="pdf-summary-title">ステータス別 件数</h3>`;
    html +=   `<table class="pdf-stable"><thead><tr>`;
    html +=     `<th style="width:60%">ステータス</th><th style="width:40%">件数</th>`;
    html +=   `</tr></thead><tbody>`;
    Object.keys(byStatus).forEach(k => {
      const cls = pdfStatusBadgeClass(k);
      html += `<tr>`;
      html += `<td><span class="pdf-badge ${cls}">${escapeHtml(k)}</span></td>`;
      html += `<td style="text-align:right">${byStatus[k]}件</td>`;
      html += `</tr>`;
    });
    html +=   `</tbody></table>`;
    html += `</div>`;

    // 担当者別
    html += `<div class="pdf-summary-section">`;
    html +=   `<h3 class="pdf-summary-title">担当者別 集計</h3>`;
    html +=   `<table class="pdf-stable"><thead><tr>`;
    html +=     `<th style="width:25%">担当者</th><th style="width:25%">件数</th><th style="width:25%">数量</th><th style="width:25%">契約金額</th>`;
    html +=   `</tr></thead><tbody>`;
    Object.keys(byManager).sort().forEach(k => {
      const d = byManager[k];
      const tcls = tantoClass(k);
      html += `<tr>`;
      html += `<td><span class="pdf-tag ${tcls}">${escapeHtml(k)}</span></td>`;
      html += `<td style="text-align:right">${d.count}件</td>`;
      html += `<td style="text-align:right">${fmtTons(d.qty)}</td>`;
      html += `<td style="text-align:right">¥${fmtAmount(d.amount)}</td>`;
      html += `</tr>`;
    });
    html +=   `</tbody></table>`;
    html += `</div>`;

    // 建物構造別
    const byStructure = {};
    filtered.forEach(s => {
      const k = s.structure || '(未設定)';
      if (!byStructure[k]) byStructure[k] = { count: 0, qty: 0, amount: 0 };
      byStructure[k].count++;
      byStructure[k].qty += Number(s.quantity) || 0;
      byStructure[k].amount += Number(s.amount) || 0;
    });
    if (Object.keys(byStructure).length > 0) {
      html += `<div class="pdf-summary-section">`;
      html +=   `<h3 class="pdf-summary-title">建物構造別 集計</h3>`;
      html +=   `<table class="pdf-stable"><thead><tr>`;
      html +=     `<th style="width:25%">建物の構造</th><th style="width:25%">件数</th><th style="width:25%">数量</th><th style="width:25%">契約金額</th>`;
      html +=   `</tr></thead><tbody>`;
      Object.keys(byStructure).sort((a, b) => byStructure[b].amount - byStructure[a].amount).forEach(k => {
        const d = byStructure[k];
        const scls = structureClass(k);
        html += `<tr>`;
        html += `<td><span class="pdf-tag ${scls}">${escapeHtml(k)}</span></td>`;
        html += `<td style="text-align:right">${d.count}件</td>`;
        html += `<td style="text-align:right">${fmtTons(d.qty)}</td>`;
        html += `<td style="text-align:right">¥${fmtAmount(d.amount)}</td>`;
        html += `</tr>`;
      });
      html +=   `</tbody></table>`;
      html += `</div>`;
    }

    // 月別 (画面と同じ12ヶ月分。日数で按分した参考値)
    const months = buildMonthList(startYear, startMonth, 12);
    const monthly = months.map(() => ({ active: 0, qty: 0, amount: 0 }));
    filtered.forEach(s => {
      const sd = toDate(s.startDate);
      const ed = toDate(s.endDate);
      if (!sd || !ed) return;
      const segStart = sd < rangeStart ? rangeStart : sd;
      const segEnd = ed > rangeEnd ? rangeEnd : ed;
      const totalDays = Math.floor((segEnd - segStart) / 86400000) + 1;
      const qty = Number(s.quantity) || 0;
      const amt = Number(s.amount) || 0;
      for (let i = 0; i < months.length; i++) {
        const m = months[i];
        const monthFirst = new Date(m.year, m.month, 1);
        const monthLastDay = new Date(m.year, m.month + 1, 0).getDate();
        const monthLast = new Date(m.year, m.month, monthLastDay, 23, 59, 59);
        if (segEnd < monthFirst || segStart > monthLast) continue;
        const a2 = segStart > monthFirst ? segStart : monthFirst;
        const b2 = segEnd < monthLast ? segEnd : monthLast;
        const dInMonth = Math.floor((b2 - a2) / 86400000) + 1;
        const ratio = totalDays > 0 ? dInMonth / totalDays : 0;
        monthly[i].active++;
        monthly[i].qty += qty * ratio;
        monthly[i].amount += amt * ratio;
      }
    });
    const monthlyTotalQty = monthly.reduce((a, d) => a + d.qty, 0);
    const monthlyTotalAmt = monthly.reduce((a, d) => a + d.amount, 0);
    html += `<div class="pdf-summary-section">`;
    html +=   `<h3 class="pdf-summary-title">月別 集計</h3>`;
    html +=   `<table class="pdf-stable"><thead><tr>`;
    html +=     `<th style="width:25%">月</th><th style="width:25%">稼働現場数</th><th style="width:25%">予定数量</th><th style="width:25%">契約金額合計</th>`;
    html +=   `</tr></thead><tbody>`;
    monthly.forEach((d, i) => {
      const m = months[i];
      html += `<tr>`;
      html += `<td>${m.year}年${m.month + 1}月</td>`;
      html += `<td style="text-align:right">${d.active}件</td>`;
      html += `<td style="text-align:right">${fmtTons(d.qty)}</td>`;
      html += `<td style="text-align:right">¥${fmtAmount(Math.round(d.amount))}</td>`;
      html += `</tr>`;
    });
    html +=   `</tbody>`;
    html +=   `<tfoot><tr>`;
    html +=     `<td style="font-weight:700">合計</td>`;
    html +=     `<td style="text-align:right;font-weight:700">—</td>`;
    html +=     `<td style="text-align:right;font-weight:700">${fmtTons(monthlyTotalQty)}</td>`;
    html +=     `<td style="text-align:right;font-weight:700">¥${fmtAmount(Math.round(monthlyTotalAmt))}</td>`;
    html +=   `</tr></tfoot>`;
    html +=   `</table>`;
    html +=   `<p style="font-size:10px;color:#95a5a6;margin:6px 0 0">※ 数量・金額は工期日数で月按分した参考値です。</p>`;
    html += `</div>`;

    area.innerHTML = html;
    return area;
  }

  function pdfKpi(label, value, sub) {
    return `<div class="pdf-kpi-card"><div class="pdf-kpi-label">${escapeHtml(label)}</div><div class="pdf-kpi-value">${escapeHtml(value)}</div>${sub ? `<div class="pdf-kpi-sub">${escapeHtml(sub)}</div>` : ''}</div>`;
  }

  // PDF生成中だけPDF領域をレイアウト計算可能な状態にする
  // - .pdf-only-area は通常時 opacity:0, z-index:-1 で画面に映らない
  // - data-pdf-active="1" を付けるだけで html2canvas に対しては可視扱いになる
  // - ユーザーには見えないよう、半透明の白マスクで覆う
  function activatePdfArea(area) {
    area.setAttribute('data-pdf-active', '1');
    // 画面に映る瞬間をユーザーから隠すための白マスク
    let mask = document.getElementById('pdfRenderMask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'pdfRenderMask';
      mask.style.cssText = 'position:fixed;inset:0;background:#ffffff;z-index:99998;pointer-events:none;opacity:1;';
      document.body.appendChild(mask);
    }
  }
  function deactivatePdfArea(area) {
    area.removeAttribute('data-pdf-active');
    // PDF専用エリアの中身をクリア(残しておくとレイアウト崩れの原因になる)
    setTimeout(() => { try { area.innerHTML = ''; } catch (e) {} }, 200);
    const mask = document.getElementById('pdfRenderMask');
    if (mask && mask.parentNode) mask.parentNode.removeChild(mask);
  }

  // 共通PDFキャプチャ→jsPDF出力
  async function capturePdf(area, filename, opts) {
    opts = opts || {};
    const orientation = opts.orientation || 'landscape';
    const format = opts.format || 'a3';

    // 1) html2canvas で実描画(scale=3 で罫線欠け対策、より高解像度)
    const canvas = await window.html2canvas(area, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      windowWidth: area.scrollWidth,
      windowHeight: area.scrollHeight,
      width: area.scrollWidth,
      height: area.scrollHeight,
      logging: false,
      letterRendering: true,
      imageTimeout: 0
    });

    // 2) jsPDF で多ページ分割
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation, unit: 'mm', format });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 6; // mm
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;

    // 画像全体を usableW に収まるように縮小し、必要なら縦を分割して複数ページに
    const imgWmm = usableW;
    const imgHmm = (canvas.height * imgWmm) / canvas.width;

    if (imgHmm <= usableH) {
      // 1ページに収まる
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(dataUrl, 'JPEG', margin, margin, imgWmm, imgHmm, undefined, 'FAST');
    } else {
      // 縦に複数ページ分割。各ページは canvas の一部を切り出して描画する。
      const pxPerMm = canvas.width / imgWmm;
      const pageSliceHpx = Math.floor(usableH * pxPerMm);
      let yPx = 0;
      let pageIdx = 0;
      while (yPx < canvas.height) {
        const sliceH = Math.min(pageSliceHpx, canvas.height - yPx);
        const tmp = document.createElement('canvas');
        tmp.width = canvas.width;
        tmp.height = sliceH;
        const ctx = tmp.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tmp.width, tmp.height);
        ctx.drawImage(canvas, 0, yPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        const sliceImg = tmp.toDataURL('image/jpeg', 0.92);
        const sliceHmm = (sliceH * imgWmm) / canvas.width;
        if (pageIdx > 0) pdf.addPage(format, orientation);
        pdf.addImage(sliceImg, 'JPEG', margin, margin, imgWmm, sliceHmm, undefined, 'FAST');
        yPx += sliceH;
        pageIdx++;
      }
    }
    pdf.save(filename);
  }

  // ========== 工程表PDFダウンロード ==========
  async function downloadSchedulePdf() {
    showPdfLoading('工程表PDFを生成中...');
    try {
      await ensurePdfLibsLoaded();
      const area = buildSchedulePdfDom();
      if (!area) throw new Error('PDF領域の構築に失敗しました');
      activatePdfArea(area);
      // フォント・レイアウト確定を待つ
      await new Promise(r => setTimeout(r, 60));
      try {
        const filename = `murata_schedule_${rangeFileTag()}.pdf`;
        await capturePdf(area, filename, { orientation: 'landscape', format: 'a3' });
        showToast('工程表PDFをダウンロードしました', 'success');
      } finally {
        deactivatePdfArea(area);
      }
    } catch (e) {
      console.error('downloadSchedulePdf error:', e);
      showToast('PDF生成に失敗しました: ' + (e && e.message ? e.message : e), 'error');
    } finally {
      hidePdfLoading();
    }
  }

  // ========== 集計PDFダウンロード ==========
  async function downloadSummaryPdf() {
    showPdfLoading('集計PDFを生成中...');
    try {
      await ensurePdfLibsLoaded();
      const area = buildSummaryPdfDom();
      if (!area) throw new Error('PDF領域の構築に失敗しました');
      activatePdfArea(area);
      await new Promise(r => setTimeout(r, 60));
      try {
        // ファイル名: 集計表_2026年度_20260507.pdf 形式 (年度=表示開始年)
        const filename = `集計表_${startYear}年度_${todayStr()}.pdf`;
        await capturePdf(area, filename, { orientation: 'landscape', format: 'a3' });
        showToast('集計PDFをダウンロードしました', 'success');
      } finally {
        deactivatePdfArea(area);
      }
    } catch (e) {
      console.error('downloadSummaryPdf error:', e);
      showToast('PDF生成に失敗しました: ' + (e && e.message ? e.message : e), 'error');
    } finally {
      hidePdfLoading();
    }
  }

  function getExportTargetSites() {
    const rangeStart = getRangeStartDate();
    const rangeEnd = getRangeEndDate();
    return sites.filter(s => {
      const sd = toDate(s.startDate); const ed = toDate(s.endDate);
      if (!sd || !ed) return false;
      return ed >= rangeStart && sd <= rangeEnd;
    }).sort(compareByNo);
  }

  function exportCSV() {
    const target = getExportTargetSites();
    if (target.length === 0) { showToast('表示期間内の出力対象がありません', 'error'); return; }
    // 「No」(行番号)とは別に「番号」(siteNo)列を追加。支給/材工列は無し。
    const headers = ['No', '番号', '現場名・工事内容', '現場担当', '建物の構造', '総数量(t)', '工期開始日', '工期終了日', '材料区分', '受注状況', '契約金額(円)', '備考'];
    const rows = target.map((s, i) => [
      i + 1,
      (s.siteNo != null && s.siteNo !== '') ? s.siteNo : (s.no != null ? s.no : ''),
      s.name || '',
      s.manager || '',
      s.structure || '',
      Number(s.quantity) || 0,
      s.startDate || '',
      s.endDate || '',
      normalizeMaterial(s.material) || '',
      s.orderStatus || '',
      s.amount || 0,
      s.memo || ''
    ]);
    const csv = [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `年間工程表_${rangeFileTag()}.csv`);
    showToast(`CSVを出力しました(${target.length}件)`, 'success');
  }

  function exportExcel() {
    const target = getExportTargetSites();
    if (target.length === 0) { showToast('表示期間内の出力対象がありません', 'error'); return; }
    const headers = ['No', '番号', '現場名・工事内容', '現場担当', '建物の構造', '総数量(t)', '工期開始日', '工期終了日', '材料区分', '受注状況', '契約金額(円)', '備考'];
    let xml = '<?xml version="1.0" encoding="UTF-8"?>';
    xml += '<?mso-application progid="Excel.Sheet"?>';
    xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
    xml += '<Styles>';
    xml += '<Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1A4A7A" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>';
    xml += '<Style ss:ID="title"><Font ss:Bold="1" ss:Size="14" ss:Color="#1A4A7A"/></Style>';
    xml += '<Style ss:ID="num"><NumberFormat ss:Format="#,##0"/></Style>';
    xml += '<Style ss:ID="numQty"><NumberFormat ss:Format="#,##0.000"/></Style>';
    xml += '</Styles>';
    xml += '<Worksheet ss:Name="現場一覧"><Table>';
    xml += `<Row><Cell ss:StyleID="title"><Data ss:Type="String">${escapeXml('年間工程表 ' + getRangeLabel())}</Data></Cell></Row>`;
    xml += '<Row></Row>';
    xml += '<Row>' + headers.map(h => `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('') + '</Row>';
    target.forEach((s, i) => {
      const siteNoVal = (s.siteNo != null && s.siteNo !== '') ? s.siteNo : (s.no != null ? s.no : '');
      xml += '<Row>';
      xml += `<Cell ss:StyleID="num"><Data ss:Type="Number">${i + 1}</Data></Cell>`;
      if (siteNoVal === '' || siteNoVal == null) {
        xml += `<Cell><Data ss:Type="String"></Data></Cell>`;
      } else {
        xml += `<Cell ss:StyleID="num"><Data ss:Type="Number">${Number(siteNoVal) || 0}</Data></Cell>`;
      }
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.name || '')}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.manager || '')}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.structure || '')}</Data></Cell>`;
      xml += `<Cell ss:StyleID="numQty"><Data ss:Type="Number">${Number(s.quantity) || 0}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.startDate || '')}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.endDate || '')}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(normalizeMaterial(s.material) || '')}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.orderStatus || '')}</Data></Cell>`;
      xml += `<Cell ss:StyleID="num"><Data ss:Type="Number">${Number(s.amount) || 0}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.memo || '')}</Data></Cell>`;
      xml += '</Row>';
    });
    xml += '</Table></Worksheet></Workbook>';
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
    downloadBlob(blob, `年間工程表_${rangeFileTag()}.xls`);
    showToast(`Excelを出力しました(${target.length}件)`, 'success');
  }

  // 集計CSV出力
  function exportSummaryCSV() {
    const data = computeSummary();
    const { months, overall, byManager, byStructure, byMaterial, monthly } = data;
    const lines = [];

    // ヘッダー(タイトル)
    lines.push(['村田鉄筋株式会社 年間工程表 集計表']);
    lines.push([`表示期間：${getRangeLabel()}`]);
    lines.push([`作成日：${fmtDateTimeJP(new Date())}`]);
    lines.push([]);

    // 全体集計
    lines.push(['【全体集計】']);
    lines.push(['表示期間', getRangeLabel()]);
    lines.push(['総現場数', overall.totalCount]);
    lines.push(['受注済み現場数', overall.confirmedCount]);
    lines.push(['受注可能性現場数', overall.tentativeCount]);
    lines.push(['総数量(t)', overall.totalQty.toFixed(3)]);
    lines.push(['受注済み数量(t)', overall.confirmedQty.toFixed(3)]);
    lines.push(['受注可能性数量(t)', overall.tentativeQty.toFixed(3)]);
    lines.push(['契約金額合計(円)', overall.totalAmount]);
    lines.push(['受注済み契約金額合計(円)', overall.confirmedAmount]);
    lines.push(['受注可能性契約金額合計(円)', overall.tentativeAmount]);
    lines.push([]);

    // 担当者別
    lines.push(['【担当者別集計】']);
    lines.push(['担当者名', '現場数', '数量合計(t)', '契約金額合計(円)']);
    byManager.forEach(([k, v]) => {
      lines.push([k, v.count, v.qty.toFixed(3), v.amount]);
    });
    lines.push([]);

    // 構造別
    lines.push(['【建物構造別集計】']);
    lines.push(['建物の構造', '現場数', '数量合計(t)', '契約金額合計(円)']);
    byStructure.forEach(([k, v]) => {
      lines.push([k, v.count, v.qty.toFixed(3), v.amount]);
    });
    lines.push([]);

    // 材料区分別
    lines.push(['【材料区分別集計】']);
    lines.push(['材料区分', '現場数', '数量合計(t)', '契約金額合計(円)']);
    byMaterial.forEach(([k, v]) => {
      lines.push([k, v.count, v.qty.toFixed(3), v.amount]);
    });
    lines.push([]);

    // 月別
    lines.push(['【月別集計】']);
    lines.push(['月', '稼働現場数', '予定数量(t)', '契約金額合計(円)']);
    monthly.forEach((d, i) => {
      const m = months[i];
      lines.push([`${m.year}年${m.month + 1}月`, d.active, d.qty.toFixed(3), Math.round(d.amount)]);
    });

    const csv = lines.map(r => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `集計表_${rangeFileTag()}.csv`);
    showToast('集計CSVを出力しました', 'success');
  }

  function exportJSON() {
    const data = { exportedAt: new Date().toISOString(), sites: sites };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `年間工程表_バックアップ_${todayStr()}.json`);
    showToast('バックアップを出力しました', 'success');
  }

  function importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.sites || !Array.isArray(data.sites)) throw new Error('形式不正');
        if (!confirm(`${data.sites.length}件のデータをインポートします。現在のデータは上書きされます。よろしいですか?`)) return;
        sites = data.sites.map(migrateSite);
        saveSites();
        renderSchedule();
        renderList();
        renderSummary();
        updateManagerList();
        showToast('インポートしました', 'success');
      } catch (err) {
        showToast('JSONの読み込みに失敗しました', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
  function rangeFileTag() {
    const endYM = normalizeYM(startYear, startMonth + 11);
    return `${startYear}${String(startMonth + 1).padStart(2, '0')}-${endYM.year}${String(endYM.month + 1).padStart(2, '0')}`;
  }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }
  function escapeXml(s) {
    if (s == null) return '';
    return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
  }

  // ---------- サンプルデータ ----------
  function maybeSeedSample() {
    if (sites.length > 0) return;
    const baseY = startYear;
    const baseM = startMonth;
    function ymd(year, monthIdx, day) {
      const ym = normalizeYM(year, monthIdx);
      return `${ym.year}-${String(ym.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    sites = [
      {
        id: uid(), no: 1, name: '〇〇マンション新築工事', manager: '山田 太郎',
        structure: 'マンションRC造', quantity: 85, material: '材工', orderStatus: '受注済み',
        startDate: ymd(baseY, baseM + 1, 15), endDate: ymd(baseY, baseM + 7, 28),
        amount: 24500000, memo: 'サンプルデータ',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      },
      {
        id: uid(), no: 2, name: '△△ビル増築工事', manager: '佐藤 花子',
        structure: 'S造', quantity: 32, material: '支給材', orderStatus: '受注済み',
        startDate: ymd(baseY, baseM + 3, 1), endDate: ymd(baseY, baseM + 10, 15),
        amount: 8200000, memo: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      },
      {
        id: uid(), no: 3, name: '□□倉庫基礎工事', manager: '鈴木 一郎',
        structure: '物流倉庫S造', quantity: 14.5, material: '材工', orderStatus: '受注済み',
        startDate: ymd(baseY, baseM + 5, 10), endDate: ymd(baseY, baseM + 8, 20),
        amount: 5800000, memo: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      },
      {
        id: uid(), no: 10, name: '▲▲工場 耐震補強工事', manager: '山田 太郎',
        structure: '耐震補強', quantity: 120, material: '材工', orderStatus: '受注済み',
        startDate: ymd(baseY, baseM + 8, 5), endDate: ymd(baseY, baseM + 14, 25),
        amount: 32500000, memo: '年またぎサンプル',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      },
      {
        id: uid(), no: 20, name: '◇◇橋梁補修工事(見込)', manager: '佐藤 花子',
        structure: '橋梁', quantity: 0.8, material: '支給材', orderStatus: '受注可能性',
        startDate: ymd(baseY, baseM + 4, 5), endDate: ymd(baseY, baseM + 6, 30),
        amount: 1800000, memo: '受注可能性サンプル',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      }
    ];
    saveSites();
  }

  // ---------- 初期化 ----------
  function init() {
    loadSites();
    loadRange();
    maybeSeedSample();
    // 既存データに番号がない場合は自動採番
    ensureSiteNumbers();
    saveSites();
    setupRole();
    setupTabs();
    setupRangeSelectors();
    setupForm();
    setupFilters();
    setupExport();
    updateManagerList();
    updatePrintDateLabels();
    renderSchedule();
    renderList();
    renderSummary();
    // 新規登録フォームの番号欄に次番号を初期表示
    const noEl = document.getElementById('siteNo');
    if (noEl && !noEl.value) noEl.value = nextSiteNo();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
