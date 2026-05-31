-- 0002: 下請(subcontract)フラグを sites テーブルに追加
--
-- 仕様:
--   - 値は 0 (下請なし=通常案件) / 1 (下請あり) の 2値
--   - 既存データは全て 0 (下請なし) として扱う -> DEFAULT 0
--   - NOT NULL で明示し、NULL を許容しない(常に boolean として扱える)
--   - 既存の INDEX や ORDER BY ロジックには影響しない(並び順は変更しない)
ALTER TABLE sites
  ADD COLUMN subcontract INTEGER NOT NULL DEFAULT 0;
