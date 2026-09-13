/**
 * 发布 GitHub Release + 上传安装包 asset。
 * 用法：
 *   GITHUB_TOKEN=ghp_xxx node scripts/publish-release.mjs
 * 也可覆盖 REPO/TAG/TITLE/INSTALLER_PATH：
 *   GITHUB_TOKEN=ghp_xxx TAG=v2.2.5 TITLE="影海 v2.2.5" \
 *     INSTALLER_PATH="C:/Users/19218/yinghai-release/2026-08-30-0417/影海 Setup 2.2.5.exe" \
 *     node scripts/publish-release.mjs
 *
 * 注意：GitHub PAT 必须从环境变量读，绝不硬编码到仓库里——
 * GitHub Push Protection 会自动扫描并拒绝含 secret 的 commit。
 */
import { readFileSync, statSync } from 'node:fs';
import { request } from 'node:https';

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('错误：未设置环境变量 GITHUB_TOKEN');
  console.error('用法：GITHUB_TOKEN=ghp_xxx node scripts/publish-release.mjs');
  process.exit(1);
}
const REPO = process.env.GITHUB_REPO || 'mr-awei/yinghai-movie-vault';
const TAG = process.env.TAG || 'v2.2.5';
const TITLE = process.env.TITLE || `影海 ${TAG}`;
const INSTALLER = process.env.INSTALLER_PATH;
const NOTES = process.env.NOTES_PATH ? readFileSync(process.env.NOTES_PATH, 'utf-8') : `Release ${TAG}`;

if (!INSTALLER) {
  console.error('错误：未设置 INSTALLER_PATH');
  console.error('用法：INSTALLER_PATH="path/to/Setup.exe" node scripts/publish-release.mjs');
  process.exit(1);
}

const auth = 'Basic ' + Buffer.from('mr-awei:' + TOKEN).toString('base64');

const postJson = (path, body) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const req = request({
    hostname: 'api.github.com',
    path,
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'yinghai-publish',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  }, (res) => {
    let chunks = '';
    res.on('data', d => chunks += d);
    res.on('end', () => resolve({ status: res.statusCode, body: chunks }));
  });
  req.on('error', reject);
  req.write(data);
  req.end();
});

const r1 = await postJson(`/repos/${REPO}/releases`, {
  tag_name: TAG,
  name: TITLE,
  body: NOTES,
  draft: false,
  prerelease: false
});
console.log('create release status=', r1.status);
const rel = JSON.parse(r1.body);
if (r1.status >= 400) {
  console.error(r1.body);
  process.exit(1);
}
console.log('release id=', rel.id);
console.log('html_url=', rel.html_url);

const filename = INSTALLER.split(/[\\/]/).pop();
const stats = statSync(INSTALLER);
const fileData = readFileSync(INSTALLER);
console.log('uploading', filename, stats.size, 'bytes...');

await new Promise((resolve, reject) => {
  const req = request({
    hostname: 'uploads.github.com',
    path: `/repos/${REPO}/releases/${rel.id}/assets?name=${encodeURIComponent(filename)}`,
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'yinghai-publish',
      'Content-Type': 'application/octet-stream',
      'Content-Length': stats.size
    }
  }, (res) => {
    let chunks = '';
    res.on('data', d => chunks += d);
    res.on('end', () => {
      console.log('upload status=', res.statusCode);
      try {
        const out = JSON.parse(chunks);
        console.log('asset id=', out.id, 'name=', out.name, 'size=', out.size);
        console.log('download url=', out.browser_download_url);
      } catch (e) {
        console.error('parse err', chunks.slice(0, 200));
      }
      resolve();
    });
  });
  req.on('error', reject);
  req.write(fileData);
  req.end();
});
