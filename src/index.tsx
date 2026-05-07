import { Hono } from 'hono'
import { renderer } from './renderer'

const app = new Hono()

app.use(renderer)

app.get('/', (c) => {
  return c.render(
    <div id="app">
      {/* ヘッダー */}
      <header class="app-header no-print">
        <div class="header-inner">
          <div class="header-left">
            <div class="logo-mark">村</div>
            <div class="header-title-block">
              <h1 class="header-title">村田鉄筋株式会社</h1>
              <p class="header-subtitle">年間工程表 管理システム</p>
            </div>
          </div>
          <div class="header-right">
            <div class="role-switch">
              <label class="role-label">権限：</label>
              <select id="roleSelect" class="role-select">
                <option value="admin">管理者(編集可)</option>
                <option value="viewer">一般ユーザー(閲覧のみ)</option>
              </select>
            </div>
          </div>
        </div>

        {/* タブナビゲーション */}
        <nav class="tab-nav">
          <button class="tab-btn active" data-tab="schedule">
            <i class="fas fa-calendar-alt"></i> 年間工程表
          </button>
          <button class="tab-btn" data-tab="register">
            <i class="fas fa-plus-circle"></i> 現場登録
          </button>
          <button class="tab-btn" data-tab="list">
            <i class="fas fa-list"></i> 現場一覧
          </button>
          <button class="tab-btn" data-tab="summary">
            <i class="fas fa-chart-bar"></i> 集計
          </button>
          <button class="tab-btn" data-tab="export">
            <i class="fas fa-file-export"></i> 出力
          </button>
        </nav>
      </header>

      <main class="app-main">

        {/* ============ 年間工程表タブ ============ */}
        <section id="tab-schedule" class="tab-panel active">
          <div class="panel-header no-print">
            <h2 class="panel-title"><i class="fas fa-calendar-alt"></i> 年間工程表</h2>
            <div class="panel-actions">
              <label class="year-label">表示開始月：</label>
              <select id="scheduleStartYear" class="year-select" aria-label="開始年"></select>
              <select id="scheduleStartMonth" class="year-select" aria-label="開始月"></select>
              <button id="btnRangePrev" class="btn btn-text" title="1ヶ月前へ"><i class="fas fa-chevron-left"></i></button>
              <button id="btnRangeNext" class="btn btn-text" title="1ヶ月後へ"><i class="fas fa-chevron-right"></i></button>
              <button id="btnRangeToday" class="btn btn-text" title="今月を開始月に">今月</button>
              <span id="rangeLabel" class="range-label"></span>
              <button id="btnPrint" class="btn btn-secondary">
                <i class="fas fa-print"></i> 印刷
              </button>
              <button id="btnPdf" class="btn btn-primary">
                <i class="fas fa-file-pdf"></i> PDF出力
              </button>
            </div>
          </div>

          {/* 簡易集計バー */}
          <div class="summary-bar no-print" id="summaryBar"></div>

          {/* 絞り込みフィルタ */}
          <div class="filter-bar no-print">
            <input type="text" id="filterName" class="filter-input" placeholder="🔍 現場名" />
            <input type="text" id="filterManager" class="filter-input" placeholder="👤 現場担当" />
            <select id="filterStructure" class="filter-input">
              <option value="">構造(全て)</option>
              <option value="RC造">RC造</option>
              <option value="S造">S造</option>
              <option value="SRC造">SRC造</option>
              <option value="木造基礎">木造基礎</option>
              <option value="その他">その他</option>
            </select>
            <select id="filterContract" class="filter-input">
              <option value="">契約区分(全て)</option>
              <option value="支給材">支給材</option>
              <option value="材工">材工</option>
            </select>
            <input type="number" id="filterAmountMin" class="filter-input" placeholder="金額下限(円)" />
            <input type="number" id="filterAmountMax" class="filter-input" placeholder="金額上限(円)" />
            <button id="btnFilterReset" class="btn btn-text">クリア</button>
          </div>

          {/* 工程表本体(ガントチャート) */}
          <div class="schedule-wrapper">
            <div id="scheduleTitle" class="schedule-print-title"></div>
            <div class="schedule-scroll">
              <table id="scheduleTable" class="schedule-table">
                <thead>
                  <tr id="scheduleHeadRow"></tr>
                </thead>
                <tbody id="scheduleBody"></tbody>
              </table>
            </div>
            <div class="schedule-legend">
              <span class="legend-item"><span class="legend-color bar-supply"></span> 支給材</span>
              <span class="legend-item"><span class="legend-color bar-materialwork"></span> 材工</span>
            </div>
          </div>
        </section>

        {/* ============ 現場登録タブ ============ */}
        <section id="tab-register" class="tab-panel">
          <div class="panel-header">
            <h2 class="panel-title"><i class="fas fa-plus-circle"></i> 現場登録 / 編集</h2>
          </div>
          <form id="siteForm" class="site-form" novalidate>
            <input type="hidden" id="siteId" />

            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">現場名 <span class="required">*</span></label>
                <input type="text" id="siteName" class="form-input" placeholder="例：〇〇マンション新築工事" />
                <div class="error-msg" data-for="siteName"></div>
              </div>

              <div class="form-group">
                <label class="form-label">現場担当 <span class="required">*</span></label>
                <input type="text" id="manager" class="form-input" placeholder="例：山田 太郎" list="managerList" />
                <datalist id="managerList"></datalist>
                <div class="error-msg" data-for="manager"></div>
              </div>

              <div class="form-group">
                <label class="form-label">建物の構造 <span class="required">*</span></label>
                <select id="structure" class="form-input">
                  <option value="">選択してください</option>
                  <option value="RC造">RC造</option>
                  <option value="S造">S造</option>
                  <option value="SRC造">SRC造</option>
                  <option value="木造基礎">木造基礎</option>
                  <option value="その他">その他</option>
                </select>
                <div class="error-msg" data-for="structure"></div>
              </div>

              <div class="form-group">
                <label class="form-label">総数量 <span class="required">*</span></label>
                <div class="input-with-unit">
                  <input type="number" id="quantity" class="form-input" placeholder="例：50000" step="0.01" />
                  <select id="quantityUnit" class="unit-select">
                    <option value="kg">kg</option>
                    <option value="t">t</option>
                  </select>
                </div>
                <div class="error-msg" data-for="quantity"></div>
              </div>

              <div class="form-group">
                <label class="form-label">工期(開始日) <span class="required">*</span></label>
                <input type="date" id="startDate" class="form-input" />
                <div class="error-msg" data-for="startDate"></div>
              </div>

              <div class="form-group">
                <label class="form-label">工期(終了日) <span class="required">*</span></label>
                <input type="date" id="endDate" class="form-input" />
                <div class="error-msg" data-for="endDate"></div>
              </div>

              <div class="form-group">
                <label class="form-label">契約区分 <span class="required">*</span></label>
                <div class="radio-group">
                  <label class="radio-item">
                    <input type="radio" name="contractType" value="支給材" />
                    <span class="radio-label radio-supply">支給材</span>
                  </label>
                  <label class="radio-item">
                    <input type="radio" name="contractType" value="材工" />
                    <span class="radio-label radio-materialwork">材工</span>
                  </label>
                </div>
                <div class="error-msg" data-for="contractType"></div>
              </div>

              <div class="form-group">
                <label class="form-label">契約金額(円) <span class="required">*</span></label>
                <input type="text" id="amount" class="form-input" placeholder="例：10,000,000" inputmode="numeric" />
                <div class="form-help" id="amountHelp">半角数字で入力してください</div>
                <div class="error-msg" data-for="amount"></div>
              </div>

              <div class="form-group form-group-full">
                <label class="form-label">備考(任意)</label>
                <textarea id="memo" class="form-input" rows={2} placeholder="備考事項があれば記入"></textarea>
              </div>
            </div>

            <div class="form-actions">
              <button type="button" id="btnCancel" class="btn btn-text">キャンセル</button>
              <button type="submit" id="btnSave" class="btn btn-primary btn-lg">
                <i class="fas fa-save"></i> <span id="saveLabel">登録する</span>
              </button>
            </div>
          </form>
        </section>

        {/* ============ 現場一覧タブ ============ */}
        <section id="tab-list" class="tab-panel">
          <div class="panel-header">
            <h2 class="panel-title"><i class="fas fa-list"></i> 現場一覧</h2>
            <div class="panel-actions">
              <input type="text" id="listSearch" class="filter-input" placeholder="🔍 現場名・担当で検索" />
            </div>
          </div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>現場名</th>
                  <th>担当</th>
                  <th>構造</th>
                  <th>総数量</th>
                  <th>工期</th>
                  <th>契約区分</th>
                  <th class="th-amount">契約金額</th>
                  <th class="th-action">操作</th>
                </tr>
              </thead>
              <tbody id="listBody"></tbody>
            </table>
          </div>
        </section>

        {/* ============ 集計タブ ============ */}
        <section id="tab-summary" class="tab-panel">
          <div class="panel-header">
            <h2 class="panel-title"><i class="fas fa-chart-bar"></i> 集計</h2>
            <div class="panel-actions">
              <label class="year-label">表示開始月：</label>
              <select id="summaryStartYear" class="year-select" aria-label="開始年"></select>
              <select id="summaryStartMonth" class="year-select" aria-label="開始月"></select>
              <span id="summaryRangeLabel" class="range-label"></span>
            </div>
          </div>
          <div id="summaryContent"></div>
        </section>

        {/* ============ 出力タブ ============ */}
        <section id="tab-export" class="tab-panel">
          <div class="panel-header">
            <h2 class="panel-title"><i class="fas fa-file-export"></i> データ出力</h2>
          </div>
          <div class="export-grid">
            <div class="export-card">
              <i class="fas fa-file-pdf export-icon" style="color:#c0392b"></i>
              <h3>PDF / 印刷</h3>
              <p>年間工程表をA3横向きで印刷・PDF保存</p>
              <button id="btnExportPdf" class="btn btn-primary">PDF / 印刷</button>
            </div>
            <div class="export-card">
              <i class="fas fa-file-csv export-icon" style="color:#16a085"></i>
              <h3>CSV出力</h3>
              <p>現場情報をCSV形式でダウンロード</p>
              <button id="btnExportCsv" class="btn btn-primary">CSVダウンロード</button>
            </div>
            <div class="export-card">
              <i class="fas fa-file-excel export-icon" style="color:#27ae60"></i>
              <h3>Excel出力</h3>
              <p>現場情報をExcel(.xls)形式でダウンロード</p>
              <button id="btnExportExcel" class="btn btn-primary">Excelダウンロード</button>
            </div>
            <div class="export-card">
              <i class="fas fa-database export-icon" style="color:#2980b9"></i>
              <h3>バックアップ(JSON)</h3>
              <p>全データのバックアップ / 復元</p>
              <div style="display:flex;gap:8px;justify-content:center">
                <button id="btnExportJson" class="btn btn-secondary">エクスポート</button>
                <button id="btnImportJson" class="btn btn-secondary">インポート</button>
                <input type="file" id="jsonFileInput" accept=".json" style="display:none" />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* トースト通知 */}
      <div id="toast" class="toast"></div>

      <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" />
      <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js"></script>
      <script src="/static/app.js"></script>
    </div>
  )
})

export default app
