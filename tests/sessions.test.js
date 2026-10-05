// 채팅방 저장소와 체크포인트 테스트: node --test tests/sessions.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../js/presets.js';
import * as S from '../js/state.js';
import * as SS from '../js/sessions.js';

const preset = (id) => PRESETS.find((p) => p.id === id);
const start = (id = 'fantasy', custom = {}) => S.newGame(preset(id), custom);

function fakeLs(limit = Infinity) {
  const m = new Map();
  const size = () => [...m].reduce((a, [k, v]) => a + k.length + v.length, 0);
  return {
    _m: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      if (size() + k.length + String(v).length > limit) throw new DOMException('full', 'QuotaExceededError');
      m.set(k, String(v));
    },
    removeItem: (k) => { m.delete(k); },
  };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 시간 표시, 미리보기 ----------
test('상대 시간: 방금 / 분 / 시간 / 일 / 날짜, 이상한 값은 방금', () => {
  const now = Date.UTC(2026, 9, 5, 12, 0, 0);
  const ago = (sec) => SS.timeAgo(now - sec * 1000, now);
  assert.deepEqual([0, 59, 60, 119, 3599, 3600, 86399, 86400, 86400 * 6].map(ago),
    ['방금', '방금', '1분 전', '1분 전', '59분 전', '1시간 전', '23시간 전', '1일 전', '6일 전']);
  assert.match(ago(86400 * 7), /^2026\.\d\d\.\d\d$/);
  for (const bad of [NaN, undefined, null, 'x']) assert.equal(SS.timeAgo(bad, now), '방금');
  assert.equal(SS.timeAgo(now + 99999, now), '방금', '미래 시각');
});

test('미리보기: 마지막 AI 응답의 지문·대사 한 줄, 없으면 마지막 플레이어 입력', () => {
  const g = start();
  assert.equal(SS.previewOf(g), '', '시스템 안내뿐이면 빈 값');
  g.log.push({ role: 'player', text: '  미라에게\n인사한다  ' });
  assert.equal(SS.previewOf(g), '미라에게 인사한다');
  g.log.push({ role: 'gm', text: '> 장소: 길드\n\n*미라가 고개를 들었다.*\n\n**미라**: "어서 와요."\n\n```\n상태\n```' });
  assert.equal(SS.previewOf(g), '어서 와요.', '마지막 대사');
  g.log.push({ role: 'gm', text: '*미라가 웃었다.*\n```\n상태\n```' });
  assert.equal(SS.previewOf(g), '미라가 웃었다.', '별표는 뗀다');
  g.log.push({ role: 'news', text: '📰 소문' }, { role: 'error', text: '⚠️ 오류' }, { role: 'system', text: '시간이 흘렀다' });
  assert.equal(SS.previewOf(g), '미라가 웃었다.', '소식, 오류, 안내는 건너뛴다');
  g.log.push({ role: 'player', text: '가'.repeat(300) });
  const p = SS.previewOf(g, 20);
  assert.equal(p.length, 20);
  assert.ok(p.endsWith('…'));
  assert.equal(SS.previewOf({}), '');
  assert.equal(SS.previewOf(null), '');
  assert.equal(SS.previewOf({ log: [{ role: 'gm', text: '{{asset:A}}' }] }), '');
});

// ---------- 저장소 ----------
const stores = {
  memory: () => SS.createStore(SS.memoryDriver()),
  local: () => SS.createStore(SS.localDriver(fakeLs())),
};
for (const [name, make] of Object.entries(stores)) {
  test(`채팅방 저장소(${name}): 저장하면 id·제목·시각이 생기고 목록은 최근순이다`, async () => {
    const st = make(); await st.init();
    assert.deepEqual(st.metas(), []);
    const a = start('fantasy', { name: '가' }); await st.save(a); await wait(3);
    const b = start('fantasy', { name: '나' }); await st.save(b); await wait(3);
    const c = start('cafe', { name: '다' }); await st.save(c);
    assert.ok(a.id && a.id !== b.id && b.id !== c.id);
    assert.equal(a.title, preset('fantasy').name);
    assert.ok(a.createdAt && a.updatedAt >= a.createdAt);
    assert.deepEqual(st.metas().map((m) => m.playerName), ['다', '나', '가']);
    assert.deepEqual(st.countByWorld(), { fantasy: 2, cafe: 1 });
    await wait(3); await st.save(a);
    assert.deepEqual(st.metas().map((m) => m.playerName), ['가', '다', '나'], '다시 저장하면 맨 위로');
    assert.equal(st.metas().length, 3, '같은 채팅방은 중복되지 않는다');
  });

  test(`채팅방 저장소(${name}): 같은 작품의 채팅방은 서로 독립이고, 불러온 값은 복사본이다`, async () => {
    const st = make(); await st.init();
    const a = start(); const b = start();
    a.log.push({ role: 'player', text: 'A의 입력' });
    await st.save(a); await st.save(b);
    const la = await st.load(a.id); const lb = await st.load(b.id);
    assert.equal(la.log.at(-1).text, 'A의 입력');
    assert.ok(!lb.log.some((m) => m.text === 'A의 입력'));
    la.log.push({ role: 'player', text: '바꿔 봄' });
    assert.ok(!(await st.load(a.id)).log.some((m) => m.text === '바꿔 봄'), '불러온 값을 고쳐도 저장본은 그대로');
    assert.equal(await st.load('없는-id'), null);
  });

  test(`채팅방 저장소(${name}): 저장은 호출한 시점의 모습을 남긴다 (쓰는 동안 게임이 바뀌어도)`, async () => {
    const st = make(); await st.init();
    const g = start();
    const pending = st.save(g);
    g.log.push({ role: 'player', text: '저장 뒤에 생긴 입력' });
    await pending;
    assert.ok(!(await st.load(g.id)).log.some((m) => m.text === '저장 뒤에 생긴 입력'));
  });

  test(`채팅방 저장소(${name}): 이름 바꾸기와 삭제`, async () => {
    const st = make(); await st.init();
    const g = start(); await st.save(g);
    await st.rename(g.id, '  나의 첫 모험  ');
    assert.equal(st.metas()[0].title, '나의 첫 모험');
    assert.equal((await st.load(g.id)).title, '나의 첫 모험');
    await st.rename(g.id, '   ');
    assert.equal(st.metas()[0].title, preset('fantasy').name, '빈 이름은 작품 이름으로');
    await st.rename(g.id, '가'.repeat(200));
    assert.equal(st.metas()[0].title.length, 60);
    assert.equal(await st.rename('없는-id', 'x'), null);
    await st.remove(g.id);
    assert.deepEqual(st.metas(), []);
    assert.equal(await st.load(g.id), null);
    await st.remove('없는-id'); // 없는 것을 지워도 오류 없음
  });

  test(`채팅방 저장소(${name}): 슬롯은 5칸이고 저장·읽기가 된다`, async () => {
    const st = make(); await st.init();
    assert.deepEqual(await st.listSlots(), [null, null, null, null, null]);
    const g = start(); g.log.push({ role: 'player', text: '슬롯 저장' });
    await st.saveSlot(2, g);
    g.log.push({ role: 'player', text: '저장 뒤' });
    const slots = await st.listSlots();
    assert.equal(slots.length, 5);
    assert.equal(slots[0], null);
    assert.ok(slots[2].savedAt > 0);
    assert.equal(slots[2].game.log.at(-1).text, '슬롯 저장', '저장 뒤의 변화는 들어가지 않는다');
  });

  test(`채팅방 저장소(${name}): 목록을 처음 불러올 때 깨진 항목은 건너뛴다`, async () => {
    const d = name === 'memory' ? SS.memoryDriver() : SS.localDriver(fakeLs());
    const st = SS.createStore(d);
    const g = start(); await st.save(g);
    const orig = d.getAllMeta;
    d.getAllMeta = async () => [...(await orig()), null, {}, { title: 'id 없음' }];
    const st2 = SS.createStore(d); await st2.init();
    assert.deepEqual(st2.metas().map((m) => m.id), [g.id]);
  });
}

test('채팅방 저장소(local): 저장 공간이 가득 차면 오류를 던지고 목록은 그대로다', async () => {
  const ls = fakeLs(1500);
  const st = SS.createStore(SS.localDriver(ls)); await st.init();
  await assert.rejects(st.save(start()), /full|Quota/);
  assert.deepEqual(st.metas(), [], '실패한 채팅방은 목록에 올라가지 않는다');
});

// ---------- 예전 자동 저장·슬롯 옮기기 ----------
test('옮기기: 예전 자동 저장 하나가 채팅방이 되고, 예전 항목은 지워진다', async () => {
  const ls = fakeLs();
  const old = start('cafe', { name: '옛 주인공' });
  old.log.push({ role: 'player', text: '예전에 한 행동' });
  ls.setItem('rp.autosave', JSON.stringify(old));
  const st = await SS.openStore({ idb: null, ls });
  assert.equal(st.metas().length, 1);
  assert.equal(st.metas()[0].id, SS.LEGACY_ID);
  assert.equal(st.metas()[0].playerName, '옛 주인공');
  assert.equal(ls.getItem('rp.autosave'), null);
  assert.equal((await st.load(SS.LEGACY_ID)).log.at(-1).text, '예전에 한 행동');
});

test('옮기기: 같은 예전 저장이 다시 나타나도 채팅방이 늘지 않는다', async () => {
  const ls = fakeLs();
  const old = start();
  for (let i = 0; i < 3; i++) {
    ls.setItem('rp.autosave', JSON.stringify(old));
    const st = await SS.openStore({ idb: null, ls });
    assert.equal(st.metas().length, 1, `${i + 1}번째`);
  }
});

test('옮기기: 깨진 예전 자동 저장은 건드리지 않고 넘어간다', async () => {
  for (const raw of ['{깨짐', 'null', '[]', JSON.stringify({ world: 1 })]) {
    const ls = fakeLs();
    ls.setItem('rp.autosave', raw);
    const st = await SS.openStore({ idb: null, ls });
    assert.deepEqual(st.metas(), [], raw);
    assert.equal(ls.getItem('rp.autosave'), raw, `${raw} 는 지우지 않는다`);
  }
});

test('옮기기: 슬롯은 새 저장소가 localStorage가 아닐 때만 옮기고 예전 항목을 지운다', async () => {
  const ls = fakeLs();
  const g = start(); g.log.push({ role: 'player', text: '슬롯에 있던 기록' });
  ls.setItem('rp.slots', JSON.stringify([null, { savedAt: 1, game: g }, null, null, null]));
  const driver = SS.memoryDriver();
  const st = SS.createStore(driver);
  await SS.migrateLegacy(st, driver, ls);
  const slots = await st.listSlots();
  assert.equal(slots[1].game.log.at(-1).text, '슬롯에 있던 기록');
  assert.equal(slots[0], null);
  assert.equal(ls.getItem('rp.slots'), null);
  // localStorage 드라이버는 같은 키를 그대로 쓰므로 건드리지 않는다
  const ls2 = fakeLs();
  ls2.setItem('rp.slots', JSON.stringify([{ savedAt: 1, game: g }]));
  const st2 = await SS.openStore({ idb: null, ls: ls2 });
  assert.equal((await st2.listSlots())[0].game.log.at(-1).text, '슬롯에 있던 기록');
  assert.ok(ls2.getItem('rp.slots'));
});

test('저장소 열기: IndexedDB가 없거나 열리지 않으면 localStorage, 그것도 없으면 메모리로 대신한다', async () => {
  assert.equal((await SS.openStore({ idb: null, ls: fakeLs() })).kind, 'local');
  assert.equal((await SS.openStore({ idb: null, ls: null })).kind, 'memory');
  const broken = { open() { throw new Error('막힘'); } };
  assert.equal((await SS.openStore({ idb: broken, ls: fakeLs() })).kind, 'local');
  const hangsThenErrors = { open() { const r = {}; setTimeout(() => r.onerror?.(), 0); return r; } };
  assert.equal((await SS.openStore({ idb: hangsThenErrors, ls: fakeLs() })).kind, 'local');
});

// ---------- 체크포인트 ----------
test('체크포인트: 한 턴이 바꾼 모든 상태가 되돌아가고 대화 기록이 잘린다', () => {
  const g = start('island');
  g.log.push({ role: 'gm', text: '앞선 장면' });
  const logBefore = g.log.length;
  const snap = JSON.stringify({ ...g, log: undefined, checkpoint: undefined });
  g.checkpoint = S.makeCheckpoint(g, { kind: 'act', text: '샘으로 간다' });
  g.log.push({ role: 'player', text: '샘으로 간다' }, { role: 'gm', text: '샘에 도착했다' });
  S.applyResult(g, {
    location: 'spring', relationshipChanges: [{ npc: 'harin', affection: 9, memory: '샘에서 만남' }],
    npcRelationChanges: [{ from: 'harin', to: 'yeeun', affection: 5 }], meterChanges: { hydration: -30 },
    statChanges: { 힘: 2 }, flags: { 거처단계: 3, 새플래그: 1 }, questsAdded: ['물 찾기'], goalProgressDelta: 20, choices: ['새 선택지'],
    ending: { id: 'rescued' },
  });
  S.advanceTime(g, 600, { clampToWorld: false });
  g.story.summary = '새 요약'; g.story.upTo = 5; g.npcs.harin.memorySummary = '요약됨';
  g.extraKey = 'x';
  assert.notEqual(JSON.stringify({ ...g, log: undefined, checkpoint: undefined }), snap);
  assert.equal(S.restoreCheckpoint(g), true);
  assert.equal(JSON.stringify({ ...g, log: undefined, checkpoint: undefined }), snap, '상태가 정확히 같다');
  assert.equal(g.log.length, logBefore);
  assert.equal(g.log.at(-1).text, '앞선 장면');
  assert.ok(!('extraKey' in g), '턴 중에 생긴 키도 사라진다');
});

test('체크포인트: 작품 정보, id, 제목은 건드리지 않고 체크포인트 자체는 커지지 않는다', () => {
  const g = start();
  g.id = 'x1'; g.title = '내 제목'; g.createdAt = 5; g.updatedAt = 6;
  g.checkpoint = S.makeCheckpoint(g, { kind: 'act', text: 'a' });
  const size1 = JSON.stringify(g.checkpoint).length;
  g.title = '바뀐 제목'; g.updatedAt = 99;
  S.applyResult(g, { goalProgressDelta: 7 });
  S.restoreCheckpoint(g);
  assert.equal(g.title, '바뀐 제목');
  assert.equal(g.id, 'x1');
  assert.equal(g.updatedAt, 99);
  assert.equal(g.goalProgress, 0);
  for (let i = 0; i < 5; i++) g.checkpoint = S.makeCheckpoint(g, { kind: 'act', text: 'a' });
  assert.equal(JSON.stringify(g.checkpoint).length, size1, '체크포인트 안에 체크포인트가 쌓이지 않는다');
  assert.ok(!('world' in g.checkpoint.state) && !('log' in g.checkpoint.state));
});

test('체크포인트: 복사본이라 복원한 뒤에 상태를 바꿔도 체크포인트는 그대로다', () => {
  const g = start();
  g.checkpoint = S.makeCheckpoint(g, { kind: 'act', text: 'a' });
  S.restoreCheckpoint(g);
  S.applyResult(g, { relationshipChanges: [{ npc: 'mira', affection: 10 }], flags: { a: 1 } });
  S.restoreCheckpoint(g);
  assert.equal(g.npcs.mira.affection, 10, '복원한 값은 원래 호감도');
  assert.deepEqual(g.flags, {});
  S.applyResult(g, { flags: { b: 2 } });
  S.restoreCheckpoint(g);
  assert.deepEqual(g.flags, {}, '두 번 복원해도 같다');
});

test('체크포인트: 없거나 깨졌으면 복원하지 않는다', () => {
  const g = start();
  assert.equal(S.restoreCheckpoint(g), false);
  g.checkpoint = { turn: { kind: 'act' } };
  assert.equal(S.restoreCheckpoint(g), false);
  g.checkpoint = { state: {}, logLength: 'x' };
  assert.equal(S.restoreCheckpoint(g), false);
  g.log.push({ role: 'player', text: 'a' });
  assert.equal(g.log.length, 2, '실패하면 기록도 그대로');
});

test('체크포인트: 다시 생성·수정 가능 여부는 마지막 턴의 종류와 남은 기록으로 정한다', () => {
  const g = start();
  assert.equal(S.canRegenerate(g), false);
  assert.equal(S.canEditLast(g), false);
  // 입력 턴
  g.checkpoint = S.makeCheckpoint(g, { kind: 'act', text: '인사한다' });
  assert.equal(S.canRegenerate(g), false, '답변이 아직 없다');
  g.log.push({ role: 'player', text: '인사한다' });
  assert.equal(S.canEditLast(g), true);
  g.log.push({ role: 'gm', text: '반갑다' });
  assert.equal(S.canRegenerate(g), true);
  assert.equal(S.canEditLast(g), true);
  // 이어쓰기 턴: 수정할 사용자 메시지가 없다
  g.checkpoint = S.makeCheckpoint(g, { kind: 'continue' });
  g.log.push({ role: 'gm', text: '이어진다' });
  assert.equal(S.canRegenerate(g), true);
  assert.equal(S.canEditLast(g), false);
  // 시간 넘기기 턴: 둘 다 불가
  g.checkpoint = S.makeCheckpoint(g, { kind: 'skip', text: '쉰다', skipMinutes: 60 });
  g.log.push({ role: 'player', text: '쉰다' }, { role: 'system', text: '시간이 흘렀다' });
  assert.equal(S.canRegenerate(g), false);
  assert.equal(S.canEditLast(g), false);
  // 진영 선택을 기다리는 중
  const r = start('racewar');
  r.checkpoint = S.makeCheckpoint(r, { kind: 'act', text: 'a' });
  r.log.push({ role: 'player', text: 'a' }, { role: 'gm', text: 'b' });
  assert.equal(S.canRegenerate(r), false);
  assert.equal(S.canEditLast(r), false);
});

test('체크포인트: 생존 수치와 NPC 관계 기억이 있는 세계관에서도 되돌아간다 (기억이 많아도)', () => {
  const g = start('island');
  for (let i = 0; i < 200; i++) S.applyResult(g, { relationshipChanges: [{ npc: 'harin', memory: `기억${i}` }] });
  g.checkpoint = S.makeCheckpoint(g, { kind: 'act', text: 'a' });
  S.applyResult(g, { relationshipChanges: [{ npc: 'harin', memory: '새 기억' }], meterChanges: { satiety: -50 } });
  assert.equal(g.npcs.harin.memories.length, 201);
  S.restoreCheckpoint(g);
  assert.equal(g.npcs.harin.memories.length, 200);
  assert.equal(g.meters.satiety, 100);
});

test('체크포인트: 전체 복사본으로 돌아가면 그 뒤에 생긴 항목은 없어지고 값은 원래대로다', () => {
  const g = start();
  g.log.push({ role: 'player', text: '가' });
  const snap = S.snapshotAll(g);
  const len = g.log.length;
  g.extra = 1; g.log.push({ role: 'gm', text: '나' }); g.player.money += 5;
  const money = snap.player.money;
  S.applySnapshot(g, snap);
  assert.ok(!('extra' in g), '복사본에 없던 항목은 지운다');
  assert.equal(g.log.length, len);
  assert.equal(g.player.money, money);
  assert.ok(g.world, '작품 정보는 그대로');
  snap.log.push({ role: 'x', text: 'y' });
  assert.equal(g.log.length, len, '복원한 뒤 복사본을 고쳐도 게임에는 영향이 없다');
});

test('채팅방 저장소: 저장 시점의 모습을 먼저 복사한다 (드라이버가 나중에 읽는 IndexedDB 같은 경우)', async () => {
  const inner = SS.memoryDriver();
  let held;
  const lazy = { ...inner, putSession: async (rec, m) => { await wait(5); held = JSON.stringify(rec); return inner.putSession(rec, m); } };
  const st = SS.createStore(lazy); await st.init();
  const g = start();
  const pending = st.save(g);
  g.log.push({ role: 'player', text: '저장 뒤에 생긴 입력' });
  await pending;
  assert.ok(!held.includes('저장 뒤에 생긴 입력'));
});

test('채팅방 저장소: 처음 불러올 때 최근에 고친 채팅이 위로 온다', async () => {
  const d = SS.memoryDriver();
  await d.putSession({ id: 'a' }, { id: 'a', updatedAt: 100 });
  await d.putSession({ id: 'b' }, { id: 'b', updatedAt: 300 });
  await d.putSession({ id: 'c' }, { id: 'c', updatedAt: 200 });
  const st = SS.createStore(d); await st.init();
  assert.deepEqual(st.metas().map((m) => m.id), ['b', 'c', 'a']);
});
