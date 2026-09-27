// 게임 로직 단위 테스트: node --test tests/unit.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../js/presets.js';
import * as S from '../js/state.js';
import * as AI from '../js/ai.js';

const preset = (id) => PRESETS.find((p) => p.id === id);
const start = (id = 'fantasy', custom = {}) => S.newGame(preset(id), custom);

// ---------- 가짜 Gemini ----------
let calls = [];
function fakeGemini(handler) {
  calls = [];
  globalThis.fetch = async (url, opts) => {
    const model = decodeURIComponent(url.match(/models\/([^:]+):/)[1]);
    const call = { url, model, headers: opts.headers, body: JSON.parse(opts.body) };
    calls.push(call);
    const { status = 200, json } = await handler(call);
    return { ok: status < 400, status, json: async () => json };
  };
}
const okJson = (obj) => ({ json: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(obj) }] } }] } });
const KEY = { apiKey: 'test-key', model: 'auto', responseLength: 'normal', adultMode: false };

test.beforeEach(() => AI.resetCooldowns());

// ---------- 프리셋 ----------
test('프리셋 6종이 있고, 학원물은 대학교이며 모든 NPC가 성인이다', () => {
  assert.equal(PRESETS.length, 6);
  assert.match(preset('campus').name, /대학/);
  for (const p of PRESETS) for (const n of p.npcs) assert.ok(n.age >= 18, `${p.id}/${n.id}`);
});

test('프리셋 데이터가 서로 맞물린다 (일과 장소, 시작 장소, 엔딩)', () => {
  for (const p of PRESETS) {
    const places = new Set(p.places.map((x) => x.id));
    assert.ok(places.has(p.startLocation), p.id);
    for (const n of p.npcs) for (const slot of Object.keys(S.SLOTS)) assert.ok(places.has(n.schedule[slot]), `${p.id}/${n.id}/${slot}`);
    assert.ok(p.endings.length >= 2);
    if (p.modules.stats) assert.ok(S.STAMINA in p.protagonist.stats, `${p.id} 체력`);
  }
});

// ---------- 캐릭터 ----------
test('이름·성격·외모를 바꿀 수 있고 빈 값이면 기본값을 쓴다', () => {
  const g = start('fantasy', { name: '아린', personality: '냉소적', appearance: '은발' });
  assert.deepEqual([g.player.name, g.player.personality, g.player.appearance], ['아린', '냉소적', '은발']);
  const d = start('fantasy', { name: '', personality: '', appearance: '' });
  assert.equal(d.player.name, preset('fantasy').protagonist.name);
});

test('newGame은 프리셋 원본을 바꾸지 않는다', () => {
  const g = start();
  g.world.npcs[0].name = '변경';
  g.player.inventory.push('x');
  assert.notEqual(preset('fantasy').npcs[0].name, '변경');
  assert.ok(!preset('fantasy').protagonist.inventory.includes('x'));
});

// ---------- 시간 ----------
test('시간대 이름은 사회적 통념을 따른다', () => {
  const at = (h) => S.periodOf(h * 60);
  assert.deepEqual([0, 5, 6, 8, 9, 11, 12, 13, 17, 18, 20, 21, 23].map(at),
    ['새벽', '새벽', '아침', '아침', '오전', '오전', '점심', '오후', '오후', '저녁', '저녁', '밤', '밤']);
});

test('NPC 일과 구간 경계', () => {
  const at = (h) => S.slotOf(h * 60);
  assert.deepEqual([5, 6, 11, 12, 17, 18, 20, 21, 0].map(at),
    ['night', 'morning', 'morning', 'day', 'day', 'evening', 'evening', 'night', 'night']);
});

test('AI가 정한 시간은 세계관 범위로 제한된다 (아주 큰 값, 음수, 문자, 없음)', () => {
  const g = start();
  const t = g.world.time;
  const before = () => g.time.day * 1440 + g.time.minute;
  for (const [input, expect] of [[1e9, t.maxMinutes], [1, t.minMinutes], [-50, t.defaultMinutes], ['abc', t.defaultMinutes], [undefined, t.defaultMinutes], [NaN, t.defaultMinutes], [Infinity, t.defaultMinutes]]) {
    const b = before();
    S.advanceTime(g, input);
    assert.equal(before() - b, expect, `입력 ${input}`);
  }
});

test('날짜가 넘어가면 지나간 날 수를 돌려준다', () => {
  const g = start();
  g.time.minute = 23 * 60;
  assert.equal(S.advanceTime(g, 180, { clampToWorld: false }), 1);
  assert.equal(g.time.day, 2);
  assert.equal(g.time.minute, 120);
  assert.equal(S.advanceTime(g, 1440 * 3, { clampToWorld: false }), 3);
});

test('시간대에 따라 NPC가 다른 장소에 있다', () => {
  const g = start();
  g.location = 'guild';
  g.time.minute = 9 * 60;
  assert.ok(S.npcsHere(g).some((n) => n.id === 'mira'));
  g.time.minute = 19 * 60;
  assert.ok(!S.npcsHere(g).some((n) => n.id === 'mira'));
  g.location = 'inn';
  assert.ok(S.npcsHere(g).some((n) => n.id === 'mira'));
});

// ---------- 수면 ----------
test('6시간 이상 자면 체력이 최대치까지 회복되고, 넘치지 않는다', () => {
  const g = start();
  g.player.stats.체력 = 2;
  S.sleep(g, 8 * 60);
  assert.equal(g.player.stats.체력, g.player.statMax.체력);
  S.sleep(g, 8 * 60);
  assert.equal(g.player.stats.체력, g.player.statMax.체력);
});

test('짧게 자면 잔 시간에 비례해 회복된다', () => {
  const g = start();
  g.player.stats.체력 = 0;
  S.sleep(g, 3 * 60);
  assert.equal(g.player.stats.체력, Math.ceil(g.player.statMax.체력 / 2));
});

test('능력치가 없는 세계관에서 수면은 오류 없이 시간만 흐른다', () => {
  const g = start('joseon');
  assert.equal(S.sleep(g, 1440), 1);
  assert.deepEqual(g.player.stats, {});
});

test('체력은 AI가 올려도 최대치를 넘지 않는다', () => {
  const g = start();
  S.applyResult(g, { statChanges: { 체력: 999, 힘: 5 } });
  assert.equal(g.player.stats.체력, g.player.statMax.체력);
  assert.equal(g.player.stats.힘, 8);
});

// ---------- 관계 ----------
test('관계 수치는 한 번에 최대 ±20, 전체 -100~100', () => {
  const g = start();
  const base = g.npcs.mira.affection;
  S.applyResult(g, { relationshipChanges: [{ npc: 'mira', affection: 9999, trust: -9999, love: 5 }] });
  assert.equal(g.npcs.mira.affection, base + S.MAX_REL_STEP);
  assert.equal(g.npcs.mira.trust, 10 - S.MAX_REL_STEP);
  assert.equal(g.npcs.mira.love, 5);
  for (let i = 0; i < 20; i++) S.applyResult(g, { relationshipChanges: [{ npc: 'mira', affection: 20 }] });
  assert.equal(g.npcs.mira.affection, 100);
});

test('상호작용 기억은 개수 제한 없이 끝까지 남는다', () => {
  const g = start();
  for (let i = 0; i < 300; i++) S.applyResult(g, { relationshipChanges: [{ npc: 'mira', memory: `기억${i}` }] });
  assert.equal(g.npcs.mira.memories.length, 300);
  assert.match(g.npcs.mira.memories[0], /기억0$/);
});

test('NPC끼리의 관계는 방향별로 따로 바뀐다', () => {
  const g = start();
  S.applyResult(g, { npcRelationChanges: [{ from: 'mira', to: 'borg', affection: 7, trust: 50 }] });
  assert.equal(g.npcRelations.mira.borg.affection, 7);
  assert.equal(g.npcRelations.mira.borg.trust, S.MAX_REL_STEP);
  assert.equal(g.npcRelations.borg.mira.affection, 0);
  assert.equal(g.npcRelations.mira.mira, undefined);
});

// ---------- AI 결과 반영: 잘못된 입력 ----------
test('AI가 이상한 값을 보내도 상태가 망가지지 않는다', () => {
  const g = start();
  const snapshot = JSON.stringify(g);
  for (const bad of [null, undefined, 'text', 42, [], {
    relationshipChanges: 'x', npcRelationChanges: [{ from: 'nobody', to: 'mira' }, null], itemsAdded: 'sword', itemsRemoved: null,
    statChanges: 'x', factionChanges: null, flags: [1, 2], questsAdded: [null, ''], choices: 'abc', location: 'moon', moneyDelta: 'lots', goalProgressDelta: 'NaN',
  }]) S.applyResult(g, bad);
  const after = JSON.parse(JSON.stringify(g));
  assert.equal(after.location, 'guild');
  assert.equal(after.player.money, 50);
  assert.equal(after.goalProgress, 0);
  assert.deepEqual(after.player.inventory, JSON.parse(snapshot).player.inventory);
  assert.ok(Number.isFinite(after.npcs.mira.affection));
  assert.deepEqual(after.flags, {});
});

test('돈은 0 밑으로 내려가지 않고, 진행도는 0~100', () => {
  const g = start();
  S.applyResult(g, { moneyDelta: -1e12, goalProgressDelta: 1e9 });
  assert.equal(g.player.money, 0);
  assert.equal(g.goalProgress, 100);
  S.applyResult(g, { goalProgressDelta: -1e9 });
  assert.equal(g.goalProgress, 0);
});

test('경제 모듈이 꺼진 세계관에서는 돈과 아이템이 바뀌지 않는다', () => {
  const g = start('campus');
  S.applyResult(g, { moneyDelta: 500, itemsAdded: ['기타'] });
  assert.equal(g.player.money, 0);
  assert.deepEqual(g.player.inventory, []);
});

test('같은 서브 퀘스트는 중복 추가되지 않고 완료 처리된다', () => {
  const g = start();
  S.applyResult(g, { questsAdded: ['늑대 사냥', '늑대 사냥'] });
  S.applyResult(g, { questsCompleted: ['늑대 사냥'] });
  assert.deepEqual(g.quests, [{ title: '늑대 사냥', done: true }]);
});

// ---------- 엔딩 ----------
test('엔딩은 AI 판단으로 한 번만 정해지고, 기간이 지나도 자동으로 끝나지 않는다', () => {
  const g = start();
  g.time.day = 999;
  S.applyResult(g, { goalProgressDelta: 5 });
  assert.equal(g.ending, null);
  S.applyResult(g, { ending: { id: 'good' } });
  assert.equal(g.ending.title, '좋은 결말');
  S.applyResult(g, { ending: { id: 'bad' } });
  assert.equal(g.ending.id, 'good');
});

// ---------- 모델 선택과 전환 ----------
test('자동 모드는 작업마다 다른 순서로 모델을 쓴다', () => {
  assert.equal(AI.modelOrder(KEY, 'story')[0], 'gemini-3.8-flash');
  assert.match(AI.modelOrder(KEY, 'summary')[0], /lite/);
  assert.equal(AI.modelOrder({ ...KEY, model: 'gemini-2.5-pro' }, 'story')[0], 'gemini-2.5-pro');
  for (const chain of Object.values(AI.CHAINS)) assert.equal(new Set(chain).size, AI.MODELS.length);
});

test('한도 초과(429)면 다음 모델로 넘어가고, 그 모델은 잠시 쉰다', async () => {
  fakeGemini(({ model }) => (model === 'gemini-3.8-flash'
    ? { status: 429, json: { error: { message: 'quota', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '30s' }] } } }
    : okJson({ narration: '성공', choices: [] })));
  const r = await AI.gmTurn(start(), '인사한다', KEY);
  assert.equal(r.narration, '성공');
  assert.deepEqual(calls.map((c) => c.model), ['gemini-3.8-flash', 'gemini-3.7-flash']);
  assert.equal(AI.aiStatus.lastModel, 'gemini-3.7-flash');
  await AI.gmTurn(start(), '인사한다', KEY);
  assert.equal(calls.at(-1).model, 'gemini-3.7-flash');
  assert.ok(!AI.modelOrder(KEY, 'story').includes('gemini-3.8-flash'));
  assert.ok(AI.modelOrder(KEY, 'story', Date.now() + 31_000).includes('gemini-3.8-flash'));
});

test('없는 모델(404)과 서버 과부하(503)도 다음 모델로 넘어간다', async () => {
  fakeGemini(({ model }) => (model === 'gemini-3.8-flash' ? { status: 404, json: {} } : model === 'gemini-3.7-flash' ? { status: 503, json: {} } : okJson({ narration: 'ok' })));
  const r = await AI.gmTurn(start(), 'a', KEY);
  assert.equal(r.narration, 'ok');
  assert.equal(calls.length, 3);
});

test('모든 모델이 한도 초과면 알아듣기 쉬운 오류를 낸다', async () => {
  fakeGemini(() => ({ status: 429, json: {} }));
  await assert.rejects(AI.gmTurn(start(), 'a', KEY), (e) => e.code === 'quota' && /한도/.test(e.message));
  assert.equal(calls.length, AI.MODELS.length);
  await assert.rejects(AI.gmTurn(start(), 'a', KEY), (e) => e.code === 'quota');
  assert.equal(calls.length, AI.MODELS.length, '쉬는 중인 모델은 다시 부르지 않는다');
});

test('잘못된 API 키는 다른 모델로 넘어가지 않고 바로 알린다', async () => {
  fakeGemini(() => ({ status: 400, json: { error: { message: 'API key not valid.' } } }));
  await assert.rejects(AI.gmTurn(start(), 'a', KEY), (e) => e.code === 'key');
  assert.equal(calls.length, 1);
});

test('차단, 깨진 JSON, 네트워크 오류를 구분해서 알린다', async () => {
  fakeGemini(() => ({ json: { promptFeedback: { blockReason: 'OTHER' } } }));
  await assert.rejects(AI.gmTurn(start(), 'a', KEY), (e) => e.code === 'blocked');
  fakeGemini(() => ({ json: { candidates: [{ finishReason: 'SAFETY' }] } }));
  await assert.rejects(AI.gmTurn(start(), 'a', KEY), (e) => e.code === 'blocked');
  fakeGemini(() => ({ json: { candidates: [{ content: { parts: [{ text: '{"narration": "끊긴' }] } }] } }));
  await assert.rejects(AI.gmTurn(start(), 'a', KEY), (e) => e.code === 'parse');
  fakeGemini(() => ({ json: { candidates: [{ content: { parts: [{ text: '[1,2]' }] } }] } }));
  await assert.rejects(AI.gmTurn(start(), 'a', KEY), (e) => e.code === 'parse');
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(AI.gmTurn(start(), 'a', KEY), (e) => e.code === 'network');
});

test('코드 블록으로 감싼 JSON도 읽는다', async () => {
  fakeGemini(() => ({ json: { candidates: [{ content: { parts: [{ text: '```json\n{"narration":"ok"}\n```' }] } }] } }));
  assert.equal((await AI.gmTurn(start(), 'a', KEY)).narration, 'ok');
});

// ---------- 요청 내용 ----------
test('API 키는 헤더로만 가고 주소에는 없다. 안전 필터는 모드와 관계없이 최하 단계', async () => {
  for (const adultMode of [false, true]) {
    fakeGemini(() => okJson({ narration: 'ok' }));
    await AI.gmTurn(start(), 'a', { ...KEY, adultMode });
    assert.equal(calls[0].headers['x-goog-api-key'], 'test-key');
    assert.ok(!calls[0].url.includes('test-key'));
    assert.ok(calls[0].url.startsWith('https://generativelanguage.googleapis.com/'));
    assert.ok(calls[0].body.safetySettings.every((s) => s.threshold === 'BLOCK_NONE'));
    const sys = calls[0].body.systemInstruction.parts[0].text;
    assert.match(sys, /미성년자/);
    assert.match(sys, adultMode ? /성인 모드/ : /일반 모드/);
  }
});

test('프롬프트에 바꾼 성격, 관계 규칙, 능력치 규칙, 엔딩 규칙, 응답 길이가 들어간다', async () => {
  fakeGemini(() => okJson({ narration: 'ok' }));
  await AI.gmTurn(start('fantasy', { personality: '겁이 많고 수다스러움' }), 'a', { ...KEY, responseLength: 'long' });
  const sys = calls[0].body.systemInstruction.parts[0].text;
  for (const s of ['겁이 많고 수다스러움', '관계 수치', '능력치 반영 규칙', '엔딩 규칙', '목표 진행도 규칙', '두세 문단']) assert.ok(sys.includes(s), s);
  calls = [];
  await AI.gmTurn(start('joseon'), 'a', KEY);
  assert.ok(!calls[0].body.systemInstruction.parts[0].text.includes('능력치 반영 규칙'), '능력치 없는 세계관');
});

test('같은 장소에 있는 NPC는 기억을 자세히, 멀리 있는 NPC는 짧게 보낸다', () => {
  const g = start();
  g.time.minute = 9 * 60; // 미라는 길드, 보르그는 대장간
  for (let i = 0; i < 6; i++) S.applyResult(g, { relationshipChanges: [{ npc: 'mira', memory: `M${i}` }, { npc: 'borg', memory: `B${i}` }] });
  const brief = AI.worldBrief(g, '');
  for (let i = 0; i < 6; i++) assert.ok(brief.includes(`M${i}`), `미라 기억 ${i}`);
  assert.ok(!brief.includes('B0') && brief.includes('B5'));
  assert.ok(AI.worldBrief(g, '보르그에게 간다').includes('B0'), '이름을 부르면 자세히');
});

// ---------- 요약 ----------
test('대화가 길어지면 요약하고, 원본 대화와 기억은 지우지 않는다', async () => {
  const g = start();
  for (let i = 0; i < 40; i++) g.log.push({ role: i % 2 ? 'gm' : 'player', text: `대화${i}` });
  for (let i = 0; i < 20; i++) S.applyResult(g, { relationshipChanges: [{ npc: 'mira', memory: `기억${i}` }] });
  const logLen = g.log.length;
  fakeGemini(() => okJson({ story: '요약된 줄거리', npcs: { mira: '미라 요약' } }));
  assert.ok(AI.needsSummary(g));
  await AI.summarize(g, KEY);
  assert.match(calls[0].model, /lite/);
  assert.equal(g.story.summary, '요약된 줄거리');
  assert.equal(g.story.upTo, logLen - AI.SUMMARY.keepRecent);
  assert.equal(g.log.length, logLen);
  assert.equal(g.npcs.mira.memories.length, 20);
  assert.equal(g.npcs.mira.memorySummary, '미라 요약');
  assert.equal(g.npcs.mira.summarizedCount, 20 - AI.SUMMARY.memKeep);
  assert.ok(!AI.needsSummary(g));
  // 다음 요청에는 요약 + 요약 이후 대화만 간다
  calls = [];
  fakeGemini(() => okJson({ narration: 'ok' }));
  await AI.gmTurn(g, 'a', KEY);
  const user = calls[0].body.contents[0].parts[0].text;
  assert.ok(user.includes('요약된 줄거리'));
  assert.ok(!user.includes('대화0'));
  assert.ok(user.includes('대화39'));
});

test('요약 응답이 비거나 이상하면 요약 위치를 옮기지 않는다 (내용 유실 방지)', async () => {
  const g = start();
  for (let i = 0; i < 40; i++) g.log.push({ role: 'gm', text: `대화${i}` });
  fakeGemini(() => okJson({ story: '', npcs: 'x' }));
  await AI.summarize(g, KEY);
  assert.equal(g.story.upTo, 0);
});

test('테스트 모드에서도 요약이 동작한다', async () => {
  const g = start();
  for (let i = 0; i < 40; i++) g.log.push({ role: 'gm', text: `대화${i}` });
  await AI.summarize(g, { apiKey: '' });
  assert.ok(g.story.summary.includes('대화0'));
  assert.ok(g.story.upTo > 0);
});

// ---------- 하루 소식 ----------
test('하루 소식은 NPC끼리의 관계를 바꾼다 (테스트 모드)', async () => {
  const g = start();
  const r = await AI.dailyEvents(g, { apiKey: '' });
  assert.equal(r.news.length, 1);
  S.applyResult(g, r);
  const changed = Object.values(g.npcRelations).flatMap((row) => Object.values(row)).some((x) => x.affection !== 0);
  assert.ok(changed);
});

test('NPC가 0명이거나 1명인 세계관에서도 하루 소식이 오류 없이 만들어진다', async () => {
  for (const npcs of [[], [preset('fantasy').npcs[0]]]) {
    const g = S.newGame({ ...preset('fantasy'), npcs }, {});
    const r = await AI.dailyEvents(g, { apiKey: '' });
    S.applyResult(g, r);
    assert.ok(Array.isArray(r.news));
  }
});

// ---------- 테스트 모드 엔딩 ----------
test('테스트 모드에서도 진행도가 100에 닿으면 엔딩이 나온다', async () => {
  const g = start();
  g.goalProgress = 99;
  let r;
  do { r = await AI.gmTurn(g, '일한다', { apiKey: '' }); } while (!r.goalProgressDelta);
  S.applyResult(g, r);
  assert.equal(g.ending?.id, 'good');
});

// ---------- 이전 세이브 ----------
test('이전 버전 세이브를 불러오면 새 항목이 채워진다', () => {
  const g = start();
  delete g.story; delete g.npcRelations; delete g.player.statMax;
  for (const s of Object.values(g.npcs)) { delete s.memorySummary; delete s.summarizedCount; }
  S.migrate(g);
  assert.equal(g.story.upTo, 0);
  assert.equal(g.npcRelations.mira.borg.trust, 0);
  assert.equal(g.player.statMax.체력, 10);
  assert.equal(S.migrate(null), null);
});
