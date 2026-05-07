/* ============================================================
 * 村田鉄筋株式会社 - 年間工程表管理システム
 * フロントエンド ロジック (開始月から12カ月ローリング表示版)
 * ============================================================ */

(function () {
  'use strict';

  // ---------- 定数 ----------
  const STORAGE_KEY = 'murata_tekkin_sites_v1';
  const ROLE_KEY = 'murata_tekkin_role_v1';
  const RANGE_KEY = 'murata_tekkin_range_v2'; // {year, month} 形式

  // ---------- 状態 ----------
  let sites = [];           // 現場データ配列
  let editingId = null;     // 編集中のID
  // 表示開始月(年・月) … 月は 0-11
  const today = new Date();
  let startYear = today.getFullYear();
  let startMonth = today.getMonth(); // 0-11

  let currentRole = 'admin';
  let filters = {
    name: '', manager: '', structure: '', contract: '',
    amountMin: null, amountMax: null
  };
  let listSearch = '';

  // ---------- ストレージ ----------
  function loadSites() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      sites = raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('load error', e);
      sites = [];
    }
  }
  function saveSites() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
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
    if (n === null || n === undefined || isNaN(n)) return '';
    return Number(n).toLocaleString('ja-JP');
  }
  function fmtQuantity(qty, unit) {
    if (qty === null || qty === undefined || isNaN(qty)) return '';
    const num = Number(qty).toLocaleString('ja-JP', { maximumFractionDigits: 3 });
    return num + (unit || 'kg');
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

  // 月インデックスを year-month に正規化(月: 0-11 を超える場合に繰り上げ)
  function normalizeYM(year, monthIdx) {
    const d = new Date(year, monthIdx, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }
  // 開始月から N カ月の {year, month} 配列を返す
  function buildMonthList(year, monthIdx, count) {
    const arr = [];
    for (let i = 0; i < count; i++) {
      const ym = normalizeYM(year, monthIdx + i);
      arr.push(ym);
    }
    return arr;
  }
  // 表示期間: 開始月の1日 〜 12カ月後の前日 23:59:59
  function getRangeStartDate() {
    return new Date(startYear, startMonth, 1, 0, 0, 0);
  }
  function getRangeEndDate() {
    // 12カ月後の月初の前日(=11カ月後の月末)
    const endYM = normalizeYM(startYear, startMonth + 11);
    const lastDay = new Date(endYM.year, endYM.month + 1, 0);
    return new Date(endYM.year, endYM.month, lastDay.getDate(), 23, 59, 59);
  }
  // 表示期間ラベル: 「2026年5月〜2027年4月」
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

    // 値を反映 + イベント
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

    // 前へ/次へ/今月
    document.getElementById('btnRangePrev').addEventListener('click', () => {
      shiftRange(-1);
    });
    document.getElementById('btnRangeNext').addEventListener('click', () => {
      shiftRange(1);
    });
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

  // セレクタ・ラベルを現在の startYear/startMonth に同期
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
    const rl = document.getElementById('rangeLabel');
    if (rl) rl.textContent = label;
    const sl = document.getElementById('summaryRangeLabel');
    if (sl) sl.textContent = label;
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

    const data = {
      id: editingId || uid(),
      name: document.getElementById('siteName').value.trim(),
      manager: document.getElementById('manager').value.trim(),
      structure: document.getElementById('structure').value,
      quantity: Number(document.getElementById('quantity').value),
      quantityUnit: document.getElementById('quantityUnit').value,
      startDate: document.getElementById('startDate').value,
      endDate: document.getElementById('endDate').value,
      contractType: (document.querySelector('input[name="contractType"]:checked') || {}).value || '',
      amount: parseAmount(document.getElementById('amount').value),
      memo: document.getElementById('memo').value.trim(),
      updatedAt: new Date().toISOString()
    };

    let ok = true;
    if (!data.name) { setError('siteName', '現場名を入力してください'); ok = false; }
    if (!data.manager) { setError('manager', '現場担当を入力してください'); ok = false; }
    if (!data.structure) { setError('structure', '構造を選択してください'); ok = false; }
    if (!data.quantity || isNaN(data.quantity) || data.quantity <= 0) { setError('quantity', '総数量を入力してください(0より大きい数値)'); ok = false; }
    if (!data.startDate) { setError('startDate', '開始日を入力してください'); ok = false; }
    if (!data.endDate) { setError('endDate', '終了日を入力してください'); ok = false; }
    if (data.startDate && data.endDate && data.startDate > data.endDate) {
      setError('endDate', '終了日は開始日以降にしてください'); ok = false;
    }
    if (!data.contractType) {
      const errEl = document.querySelector('.error-msg[data-for="contractType"]');
      if (errEl) errEl.textContent = '契約区分を選択してください';
      ok = false;
    }
    if (!data.amount || isNaN(data.amount) || data.amount < 0) { setError('amount', '契約金額を入力してください(0以上の数値)'); ok = false; }

    if (!ok) {
      showToast('入力に不備があります', 'error');
      const firstErr = document.querySelector('.has-error');
      if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (editingId) {
      const idx = sites.findIndex(s => s.id === editingId);
      if (idx >= 0) sites[idx] = data;
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
    document.getElementById('saveLabel').textContent = '登録する';
    clearErrors();
  }

  function loadFormForEdit(id) {
    const site = sites.find(s => s.id === id);
    if (!site) return;
    editingId = id;
    document.getElementById('siteId').value = id;
    document.getElementById('siteName').value = site.name || '';
    document.getElementById('manager').value = site.manager || '';
    document.getElementById('structure').value = site.structure || '';
    document.getElementById('quantity').value = site.quantity || '';
    document.getElementById('quantityUnit').value = site.quantityUnit || 'kg';
    document.getElementById('startDate').value = site.startDate || '';
    document.getElementById('endDate').value = site.endDate || '';
    const radio = document.querySelector(`input[name="contractType"][value="${site.contractType}"]`);
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
    const ids = ['filterName', 'filterManager', 'filterStructure', 'filterContract', 'filterAmountMin', 'filterAmountMax'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('input', updateFilters);
      el.addEventListener('change', updateFilters);
    });
    document.getElementById('btnFilterReset').addEventListener('click', () => {
      ids.forEach(id => { document.getElementById(id).value = ''; });
      updateFilters();
    });
    document.getElementById('listSearch').addEventListener('input', (e) => {
      listSearch = e.target.value.trim();
      renderList();
    });
  }
  function updateFilters() {
    filters.name = document.getElementById('filterName').value.trim().toLowerCase();
    filters.manager = document.getElementById('filterManager').value.trim().toLowerCase();
    filters.structure = document.getElementById('filterStructure').value;
    filters.contract = document.getElementById('filterContract').value;
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
      if (filters.structure && s.structure !== filters.structure) return false;
      if (filters.contract && s.contractType !== filters.contract) return false;
      if (filters.amountMin !== null && Number(s.amount) < filters.amountMin) return false;
      if (filters.amountMax !== null && Number(s.amount) > filters.amountMax) return false;
      return true;
    });
  }

  // ---------- 年間工程表(ガント) ----------
  function renderSchedule() {
    const months = buildMonthList(startYear, startMonth, 12); // [{year,month}, ...]

    // ヘッダー
    const headRow = document.getElementById('scheduleHeadRow');
    let head = '';
    head += '<th class="col-name col-info">現場名</th>';
    head += '<th class="col-manager col-info">担当</th>';
    head += '<th class="col-structure col-info">構造</th>';
    head += '<th class="col-quantity col-info">総数量</th>';
    head += '<th class="col-contract col-info">区分</th>';
    head += '<th class="col-amount col-info">契約金額(円)</th>';
    months.forEach((ym, i) => {
      const isQEnd = ((i + 1) % 3 === 0);
      // 年が前月から変わるタイミング(初月 or 1月になる月)を強調
      const isNewYear = (i === 0) || (ym.month === 0);
      const cls = `col-month${isQEnd ? ' q-end' : ''}${isNewYear ? ' month-newyear' : ''}`;
      head += `<th class="${cls}"><span class="month-year">${ym.year}年</span>${ym.month + 1}月</th>`;
    });
    headRow.innerHTML = head;

    // タイトル(印刷用)
    document.getElementById('scheduleTitle').textContent =
      `村田鉄筋株式会社  年間工程表(${getRangeLabel()})`;

    // ボディ
    const body = document.getElementById('scheduleBody');
    const filtered = applyFilters(sites);
    const rangeStart = getRangeStartDate();
    const rangeEnd = getRangeEndDate();

    // 表示期間と重なる現場のみ
    const visible = filtered.filter(s => {
      const sd = toDate(s.startDate);
      const ed = toDate(s.endDate);
      if (!sd || !ed) return false;
      return ed >= rangeStart && sd <= rangeEnd;
    }).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

    if (visible.length === 0) {
      body.innerHTML = `<tr class="empty-row"><td colspan="18">表示期間(${getRangeLabel()})に該当する現場がありません。</td></tr>`;
      renderSummaryBar(filtered);
      return;
    }

    let html = '';
    visible.forEach(s => {
      const barInfo = computeBarSegment(s, months);
      const barClass = s.contractType === '材工' ? 'bar-materialwork' : 'bar-supply';
      let row = '<tr class="bar-row">';
      row += `<td class="col-name col-info" title="${escapeAttr(s.name)}">${escapeHtml(s.name)}</td>`;
      row += `<td class="col-manager col-info">${escapeHtml(s.manager || '')}</td>`;
      row += `<td class="col-structure col-info">${escapeHtml(s.structure || '')}</td>`;
      row += `<td class="col-quantity col-info">${escapeHtml(fmtQuantity(s.quantity, s.quantityUnit))}</td>`;
      row += `<td class="col-contract col-info"><span class="badge ${s.contractType === '材工' ? 'badge-materialwork' : 'badge-supply'}">${escapeHtml(s.contractType || '')}</span></td>`;
      row += `<td class="col-amount col-info">${fmtAmount(s.amount)}</td>`;

      // 月セル(12個)
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
          cellInner = `<div class="gantt-bar ${barClass}" style="left:${leftPct}%;width:${widthPct}%;" title="${escapeAttr(s.name + ' / ' + dateRange)}">${escapeHtml(s.name)}</div>`;
        }
        row += `<td class="${cls}">${cellInner}</td>`;
      }

      row += '</tr>';
      html += row;
    });
    body.innerHTML = html;
    renderSummaryBar(filtered);
  }

  /**
   * 工期バーの位置を「12カ月の月リスト」内で算出
   * 戻り値: { startIndex: 0..11, spanMonths: 1..12, startOffsetPct, endOffsetPct }
   * - 工期が表示期間の前後にはみ出す場合は、表示期間内に切り取る
   * - 表示期間と重なりがなければ null
   */
  function computeBarSegment(site, months) {
    const sd = toDate(site.startDate);
    const ed = toDate(site.endDate);
    if (!sd || !ed) return null;

    const rangeStart = new Date(months[0].year, months[0].month, 1, 0, 0, 0);
    const lastYM = months[11];
    const lastDay = new Date(lastYM.year, lastYM.month + 1, 0).getDate();
    const rangeEnd = new Date(lastYM.year, lastYM.month, lastDay, 23, 59, 59);

    // 重なり区間
    const segStart = sd < rangeStart ? rangeStart : sd;
    const segEnd = ed > rangeEnd ? rangeEnd : ed;
    if (segEnd < segStart) return null;

    // segStart と segEnd が、それぞれ months のどのインデックスに属するか
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

    // 開始月/終了月の日数で按分
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
    let totalQtyKg = 0;
    rangeSites.forEach(s => {
      const q = Number(s.quantity) || 0;
      totalQtyKg += s.quantityUnit === 't' ? q * 1000 : q;
    });
    const totalAmount = rangeSites.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
    const supplyCount = rangeSites.filter(s => s.contractType === '支給材').length;
    const materialworkCount = rangeSites.filter(s => s.contractType === '材工').length;

    const bar = document.getElementById('summaryBar');
    bar.innerHTML = `
      <div class="summary-card"><p class="summary-label">期間内 総現場数</p><p class="summary-value">${totalCount}<span class="summary-unit">件</span></p></div>
      <div class="summary-card"><p class="summary-label">期間内 総数量</p><p class="summary-value">${(totalQtyKg / 1000).toLocaleString('ja-JP', { maximumFractionDigits: 2 })}<span class="summary-unit">t</span></p></div>
      <div class="summary-card"><p class="summary-label">期間内 総契約金額</p><p class="summary-value">¥${fmtAmount(totalAmount)}</p></div>
      <div class="summary-card"><p class="summary-label">支給材</p><p class="summary-value">${supplyCount}<span class="summary-unit">件</span></p></div>
      <div class="summary-card"><p class="summary-label">材工</p><p class="summary-value">${materialworkCount}<span class="summary-unit">件</span></p></div>
    `;
  }

  // ---------- 現場一覧 ----------
  function renderList() {
    const tbody = document.getElementById('listBody');
    const term = listSearch.toLowerCase();
    const list = sites.filter(s => {
      if (!term) return true;
      return (s.name || '').toLowerCase().includes(term) ||
             (s.manager || '').toLowerCase().includes(term);
    }).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

    if (list.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="8">登録された現場はありません。</td></tr>`;
      return;
    }

    const isAdmin = currentRole === 'admin';
    let html = '';
    list.forEach(s => {
      const badgeClass = s.contractType === '材工' ? 'badge-materialwork' : 'badge-supply';
      html += `
        <tr>
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.manager || '')}</td>
          <td>${escapeHtml(s.structure || '')}</td>
          <td>${escapeHtml(fmtQuantity(s.quantity, s.quantityUnit))}</td>
          <td>${fmtDateJP(s.startDate)}<br>〜 ${fmtDateJP(s.endDate)}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(s.contractType || '')}</span></td>
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

  // ---------- 集計画面 ----------
  function renderSummary() {
    const container = document.getElementById('summaryContent');
    if (!container) return;

    const months = buildMonthList(startYear, startMonth, 12);
    const rangeStart = getRangeStartDate();
    const rangeEnd = getRangeEndDate();

    const rangeSites = sites.filter(s => {
      const sd = toDate(s.startDate); const ed = toDate(s.endDate);
      if (!sd || !ed) return false;
      return ed >= rangeStart && sd <= rangeEnd;
    });

    // 全体KPI
    const totalCount = rangeSites.length;
    let totalQtyKg = 0;
    rangeSites.forEach(s => {
      const q = Number(s.quantity) || 0;
      totalQtyKg += s.quantityUnit === 't' ? q * 1000 : q;
    });
    const totalAmount = rangeSites.reduce((a, s) => a + (Number(s.amount) || 0), 0);
    const supplyCount = rangeSites.filter(s => s.contractType === '支給材').length;
    const mwCount = rangeSites.filter(s => s.contractType === '材工').length;

    let html = '';
    html += `
      <div class="summary-section">
        <h3 class="summary-section-title">全体サマリー(${getRangeLabel()})</h3>
        <div class="kpi-grid">
          <div class="kpi-card"><p class="kpi-label">期間内 総現場数</p><p class="kpi-value">${totalCount}<span class="kpi-unit">件</span></p></div>
          <div class="kpi-card"><p class="kpi-label">期間内 総数量(kg)</p><p class="kpi-value">${totalQtyKg.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}<span class="kpi-unit">kg</span></p></div>
          <div class="kpi-card"><p class="kpi-label">期間内 総数量(t)</p><p class="kpi-value">${(totalQtyKg / 1000).toLocaleString('ja-JP', { maximumFractionDigits: 2 })}<span class="kpi-unit">t</span></p></div>
          <div class="kpi-card"><p class="kpi-label">期間内 総契約金額</p><p class="kpi-value">¥${fmtAmount(totalAmount)}</p></div>
          <div class="kpi-card"><p class="kpi-label">支給材 現場数</p><p class="kpi-value">${supplyCount}<span class="kpi-unit">件</span></p></div>
          <div class="kpi-card"><p class="kpi-label">材工 現場数</p><p class="kpi-value">${mwCount}<span class="kpi-unit">件</span></p></div>
        </div>
      </div>
    `;

    // 担当者別
    const managerMap = {};
    rangeSites.forEach(s => {
      const m = s.manager || '(未設定)';
      if (!managerMap[m]) managerMap[m] = { count: 0, qtyKg: 0, amount: 0 };
      managerMap[m].count++;
      const q = Number(s.quantity) || 0;
      managerMap[m].qtyKg += s.quantityUnit === 't' ? q * 1000 : q;
      managerMap[m].amount += Number(s.amount) || 0;
    });
    const managerRows = Object.entries(managerMap)
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([name, v]) => `
        <tr>
          <td>${escapeHtml(name)}</td>
          <td class="num">${v.count}</td>
          <td class="num">${(v.qtyKg / 1000).toLocaleString('ja-JP', { maximumFractionDigits: 2 })} t</td>
          <td class="num">¥${fmtAmount(v.amount)}</td>
        </tr>
      `).join('');
    html += `
      <div class="summary-section">
        <h3 class="summary-section-title">担当者別 集計</h3>
        ${managerRows ? `
        <table class="mini-table">
          <thead><tr><th>担当</th><th class="num">現場数</th><th class="num">総数量</th><th class="num">契約金額合計</th></tr></thead>
          <tbody>${managerRows}</tbody>
        </table>` : '<p style="color:#95a5a6">データがありません</p>'}
      </div>
    `;

    // 月別(12カ月)
    const monthData = months.map(() => ({ active: 0, qtyKg: 0, amount: 0 }));
    rangeSites.forEach(s => {
      const sd = toDate(s.startDate);
      const ed = toDate(s.endDate);
      if (!sd || !ed) return;
      const segStart = sd < rangeStart ? rangeStart : sd;
      const segEnd = ed > rangeEnd ? rangeEnd : ed;
      const totalDays = Math.floor((segEnd - segStart) / 86400000) + 1;
      const q = Number(s.quantity) || 0;
      const qtyKg = s.quantityUnit === 't' ? q * 1000 : q;
      const amount = Number(s.amount) || 0;

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
        monthData[i].active++;
        monthData[i].qtyKg += qtyKg * ratio;
        monthData[i].amount += amount * ratio;
      }
    });
    const monthRows = monthData.map((d, i) => {
      const m = months[i];
      return `
        <tr>
          <td>${m.year}年${m.month + 1}月</td>
          <td class="num">${d.active}</td>
          <td class="num">${(d.qtyKg / 1000).toLocaleString('ja-JP', { maximumFractionDigits: 2 })} t</td>
          <td class="num">¥${fmtAmount(Math.round(d.amount))}</td>
        </tr>
      `;
    }).join('');
    html += `
      <div class="summary-section">
        <h3 class="summary-section-title">月別 集計(${getRangeLabel()})</h3>
        <table class="mini-table">
          <thead><tr><th>月</th><th class="num">稼働現場数</th><th class="num">予定数量(按分)</th><th class="num">契約金額(按分)</th></tr></thead>
          <tbody>${monthRows}</tbody>
        </table>
        <p style="font-size:12px;color:#95a5a6;margin:8px 0 0">※ 数量・金額は工期日数で月按分した参考値です。</p>
      </div>
    `;

    container.innerHTML = html;
  }

  // ---------- 出力 ----------
  function setupExport() {
    document.getElementById('btnPrint').addEventListener('click', doPrint);
    document.getElementById('btnPdf').addEventListener('click', doPrint);
    document.getElementById('btnExportPdf').addEventListener('click', () => {
      document.querySelector('.tab-btn[data-tab="schedule"]').click();
      setTimeout(doPrint, 200);
    });
    document.getElementById('btnExportCsv').addEventListener('click', exportCSV);
    document.getElementById('btnExportExcel').addEventListener('click', exportExcel);
    document.getElementById('btnExportJson').addEventListener('click', exportJSON);
    document.getElementById('btnImportJson').addEventListener('click', () => {
      document.getElementById('jsonFileInput').click();
    });
    document.getElementById('jsonFileInput').addEventListener('change', importJSON);
  }

  function doPrint() {
    document.querySelector('.tab-btn[data-tab="schedule"]').click();
    setTimeout(() => window.print(), 100);
  }

  // 出力対象: 現在表示期間に重なる現場のみ
  function getExportTargetSites() {
    const rangeStart = getRangeStartDate();
    const rangeEnd = getRangeEndDate();
    return sites.filter(s => {
      const sd = toDate(s.startDate); const ed = toDate(s.endDate);
      if (!sd || !ed) return false;
      return ed >= rangeStart && sd <= rangeEnd;
    }).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  }

  function exportCSV() {
    const target = getExportTargetSites();
    if (target.length === 0) { showToast('表示期間内の出力対象がありません', 'error'); return; }
    const headers = ['現場名', '現場担当', '建物の構造', '建物の総数量', '工期開始日', '工期終了日', '支給材／材工', '契約金額'];
    const rows = target.map(s => [
      s.name || '',
      s.manager || '',
      s.structure || '',
      `${s.quantity || ''}${s.quantityUnit || ''}`,
      s.startDate || '',
      s.endDate || '',
      s.contractType || '',
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
    const headers = ['現場名', '現場担当', '建物の構造', '建物の総数量', '工期開始日', '工期終了日', '支給材／材工', '契約金額'];
    let xml = '<?xml version="1.0" encoding="UTF-8"?>';
    xml += '<?mso-application progid="Excel.Sheet"?>';
    xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
    xml += '<Styles>';
    xml += '<Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1A4A7A" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>';
    xml += '<Style ss:ID="title"><Font ss:Bold="1" ss:Size="14" ss:Color="#1A4A7A"/></Style>';
    xml += '<Style ss:ID="num"><NumberFormat ss:Format="#,##0"/></Style>';
    xml += '</Styles>';
    xml += '<Worksheet ss:Name="現場一覧"><Table>';
    // タイトル行
    xml += `<Row><Cell ss:StyleID="title"><Data ss:Type="String">${escapeXml('年間工程表 ' + getRangeLabel())}</Data></Cell></Row>`;
    xml += '<Row></Row>';
    xml += '<Row>' + headers.map(h => `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('') + '</Row>';
    target.forEach(s => {
      xml += '<Row>';
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.name || '')}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.manager || '')}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.structure || '')}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml((s.quantity || '') + (s.quantityUnit || ''))}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.startDate || '')}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.endDate || '')}</Data></Cell>`;
      xml += `<Cell><Data ss:Type="String">${escapeXml(s.contractType || '')}</Data></Cell>`;
      xml += `<Cell ss:StyleID="num"><Data ss:Type="Number">${Number(s.amount) || 0}</Data></Cell>`;
      xml += '</Row>';
    });
    xml += '</Table></Worksheet></Workbook>';
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
    downloadBlob(blob, `年間工程表_${rangeFileTag()}.xls`);
    showToast(`Excelを出力しました(${target.length}件)`, 'success');
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
        sites = data.sites;
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

  // ---------- サンプルデータ初回投入(空のとき) ----------
  function maybeSeedSample() {
    if (sites.length > 0) return;
    // 開始月を基準に、表示期間と重なる現場を投入
    const baseY = startYear;
    const baseM = startMonth;
    function ymd(year, monthIdx, day) {
      const ym = normalizeYM(year, monthIdx);
      return `${ym.year}-${String(ym.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    sites = [
      {
        id: uid(), name: 'サンプル：〇〇マンション新築工事', manager: '山田 太郎',
        structure: 'RC造', quantity: 85000, quantityUnit: 'kg',
        startDate: ymd(baseY, baseM + 1, 15), endDate: ymd(baseY, baseM + 7, 28),
        contractType: '材工', amount: 24500000, memo: 'サンプルデータ',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      },
      {
        id: uid(), name: 'サンプル：△△ビル増築工事', manager: '佐藤 花子',
        structure: 'S造', quantity: 32, quantityUnit: 't',
        startDate: ymd(baseY, baseM + 3, 1), endDate: ymd(baseY, baseM + 10, 15),
        contractType: '支給材', amount: 8200000, memo: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      },
      {
        id: uid(), name: 'サンプル：□□倉庫基礎工事', manager: '鈴木 一郎',
        structure: 'RC造', quantity: 14500, quantityUnit: 'kg',
        startDate: ymd(baseY, baseM + 5, 10), endDate: ymd(baseY, baseM + 8, 20),
        contractType: '材工', amount: 5800000, memo: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      },
      {
        id: uid(), name: 'サンプル：年またぎ工事(▲▲工場)', manager: '山田 太郎',
        structure: 'SRC造', quantity: 120, quantityUnit: 't',
        startDate: ymd(baseY, baseM + 8, 5), endDate: ymd(baseY, baseM + 14, 25),
        contractType: '材工', amount: 32500000, memo: '年またぎサンプル',
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
    setupRole();
    setupTabs();
    setupRangeSelectors();
    setupForm();
    setupFilters();
    setupExport();
    updateManagerList();
    renderSchedule();
    renderList();
    renderSummary();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
