-- 0004: 現場の表示順を管理する sort_order カラムを sites に追加
--
-- 仕様:
--   - ドラッグ&ドロップ並び替え機能で使用する。通常表示は sort_order ASC で並べる。
--   - 既存の全現場に対して、現在の表示順 (site_no ASC, created_at ASC) と同じ順序で
--     sort_order を 10 刻みで初期値を設定する (10, 20, 30, ...)。
--   - 10 刻みにするのは、将来の並び替え保存で任意の位置に挿入する際に、
--     全件更新せずに間の値を割り当てられるようにするためだが、
--     本アプリでは基本的に「並び替え保存 → 全件再採番」を採用するので、
--     この初期化は「今後 sort_order が事実上の表示順になる」ことを保証すれば十分。
--   - 新規登録の現場は sort_order = COALESCE((SELECT MAX(sort_order) FROM sites), 0) + 10
--     をアプリ側で割り当てる (末尾に追加)。
--
-- 既存テーブル・データは保持したまま、新カラムのみを追加する。

ALTER TABLE sites ADD COLUMN sort_order INTEGER;

-- 既存データに現在の表示順 (site_no ASC nulls last, created_at ASC) の連番を 10 刻みで付与する。
-- SQLite の UPDATE で ROW_NUMBER() を使うために CTE 経由で id を紐づけて更新する。
UPDATE sites
SET sort_order = (
  SELECT rn * 10
  FROM (
    SELECT id AS id_x,
           ROW_NUMBER() OVER (
             ORDER BY
               CASE WHEN site_no IS NULL THEN 1 ELSE 0 END ASC,
               site_no ASC,
               created_at ASC
           ) AS rn
    FROM sites
  ) AS ranked
  WHERE ranked.id_x = sites.id
)
WHERE sort_order IS NULL;

-- 通常表示クエリを高速化するためのインデックス
CREATE INDEX IF NOT EXISTS idx_sites_sort_order ON sites(sort_order);
