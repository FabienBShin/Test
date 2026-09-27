// 브라우저 테스트: npm run test:e2e  (Gemini는 가짜 응답으로 대체)
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
let server, base, browser;

test.before(async () => {
  server = http.createServer(async (req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
    try { res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] ?? 'application/octet-stream' }); res.end(await fs.readFile(p)); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}/`;
  const local = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
  const exists = await fs.access(local).then(() => true, () => false);
  browser = await chromium.launch(exists ? { executablePath: local } : {}); // CI에서는 Playwright가 설치한 브라우저
});
test.after(async () => { await browser?.close(); server?.close(); });

const ok = (obj) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });

// 새 페이지. gemini: (요청 본문, 모델) => route.fulfill 인자
async function open({ width = 390, height = 800, gemini, stats, settings } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push({ url: r.url(), headers: r.headers(), body: r.postData() }));
  await ctx.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request();
    const model = decodeURIComponent(req.url().match(/models\/([^:]+):/)[1]);
    const body = JSON.parse(req.postData());
    // 게임 시작 때의 능력치 결정 요청은 따로 처리한다 (stats 옵션이 없으면 AI가 기준값을 그대로 돌려준 것으로 본다)
    const isStats = body.systemInstruction.parts[0].text.includes('캐릭터 설계자');
    const res = isStats ? (stats ? await stats(body, model) : ok({ stats: {} }))
      : gemini ? await gemini(body, model) : ok({ narration: '기본 응답', choices: [] });
    if (res === 'network') return route.abort();
    return route.fulfill(res);
  });
  if (settings) await ctx.addInitScript((s) => localStorage.setItem('rp.settings', JSON.stringify(s)), settings);
  await page.goto(base);
  return { page, ctx, errors, requests };
}
const KEY = { apiKey: 'secret-test-key', model: 'auto', responseLength: 'normal', adultMode: false };

async function startPreset(page, index = 0, custom = {}) {
  await page.locator('#preset-list .card').nth(index).getByText('플레이').click();
  for (const [k, v] of Object.entries(custom)) await page.fill(`#setup-form [name=${k}]`, v);
  await page.click('text=게임 시작');
  await page.waitForSelector('#screen-game:not([hidden])');
}
async function say(page, text) {
  await page.fill('#action-input', text);
  await page.click('#action-form button');
  await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
}
const logText = (page) => page.textContent('#log');
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// ---------- 완료 기준 1: 화면 ----------
for (const width of [390, 1280]) {
  test(`[기준1] ${width}px에서 모든 화면에 가로 스크롤이 없다`, async () => {
    const { page, ctx, errors } = await open({ width });
    assert.ok(await noHScroll(page), '타이틀');
    await page.locator('#preset-list .card').first().getByText('플레이').click();
    assert.ok(await noHScroll(page), '캐릭터 설정');
    await page.click('text=게임 시작');
    for (const tab of ['me', 'people', 'map', 'bag', 'quest', 'world']) {
      await page.click(`[data-tab=${tab}]`);
      assert.ok(await noHScroll(page), tab);
    }
    await page.click('#btn-settings-2');
    assert.ok(await noHScroll(page), '설정 창');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

// ---------- 완료 기준 2, 4: AI 연결, 키 보호, 성격 반영 ----------
test('[기준2,4] 설정에 키를 넣으면 AI가 응답하고, 키는 Gemini 헤더로만 간다. 바꾼 성격이 프롬프트에 들어간다', async () => {
  const { page, ctx, errors, requests } = await open({ gemini: () => ok({ narration: 'AI 게임 마스터의 응답', choices: ['다음'] }) });
  await page.click('#btn-open-settings');
  await page.fill('#settings-form [name=apiKey]', 'secret-test-key');
  assert.equal(await page.inputValue('#settings-form [name=model]'), 'auto');
  assert.equal(await page.locator('#settings-form [name=model] option').count(), 9);
  await page.click('#settings-form button[value=ok]');
  await startPreset(page, 0, { personality: '겁이 많고 수다스러움' });
  await say(page, '미라에게 인사한다');
  assert.match(await logText(page), /AI 게임 마스터의 응답/);
  const ai = requests.filter((r) => r.url.includes('generativelanguage'));
  assert.ok(ai.length >= 1);
  assert.ok(ai.every((r) => r.headers['x-goog-api-key'] === 'secret-test-key'));
  assert.ok(ai[0].body.includes('겁이 많고 수다스러움'));
  const others = requests.filter((r) => !r.url.includes('generativelanguage'));
  assert.ok(others.every((r) => r.url.startsWith(base)), '다른 서버로 가는 요청 없음');
  assert.ok(requests.every((r) => !r.url.includes('secret-test-key') && (r.url.includes('generativelanguage') || !(r.body ?? '').includes('secret-test-key'))));
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- 완료 기준 3: 테스트 모드 6종 ----------
test('[기준3] API 키 없이 6개 프리셋에서 대화, 이동, 시간 넘기기가 된다', async () => {
  const { page, ctx, errors, requests } = await open();
  const count = await page.locator('#preset-list .card').count();
  assert.equal(count, 6);
  for (let i = 0; i < count; i++) {
    await page.goto(base);
    await startPreset(page, i);
    await page.locator('#choices button').first().click();
    await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
    await say(page, '안녕하세요');
    assert.match(await logText(page), /테스트 모드/);
    await page.click('[data-tab=map]');
    const t0 = await page.textContent('#g-time');
    await page.locator('#tab-body button', { hasText: '이동' }).first().click();
    await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
    await page.click('[data-skip="60"]');
    await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
    assert.notEqual(await page.textContent('#g-time'), t0);
  }
  assert.ok(!requests.some((r) => r.url.includes('generativelanguage')), '테스트 모드는 AI를 부르지 않는다');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- 완료 기준 5: 관계 ----------
test('[기준5] 상호작용하면 관계 수치와 기억이 갱신되어 패널에 보인다', async () => {
  const { page, ctx } = await open({ settings: KEY, gemini: () => ok({ narration: '미라가 웃는다', relationshipChanges: [{ npc: 'mira', affection: 5, trust: 2, love: 1, memory: '레온이 꽃을 줬다' }], choices: [] }) });
  await startPreset(page, 0);
  await say(page, '미라에게 꽃을 준다');
  await page.click('[data-tab=people]');
  const txt = await page.textContent('#tab-body');
  assert.match(txt, /호감 15/);
  assert.match(txt, /신뢰 12/);
  assert.match(txt, /애정 1/);
  assert.match(txt, /기억 1개/);
  await page.click('#tab-body summary');
  assert.match(await page.textContent('#tab-body'), /꽃을 줬다/);
  await ctx.close();
});

// ---------- 완료 기준 6: 시간 ----------
test('[기준6] 행동마다 세계관 범위 안에서 시간이 흐르고, NPC 위치가 시간대마다 바뀐다', async () => {
  const minutes = [99999, 1, 45];
  const { page, ctx } = await open({ settings: KEY, gemini: () => ok({ narration: '...', minutes: minutes.shift() ?? 60 }) });
  await startPreset(page, 0); // 판타지: 1일차 08:00, 범위 10~480분
  await say(page, 'a');
  assert.match(await page.textContent('#g-time'), /1일차 16:00 \(오후\)/);
  await say(page, 'b');
  assert.match(await page.textContent('#g-time'), /1일차 16:10/);
  await say(page, 'c');
  assert.match(await page.textContent('#g-time'), /1일차 16:55/);
  await page.click('[data-tab=people]');
  assert.match(await page.textContent('#tab-body'), /미라.*📍 모험가 길드/s);
  await page.click('[data-skip="240"]');
  await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
  assert.match(await page.textContent('#g-time'), /20:55 \(저녁\)/);
  assert.match(await page.textContent('#tab-body'), /미라.*📍 은빛 여관/s);
  await ctx.close();
});

// ---------- 완료 기준 7: 하루 소식, 세계 상태 ----------
test('[기준7] 하루가 끝나면 NPC 사이 소식이 나오고 세력, 플래그, NPC 관계가 바뀐다', async () => {
  const { page, ctx } = await open({
    settings: KEY,
    gemini: (body) => (body.systemInstruction.parts[0].text.includes('세계 시뮬레이터')
      ? ok({ news: ['보르그와 미라가 크게 다퉜다'], npcRelationChanges: [{ from: 'borg', to: 'mira', affection: -8, trust: -3 }], factionChanges: { lord: -15 }, flags: { 세금인상: '발표됨' } })
      : ok({ narration: '...', statChanges: { 체력: -6 } })),
  });
  await startPreset(page, 0);
  await say(page, '힘든 일을 한다');
  await page.click('[data-skip=sleep]');
  await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
  const log = await logText(page);
  assert.match(log, /📰 보르그와 미라가 크게 다퉜다/);
  assert.match(log, /체력이\(가\) 6 회복되었다. \(10\/10\)/);
  assert.match(await page.textContent('#g-time'), /2일차 08:00 \(아침\)/);
  await page.click('[data-tab=world]');
  const w = await page.textContent('#tab-body');
  assert.match(w, /영주 가문 -15/);
  assert.match(w, /세금인상: 발표됨/);
  await page.click('[data-tab=people]');
  assert.match(await page.textContent('#tab-body'), /보르그.*→ 미라: 호감7 신뢰27/s);
  await ctx.close();
});

// ---------- 완료 기준 8: 모듈 ----------
test('[기준8] 경제·능력치 모듈이 켜진 세계관에서만 보인다', async () => {
  const { page, ctx } = await open();
  const check = async (idx, { money, stats }) => {
    await page.goto(base);
    await startPreset(page, idx);
    await page.click('[data-tab=me]');
    const me = await page.textContent('#tab-body');
    assert.equal(/💰/.test(me), money, `돈 ${idx}`);
    assert.equal(/체력/.test(me), stats, `능력치 ${idx}`);
    await page.click('[data-tab=bag]');
    assert.equal(/쓰지 않습니다/.test(await page.textContent('#tab-body')), !money);
  };
  await check(0, { money: true, stats: true }); // 판타지
  await check(1, { money: false, stats: true }); // 대학
  await check(3, { money: true, stats: false }); // 사극
  await ctx.close();
});

// ---------- 완료 기준 9: 목표, 엔딩 ----------
test('[기준9] 목표 진행도가 보이고, 엔딩이 나온 뒤에도 계속 플레이할 수 있다', async () => {
  let n = 0;
  const { page, ctx } = await open({ settings: KEY, gemini: () => (++n === 1 ? ok({ narration: '진전', goalProgressDelta: 40 }) : n === 2 ? ok({ narration: '해냈다', goalProgressDelta: 60, ending: { id: 'good' } }) : ok({ narration: '엔딩 이후의 하루' })) });
  await startPreset(page, 0);
  await say(page, '의뢰를 해결한다');
  await page.click('[data-tab=quest]');
  assert.match(await page.textContent('#tab-body'), /진행도 40\/100/);
  await say(page, '분쟁을 해결한다');
  assert.match(await logText(page), /🏁 엔딩: 좋은 결말/);
  await say(page, '산책한다');
  const log = await logText(page);
  assert.match(log, /엔딩 이후의 하루/);
  assert.equal((log.match(/🏁/g) ?? []).length, 1);
  await ctx.close();
});

// ---------- 완료 기준 10: 세계관 만들기 ----------
test('[기준10] 한 줄 설명으로 AI가 세계관을 만들고, 에디터에서 고쳐 플레이할 수 있다', async () => {
  const { PRESETS } = await import('../js/presets.js');
  const generated = { ...structuredClone(PRESETS[0]), id: 'x', name: '스팀펑크 탐정', emoji: '🕵️' };
  const { page, ctx, errors } = await open({ settings: KEY, gemini: () => ok(generated) });
  await page.click('#btn-new-world');
  await page.fill('#gen-prompt', '스팀펑크 도시의 탐정물');
  await page.click('#btn-generate');
  await page.waitForFunction(() => document.querySelector('#editor-json').value.includes('스팀펑크'));
  const json = JSON.parse(await page.inputValue('#editor-json'));
  json.name = '스팀펑크 탐정 (수정됨)';
  await page.fill('#editor-json', JSON.stringify(json));
  await page.click('#btn-editor-save');
  assert.match(await page.textContent('#world-list'), /스팀펑크 탐정 \(수정됨\)/);
  await page.locator('#world-list .card').first().getByText('플레이').click();
  await page.click('text=게임 시작');
  await page.waitForSelector('#screen-game:not([hidden])'); // 키가 있으면 AI 능력치 결정을 기다린다
  assert.match(await page.textContent('#g-world'), /수정됨/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[기준10] 프리셋을 복사해서 수정할 수 있고 원본은 그대로다', async () => {
  const { page, ctx } = await open();
  await page.locator('#preset-list .card').first().getByText('복사해서 수정').click();
  await page.click('#btn-editor-save');
  assert.equal(await page.locator('#world-list .card').count(), 1);
  assert.equal(await page.locator('#preset-list .card').count(), 6);
  await ctx.close();
});

// ---------- 완료 기준 11: 저장 ----------
test('[기준11] 새로고침 후 이어하기, 슬롯 저장과 불러오기', async () => {
  const { page, ctx } = await open();
  await startPreset(page, 0, { name: '저장테스트' });
  await say(page, '첫 행동');
  await page.reload();
  await page.click('#btn-continue');
  assert.match(await logText(page), /첫 행동/);
  await page.click('#btn-save');
  assert.equal(await page.locator('#slot-list .slot').count(), 5);
  await page.locator('#slot-list .slot').nth(2).getByText('저장').click();
  await say(page, '슬롯 저장 뒤 행동');
  await page.click('#btn-to-title');
  await page.click('#btn-open-slots');
  assert.match(await page.textContent('#slot-list'), /3\. .*저장테스트/);
  await page.locator('#slot-list .slot').nth(2).getByText('불러오기').click();
  const log = await logText(page);
  assert.match(log, /첫 행동/);
  assert.doesNotMatch(log, /슬롯 저장 뒤 행동/);
  await ctx.close();
});

test('[기준11] 세이브와 세계관을 파일로 내보내고 다시 불러온다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rp-'));
  const { page, ctx } = await open();
  await startPreset(page, 0, { name: '파일테스트' });
  await say(page, '파일 행동');
  await page.click('#btn-save');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-save')]);
  const saveFile = path.join(dir, 'save.json');
  await dl.saveAs(saveFile);
  await page.keyboard.press('Escape');
  // 복사한 세계관 내보내기
  await page.click('#btn-to-title');
  await page.locator('#preset-list .card').nth(1).getByText('복사해서 수정').click();
  await page.click('#btn-editor-save');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.locator('#world-list .card').first().getByTitle('파일로 내보내기').click()]);
  const worldFile = path.join(dir, 'world.json');
  await dl2.saveAs(worldFile);
  // 저장소를 비우고 다시 불러오기
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles('#file-import-world', worldFile);
  await page.waitForFunction(() => document.querySelectorAll('#world-list .card').length === 1);
  await page.setInputFiles('#file-import-save', saveFile);
  await page.waitForSelector('#screen-game:not([hidden])');
  assert.match(await logText(page), /파일 행동/);
  assert.match(await page.textContent('#tab-body'), /파일테스트/);
  await ctx.close();
});

// ---------- 완료 기준 12: 성인 모드, 미성년자 ----------
test('[기준12] 성인 확인을 거절하면 성인 모드가 켜지지 않는다', async () => {
  const { page, ctx } = await open();
  await page.click('#btn-open-settings');
  page.once('dialog', (d) => d.dismiss());
  await page.click('#settings-form [name=adultMode]'); // check()는 상태가 안 바뀌면 오류를 내므로 click 사용
  assert.equal(await page.isChecked('#settings-form [name=adultMode]'), false);
  page.once('dialog', (d) => { assert.match(d.message(), /만 19세/); d.accept(); });
  await page.click('#settings-form [name=adultMode]');
  assert.equal(await page.isChecked('#settings-form [name=adultMode]'), true);
  await page.click('#settings-form button[value=ok]');
  await page.waitForFunction(() => localStorage.getItem('rp.settings')); // 창 닫힘 이벤트는 조금 뒤에 온다
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('rp.settings'))).adultMode, true);
  await ctx.close();
});

test('[기준12] 미성년자 NPC가 있는 세계관은 저장되지 않는다', async () => {
  const { page, ctx } = await open();
  await page.locator('#preset-list .card').first().getByText('복사해서 수정').click();
  const w = JSON.parse(await page.inputValue('#editor-json'));
  w.npcs[0].age = 17;
  await page.fill('#editor-json', JSON.stringify(w));
  await page.click('#btn-editor-save');
  assert.match(await page.textContent('#editor-error'), /성인/);
  assert.equal(await page.locator('#world-list .card').count(), 0);
  await ctx.close();
});

// ---------- 완료 기준 13: 오류 ----------
const errorCases = {
  '응답 차단': [() => ok({}) && { status: 200, contentType: 'application/json', body: JSON.stringify({ promptFeedback: { blockReason: 'OTHER' } }) }, /차단/],
  '키 오류': [() => ({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'API key not valid' } }) }), /API 키/],
  '네트워크 오류': [() => 'network', /네트워크/],
  '모든 모델 한도 초과': [() => ({ status: 429, body: '{}' }), /한도/],
  '깨진 응답': [() => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{깨짐' }] } }] }) }), /해석/],
};
for (const [name, [gemini, re]] of Object.entries(errorCases)) {
  test(`[기준13] ${name}: 안내가 나오고, 입력이 복구되며, 게임이 계속된다`, async () => {
    let fail = true;
    const { page, ctx, errors } = await open({ settings: KEY, gemini: (b, m) => (fail ? gemini(b, m) : ok({ narration: '복구됨' })) });
    await startPreset(page, 0);
    const t0 = await page.textContent('#g-time');
    await say(page, '문제의 행동');
    assert.match(await logText(page), re);
    assert.equal(await page.inputValue('#action-input'), '문제의 행동');
    assert.equal(await page.textContent('#g-time'), t0, '실패한 행동으로 시간이 흐르지 않는다');
    fail = false;
    if (name.includes('한도')) {
      // 한도에 걸린 모델은 잠시 쉰다. 바로 다시 누르면 같은 안내가 나오고, 대기 시간이 지나면 다시 된다.
      await page.click('#action-form button');
      await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
      assert.equal((await logText(page)).match(/한도/g).length, 2);
      await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 61_000; });
    }
    await page.click('#action-form button');
    await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
    assert.match(await logText(page), /복구됨/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('[기준13] 한도 초과 모델은 건너뛰고 다른 모델로 이어서 플레이한다', async () => {
  const used = [];
  const { page, ctx } = await open({ settings: KEY, gemini: (b, m) => { used.push(m); return m === 'gemini-3.8-flash' ? { status: 429, body: '{}' } : ok({ narration: `${m} 응답` }); } });
  await startPreset(page, 0);
  await say(page, 'a');
  assert.match(await logText(page), /gemini-3.7-flash 응답/);
  await ctx.close();
});

// ---------- 예외 상황 ----------
test('[예외] 빈 입력과 공백만 있는 입력은 무시한다', async () => {
  const { page, ctx } = await open();
  await startPreset(page, 0);
  const before = await page.locator('#log .msg').count();
  await page.fill('#action-input', '   ');
  await page.click('#action-form button');
  await page.fill('#action-input', '');
  await page.click('#action-form button');
  assert.equal(await page.locator('#log .msg').count(), before);
  await ctx.close();
});

test('[예외] 아주 긴 입력은 500자로 잘린다', async () => {
  const { page, ctx } = await open();
  await startPreset(page, 0);
  await page.fill('#action-input', '가'.repeat(5000));
  assert.equal((await page.inputValue('#action-input')).length, 500);
  await ctx.close();
});

test('[예외] 공백만 있는 이름은 기본 이름으로 시작한다', async () => {
  const { page, ctx } = await open();
  await startPreset(page, 0, { name: '   ' });
  await page.click('[data-tab=me]');
  assert.match(await page.textContent('#tab-body'), /레온/);
  await ctx.close();
});

test('[예외] 응답을 기다리는 중에 연타해도 한 번만 처리된다', async () => {
  let n = 0;
  const { page, ctx } = await open({ settings: KEY, gemini: async () => { n++; await new Promise((r) => setTimeout(r, 300)); return ok({ narration: '응답' }); } });
  await startPreset(page, 0);
  await page.fill('#action-input', '연타');
  await page.press('#action-input', 'Enter');
  await page.locator('#choices button').first().click({ force: true, timeout: 500 }).catch(() => {});
  await page.press('#action-input', 'Enter').catch(() => {});
  await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
  assert.equal(n, 1);
  await ctx.close();
});

test('[예외] 잘못된 세이브 파일과 세계관 파일은 안내만 하고 무시한다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rp-'));
  const bad = path.join(dir, 'bad.json');
  const { page, ctx, errors } = await open();
  for (const content of ['이건 JSON이 아님', '{}', '[]', 'null', JSON.stringify({ id: 'w' })]) {
    await fs.writeFile(bad, content);
    await page.setInputFiles('#file-import-save', bad);
    await page.waitForFunction(() => /읽지 못했습니다/.test(document.querySelector('#toast').textContent)); // 앞 안내가 남아 있을 수 있다
    await page.setInputFiles('#file-import-world', bad);
    await page.waitForFunction(() => /세계관 파일 오류/.test(document.querySelector('#toast').textContent));
    assert.ok(await page.isVisible('#screen-title'));
  }
  assert.equal(await page.locator('#world-list .card').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[예외] 에디터: 깨진 JSON, 빠진 항목, 없는 장소를 저장하지 않는다', async () => {
  const { page, ctx } = await open();
  await page.locator('#preset-list .card').first().getByText('복사해서 수정').click();
  const w = JSON.parse(await page.inputValue('#editor-json'));
  const cases = [
    ['{ 깨짐', /JSON 형식/],
    [JSON.stringify({ ...w, places: undefined }), /places/],
    [JSON.stringify({ ...w, startLocation: 'moon' }), /startLocation/],
    [JSON.stringify({ ...w, npcs: [{ ...w.npcs[0], schedule: { ...w.npcs[0].schedule, night: 'moon' } }] }), /일과 장소/],
  ];
  for (const [text, re] of cases) {
    await page.fill('#editor-json', text);
    await page.click('#btn-editor-save');
    assert.match(await page.textContent('#editor-error'), re);
  }
  assert.equal(await page.locator('#world-list .card').count(), 0);
  await ctx.close();
});

test('[예외] 시간 설정이 잘못된 세계관은 저장되지 않거나, 플레이해도 시간이 망가지지 않는다', async () => {
  const { page, ctx } = await open();
  await page.locator('#preset-list .card').first().getByText('복사해서 수정').click();
  const w = JSON.parse(await page.inputValue('#editor-json'));
  w.time = {};
  await page.fill('#editor-json', JSON.stringify(w));
  await page.click('#btn-editor-save');
  const rejected = (await page.textContent('#editor-error')).length > 0;
  if (!rejected) {
    await page.locator('#world-list .card').first().getByText('플레이').click();
    await page.click('text=게임 시작');
    await say(page, 'a');
    assert.match(await page.textContent('#g-time'), /^\d+일차 \d\d:\d\d/);
  }
  await ctx.close();
});

test('[예외] NPC가 없는 세계관도 하루를 넘길 수 있다', async () => {
  const { page, ctx, errors } = await open();
  await page.locator('#preset-list .card').first().getByText('복사해서 수정').click();
  const w = JSON.parse(await page.inputValue('#editor-json'));
  w.npcs = [];
  await page.fill('#editor-json', JSON.stringify(w));
  await page.click('#btn-editor-save');
  await page.locator('#world-list .card').first().getByText('플레이').click();
  await page.click('text=게임 시작');
  await page.click('[data-skip=sleep]');
  await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
  assert.match(await page.textContent('#g-time'), /2일차/);
  assert.doesNotMatch(await logText(page), /만들지 못했습니다/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[예외] 브라우저 저장 공간이 가득 차면 저장 실패를 알린다', async () => {
  const { page, ctx } = await open();
  await startPreset(page, 0);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
  await say(page, '저장 안 되는 행동');
  const shown = await page.evaluate(() => document.querySelector('#toast').hidden === false && /저장/.test(document.querySelector('#toast').textContent));
  assert.ok(shown, '저장 실패 안내가 보여야 한다');
  await ctx.close();
});

test('[예외] 목록에 없는 모델이 저장돼 있어도 설정 창이 자동으로 표시된다', async () => {
  const { page, ctx } = await open({ settings: { ...KEY, model: 'gemini-9-ultra' } });
  await page.click('#btn-open-settings');
  assert.equal(await page.inputValue('#settings-form [name=model]'), 'auto');
  await ctx.close();
});

test('[예외] 긴 플레이(대화 80회)에서도 요약이 돌고 AI 요청 크기가 계속 커지지 않는다', async () => {
  const sizes = [];
  const { page, ctx } = await open({
    settings: KEY,
    gemini: (b) => {
      const sys = b.systemInstruction.parts[0].text;
      if (sys.includes('기록 담당')) return ok({ story: '요약: 레온은 미라와 친해졌다', npcs: { mira: '자주 대화함' } });
      sizes.push(JSON.stringify(b).length);
      return ok({ narration: '응답 '.repeat(40), minutes: 10, relationshipChanges: [{ npc: 'mira', affection: 1, memory: `대화 ${sizes.length}` }] });
    },
  });
  await startPreset(page, 0);
  for (let i = 0; i < 80; i++) await say(page, `행동 ${i}`);
  await page.click('[data-tab=people]');
  assert.match(await page.textContent('#tab-body'), /기억 80개/);
  const early = Math.max(...sizes.slice(10, 20));
  const late = Math.max(...sizes.slice(-10));
  assert.ok(late < early * 2, `후반 요청 ${late} vs 초반 ${early}`);
  await ctx.close();
});

test('[예외] 한도 초과 뒤 API 키를 바꾸면 바로 다시 시도할 수 있다', async () => {
  let quota = true;
  const { page, ctx } = await open({ settings: KEY, gemini: () => (quota ? { status: 429, body: '{}' } : ok({ narration: '새 키로 응답' })) });
  await startPreset(page, 0);
  await say(page, 'a');
  assert.match(await logText(page), /한도/);
  quota = false;
  await page.click('#btn-settings-2');
  await page.fill('#settings-form [name=apiKey]', 'another-key');
  await page.click('#settings-form button[value=ok]');
  await page.click('#action-form button');
  await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
  assert.match(await logText(page), /새 키로 응답/);
  await ctx.close();
});

// ---------- 결정 사항 반영 ----------
test('[결정1] API 키가 있으면 게임 시작 때 AI가 능력치를 정하고, 실패하면 기본값으로 시작한다', async () => {
  let fail = false;
  const { page, ctx } = await open({ settings: KEY, stats: () => (fail ? { status: 500, body: '{}' } : ok({ stats: { 힘: 8, 지혜: 1, 매력: 2, 체력: 12 }, reason: '싸움꾼 기질' })) });
  await startPreset(page, 0, { personality: '싸움을 좋아함' });
  assert.match(await logText(page), /AI가 정한 능력치: 힘 8, 지혜 1, 매력 2, 체력 12/);
  await page.click('[data-tab=me]');
  assert.match(await page.textContent('#tab-body'), /힘8/);
  fail = true;
  await page.goto(base);
  await startPreset(page, 0);
  assert.match(await logText(page), /기본값으로 시작/);
  await ctx.close();
});

test('[결정1] 테스트 모드와 능력치 없는 세계관은 능력치 결정 요청을 보내지 않는다', async () => {
  const { page, ctx, requests } = await open({ settings: KEY });
  await startPreset(page, 3); // 사극: 능력치 없음
  const { page: p2, ctx: c2, requests: r2 } = await open();
  await startPreset(p2, 0);
  assert.equal(requests.filter((r) => r.url.includes('generativelanguage')).length, 0);
  assert.equal(r2.filter((r) => r.url.includes('generativelanguage')).length, 0);
  await ctx.close(); await c2.close();
});

test('[결정4] 직접 잔다고 입력하면 AI 휴식 판단으로 회복하고, 짧게 쉬면 적게 회복한다', async () => {
  const { page, ctx } = await open({ settings: KEY, gemini: (b) => {
    const action = b.contents[0].parts[0].text.split('플레이어 행동: ').pop();
    if (action.includes('훈련')) return ok({ narration: '지쳤다', statChanges: { 체력: -5 } });
    if (action.includes('잔다')) return ok({ narration: '푹 잤다', resting: true, minutes: 480 });
    return ok({ narration: '...' });
  } });
  await startPreset(page, 1); // 대학: 행동 최대 240분, 체력 5
  await say(page, '훈련한다');
  const t0 = await page.textContent('#g-time');
  await say(page, '방에 가서 잔다');
  assert.match(await logText(page), /체력이\(가\) 5 회복되었다. \(5\/5\)/);
  assert.match(t0, /1일차 10:00/);
  assert.match(await page.textContent('#g-time'), /1일차 18:00/, '휴식 8시간은 행동 최대치(4시간)에 막히지 않는다');
  await say(page, '훈련한다');
  await page.click('[data-skip="60"]');
  await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
  assert.match(await logText(page), /체력이\(가\) 1 회복되었다. \(1\/5\)/);
  await ctx.close();
});

test('[결정6] 예전 4구간 일과로 만든 세계관 파일도 불러와서 플레이할 수 있다', async () => {
  const { PRESETS } = await import('../js/presets.js');
  const w = structuredClone(PRESETS[0]);
  w.id = 'legacy';
  for (const n of w.npcs) n.schedule = { morning: 'guild', day: 'smithy', evening: 'inn', night: 'manor' };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rp-'));
  const file = path.join(dir, 'w.json');
  await fs.writeFile(file, JSON.stringify(w));
  const { page, ctx, errors } = await open();
  await page.setInputFiles('#file-import-world', file);
  await page.waitForFunction(() => document.querySelectorAll('#world-list .card').length === 1);
  await page.locator('#world-list .card').first().getByText('플레이').click();
  await page.click('text=게임 시작');
  await page.click('[data-tab=people]');
  assert.match(await page.textContent('#tab-body'), /📍 모험가 길드/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- 웹앱 (설치, 오프라인) ----------
test('[웹앱] 설치 정보(manifest)와 아이콘이 올바르다', async () => {
  const { page, ctx } = await open();
  const href = await page.getAttribute('link[rel=manifest]', 'href');
  const manifest = await (await page.request.get(new URL(href, base).href)).json();
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  for (const size of ['192x192', '512x512']) {
    const icon = manifest.icons.find((i) => i.sizes === size);
    const res = await page.request.get(new URL(icon.src, base).href);
    assert.equal(res.status(), 200, size);
    assert.equal(res.headers()['content-type'], 'image/png');
  }
  assert.equal((await page.request.get(new URL(await page.getAttribute('link[rel=apple-touch-icon]', 'href'), base).href)).status(), 200);
  await ctx.close();
});

test('[웹앱] 서비스 워커가 설치되고, 인터넷이 끊겨도 앱이 열리며 테스트 모드로 플레이할 수 있다', async () => {
  const { page, ctx, errors } = await open();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // 서비스 워커가 페이지를 맡은 상태로 다시 연다
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await page.reload();
  await startPreset(page, 0);
  await say(page, '오프라인에서 인사한다');
  assert.match(await logText(page), /테스트 모드/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[웹앱] 서비스 워커 캐시 목록의 파일이 모두 실제로 있다', async () => {
  const sw = await fs.readFile(path.join(ROOT, 'sw.js'), 'utf8');
  const files = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const f of files.filter((x) => x !== './')) await fs.access(path.join(ROOT, f));
  const jsFiles = (await fs.readdir(path.join(ROOT, 'js'))).map((f) => `js/${f}`);
  for (const f of jsFiles) assert.ok(files.includes(f), `${f}가 캐시 목록에 없다`);
});

test('[웹앱] 배포 워크플로가 복사하는 파일로 게임이 동작한다', async () => {
  const wf = await fs.readFile(path.join(ROOT, '.github/workflows/pages.yml'), 'utf8');
  const copied = wf.match(/cp -r (.+) _site\//)[1].split(/\s+/);
  for (const need of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons']) assert.ok(copied.includes(need), need);
  const html = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
  for (const ref of html.matchAll(/(?:href|src)="([^"#:]+)"/g)) {
    assert.ok(copied.some((c) => ref[1] === c || ref[1].startsWith(`${c}/`)), `${ref[1]}가 배포에서 빠진다`);
  }
});
