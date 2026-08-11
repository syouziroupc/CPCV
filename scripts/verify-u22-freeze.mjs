import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const failures = [];
let passed = 0;

const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const json = (path) => JSON.parse(read(path));
const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`[PASS] ${label}`);
    return;
  }
  failures.push(label);
  console.error(`[FAIL] ${label}${detail ? `: ${detail}` : ''}`);
};

const rootPackage = json('package.json');
const desktopPackage = json('desktop-overlay-poc/package.json');
const desktopTauri = json('desktop-overlay-poc/src-tauri/tauri.conf.json');
const desktopCargo = read('desktop-overlay-poc/src-tauri/Cargo.toml');
const desktopVersion = read('desktop-overlay-poc/VERSION').trim();
const rustToolchain = read('desktop-overlay-poc/rust-toolchain.toml');
const desktopWorkflow = read('.github/workflows/desktop-overlay-poc.yml');
const ciWorkflow = read('.github/workflows/ci.yml');
const productionWorkflow = read('.github/workflows/deploy-production.yml');
const responsiveWorkflow = read('.github/workflows/responsive-and-ai-regression.yml');
const currentSystem = read('docs/current-system.md');
const knownIssues = read('docs/known-issues.md');
const docsIndex = read('docs/INDEX.md');
const stage82Index = read('docs/final-stage08/00_INDEX.md');
const sourceRecord = read('SOURCE_GIT_RECORD.txt');
const contestNotes = read('desktop-overlay-poc/CONTEST-SOURCE-NOTES.md');
const freezeReadiness = read('docs/U22_FREEZE_READINESS.md');
const codexAcceptance = read('docs/U22_CODEX_FINAL_ACCEPTANCE.md');
const dataFreezePlan = read('docs/U22_DATA_FREEZE_PLAN.md');
const freezeBundler = read('scripts/build-u22-freeze-bundle.mjs');
const wrangler = read('wrangler.toml');
const gitignore = read('.gitignore');

check('Web package version is 0.8.10', rootPackage.version === '0.8.10');
check('Web npm is pinned to 11.18.0', rootPackage.packageManager === 'npm@11.18.0');
check('Web CI pins Ubuntu 24.04', ciWorkflow.includes('runs-on: ubuntu-24.04'));
check('Web CI pins Node 22.23.1', ciWorkflow.includes('node-version: 22.23.1') && ciWorkflow.includes('v22.23.1'));
check('Web CI pins npm 11.18.0', ciWorkflow.includes('npm install --global npm@11.18.0') && ciWorkflow.includes('11.18.0'));
check('Web CI pins official actions to immutable SHAs', ciWorkflow.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1') && ciWorkflow.includes('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020') && ciWorkflow.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'));
check('Web CI checks out and verifies exact PR head', ciWorkflow.includes('ref: ${{ github.event.pull_request.head.sha || github.sha }}') && ciWorkflow.includes('Verify exact source revision'));

check('Desktop package version is 0.2.2', desktopPackage.version === '0.2.2');
check('Desktop npm is pinned to 10.9.8', desktopPackage.packageManager === 'npm@10.9.8');
check('Desktop VERSION is 0.2.2', desktopVersion === '0.2.2');
check('Desktop Tauri version is 0.2.2', desktopTauri.version === '0.2.2');
check('Desktop Cargo version is 0.2.2', /^version\s*=\s*"0\.2\.2"/m.test(desktopCargo));
check('Desktop Rust toolchain is pinned to 1.97.1', /channel\s*=\s*"1\.97\.1"/.test(rustToolchain));

check('Desktop compatibility check uses bundled source', desktopPackage.scripts?.['check:compat'] === 'node scripts/check-current-web-contract.mjs ..');
check('Desktop workflow does not checkout moving master', !desktopWorkflow.includes('path: current-master') && !desktopWorkflow.includes('ref: master'));
check('Desktop workflow checks out and verifies exact PR head', desktopWorkflow.includes('ref: ${{ github.event.pull_request.head.sha || github.sha }}') && desktopWorkflow.includes('Verify exact source revision'));
check('Desktop workflow pins Windows 2025 generation', desktopWorkflow.includes('runs-on: windows-2025'));
check('Desktop workflow pins Node 22.23.1', desktopWorkflow.includes('node-version: 22.23.1') && desktopWorkflow.includes('v22.23.1'));
check('Desktop workflow pins npm 10.9.8', desktopWorkflow.includes('npm install --global npm@10.9.8'));
check('Desktop workflow installs rustc 1.97.1 explicitly', desktopWorkflow.includes('rustup toolchain install 1.97.1'));
check('Desktop workflow avoids moving third-party Rust action', !desktopWorkflow.includes('dtolnay/rust-toolchain@'));
check('Desktop workflow pins official actions to immutable SHAs', desktopWorkflow.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1') && desktopWorkflow.includes('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020') && desktopWorkflow.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'));
check('Desktop workflow runs pinned RustSec audit', desktopWorkflow.includes('cargo install cargo-audit --version 0.22.2 --locked') && desktopWorkflow.includes('cargo audit --file src-tauri/Cargo.lock'));
check('Desktop artifact records build environment', desktopWorkflow.includes('CPCV_BUILD_ENVIRONMENT.txt'));

check('Production workflow pins Ubuntu, Node, npm and immutable actions',
  productionWorkflow.includes('runs-on: ubuntu-24.04') &&
  productionWorkflow.includes('node-version: 22.23.1') &&
  productionWorkflow.includes('npm install --global npm@11.18.0') &&
  productionWorkflow.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1') &&
  productionWorkflow.includes('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020') &&
  productionWorkflow.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'));
check('Production workflow enforces reviewed install scripts and freeze verification',
  productionWorkflow.includes('NPM_CONFIG_STRICT_ALLOW_SCRIPTS: "true"') &&
  productionWorkflow.includes('npm install-scripts ls') &&
  productionWorkflow.includes('node scripts/verify-u22-freeze.mjs'));
check('Responsive workflow checks exact source with frozen dependencies',
  responsiveWorkflow.includes('runs-on: ubuntu-24.04') &&
  responsiveWorkflow.includes('ref: ${{ github.event.pull_request.head.sha || github.sha }}') &&
  responsiveWorkflow.includes('node-version: 22.23.1') &&
  responsiveWorkflow.includes('npm install --global npm@11.18.0') &&
  responsiveWorkflow.includes('python-version: "3.12.12"') &&
  responsiveWorkflow.includes('requirements-visual.txt') &&
  responsiveWorkflow.includes('actions/setup-python@a309ff8b426b58ec0e2a45f0f869d46889d02405'));

check('Current system identifies both release versions', currentSystem.includes('0.8.10') && currentSystem.includes('0.2.2'));
check('Known issues are freeze-candidate current', knownIssues.includes('U-22凍結候補') && knownIssues.includes('Web `0.8.10`') && knownIssues.includes('Desktop `0.2.2`'));
check('Known issues no longer claim production resources are unset', !knownIssues.includes('Remote環境未設定') && !knownIssues.includes('Rate Limiting namespace未設定'));
check('Documentation index points to current canonical files', docsIndex.includes('U22_FREEZE_READINESS.md') && docsIndex.includes('SOURCE_GIT_RECORD.txt'));
check('Stage 8.2 index is explicitly historical', stage82Index.includes('historical snapshot') && stage82Index.includes('現在のproduction状態を意味しません'));
check('Source record identifies v0.8.10', sourceRecord.includes('Version: 0.8.10') && !sourceRecord.includes('Version: 0.8.2'));
check('Source record identifies freeze branch and prior verified deployment', sourceRecord.includes('release/cpcv-u22-final-20260810') && sourceRecord.includes('4a295ae5505a680019b9896b97e1d6f1ec2f20cd'));
check('Freeze readiness records external gates', freezeReadiness.includes('Web production一致') && freezeReadiness.includes('Windows物理acceptance'));
check('Codex acceptance specifies 5.4 mini', codexAcceptance.includes('指定model: **5.4 mini**'));
check('Contest notes identifies both versions', contestNotes.includes('0.8.10') && contestNotes.includes('0.2.2'));
check('Data freeze plan separates production data from submission data', dataFreezePlan.includes('Production D1') && dataFreezePlan.includes('提出禁止') && dataFreezePlan.includes('synthetic'));
check('Freeze bundler rejects dirty trees and uses git archive',
  freezeBundler.includes("['status', '--porcelain']") &&
  freezeBundler.includes("['archive', '--format=zip'") &&
  freezeBundler.includes("resolve(ROOT, '.freeze-output')") &&
  freezeBundler.includes('verify-source-manifest.mjs') &&
  freezeBundler.includes('verify-u22-freeze.mjs'));

const productionOrigin = 'https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev';
check('Wrangler production origin is fixed', wrangler.includes(`PUBLIC_ORIGIN = "${productionOrigin}"`) && wrangler.includes(`AUTH_ORIGIN = "${productionOrigin}"`));
check('Source record uses production origin', sourceRecord.includes(productionOrigin));

for (const ignored of ['.env*', '.dev.vars*', 'node_modules/', '.wrangler/', '.freeze-output/', '.cpcv-staging.wrangler.toml', 'deployment-records/']) {
  check(`gitignore protects ${ignored}`, gitignore.includes(ignored));
}

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const forbiddenDirectories = /(^|\/)(node_modules|target|\.wrangler|\.dev-d1|\.freeze-output|deployment-records)(\/|$)/;
const forbiddenExtensions = new Set(['.exe', '.pfx', '.p12', '.pem', '.key', '.sqlite', '.sqlite3', '.db']);
const forbiddenNames = /(^|\/)(\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/;
const pathViolations = tracked.filter((path) => forbiddenDirectories.test(path) || forbiddenExtensions.has(extname(path).toLowerCase()) || forbiddenNames.test(path));
check('No runtime binary/database/secret files are tracked', pathViolations.length === 0, pathViolations.join(', '));

const textExtensions = new Set(['.js', '.mjs', '.json', '.toml', '.md', '.txt', '.yml', '.yaml', '.ps1', '.py', '.sql', '.html', '.css']);
const privateKeyHits = [];
for (const path of tracked) {
  if (!textExtensions.has(extname(path).toLowerCase())) continue;
  let content;
  try {
    content = read(path);
  } catch {
    continue;
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) privateKeyHits.push(path);
}
check('No private-key block is tracked', privateKeyHits.length === 0, privateKeyHits.join(', '));

const secretAssignments = [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'AUTH_RATE_LIMIT_PEPPER',
  'PUBLIC_RATE_LIMIT_PEPPER',
  'TURNSTILE_SECRET_KEY',
  'CPCV_WINDOWS_CERTIFICATE_BASE64',
  'CPCV_WINDOWS_CERTIFICATE_PASSWORD'
];
for (const name of secretAssignments) {
  const assignment = new RegExp(`^\\s*${name}\\s*=`, 'm');
  check(`wrangler.toml does not contain secret assignment ${name}`, !assignment.test(wrangler));
}

check('CI invokes U-22 freeze verifier', ciWorkflow.includes('node scripts/verify-u22-freeze.mjs'));
check('CI builds and uploads an exact-head source freeze candidate', ciWorkflow.includes('node scripts/build-u22-freeze-bundle.mjs') && ciWorkflow.includes('cpcv-u22-source-candidate-${{ github.event.pull_request.head.sha || github.sha }}'));
check('Freeze verifier itself is tracked', tracked.includes('scripts/verify-u22-freeze.mjs'));
check('Freeze readiness record is tracked', tracked.includes('docs/U22_FREEZE_READINESS.md'));
check('Codex acceptance record is tracked', tracked.includes('docs/U22_CODEX_FINAL_ACCEPTANCE.md'));
check('Data freeze plan is tracked', tracked.includes('docs/U22_DATA_FREEZE_PLAN.md'));
check('Freeze bundler is tracked', tracked.includes('scripts/build-u22-freeze-bundle.mjs'));
check('Desktop Rust toolchain pin is tracked', tracked.includes('desktop-overlay-poc/rust-toolchain.toml'));

console.log(`\nU-22 freeze verification summary: ${passed} passed, ${failures.length} failed, ${passed + failures.length} total.`);
if (failures.length) process.exitCode = 1;
