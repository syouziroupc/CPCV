import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const home = read("public/index.html");
const about = read("public/about/index.html");
const guide = read("public/guide/index.html");
const privacy = read("public/privacy/index.html");
const admin = read("public/admin/index.html");
const account = read("public/account/index.html");
const master = read("public/master/index.html");
const signup = read("public/signup/index.html");
const forgot = read("public/forgot-password/index.html");
const css = read("public/assets/app.css");

assert.match(home, /id="join"/);
assert.match(home, /学生として参加/);
assert.match(home, /先生としてログイン/);
assert.doesNotMatch(home, /statement-section|blockquote/);
assert.match(about, /3つの画面で動く/);
assert.match(guide, /id="teacher"/);
assert.match(guide, /id="student"/);
assert.match(privacy, /送信しない/);
for (const html of [home, about, guide, privacy]) {
  assert.match(html, /href="\/admin">先生ログイン/);
  assert.match(html, /href="\/guide"/);
}
for (const html of [admin, account, master]) {
  assert.match(html, /class="app-nav"/);
  assert.match(html, /href="\/admin"/);
  assert.match(html, /href="\/account"/);
  assert.match(html, /href="\/">ホーム/);
}
assert.match(admin, /class="auth-intro"/);
assert.match(signup, /class="compact-public-header"/);
assert.match(forgot, /class="compact-public-header"/);
assert.match(css, /Navigation and clarity refinement v1/);
assert.equal(admin, read("public/_admin_spa.html"));
console.log("Navigation and clarity refinement tests passed");
