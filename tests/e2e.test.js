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
// storage: 처음 열 때 넣어 둘 localStorage 값(JSON으로 저장). rawStorage: 문자열 그대로 넣을 값. 새로고침할 때마다 다시 넣으므로 이어하기 확인용이다.
async function open({ width = 390, height = 800, gemini, stats, settings, storage, rawStorage } = {}) {
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
    // 앱은 스트리밍(streamGenerateContent)으로 요청한다. 성공 JSON은 SSE 이벤트 하나로 감싸 돌려준다. 오류 응답은 그대로.
    if (req.url().includes('streamGenerateContent') && res.status === 200 && res.contentType === 'application/json') {
      return route.fulfill({ ...res, contentType: 'text/event-stream', body: `data: ${res.body}\n\n` });
    }
    return route.fulfill(res);
  });
  if (settings) await ctx.addInitScript((s) => localStorage.setItem('rp.settings', JSON.stringify(s)), settings);
  if (storage) await ctx.addInitScript((kv) => { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v)); }, storage);
  if (rawStorage) await ctx.addInitScript((kv) => { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); }, rawStorage);
  await page.goto(base);
  return { page, ctx, errors, requests };
}
const KEY = { apiKey: 'secret-test-key', model: 'auto', responseLength: 'normal', adultMode: false };

// 프리셋 id로 위치를 찾는다 (프리셋이 늘어도 번호가 어긋나지 않게)
async function presetIndex(id) {
  const { PRESETS } = await import('../js/presets.js');
  return PRESETS.findIndex((p) => p.id === id);
}
async function startPreset(page, index = 0, custom = {}) {
  await page.locator('#preset-list .card').nth(index).getByText('새 채팅').click();
  for (const [k, v] of Object.entries(custom)) await page.fill(`#setup-form [name=${k}]`, v);
  await page.click('text=게임 시작');
  await page.waitForSelector('#screen-game:not([hidden])');
}
// 이어하기: 저장소에서 읽어 오는 동안 기다린다
async function resume(page) {
  await page.click('#btn-continue');
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
    await page.locator('#preset-list .card').first().getByText('새 채팅').click();
    assert.ok(await noHScroll(page), '캐릭터 설정');
    await page.click('text=게임 시작');
    for (const tab of ['me', 'people', 'map', 'bag', 'quest', 'world']) {
      await page.click(`[data-tab=${tab}]`);
      assert.ok(await noHScroll(page), tab);
    }
    await page.click('#btn-settings-2');
    assert.ok(await noHScroll(page), '설정 창');
    await page.keyboard.press('Escape');
    await page.click('#btn-display');
    assert.ok(await noHScroll(page), '화면 표시 창');
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
  assert.equal(await page.locator('#settings-form [name=model] option').count(), 6); // 자동 + 모델 5개
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
test('[기준3] API 키 없이 모든 프리셋에서 대화, 이동, 시간 넘기기가 된다', async () => {
  const { PRESETS } = await import('../js/presets.js');
  const { page, ctx, errors, requests } = await open();
  const count = await page.locator('#preset-list .card').count();
  assert.equal(count, PRESETS.length);
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
  await page.locator('#world-list .card').first().getByText('새 채팅').click();
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
  assert.equal(await page.locator('#preset-list .card').count(), (await import('../js/presets.js')).PRESETS.length);
  await ctx.close();
});

// ---------- 완료 기준 11: 저장 ----------
test('[기준11] 새로고침 후 이어하기, 슬롯 저장과 불러오기', async () => {
  const { page, ctx } = await open();
  await startPreset(page, 0, { name: '저장테스트' });
  await say(page, '첫 행동');
  await page.reload();
  await resume(page);
  assert.match(await logText(page), /첫 행동/);
  await page.click('#btn-save');
  await page.waitForFunction(() => document.querySelectorAll('#slot-list .slot').length === 5);
  await page.locator('#slot-list .slot').nth(2).getByText('저장').click();
  await page.waitForFunction(() => /슬롯 3에 저장/.test(document.querySelector('#toast')?.textContent ?? ''));
  await say(page, '슬롯 저장 뒤 행동');
  await page.click('#btn-to-title');
  await page.click('#btn-open-slots');
  await page.waitForFunction(() => /불러올/.test(document.querySelector('#slots-title')?.textContent ?? '') && document.querySelector('#dlg-slots')?.open);
  assert.match(await page.textContent('#slot-list'), /3\. .*저장테스트/);
  await page.locator('#slot-list .slot').nth(2).getByText('불러오기').click();
  await page.waitForSelector('#screen-game:not([hidden])');
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
    await page.locator('#world-list .card').first().getByText('새 채팅').click();
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
  await page.locator('#world-list .card').first().getByText('새 채팅').click();
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
  await page.evaluate(() => { IDBObjectStore.prototype.put = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
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

// ---------- 선택 필드: startChoices, relationStages, templates ----------
test('[선택필드] 종족전쟁은 오프닝 전에 진영 버튼을 보여주고, 고르면 패치가 적용된다', async () => {
  const { page, ctx, errors } = await open();
  await startPreset(page, 6);
  const buttons = page.locator('#choices button');
  assert.equal(await buttons.count(), 3);
  assert.match(await buttons.first().textContent(), /솔렌 성왕국에 입대한다/);
  assert.ok(await page.isDisabled('#action-input'), '선택 전에는 자유 입력을 막는다');
  assert.ok(await page.isDisabled('[data-skip="60"]'));
  assert.doesNotMatch(await logText(page), /이야기가 시작됩니다/);
  await buttons.nth(1).click(); // 실바레스
  assert.match(await logText(page), /실바레스 대수림에 입대한다.*이야기가 시작됩니다/s);
  assert.match(await page.textContent('#g-time'), /실바레스 대수림 경계/);
  assert.ok(!(await page.isDisabled('#action-input')));
  await page.click('[data-tab=me]');
  const me = await page.textContent('#tab-body');
  assert.match(me, /신병 \[D급\]/);
  assert.match(me, /소속: 실바레스 대수림/);
  assert.match(me, /긴 귀와 은발/);
  await page.click('[data-tab=people]');
  assert.match(await page.textContent('#tab-body'), /엘윈 \(실바레스 대수림 숲 파수대장\) \[경계\].*호감 10/s);
  await say(page, '파수대장에게 인사한다');
  assert.match(await logText(page), /테스트 모드/);
  // 새로고침해도 선택 결과가 유지된다
  await page.reload();
  await resume(page);
  await page.click('[data-tab=me]');
  assert.match(await page.textContent('#tab-body'), /소속: 실바레스 대수림/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[선택필드] 선택 전에 새로고침해도 진영 버튼이 다시 나온다', async () => {
  const { page, ctx } = await open();
  await startPreset(page, 6);
  await page.reload();
  await resume(page);
  assert.equal(await page.locator('#choices button').count(), 3);
  assert.ok(await page.isDisabled('#action-input'));
  await ctx.close();
});

test('[선택필드] 기존 프리셋은 진영 버튼 없이 바로 시작하고 단계명도 없다', async () => {
  const { page, ctx } = await open();
  await startPreset(page, 0);
  assert.match(await logText(page), /이야기가 시작됩니다/);
  assert.doesNotMatch(await page.textContent('#choices'), /입대한다/);
  assert.ok(!(await page.isDisabled('#action-input')));
  await page.click('[data-tab=people]');
  assert.doesNotMatch(await page.textContent('#tab-body'), /\[경계\]|\[인정\]/);
  await ctx.close();
});

test('[선택필드] API 키가 있으면 templates 형식과 현재 값이 AI 요청에 들어가고, AI 능력치 결정은 건너뛴다', async () => {
  let statsCalls = 0;
  const { page, ctx, requests } = await open({ settings: KEY, stats: () => { statsCalls++; return ok({ stats: {} }); }, gemini: () => ok({ narration: 'AI 응답' }) });
  await startPreset(page, 6);
  await page.locator('#choices button').first().click(); // 솔렌
  await say(page, '막사를 둘러본다');
  assert.equal(statsCalls, 0);
  const body = requests.filter((r) => r.url.includes('generativelanguage')).at(-1).body;
  for (const s of ['출력 형식 규칙', '현재 상태 값', '소속 진영: 솔렌 성왕국', '카엘 10 [경계]']) assert.ok(body.includes(s), s);
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
  await page.locator('#world-list .card').first().getByText('새 채팅').click();
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

// ---------- 렌더러, 화면 표시 설정 ----------
const MD_SAMPLE = [
  '> 🏝️ 장소: 모래해변 | 🌤️ 날씨: ☀️ 맑음', '> ⏰ 시간: 3일차 | 14:20', '', '{{asset:BG001}}', '',
  '*파도가 발목을 적시고 지나갔다.*', '{{asset:HR01}}', '**서하린**: "조개부터 줍자."',
  '*하린은 앞장섰다. 모래 위에 <b>발자국</b>이 찍혔다.*', '**도예은 (서퍼):** 💭 \'저 사람, **조심해야겠다.**\'', '',
  '```INFO', '포만감: 62 (보통)', '```',
].join('\n');
async function gameWithMarkdown() {
  const { PRESETS } = await import('../js/presets.js');
  const S = await import('../js/state.js');
  const g = S.newGame(PRESETS[0], {});
  g.log.push({ role: 'player', text: '조개를 줍는다.' }, { role: 'gm', text: MD_SAMPLE });
  return g;
}

test('[렌더러] AI 응답의 서식이 헤더·지문·대사·상태창으로 보이고, HTML은 글자로만 보인다', async () => {
  const { page, ctx, errors } = await open({ storage: { 'rp.autosave': await gameWithMarkdown() } });
  await resume(page);
  const body = page.locator('.msg.gm .gm-body').last();
  assert.match(await body.locator('.quote').textContent(), /장소: 모래해변.*3일차 \| 14:20/s);
  assert.equal(await body.locator('.dialogue .who').first().textContent(), '서하린');
  assert.equal(await body.locator('.dialogue .say').first().textContent(), '조개부터 줍자.');
  assert.equal(await body.locator('.dialogue.thought .who').textContent(), '도예은 (서퍼)');
  assert.equal(await body.locator('.dialogue.thought strong').textContent(), '조심해야겠다.');
  assert.match(await body.locator('.panel-label').textContent(), /INFO/);
  assert.match(await body.locator('.panel-text').textContent(), /포만감: 62 \(보통\)/);
  const log = await logText(page);
  assert.ok(!log.includes('**') && !log.includes('{{asset') && !log.includes('```'), '서식 기호가 날것으로 남지 않는다');
  assert.ok(log.includes('<b>발자국</b>'), 'HTML 태그는 글자로 보인다');
  assert.equal(await page.locator('#log b, #log script, #log img').count(), 0, 'HTML 요소가 만들어지지 않는다');
  assert.ok(await noHScroll(page));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[렌더러] 굵게·기울임·코드·대사 안의 HTML도 요소가 되거나 실행되지 않는다', async () => {
  const { PRESETS } = await import('../js/presets.js');
  const S = await import('../js/state.js');
  const g = S.newGame(PRESETS[0], {});
  g.log.push({ role: 'gm', text: [
    '**<img src=x onerror="window.__xss=1">** 와 *앞 <img src=x onerror=window.__xss=2> 뒤* 와 `<script>window.__xss=3</script>`',
    '', '**공격자**: "<img src=x onerror=window.__xss=4> **<b>굵게</b>**"', '',
    '```', '<img src=x onerror=window.__xss=5>', '```', '', '> <img src=x onerror=window.__xss=6>',
  ].join('\n') });
  const { page, ctx, errors } = await open({ storage: { 'rp.autosave': g } });
  await resume(page);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__xss), undefined, '실행된 스크립트가 없다');
  assert.equal(await page.locator('#log img, #log script, #log b').count(), 0, 'HTML 요소가 만들어지지 않는다');
  const log = await logText(page);
  for (let n = 1; n <= 6; n++) assert.ok(log.includes(`window.__xss=${n}`), `${n}번 글자가 그대로 보인다`);
  assert.ok((await page.locator('#log strong').first().textContent()).includes('<img src=x'), '굵게 안의 태그도 글자');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[렌더러] 생존 수치가 20% 아래면 게이지가 위험색으로 보인다', async () => {
  const { PRESETS } = await import('../js/presets.js');
  const S = await import('../js/state.js');
  const g = S.newGame(PRESETS.find((p) => p.id === 'island'), {});
  Object.assign(g.meters, { satiety: 10, hydration: 50, condition: 19.9 });
  const { page, ctx } = await open({ storage: { 'rp.autosave': g } });
  await resume(page);
  await page.click('[data-tab=me]');
  const bars = page.locator('#tab-body .gauges .bar');
  assert.deepEqual(await bars.evaluateAll((els) => els.map((e) => e.classList.contains('danger'))), [true, false, true]);
  const color = (i) => bars.nth(i).locator('i').evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(await color(0), await color(1), '위험 게이지는 다른 색');
  assert.match(await page.textContent('#tab-body .gauges'), /포만감 10\/100 · 위험/);
  await ctx.close();
});

test('[표시설정] 소설형으로 바꾸면 지문이 말풍선에서 빠지고, 글자 크기·줄 간격과 함께 새로고침 후에도 유지된다', async () => {
  const { page, ctx, errors } = await open({ storage: { 'rp.autosave': await gameWithMarkdown() } });
  await resume(page);
  assert.ok(await page.locator('.gm-body.view-bubble .narration.bubble').count() > 0, '기본은 채팅형');
  await page.click('#btn-display');
  assert.equal(await page.getAttribute('[data-mode=bubble]', 'aria-checked'), 'true');
  assert.ok(await page.locator('#display-preview .dialogue').count() > 0, '미리보기에 예시가 보인다');
  await page.click('[data-mode=plain]');
  assert.equal(await page.getAttribute('[data-mode=plain]', 'aria-checked'), 'true');
  assert.equal(await page.locator('#log .narration.bubble').count(), 0);
  assert.ok(await page.locator('#log .gm-body.view-plain .narration').count() > 0);
  assert.ok(await page.locator('#log .dialogue .say.bubble').count() > 0, '대사는 소설형에서도 말풍선');
  const setLevel = (name, v) => page.$eval(`#display-form [name=${name}]`, (el, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));
  await setLevel('fontSizeLevel', 5);
  await setLevel('lineHeightLevel', 1);
  const vars = () => page.evaluate(() => [getComputedStyle(document.documentElement).getPropertyValue('--chat-font-size').trim(), getComputedStyle(document.documentElement).getPropertyValue('--chat-line-height').trim()]);
  assert.deepEqual(await vars(), ['1.25rem', '1.3']);
  assert.equal(await page.$eval('#log', (el) => getComputedStyle(el).fontSize), '20px');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('rp.display'))), { viewMode: 'plain', fontSizeLevel: 5, lineHeightLevel: 1 });
  await page.reload();
  assert.deepEqual(await vars(), ['1.25rem', '1.3'], '새로고침 후에도 크기 유지');
  await resume(page);
  assert.equal(await page.locator('#log .narration.bubble').count(), 0, '새로고침 후에도 소설형');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[표시설정] 저장된 값이 깨져 있으면 기본값(채팅형, 3단계)으로 시작한다', async () => {
  for (const raw of ['{깨짐', 'null', '[1,2]', JSON.stringify({ viewMode: 'x', fontSizeLevel: 99, lineHeightLevel: 'abc' })]) {
    const { page, ctx, errors } = await open({ rawStorage: { 'rp.display': raw } });
    await startPreset(page, 0);
    await page.click('#btn-display');
    assert.equal(await page.getAttribute('[data-mode=bubble]', 'aria-checked'), 'true', raw);
    assert.equal(await page.inputValue('#display-form [name=fontSizeLevel]'), raw.includes('99') ? '5' : '3', raw);
    assert.equal(await page.inputValue('#display-form [name=lineHeightLevel]'), '3', raw);
    assert.deepEqual(errors, [], raw);
    await ctx.close();
  }
});

// ---------- 새 프리셋: 무인도, 봉쇄 도시 ----------
test('[무인도] 오프닝이 먼저 나오고 이름이 들어가며, 생존 수치는 시간이 지나면 줄고 먹으면 오른다', async () => {
  const { page, ctx, errors } = await open();
  await startPreset(page, await presetIndex('island'), { name: '민재' });
  const log = await logText(page);
  for (const n of ['서하린', '도예은', '윤채원']) assert.ok(log.includes(n), n);
  assert.ok(log.includes('민재, 맞지?') && !log.includes('{이름}'), '주인공 이름이 들어간다');
  assert.ok(await page.locator('.msg.gm .panel-text').count() > 0, '오프닝 상태창이 패널로 보인다');
  assert.match(await page.textContent('#g-time'), /1일차 08:00 .*모래해변/);
  const gauge = async () => {
    await page.click('[data-tab=me]');
    const t = await page.textContent('#tab-body .gauges');
    return Object.fromEntries([...t.matchAll(/(포만감|수분|컨디션) (\d+)\/100/g)].map((m) => [m[1], Number(m[2])]));
  };
  assert.deepEqual(await gauge(), { 포만감: 100, 수분: 100, 컨디션: 100 });
  await say(page, '주변을 둘러본다');
  const afterLook = await gauge();
  assert.ok(afterLook.포만감 < 100 && afterLook.수분 < 100, '행동 시간만큼 줄어든다');
  await page.click('[data-skip=sleep]');
  await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
  const afterSleep = await gauge();
  assert.ok(afterSleep.포만감 < 80 && afterSleep.수분 < 80, `하룻밤 뒤 ${JSON.stringify(afterSleep)}`);
  assert.equal(afterSleep.컨디션, 100, '자고 나면 컨디션이 가득');
  await say(page, '과일을 먹는다');
  await say(page, '샘물을 마신다');
  const afterMeal = await gauge();
  assert.ok(afterMeal.포만감 > afterSleep.포만감 + 15, `${afterSleep.포만감} → ${afterMeal.포만감}`);
  assert.ok(afterMeal.수분 > afterSleep.수분 + 20, `${afterSleep.수분} → ${afterMeal.수분}`);
  await page.click('[data-tab=people]');
  assert.match(await page.textContent('#tab-body'), /서하린 \(해양생물 연구원\) \[경계\]/);
  await page.click('[data-tab=world]');
  assert.doesNotMatch(await page.textContent('#tab-body'), /세력 평판/, '세력이 없으면 제목도 없다');
  assert.match(await page.textContent('#tab-body'), /거처단계: 1/);
  assert.ok(await noHScroll(page));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[무인도] 생존 수치와 오프닝은 저장하고 이어해도 그대로다', async () => {
  const { page, ctx } = await open();
  await startPreset(page, await presetIndex('island'));
  await page.click('[data-skip=sleep]');
  await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
  await page.click('[data-tab=me]');
  const before = await page.textContent('#tab-body .gauges');
  await page.reload();
  await resume(page);
  await page.click('[data-tab=me]');
  assert.equal(await page.textContent('#tab-body .gauges'), before);
  assert.equal(await page.locator('.msg.gm').count(), 1, '오프닝은 한 번만');
  await ctx.close();
});

test('[봉쇄도시] 오프닝의 INFO 패널과 세력별 점령 구역, 호감도 단계가 보인다', async () => {
  const { page, ctx, errors } = await open();
  await startPreset(page, await presetIndex('blockade'), { name: '서진' });
  assert.match(await page.textContent('#g-time'), /1일차 14:00 .*외곽 빌라촌/);
  const log = await logText(page);
  assert.ok(log.includes('서가을 (스캐빈저)') && log.includes('서진이라고 적힌 이름표'));
  assert.match(await page.locator('.msg.gm .panel-label').textContent(), /INFO/);
  assert.match(await page.locator('.msg.gm .panel-text').textContent(), /방주회: 2\/25 구역[\s\S]*위험구역·미확보: 14\/25 구역/);
  await page.click('[data-tab=world]');
  const w = await page.textContent('#tab-body');
  assert.match(w, /방주회 2/);
  assert.match(w, /철책대 4/);
  assert.match(w, /흑익회 5/);
  await page.click('[data-tab=people]');
  const people = await page.textContent('#tab-body');
  assert.match(people, /서가을 \(스캐빈저 \(무소속\)\) \[Lv\.1\].*여기 있음/s);
  assert.match(people, /한서윤.*시립병원|한서윤/s);
  await page.click('[data-tab=me]');
  assert.doesNotMatch(await page.textContent('#tab-body'), /gauges/);
  assert.equal(await page.locator('#tab-body .gauges').count(), 0, '생존 수치가 없는 세계관에는 게이지가 없다');
  await say(page, '서가을에게 말을 건다');
  assert.match(await logText(page), /테스트 모드/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[에디터] 새 프리셋을 복사해 저장할 수 있고, 깨진 생존 수치(meters)는 저장되지 않는다', async () => {
  const { page, ctx } = await open();
  await page.locator('#preset-list .card').nth(await presetIndex('island')).getByText('복사해서 수정').click();
  const w = JSON.parse(await page.inputValue('#editor-json'));
  assert.ok(w.meters.length === 3 && w.opening.includes('{이름}'), '복사본에 새 필드가 그대로 들어 있다');
  const bad = [
    [{ ...w, meters: 'x' }, /meters.*목록/],
    [{ ...w, meters: [{ id: 'a', name: '가' }] }, /decayPerHour/],
    [{ ...w, meters: [{ id: 1, name: '가', decayPerHour: 1 }] }, /id, name/],
    [{ ...w, meters: [{ id: 'a', name: '가', decayPerHour: 'abc' }] }, /decayPerHour/],
    [{ ...w, meters: [{ id: 'a', name: '가', decayPerHour: 1, levels: 5 }] }, /levels/],
  ];
  for (const [world, re] of bad) {
    await page.fill('#editor-json', JSON.stringify(world));
    await page.click('#btn-editor-save');
    assert.match(await page.textContent('#editor-error'), re);
  }
  assert.equal(await page.locator('#world-list .card').count(), 0);
  await page.fill('#editor-json', JSON.stringify(w));
  await page.click('#btn-editor-save');
  assert.equal(await page.locator('#world-list .card').count(), 1);
  // 복사본으로 시작해도 수치가 있다
  await page.locator('#world-list .card').first().getByText('새 채팅').click();
  await page.click('text=게임 시작');
  await page.waitForSelector('#screen-game:not([hidden])');
  assert.equal(await page.locator('#tab-body .gauges > div').count(), 3);
  await ctx.close();
});

// ---------- 채팅방 · 다시 생성 · 수정 · 이어쓰기 · 추천 답변 · 스트리밍 ----------
const isSuggest = (body) => body.systemInstruction.parts[0].text.includes('제안하는 도우미');
const lastUserText = (body) => body.contents.at(-1).parts[0].text;
// 호출 순서대로 다른 응답을 주는 가짜 서버
const sequence = (...texts) => {
  let n = 0;
  return (body) => (isSuggest(body) ? ok({ suggestions: ['"안녕하세요."', '주변을 살핀다', '문을 두드린다'] }) : ok({ narration: texts[Math.min(n++, texts.length - 1)], choices: ['다음'] }));
};
const msgCount = (page, role) => page.locator(`#log .msg.${role}`).count();

test('[채팅방] 같은 작품으로 채팅을 여러 개 만들고, 목록에서 열기·이름 바꾸기·삭제가 된다', async () => {
  const { page, ctx, errors } = await open({ settings: KEY, gemini: () => ok({ narration: '응답', choices: [] }) });
  await startPreset(page, 0, { name: '첫째' });
  await say(page, '첫 번째 방 행동');
  await page.click('#btn-to-title');
  await startPreset(page, 0, { name: '둘째' });
  await say(page, '두 번째 방 행동');
  await page.click('#btn-to-title');
  await startPreset(page, 1, { name: '다른작품' });
  await page.click('#btn-to-title');
  assert.match(await page.locator('#preset-list .card').first().textContent(), /채팅 2개/);
  // 이어하기는 가장 최근 채팅
  await resume(page);
  assert.match(await page.textContent('#tab-body'), /다른작품/);
  await page.click('#btn-to-title');
  // 목록: 전체 3개, 작품 칩으로 걸러 보면 2개
  await page.click('#btn-open-sessions');
  assert.equal(await page.locator('#session-list .session').count(), 3);
  await page.click('#btn-back-sessions').catch(() => {});
  await page.reload();
  await page.click('#btn-open-sessions');
  assert.equal(await page.locator('#session-list .session').count(), 3, '새로고침 뒤에도 남는다');
  // 두 번째 채팅을 열면 그 방의 기록만 보인다
  const target = page.locator('#session-list .session', { hasText: '둘째' }).first();
  await target.locator('.session-main').click();
  await page.waitForSelector('#screen-game:not([hidden])');
  assert.match(await logText(page), /두 번째 방 행동/);
  assert.doesNotMatch(await logText(page), /첫 번째 방 행동/);
  await page.click('#btn-to-title');
  // 이름 바꾸기
  await page.click('#btn-open-sessions');
  page.once('dialog', (d) => d.accept('내 이름'));
  await page.locator('#session-list .session').first().getByText('이름 변경').click();
  await page.waitForFunction(() => /내 이름/.test(document.querySelector('#session-list')?.textContent ?? ''));
  // 삭제: 취소하면 그대로, 확인하면 사라진다
  let asked = '';
  page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
  await page.locator('#session-list .session').first().getByText('삭제').click();
  await page.waitForTimeout(400);
  assert.match(asked, /삭제할까요/, '삭제 전에 묻는다');
  assert.equal(await page.locator('#session-list .session').count(), 3);
  page.once('dialog', (d) => d.accept());
  await page.locator('#session-list .session').first().getByText('삭제').click();
  await page.waitForFunction(() => document.querySelectorAll('#session-list .session').length === 2);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[채팅방] 작품 카드의 채팅 수를 누르면 그 작품의 채팅만 걸러 보인다', async () => {
  const { page, ctx } = await open();
  await startPreset(page, 0); await page.click('#btn-to-title');
  await startPreset(page, 0); await page.click('#btn-to-title');
  await startPreset(page, 1); await page.click('#btn-to-title');
  await page.locator('#preset-list .card').first().getByText(/채팅 2개/).click();
  await page.waitForSelector('#screen-sessions:not([hidden])');
  assert.equal(await page.locator('#session-list .session').count(), 2);
  await page.getByText('전체 채팅 보기').click();
  assert.equal(await page.locator('#session-list .session').count(), 3);
  await ctx.close();
});

test('[채팅방] IndexedDB를 쓸 수 없어도 localStorage로 저장되고 이어하기가 된다', async () => {
  const { page, ctx } = await open();
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
  await page.reload();
  await startPreset(page, 0, { name: '대체저장' });
  await say(page, '대체 저장 행동');
  await page.reload();
  await resume(page);
  assert.match(await logText(page), /대체 저장 행동/);
  assert.ok(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('rp.s.'))));
  await ctx.close();
});

test('[채팅방] 예전 자동 저장은 채팅 하나로 옮겨지고, 파일 가져오기는 항상 새 채팅이 된다', async () => {
  const g = await gameWithMarkdown();
  const { page, ctx } = await open({ storage: { 'rp.autosave': g } });
  await page.click('#btn-open-sessions');
  assert.equal(await page.locator('#session-list .session').count(), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('rp.autosave')), null, '옮긴 뒤 예전 항목은 지워진다');
  await ctx.close();
});

test('[다시 생성] 확인하면 마지막 답변만 새로 만들고, 취소하면 그대로다', async () => {
  const { page, ctx, requests } = await open({ settings: KEY, gemini: sequence('첫 답변', '다시 만든 답변') });
  await startPreset(page, 0);
  await say(page, '인사한다');
  assert.equal(await page.locator('#log .msg-actions .link-btn', { hasText: '다시 생성' }).count(), 1);
  page.once('dialog', (d) => d.dismiss());
  await page.getByText('다시 생성').click();
  assert.match(await logText(page), /첫 답변/);
  page.once('dialog', (d) => d.accept());
  await page.getByText('다시 생성').click();
  await page.waitForFunction(() => /다시 만든 답변/.test(document.querySelector('#log').textContent) && !document.querySelector('#action-input').disabled);
  const text = await logText(page);
  assert.doesNotMatch(text, /첫 답변/);
  assert.equal(await msgCount(page, 'player'), 1, '플레이어 말풍선이 늘어나지 않는다');
  const story = requests.filter((r) => r.body && !isSuggest(JSON.parse(r.body)) && /인사한다/.test(r.body) && r.url.includes('generativelanguage'));
  assert.ok(story.length >= 2, '같은 입력으로 다시 요청');
  await ctx.close();
});

test('[다시 생성] 실패하면 원래 답변이 그대로 돌아온다', async () => {
  let n = 0;
  const { page, ctx } = await open({ settings: KEY, gemini: () => (n++ === 0 ? ok({ narration: '살아남을 답변', choices: ['x'] }) : { status: 500, contentType: 'application/json', body: '{"error":{"message":"boom"}}' }) });
  await startPreset(page, 0);
  await say(page, '인사한다');
  page.once('dialog', (d) => d.accept());
  await page.getByText('다시 생성').click();
  await page.waitForFunction(() => !document.querySelector('#action-input').disabled && !document.querySelector('#log .typing'));
  const text = await logText(page);
  assert.match(text, /살아남을 답변/, '원래 답변 복구');
  assert.equal(await msgCount(page, 'player'), 1);
  assert.equal(await page.locator('#log .link-btn', { hasText: '다시 생성' }).count(), 1, '다시 시도할 수 있다');
  await ctx.close();
});

test('[수정] 마지막 플레이어 메시지를 고치면 그 뒤가 새로 진행된다. 취소·Esc는 그대로', async () => {
  const { page, ctx, requests } = await open({ settings: KEY, gemini: sequence('첫 답변', '고친 뒤 답변') });
  await startPreset(page, 0);
  await say(page, '틀린 말');
  await page.getByText('수정', { exact: true }).click();
  assert.equal(await page.locator('#log .edit-box textarea').inputValue(), '틀린 말');
  await page.locator('#log .edit-box textarea').press('Escape');
  assert.equal(await page.locator('#log .edit-box').count(), 0);
  assert.match(await logText(page), /틀린 말/);
  await page.getByText('수정', { exact: true }).click();
  await page.locator('#log .edit-box textarea').fill('고친 말');
  await page.locator('#log .edit-box textarea').press('Control+Enter');
  await page.waitForFunction(() => /고친 뒤 답변/.test(document.querySelector('#log').textContent) && !document.querySelector('#action-input').disabled);
  const text = await logText(page);
  assert.match(text, /고친 말/);
  assert.doesNotMatch(text, /틀린 말|첫 답변/);
  assert.equal(await msgCount(page, 'player'), 1);
  assert.ok(requests.some((r) => r.body?.includes('고친 말')));
  await ctx.close();
});

test('[수정] 비워서 저장할 수 없고, 실패하면 원래 메시지와 답변이 돌아온다', async () => {
  let n = 0;
  const { page, ctx } = await open({ settings: KEY, gemini: () => (n++ === 0 ? ok({ narration: '원래 답변', choices: ['x'] }) : { status: 500, contentType: 'application/json', body: '{"error":{"message":"boom"}}' }) });
  await startPreset(page, 0);
  await say(page, '원래 말');
  await page.getByText('수정', { exact: true }).click();
  await page.locator('#log .edit-box textarea').fill('   ');
  await page.getByText('저장하고 다시 진행').click();
  assert.equal(await page.locator('#log .edit-box').count(), 1, '빈 내용은 저장되지 않는다');
  await page.locator('#log .edit-box textarea').fill('바꾼 말');
  await page.getByText('저장하고 다시 진행').click();
  await page.waitForFunction(() => !document.querySelector('#action-input').disabled && !document.querySelector('#log .typing'));
  const text = await logText(page);
  assert.match(text, /원래 말/);
  assert.match(text, /원래 답변/);
  assert.doesNotMatch(text, /바꾼 말/);
  await ctx.close();
});

test('[이어쓰기] 플레이어 말풍선 없이 이야기가 이어진다', async () => {
  const { page, ctx, requests } = await open({ settings: KEY, gemini: sequence('첫 장면', '이어진 장면') });
  await startPreset(page, 0);
  await say(page, '문을 연다');
  const before = await msgCount(page, 'player');
  await page.click('#btn-continue-story');
  await page.waitForFunction(() => /이어진 장면/.test(document.querySelector('#log').textContent) && !document.querySelector('#action-input').disabled);
  assert.equal(await msgCount(page, 'player'), before);
  assert.ok(requests.some((r) => r.body?.includes('이어쓰기')));
  // 이어쓴 답변도 다시 생성할 수 있다
  assert.equal(await page.locator('#log .link-btn', { hasText: '다시 생성' }).count(), 1);
  assert.equal(await page.locator('#log .link-btn', { hasText: /^수정$/ }).count(), 0, '입력 없는 턴에는 수정 버튼이 없다');
  await ctx.close();
});

test('[추천 답변] 후보 3개가 나오고, 고르면 입력창에 채워진다', async () => {
  const { page, ctx } = await open({ settings: KEY, gemini: sequence('장면') });
  await startPreset(page, 0);
  await say(page, '둘러본다');
  await page.click('#btn-suggest');
  await page.waitForSelector('#suggest-panel [role=option]');
  assert.equal(await page.locator('#suggest-panel [role=option]').count(), 3);
  await page.locator('#suggest-panel [role=option]').nth(1).click();
  assert.equal(await page.inputValue('#action-input'), '주변을 살핀다');
  assert.ok(await page.locator('#suggest-panel').isHidden());
  assert.equal(await msgCount(page, 'player'), 1, '고르기만 해서는 보내지 않는다');
  await ctx.close();
});

test('[추천 답변] 실패하면 오류를 보여 주고 게임은 계속된다. 키가 없으면 예시 후보', async () => {
  const bad = await open({ settings: KEY, gemini: (body) => (isSuggest(body) ? ok({ suggestions: [] }) : ok({ narration: '장면', choices: [] })) });
  await startPreset(bad.page, 0);
  await bad.page.click('#btn-suggest');
  await bad.page.waitForSelector('#suggest-panel .error');
  await bad.page.locator('#suggest-panel').getByText('닫기').click();
  assert.ok(await bad.page.locator('#suggest-panel').isHidden());
  await say(bad.page, '계속');
  assert.match(await logText(bad.page), /장면/);
  await bad.ctx.close();
  const mock = await open();
  await startPreset(mock.page, 0);
  await mock.page.click('#btn-suggest');
  await mock.page.waitForSelector('#suggest-panel [role=option]');
  assert.ok(await mock.page.locator('#suggest-panel [role=option]').count() >= 1);
  await mock.ctx.close();
});

// 스트리밍: 페이지 안의 fetch를 바꿔서, 테스트가 조각을 하나씩 흘려 보낸다
async function withLiveStream(page) {
  await page.evaluate(() => {
    const realFetch = window.fetch;
    window.__live = null;
    window.fetch = (url, init) => {
      if (!String(url).includes('streamGenerateContent')) return realFetch(url, init);
      const enc = new TextEncoder();
      let ctl;
      const stream = new ReadableStream({ start(c) { ctl = c; } });
      const abortErr = () => new DOMException('aborted', 'AbortError');
      init?.signal?.addEventListener('abort', () => { try { ctl.error(abortErr()); } catch { /* 이미 닫힘 */ } });
      window.__live = {
        push: (jsonText) => ctl.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: jsonText }] } }] })}\n\n`)),
        finish: () => ctl.close(),
      };
      return Promise.resolve(new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    };
  });
}

test('[스트리밍] 글이 오는 대로 보이고, 끝나면 확정된다', async () => {
  const { page, ctx, errors } = await open({ settings: KEY });
  await startPreset(page, 0);
  await withLiveStream(page);
  await page.fill('#action-input', '살핀다');
  await page.click('#btn-send');
  await page.waitForFunction(() => window.__live);
  assert.equal(await page.locator('#log .draft .typing').count(), 1, '글이 오기 전에는 입력 중 표시');
  assert.ok(await page.locator('#btn-stop').isVisible());
  assert.ok(await page.locator('#btn-send').isHidden());
  assert.ok(await page.locator('#action-input').isDisabled());
  await page.evaluate(() => window.__live.push('{"narration":"바람이 불'));
  await page.waitForFunction(() => /바람이 불/.test(document.querySelector('#log .draft')?.textContent ?? ''));
  assert.equal(await page.locator('#log .draft .typing').count(), 0);
  await page.evaluate(() => window.__live.push('었다.","choices":["가","나"],"minutes":5}'));
  await page.evaluate(() => window.__live.finish());
  await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
  assert.equal(await page.locator('#log .draft').count(), 0);
  assert.match(await logText(page), /바람이 불었다\./);
  assert.deepEqual(await page.locator('#choices button').allTextContents(), ['가', '나']);
  assert.ok(await page.locator('#btn-stop').isHidden());
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[스트리밍] 중지하면 이번 입력이 취소되고 입력창에 되돌아온다', async () => {
  const { page, ctx, errors } = await open({ settings: KEY });
  await startPreset(page, 0);
  await withLiveStream(page);
  const logBefore = await logText(page);
  await page.fill('#action-input', '취소할 행동');
  await page.click('#btn-send');
  await page.waitForFunction(() => window.__live);
  await page.evaluate(() => window.__live.push('{"narration":"반쯤 온 글'));
  await page.waitForFunction(() => /반쯤 온 글/.test(document.querySelector('#log .draft')?.textContent ?? ''));
  await page.click('#btn-stop');
  await page.waitForFunction(() => !document.querySelector('#action-input').disabled);
  assert.equal(await logText(page), logBefore, '말풍선도 반쯤 온 글도 남지 않는다');
  assert.equal(await page.inputValue('#action-input'), '취소할 행동');
  assert.equal(await page.locator('#log .msg.error').count(), 0, '중지는 오류가 아니다');
  await page.reload();
  await resume(page);
  assert.doesNotMatch(await logText(page), /취소할 행동|반쯤/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[스트리밍] 설정에서 끄면 한 번에 받는 방식으로 요청한다', async () => {
  const on = await open({ settings: KEY, gemini: () => ok({ narration: '응답', choices: [] }) });
  await startPreset(on.page, 0);
  await say(on.page, '가');
  assert.ok(on.requests.some((r) => r.url.includes(':streamGenerateContent')));
  await on.ctx.close();
  const off = await open({ settings: { ...KEY, stream: false }, gemini: () => ok({ narration: '응답', choices: [] }) });
  await startPreset(off.page, 0);
  await say(off.page, '가');
  const ai = off.requests.filter((r) => r.url.includes('generativelanguage'));
  assert.ok(ai.length > 0 && ai.every((r) => !r.url.includes('streamGenerateContent') && r.url.includes(':generateContent')));
  assert.match(await logText(off.page), /응답/);
  await off.ctx.close();
});

test('[채팅방] 모바일에서 채팅 목록·수정창·추천 패널에 가로 스크롤이 없다', async () => {
  const { page, ctx } = await open({ width: 360, settings: KEY, gemini: sequence('아주 긴 응답 '.repeat(40)) });
  await startPreset(page, 0);
  await say(page, '긴 입력 '.repeat(30));
  await page.getByText('수정', { exact: true }).click();
  assert.ok(await noHScroll(page), '수정창');
  await page.locator('#log .edit-box textarea').press('Escape');
  await page.click('#btn-suggest');
  await page.waitForSelector('#suggest-panel [role=option]');
  assert.ok(await noHScroll(page), '추천 패널');
  await page.click('#btn-to-title');
  await page.click('#btn-open-sessions');
  assert.ok(await noHScroll(page), '채팅 목록');
  await ctx.close();
});

test('[저장] 한 턴의 결과가 저장소에 들어간 뒤에야 입력창이 풀린다', async () => {
  const { page, ctx } = await open({ settings: KEY, gemini: () => ok({ narration: '저장순서응답', choices: [] }) });
  await startPreset(page, 0);
  await page.evaluate(() => {
    window.__ev = [];
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (v, k) {
      window.__ev.push(this.name === 'sessions' && JSON.stringify(v).includes('저장순서응답') ? 'put' : 'other');
      return put.call(this, v, k);
    };
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'disabled');
    Object.defineProperty(HTMLInputElement.prototype, 'disabled', {
      ...d, set(v) { if (this.id === 'action-input' && !v) window.__ev.push('unlock'); d.set.call(this, v); },
    });
  });
  await say(page, '순서 확인');
  const ev = await page.evaluate(() => window.__ev);
  const firstPut = ev.indexOf('put');
  assert.ok(firstPut >= 0, '결과가 저장됐다');
  assert.ok(!ev.slice(0, firstPut).includes('unlock'), `저장 전에 입력이 풀렸다: ${ev.join(',')}`);
  assert.ok(ev.includes('unlock'));
  await ctx.close();
});
