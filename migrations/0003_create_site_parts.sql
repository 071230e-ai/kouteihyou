-- 0003: 現場の「部位別工程」を保存するテーブル
--
-- 仕様:
--   - 1つの現場(sites) に対して 0..N 件の部位を持つ (1対多)
--   - 既存の sites テーブルや既存データには一切変更を加えない
--   - 既存現場には部位レコードが存在しないため、フロント側では parts: [] として扱われる
--   - 現場が削除された場合は ON DELETE CASCADE で部位も削除される
--   - 並び順は sort_order ASC、同値時は created_at ASC で安定
CREATE TABLE IF NOT EXISTS site_parts (
  id TEXT PRIMARY KEY,                       -- 部位レコードのID (フロント発番のuid)
  site_id TEXT NOT NULL,                     -- 紐づく現場(sites.id) への FK
  sort_order INTEGER NOT NULL DEFAULT 0,     -- フォーム上の表示順
  name TEXT NOT NULL DEFAULT '',             -- 部位名 (自由入力。例: 基礎 / 地中梁 / 柱 / ...)
  quantity REAL NOT NULL DEFAULT 0,          -- 部位数量(t)
  start_date TEXT,                           -- 部位の施工開始日 'YYYY-MM-DD'
  end_date TEXT,                             -- 部位の施工終了日 'YYYY-MM-DD'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

-- 現場ごとの取得を高速化
CREATE INDEX IF NOT EXISTS idx_site_parts_site_order
  ON site_parts(site_id, sort_order, created_at);
