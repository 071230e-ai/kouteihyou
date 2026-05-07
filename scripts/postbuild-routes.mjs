// Cloudflare Pages の _routes.json を上書きして /static/* も Worker 経由にする。
// これにより Worker の認証ミドルウェアが /static/* にも適用される。
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const routesPath = resolve(process.cwd(), 'dist/_routes.json');
// /favicon.svg は公開(ログイン画面で使用)。それ以外は全て Worker 経由。
const routes = {
  version: 1,
  include: ['/*'],
  exclude: ['/favicon.svg']
};
writeFileSync(routesPath, JSON.stringify(routes));
console.log('[postbuild] _routes.json updated:', routes);
