-- 村田鉄筋 年間工程表 - 現場テーブル
-- 全デバイスから共有される唯一の正となるストレージ
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,                  -- フロント側で発番する uid (互換のため文字列)
  site_no INTEGER,                      -- 表示用 No (NULL は末尾扱い)
  name TEXT NOT NULL DEFAULT '',        -- 現場名・工事内容
  manager TEXT NOT NULL DEFAULT '',     -- 現場担当
  structure TEXT NOT NULL DEFAULT '',   -- 構造 (RC造 / S造 / etc.)
  quantity REAL NOT NULL DEFAULT 0,     -- 総数量(t)
  material TEXT NOT NULL DEFAULT '',    -- 材料区分: '材工' | '支給材'
  order_status TEXT NOT NULL DEFAULT '受注済み',  -- '受注済み' | '受注可能性'
  start_date TEXT,                      -- 工期 開始日 'YYYY-MM-DD'
  end_date TEXT,                        -- 工期 終了日 'YYYY-MM-DD'
  amount REAL NOT NULL DEFAULT 0,       -- 契約金額(円)
  memo TEXT NOT NULL DEFAULT '',        -- 備考
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- No順ソート用 (NULLは末尾、その後 created_at 古い順)
CREATE INDEX IF NOT EXISTS idx_sites_no_created
  ON sites(site_no, created_at);
CREATE INDEX IF NOT EXISTS idx_sites_updated
  ON sites(updated_at);
