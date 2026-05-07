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
  function migrateSite(s) {
    if (!s || typeof s !== 'object') return s;
    // 番号: 既存値があれば数値化、なければ未設定(後で採番)
    let no = null;
    if (s.no !== undefined && s.no !== null && s.no !== '') {
      const n = Number(s.no);
      if (isFinite(n) && n > 0) no = Math.floor(n);
    }
    return {
      id: s.id || uid(),
      no: no,
      name: s.name || s.siteName || '',
      manager: s.manager || '',
      // 旧 kubun → structure に移行(なければ既存structure)
      structure: s.structure || s.kubun || '',
      // 数量は数値で保持(unitがあっても t に統一して扱う)
      // 旧データで unit==='kg' の場合は t に換算
      quantity: convertQuantityToT(s.quantity, s.quantityUnit || s.unit),
      // 材料区分: 旧値を「材工」「支給材」の2択に正規化
      material: normalizeMaterial(s.material || normalizeOldContractType(s.contractType)),
      // 受注状況: 既存値がなければ「受注済み」をデフォルト
      orderStatus: s.orderStatus || '受注済み',
      startDate: s.startDate || '',
      endDate: s.endDate || '',
      // 契約金額: contractAmount があればそれを優先
      amount: toNumberSafe(s.amount != null ? s.amount : s.contractAmount),
      memo: s.memo || '',
      createdAt: s.createdAt || new Date().toISOString(),
      updatedAt: s.updatedAt || new Date().toISOString()
    };
  }
  // 番号未設定のデータに自動採番(既存最大+1)
  function ensureSiteNumbers() {
    const used = sites.map(s => Number(s.no)).filter(n => isFinite(n) && n > 0);
    let next = used.length ? Math.max.apply(null, used) + 1 : 1;
    sites.forEach(s => {
      if (!s.no || !isFinite(Number(s.no)) || Number(s.no) <= 0) {
        s.no = next++;
      } else {
        s.no = Math.floor(Number(s.no));
      }
    });
  }
  // 番号順ソート用比較関数
  function compareByNo(a, b) {
    const na = Number(a.no) || 0;
    const nb = Number(b.no) || 0;
    if (na !== nb) return na - nb;
    return (a.startDate || '').localeCompare(b.startDate || '');
  }
  // 次の番号(新規登録時のデフォルト)
  function nextSiteNo() {
    const used = sites.map(s => Number(s.no)).filter(n => isFinite(n) && n > 0);
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
          cellInner = `<div class="gantt-bar ${colorCls}${tentativeCls}" style="left:${leftPct}%;width:${widthPct}%;" title="${escapeAttr(tip)}">${escapeHtml(s.name)}</div>`;
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
    // 材料区分別
    const byMaterial = groupBy(rangeSites, s => s.material || '(未設定)');
    // 支給/材工別(集約)
    const bySupplyType = groupSupplyType(rangeSites);

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

    return { months, overall, byManager, byStructure, byMaterial, bySupplyType, monthly };
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
  function groupSupplyType(arr) {
    // 「支給」「支給外」「材工」「労務」「材料」「その他」の集約
    const buckets = {
      '支給': { count: 0, qty: 0, amount: 0 },
      '支給外': { count: 0, qty: 0, amount: 0 },
      '材工': { count: 0, qty: 0, amount: 0 },
      '労務': { count: 0, qty: 0, amount: 0 },
      '材料': { count: 0, qty: 0, amount: 0 },
      'その他': { count: 0, qty: 0, amount: 0 }
    };
    arr.forEach(s => {
      const key = (s.material in buckets) ? s.material : 'その他';
      buckets[key].count++;
      buckets[key].qty += Number(s.quantity) || 0;
      buckets[key].amount += Number(s.amount) || 0;
    });
    return Object.entries(buckets);
  }

  // ---------- 集計画面 ----------
  function renderSummary() {
    const container = document.getElementById('summaryContent');
    if (!container) return;
    const data = computeSummary();
    const { months, overall, byManager, byStructure, byMaterial, bySupplyType, monthly } = data;

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

    // 支給/材工別(固定区分)
    html += `
      <div class="summary-section">
        <h3 class="summary-section-title">支給／材工別 集計</h3>
        <table class="summary-table">
          <thead>
            <tr>
              <th>区分</th>
              <th class="num">現場数</th>
              <th class="num">数量合計</th>
              <th class="num">契約金額合計</th>
            </tr>
          </thead>
          <tbody>
            ${bySupplyType.map(([k, v]) => `
              <tr>
                <td>${paramTag(k, materialClass(k))}</td>
                <td class="num">${v.count} 件</td>
                <td class="num">${v.qty.toLocaleString('ja-JP', { maximumFractionDigits: 2 })} t</td>
                <td class="num">¥${fmtAmount(v.amount)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td>合計</td>
              <td class="num">${overall.totalCount} 件</td>
              <td class="num">${overall.totalQty.toLocaleString('ja-JP', { maximumFractionDigits: 2 })} t</td>
              <td class="num">¥${fmtAmount(overall.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

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
    document.getElementById('btnPrint').addEventListener('click', printSchedule);
    document.getElementById('btnPdf').addEventListener('click', printSchedule);

    // 集計タブのボタン
    document.getElementById('btnSummaryPrint').addEventListener('click', printSummary);
    document.getElementById('btnSummaryPdf').addEventListener('click', printSummary);
    document.getElementById('btnSummaryCsv').addEventListener('click', exportSummaryCSV);

    // 出力タブ
    document.getElementById('btnExportPdf').addEventListener('click', () => {
      document.querySelector('.tab-btn[data-tab="schedule"]').click();
      setTimeout(printSchedule, 200);
    });
    document.getElementById('btnExportCsv').addEventListener('click', exportCSV);
    document.getElementById('btnExportExcel').addEventListener('click', exportExcel);
    const btnSummaryPdfMain = document.getElementById('btnExportSummaryPdfMain');
    if (btnSummaryPdfMain) {
      btnSummaryPdfMain.addEventListener('click', () => {
        document.querySelector('.tab-btn[data-tab="summary"]').click();
        setTimeout(printSummary, 200);
      });
    }
    document.getElementById('btnExportSummaryPdf').addEventListener('click', () => {
      document.querySelector('.tab-btn[data-tab="summary"]').click();
      setTimeout(printSummary, 200);
    });
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
    const headers = ['No', '現場名・工事内容', '現場担当', '建物の構造', '総数量(t)', '工期開始日', '工期終了日', '材料区分', '受注状況', '契約金額(円)'];
    const rows = target.map((s, i) => [
      s.no || (i + 1),
      s.name || '',
      s.manager || '',
      s.structure || '',
      Number(s.quantity) || 0,
      s.startDate || '',
      s.endDate || '',
      normalizeMaterial(s.material) || '',
      s.orderStatus || '',
      s.amount || 0
    ]);
    const csv = [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `年間工程表_${rangeFileTag()}.csv`);
    showToast(`CSVを出力しました(${target.length}件)`, 'success');
  }

  function exportExcel() {
    const target = getExportTargetSites();
    if (target.length === 0) { showToast('表示期間内の出力対象がありません', 'error'); return; }
    const headers = ['No', '現場名・工事内容', '現場担当', '建物の構造', '総数量(t)', '工期開始日', '工期終了日', '材料区分', '受注状況', '契約金額(円)'];
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
      xml += '<Row>';
      xml += `<Cell ss:StyleID="num"><Data ss:Type="Number">${s.no || (i + 1)}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.name || '')}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.manager || '')}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.structure || '')}</Data></Cell>`;
      xml += `<Cell ss:StyleID="numQty"><Data ss:Type="Number">${Number(s.quantity) || 0}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.startDate || '')}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.endDate || '')}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(normalizeMaterial(s.material) || '')}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.orderStatus || '')}</Data></Cell>`;
      xml += `<Cell ss:StyleID="num"><Data ss:Type="Number">${Number(s.amount) || 0}</Data></Cell>`;
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
    const { months, overall, byManager, byStructure, byMaterial, bySupplyType, monthly } = data;
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

    // 支給/材工別
    lines.push(['【支給／材工別集計】']);
    lines.push(['区分', '現場数', '数量合計(t)', '契約金額合計(円)']);
    bySupplyType.forEach(([k, v]) => {
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
