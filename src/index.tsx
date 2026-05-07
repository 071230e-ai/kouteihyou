import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { renderer } from './renderer'

type Bindings = {
  LOGIN_PASSWORD?: string
  SESSION_SECRET?: string
  ASSETS?: Fetcher
}

const app = new Hono<{ Bindings: Bindings }>()

// ============================================================
// 認証 (パスワードログイン)
// ============================================================
const SESSION_COOKIE = 'murata_session'
const SESSION_MAX_AGE = 60 * 60 * 24 // 24時間

// 定数時間比較 (タイミング攻撃対策)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

function getPassword(c: any): string {
  return (c.env && c.env.LOGIN_PASSWORD) || 'muratakouteihyou'
}
function getSecret(c: any): string {
  return (c.env && c.env.SESSION_SECRET) || 'murata-kouteihyou-default-secret-2026'
}

// HMAC-SHA256 署名付きセッショントークン (userId.exp.sig)
async function signSession(c: any, userId: string): Promise<string> {
  const secret = getSecret(c)
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
  const payload = `${userId}.${exp}`
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${payload}.${sigB64}`
}

async function verifySession(c: any, token: string | undefined): Promise<boolean> {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [userId, expStr, sig] = parts
  const exp = parseInt(expStr, 10)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  const secret = getSecret(c)
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${userId}.${expStr}`))
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return timingSafeEqual(sig, expectedB64)
}

async function isAuthenticated(c: any): Promise<boolean> {
  return await verifySession(c, getCookie(c, SESSION_COOKIE))
}

// 認証ミドルウェア (公開パス以外は要認証)
app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  const publicPaths = ['/login', '/api/login', '/api/logout', '/favicon.svg']
  if (publicPaths.includes(path)) return next()
  if (await isAuthenticated(c)) {
    // 認証済み: /static/* は Cloudflare Pages の静的アセット配信にフォワード
    if (path.startsWith('/static/') && c.env && c.env.ASSETS) {
      return c.env.ASSETS.fetch(c.req.raw)
    }
    return next()
  }
  // 未認証
  const accept = c.req.header('accept') || ''
  if (accept.includes('text/html')) return c.redirect('/login', 302)
  return c.text('Unauthorized', 401)
})

// ログイン画面
app.get('/login', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>ログイン - 村田鉄筋株式会社 年間工程表</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<style>
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Yu Gothic",Meiryo,sans-serif;background:linear-gradient(135deg,#1a4a7a 0%,#2c6ba6 50%,#1a4a7a 100%);display:flex;align-items:center;justify-content:center;min-height:100vh;color:#2c3e50}
.login-card{width:92%;max-width:420px;background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3),0 4px 12px rgba(0,0,0,.15);padding:40px 36px 32px}
.login-header{text-align:center;margin-bottom:28px}
.logo-mark{display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#1a4a7a,#2c6ba6);color:#fff;font-size:28px;font-weight:700;margin-bottom:14px;box-shadow:0 4px 12px rgba(26,74,122,.4)}
.login-title{font-size:18px;font-weight:700;color:#1a4a7a;margin:0 0 4px 0}
.login-subtitle{font-size:13px;color:#6b7a8a;margin:0}
.form-group{margin-bottom:18px}
.form-label{display:block;font-size:13px;font-weight:600;color:#2c3e50;margin-bottom:6px}
.form-input{width:100%;padding:11px 14px;font-size:15px;border:1.5px solid #cdd6e0;border-radius:6px;outline:none;transition:border-color .15s,box-shadow .15s;font-family:inherit}
.form-input:focus{border-color:#2c6ba6;box-shadow:0 0 0 3px rgba(44,107,166,.15)}
.login-btn{width:100%;padding:12px 16px;font-size:15px;font-weight:600;color:#fff;background:linear-gradient(135deg,#1a4a7a,#2c6ba6);border:none;border-radius:6px;cursor:pointer;transition:transform .1s,box-shadow .15s,opacity .15s;margin-top:6px}
.login-btn:hover{box-shadow:0 4px 12px rgba(26,74,122,.35)}
.login-btn:active{transform:translateY(1px)}
.login-btn:disabled{opacity:.6;cursor:not-allowed}
.error-msg{display:none;background:#fdecea;color:#c0392b;border:1px solid #f5b7b1;border-radius:6px;padding:10px 12px;font-size:13px;margin-bottom:14px}
.error-msg.show{display:block}
.login-footer{text-align:center;margin-top:22px;padding-top:18px;border-top:1px solid #eef0f3;font-size:12px;color:#95a5a6}
</style>
</head>
<body>
<main class="login-card" role="main">
  <div class="login-header">
    <div class="logo-mark">村</div>
    <h1 class="login-title">村田鉄筋株式会社</h1>
    <p class="login-subtitle">年間工程表 管理システム</p>
  </div>
  <div id="errorMsg" class="error-msg" role="alert" aria-live="polite"></div>
  <form id="loginForm" autocomplete="off" novalidate>
    <div class="form-group">
      <label for="passwordInput" class="form-label">パスワード</label>
      <input type="password" id="passwordInput" name="password" class="form-input" placeholder="パスワードを入力" autocomplete="current-password" required autofocus />
    </div>
    <button type="submit" id="loginBtn" class="login-btn">ログイン</button>
  </form>
  <div class="login-footer">© Murata Tekkin Co., Ltd.</div>
</main>
<script>
(function(){
  var form=document.getElementById('loginForm');
  var input=document.getElementById('passwordInput');
  var btn=document.getElementById('loginBtn');
  var errBox=document.getElementById('errorMsg');
  function showError(m){errBox.textContent=m;errBox.classList.add('show');}
  function hideError(){errBox.classList.remove('show');}
  form.addEventListener('submit', async function(e){
    e.preventDefault(); hideError();
    var pw=input.value;
    if(!pw){showError('パスワードを入力してください');return;}
    btn.disabled=true; btn.textContent='認証中...';
    try{
      var res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw}),credentials:'same-origin'});
      if(res.ok){window.location.href='/';return;}
      var data=await res.json().catch(function(){return{};});
      showError(data&&data.error?data.error:'パスワードが違います');
    }catch(err){showError('通信エラーが発生しました');}
    finally{btn.disabled=false; btn.textContent='ログイン'; input.select();}
  });
})();
</script>
</body>
</html>`)
})

// ログインAPI
app.post('/api/login', async (c) => {
  let body: any = {}
  try { body = await c.req.json() } catch { /* ignore */ }
  const password = (body && body.password) || ''
  if (typeof password !== 'string' || password.length === 0) {
    return c.json({ error: 'パスワードを入力してください' }, 400)
  }
  const expected = getPassword(c)
  if (!timingSafeEqual(password, expected)) {
    await new Promise(r => setTimeout(r, 400)) // 簡易ブルートフォース対策
    return c.json({ error: 'パスワードが違います' }, 401)
  }
  const token = await signSession(c, 'user')
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'Lax', secure: true, path: '/', maxAge: SESSION_MAX_AGE
  })
  return c.json({ ok: true })
})

// ログアウト
app.post('/api/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})
app.get('/api/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.redirect('/login', 302)
})

// 認証状態確認
app.get('/api/auth/status', async (c) => {
  return c.json({ authenticated: await isAuthenticated(c) })
})

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
            <button id="btnLogout" class="btn btn-secondary" style="margin-left:12px" title="ログアウト">
              <i class="fas fa-sign-out-alt"></i> ログアウト
            </button>
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
              <button id="btnPrint" class="btn btn-secondary" title="ブラウザの印刷ダイアログ">
                <i class="fas fa-print"></i> 印刷
              </button>
              <button id="btnPdf" class="btn btn-primary" title="PDFファイルを直接ダウンロード">
                <i class="fas fa-file-pdf"></i> 工程表PDFダウンロード
              </button>
            </div>
          </div>

          {/* 簡易集計バー */}
          <div class="summary-bar no-print" id="summaryBar"></div>

          {/* 絞り込みフィルタ */}
          <div class="filter-bar no-print">
            <input type="text" id="filterName" class="filter-input" placeholder="🔍 現場名" />
            <input type="text" id="filterManager" class="filter-input" placeholder="👤 現場担当" />
            <input type="text" id="filterStructure" class="filter-input" placeholder="🏗 構造" />
            <select id="filterMaterial" class="filter-input">
              <option value="">材料区分(全て)</option>
              <option value="材工">材工</option>
              <option value="支給材">支給材</option>
            </select>
            <select id="filterOrder" class="filter-input">
              <option value="">受注状況(全て)</option>
              <option value="受注済み">受注済み</option>
              <option value="受注可能性">受注可能性</option>
            </select>
            <input type="number" id="filterAmountMin" class="filter-input" placeholder="金額下限(円)" />
            <input type="number" id="filterAmountMax" class="filter-input" placeholder="金額上限(円)" />
            <button id="btnFilterReset" class="btn btn-text">クリア</button>
          </div>

          {/* 印刷用ヘッダー(画面非表示) */}
          <div id="schedulePrintHeader" class="print-header">
            <div class="print-company">村田鉄筋株式会社</div>
            <div class="print-doc-title">年間工程表</div>
            <div class="print-meta">
              <span id="schedulePrintRange"></span>
              <span class="print-date" id="schedulePrintDate"></span>
            </div>
          </div>

          {/* 工程表本体(ガントチャート) */}
          <div class="schedule-wrapper">
            <div class="schedule-scroll">
              <table id="scheduleTable" class="schedule-table">
                <thead>
                  <tr id="scheduleHeadRow"></tr>
                </thead>
                <tbody id="scheduleBody"></tbody>
              </table>
            </div>
            <div class="schedule-legend no-print">
              <span class="legend-item"><span class="legend-color bar-supply"></span> 支給系</span>
              <span class="legend-item"><span class="legend-color bar-materialwork"></span> 材工系</span>
              <span class="legend-item"><span class="legend-color bar-other"></span> その他</span>
              <span class="legend-item"><span class="legend-color bar-tentative"></span> 受注可能性</span>
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
                <label class="form-label">番号 <span class="required">*</span></label>
                <input type="number" id="siteNo" class="form-input" placeholder="例：1, 2, 10, 20" min="1" step="1" />
                <div class="form-help">未入力の場合は自動で採番されます(現在の最大番号+1)</div>
                <div class="error-msg" data-for="siteNo"></div>
              </div>
              <div class="form-group">
                <label class="form-label">　</label>
                <div style="padding:10px 0;font-size:12px;color:#6b7a8a">※ 番号順に工程表・集計に表示されます</div>
              </div>
              <div class="form-group form-group-full">
                <label class="form-label">現場名・工事内容 <span class="required">*</span></label>
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
                <input type="text" id="structure" class="form-input" placeholder="例：RC造 / S造 / SRC造 / マンションRC造 / 物流倉庫S造 / 耐震補強 / 橋梁 など" list="structureList" />
                <datalist id="structureList">
                  <option value="RC造" />
                  <option value="S造" />
                  <option value="SRC造" />
                  <option value="WRC造" />
                  <option value="木造基礎" />
                  <option value="マンションRC造" />
                  <option value="物流倉庫S造" />
                  <option value="耐震補強" />
                  <option value="橋梁" />
                  <option value="土木構造物" />
                  <option value="その他" />
                </datalist>
                <div class="form-help">よく使う候補が表示されます。自由に入力できます。</div>
                <div class="error-msg" data-for="structure"></div>
              </div>

              <div class="form-group">
                <label class="form-label">総数量(t) <span class="required">*</span></label>
                <div class="input-with-unit">
                  <input type="number" id="quantity" class="form-input" placeholder="例：85.5" step="0.001" min="0" />
                  <span class="unit-fixed">t</span>
                </div>
                <div class="form-help">トン(t)単位で入力してください。小数も可(例: 12.5t / 0.8t)</div>
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
                <label class="form-label">材料区分 <span class="required">*</span></label>
                <select id="material" class="form-input">
                  <option value="">選択してください</option>
                  <option value="材工">材工</option>
                  <option value="支給材">支給材</option>
                </select>
                <div class="form-help">「材工」または「支給材」を選択してください</div>
                <div class="error-msg" data-for="material"></div>
              </div>

              <div class="form-group">
                <label class="form-label">受注状況 <span class="required">*</span></label>
                <div class="radio-group">
                  <label class="radio-item">
                    <input type="radio" name="orderStatus" value="受注済み" />
                    <span class="radio-label radio-confirmed">受注済み</span>
                  </label>
                  <label class="radio-item">
                    <input type="radio" name="orderStatus" value="受注可能性" />
                    <span class="radio-label radio-tentative">受注可能性</span>
                  </label>
                </div>
                <div class="error-msg" data-for="orderStatus"></div>
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
              <input type="text" id="listSearch" class="filter-input" placeholder="🔍 現場名・担当・構造で検索" />
            </div>
          </div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>現場名・工事内容</th>
                  <th>担当</th>
                  <th>構造</th>
                  <th>数量</th>
                  <th>材料区分</th>
                  <th>受注</th>
                  <th>工期</th>
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
          <div class="panel-header no-print">
            <h2 class="panel-title"><i class="fas fa-chart-bar"></i> 集計</h2>
            <div class="panel-actions">
              <label class="year-label">表示開始月：</label>
              <select id="summaryStartYear" class="year-select" aria-label="開始年"></select>
              <select id="summaryStartMonth" class="year-select" aria-label="開始月"></select>
              <span id="summaryRangeLabel" class="range-label"></span>
              <button id="btnSummaryPrint" class="btn btn-secondary" title="ブラウザの印刷ダイアログ">
                <i class="fas fa-print"></i> 集計印刷
              </button>
              <button id="btnSummaryPdf" class="btn btn-primary" title="PDFファイルを直接ダウンロード">
                <i class="fas fa-file-pdf"></i> 集計PDFダウンロード
              </button>
              <button id="btnSummaryCsv" class="btn btn-primary">
                <i class="fas fa-file-csv"></i> 集計CSV出力
              </button>
            </div>
          </div>
          {/* 印刷用ヘッダー(画面非表示・印刷時のみ表示) */}
          <div id="summaryPrintHeader" class="print-header">
            <div class="print-company">村田鉄筋株式会社</div>
            <div class="print-doc-title">年間工程表 集計表</div>
            <div class="print-meta">
              <span id="summaryPrintRange"></span>
              <span class="print-date" id="summaryPrintDate"></span>
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
              <h3>工程表PDFダウンロード</h3>
              <p>年間工程表をA3横向きでPDFダウンロード(印刷ダイアログを開かず直接保存)</p>
              <button id="btnExportPdf" class="btn btn-primary">
                <i class="fas fa-file-pdf"></i> 工程表PDFダウンロード
              </button>
            </div>
            <div class="export-card">
              <i class="fas fa-file-pdf export-icon" style="color:#8e44ad"></i>
              <h3>集計PDFダウンロード</h3>
              <p>集計表をA3横向きでPDFダウンロード(印刷ダイアログを開かず直接保存)</p>
              <button id="btnExportSummaryPdfMain" class="btn btn-primary">
                <i class="fas fa-file-pdf"></i> 集計PDFダウンロード
              </button>
            </div>
            <div class="export-card">
              <i class="fas fa-file-csv export-icon" style="color:#16a085"></i>
              <h3>現場一覧 CSV出力</h3>
              <p>現場情報をCSV形式でダウンロード</p>
              <button id="btnExportCsv" class="btn btn-primary">CSVダウンロード</button>
            </div>
            <div class="export-card">
              <i class="fas fa-file-excel export-icon" style="color:#27ae60"></i>
              <h3>現場一覧 Excel出力</h3>
              <p>現場情報をExcel(.xls)形式でダウンロード</p>
              <button id="btnExportExcel" class="btn btn-primary">Excelダウンロード</button>
            </div>
            <div class="export-card">
              <i class="fas fa-chart-pie export-icon" style="color:#8e44ad"></i>
              <h3>集計CSV出力</h3>
              <p>集計表をCSV形式でダウンロード</p>
              <button id="btnExportSummaryCsv" class="btn btn-secondary">
                <i class="fas fa-file-csv"></i> 集計CSV
              </button>
              <button id="btnExportSummaryPdf" class="btn btn-secondary" style="margin-left:6px" title="印刷ダイアログを開く"><i class="fas fa-print"></i> 印刷</button>
            </div>
            <div class="export-card">
              <i class="fas fa-database export-icon" style="color:#2980b9"></i>
              <h3>バックアップ(JSON)</h3>
              <p>全データのバックアップ / 復元</p>
              <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
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

      {/* PDF出力専用エリア(画面外配置・display:noneは使わない・html2canvasで撮影可能) */}
      <div id="pdfScheduleArea" class="pdf-only-area" aria-hidden="true"></div>
      <div id="pdfSummaryArea" class="pdf-only-area" aria-hidden="true"></div>

      <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" />
      <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js"></script>
      {/* PDF生成用ライブラリ */}
      <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
      <script src="/static/app.js"></script>
    </div>
  )
})

export default app
