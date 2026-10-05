// 스트리밍, 이어쓰기, 추천 답변 테스트: node --test tests/ai.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../js/presets.js';
import * as S from '../js/state.js';
import * as AI from '../js/ai.js';

const preset = (id) => PRESETS.find((p) => p.id === id);
const start = (id = 'fantasy') => S.newGame(preset(id), {});
const KEY = { apiKey: 'test-key', model: 'auto', responseLength: 'normal', adultMode: false };
const enc = new TextEncoder();

// ---------- 가짜 서버 ----------
let calls = [];
const sseEvent = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
const chunkOf = (text, extra = {}) => sseEvent({ candidates: [{ content: { parts: [{ text }], role: 'model' }, ...extra }] });

// text를 바이트로 바꿔 size바이트씩 끊어 흘려보낸다. 한글이 바이트 중간에서 끊길 수 있다.
function streamResponse(text, { size = 7, status = 200, failAfter = null, signal = null } = {}) {
  const bytes = enc.encode(text);
  let pos = 0;
  const body = new ReadableStream({
    start(c) {
      signal?.addEventListener('abort', () => c.error(new DOMException('Aborted', 'AbortError')));
    },
    pull(c) {
      if (failAfter != null && pos >= failAfter) { c.error(new TypeError('network down')); return; }
      if (pos >= bytes.length) { if (failAfter == null && !signal) c.close(); else if (signal) return new Promise(() => {}); else c.close(); return; }
      c.enqueue(bytes.slice(pos, pos + size));
      pos += size;
    },
  });
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
}

// handler(call) → Response | { status, json } | throw
function fakeServer(handler) {
  calls = [];
  globalThis.fetch = async (url, opts) => {
    const model = decodeURIComponent(url.match(/models\/([^:]+):/)[1]);
    const call = { url, model, stream: url.includes('streamGenerateContent'), headers: opts.headers, body: JSON.parse(opts.body), signal: opts.signal };
    calls.push(call);
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const r = await handler(call);
    if (r instanceof Response) return r;
    const { status = 200, json } = r;
    return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
  };
}
const fullJson = (obj) => JSON.stringify(obj);
// 응답 JSON 글을 여러 조각의 SSE로 바꾼다
function sseOf(jsonText, parts = 5, extraLast = { finishReason: 'STOP' }) {
  const n = Math.ceil(jsonText.length / parts);
  const chunks = [];
  for (let i = 0; i < jsonText.length; i += n) chunks.push(jsonText.slice(i, i + n));
  return chunks.map((c, i) => chunkOf(c, i === chunks.length - 1 ? extraLast : {})).join('');
}

test.beforeEach(() => AI.resetCooldowns());

// ---------- 지문 꺼내기 ----------
test('지문 꺼내기: 아직 안 왔으면 빈 글, 오는 만큼 이어서 늘어난다', () => {
  const full = '{"narration": "첫 줄입니다.\\n둘째 \\"줄\\"과 \\\\ 역슬래시","minutes": 30}';
  assert.equal(AI.extractNarration(''), '');
  assert.equal(AI.extractNarration('{"minu'), '');
  assert.equal(AI.extractNarration('{"narration"'), '');
  assert.equal(AI.extractNarration('{"narration": "'), '');
  assert.equal(AI.extractNarration('{"narration": "첫'), '첫');
  let prev = '';
  for (let i = 0; i <= full.length; i++) {
    const cur = AI.extractNarration(full.slice(0, i));
    assert.ok(cur.startsWith(prev), `${i}: ${JSON.stringify(prev)} → ${JSON.stringify(cur)}`);
    prev = cur;
  }
  assert.equal(prev, '첫 줄입니다.\n둘째 "줄"과 \\ 역슬래시');
  assert.equal(AI.extractNarration(full), prev, '닫는 따옴표 뒤의 내용은 무시');
});

test('지문 꺼내기: 이스케이프가 중간에 끊기면 그 앞까지만 돌려준다', () => {
  assert.equal(AI.extractNarration('{"narration":"가\\'), '가');
  assert.equal(AI.extractNarration('{"narration":"가\\u'), '가');
  assert.equal(AI.extractNarration('{"narration":"가\\u00'), '가');
  assert.equal(AI.extractNarration('{"narration":"가\\uAC0'), '가');
  assert.equal(AI.extractNarration('{"narration":"가\\uAC00'), '가가');
  assert.equal(AI.extractNarration('{"narration":"\\n\\t\\/"'), '\n\t/');
  assert.equal(AI.extractNarration('{"narration":"\\q"'), 'q', '모르는 이스케이프는 글자로');
});

test('지문 꺼내기: 이모지가 반만 왔을 때 깨진 글자를 보이지 않는다', () => {
  const full = JSON.stringify({ narration: '불꽃🔥이 튀었다' });
  const half = full.slice(0, full.indexOf('🔥') + 1); // 높은 서로게이트만 온 상태
  assert.equal(AI.extractNarration(half), '불꽃');
  assert.equal(AI.extractNarration(full), '불꽃🔥이 튀었다');
  const escaped = '{"narration":"불꽃\\uD83D';
  assert.equal(AI.extractNarration(escaped), '불꽃', '이스케이프로 온 반쪽도 뺀다');
  assert.equal(AI.extractNarration('{"narration":"불꽃\\uD83D\\uDD25"'), '불꽃🔥');
});

test('지문 꺼내기: 코드블록으로 감싸 오거나 키 앞에 다른 값이 있어도 찾고, 지문 안의 따옴표 흉내는 속지 않는다', () => {
  assert.equal(AI.extractNarration('```json\n{"narration": "코드블록 안"'), '코드블록 안');
  assert.equal(AI.extractNarration('{"minutes": 10, "narration": "뒤에 나옴"'), '뒤에 나옴');
  const tricky = JSON.stringify({ narration: '그가 말했다. "narration": "가짜"', minutes: 5 });
  assert.equal(AI.extractNarration(tricky), '그가 말했다. "narration": "가짜"');
  assert.equal(AI.extractNarration(null), '');
  assert.equal(AI.extractNarration(undefined), '');
});

// ---------- SSE 해석 ----------
test('SSE 해석: 조각이 어디서 끊겨도 같은 결과', () => {
  const text = `: 주석\r\n${sseEvent({ a: 1 })}${sseEvent({ b: '한글' })}data: 줄1\ndata: 줄2\n\n\r\n\r\ndata: [DONE]\r\n\r\n`;
  const expect = ['{"a":1}', '{"b":"한글"}', '줄1\n줄2', '[DONE]'];
  const run = (cuts) => {
    const out = [];
    const p = AI.createSseParser((d) => out.push(d));
    let last = 0;
    for (const c of [...cuts, text.length]) { p.push(text.slice(last, c)); last = c; }
    p.end();
    return out;
  };
  assert.deepEqual(run([]), expect);
  assert.deepEqual(run([...Array(text.length).keys()].slice(1)), expect, '한 글자씩');
  for (let i = 0; i < 30; i++) {
    const cuts = [...new Set(Array.from({ length: 6 }, () => 1 + Math.floor(Math.random() * (text.length - 1))))].sort((a, b) => a - b);
    assert.deepEqual(run(cuts), expect, JSON.stringify(cuts));
  }
});

test('SSE 해석: 끝에 빈 줄이 없어도 end()로 마지막 이벤트를 받는다', () => {
  const out = [];
  const p = AI.createSseParser((d) => out.push(d));
  p.push('data: {"x":1}');
  assert.deepEqual(out, []);
  p.end();
  assert.deepEqual(out, ['{"x":1}']);
  p.end();
  assert.deepEqual(out, ['{"x":1}'], '두 번 불러도 중복 없음');
});

// ---------- 스트리밍 요청 ----------
const ANSWER = { narration: '파도가 밀려왔다.\n"좋아!" 그녀가 웃었다. 🌊 한글이 바이트 중간에서 끊겨도 된다.', minutes: 20, choices: ['다음'] };

test('스트리밍: streamGenerateContent로 요청하고 지문이 오는 대로 알리며 결과는 일반 응답과 같다', async () => {
  fakeServer(() => streamResponse(sseOf(fullJson(ANSWER), 6)));
  const seen = [];
  const r = await AI.gmTurn(start(), '인사한다', KEY, { onNarration: (t) => seen.push(t) });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].stream && calls[0].url.endsWith(':streamGenerateContent?alt=sse'));
  assert.equal(calls[0].headers['x-goog-api-key'], 'test-key');
  assert.ok(!calls[0].url.includes('test-key'));
  assert.deepEqual(r, ANSWER);
  assert.ok(seen.length >= 3, `여러 번 나눠 알림: ${seen.length}`);
  assert.ok(seen.every((t, i) => i === 0 || t.startsWith(seen[i - 1])), '앞 글을 유지하며 늘어난다');
  assert.equal(seen.at(-1), ANSWER.narration);
  assert.equal(new Set(seen).size, seen.length, '같은 글을 반복해서 알리지 않는다');
});

test('스트리밍: 바이트를 1개씩 흘려도 한글·이모지가 깨지지 않는다', async () => {
  fakeServer(() => streamResponse(sseOf(fullJson(ANSWER), 3), { size: 1 }));
  const seen = [];
  const r = await AI.gmTurn(start(), 'a', KEY, { onNarration: (t) => seen.push(t) });
  assert.deepEqual(r, ANSWER);
  assert.ok(seen.every((t) => !t.includes('�')), '깨진 글자(�) 없음');
  assert.equal(seen.at(-1), ANSWER.narration);
});

test('스트리밍: 설정에서 끄면 일반 요청(generateContent)을 쓰고 알림도 없다', async () => {
  fakeServer(() => ({ json: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: fullJson(ANSWER) }] } }] } }));
  const seen = [];
  const r = await AI.gmTurn(start(), 'a', { ...KEY, stream: false }, { onNarration: (t) => seen.push(t) });
  assert.ok(!calls[0].stream && calls[0].url.endsWith(':generateContent'));
  assert.deepEqual(seen, []);
  assert.deepEqual(r, ANSWER);
  calls = [];
  await AI.gmTurn(start(), 'a', KEY); // onNarration 없이도 일반 요청
  assert.ok(!calls[0].stream);
});

test('스트리밍: 한도 초과(429)는 다음 모델로 넘어가고, 쉬는 모델은 건너뛴다', async () => {
  fakeServer(({ model }) => (model === 'gemini-3.8-flash' ? { status: 429, json: { error: { message: 'quota' } } } : streamResponse(sseOf(fullJson(ANSWER), 4))));
  const seen = [];
  const r = await AI.gmTurn(start(), 'a', KEY, { onNarration: (t) => seen.push(t) });
  assert.deepEqual(calls.map((c) => c.model), ['gemini-3.8-flash', 'gemini-3.7-flash']);
  assert.deepEqual(r, ANSWER);
  assert.equal(seen.at(-1), ANSWER.narration);
  assert.equal(AI.aiStatus.lastModel, 'gemini-3.7-flash');
});

test('스트리밍: 잘못된 키는 바로 알리고, 없는 모델(404)은 다음 모델로 넘어간다', async () => {
  fakeServer(() => ({ status: 403, json: { error: { message: 'API key not valid' } } }));
  await assert.rejects(AI.gmTurn(start(), 'a', KEY, { onNarration() {} }), (e) => e.code === 'key');
  assert.equal(calls.length, 1);
  AI.resetCooldowns();
  fakeServer(({ model }) => (model === 'gemini-3.8-flash' ? { status: 404, json: { error: { message: 'gone' } } } : streamResponse(sseOf(fullJson(ANSWER), 2))));
  assert.deepEqual(await AI.gmTurn(start(), 'a', KEY, { onNarration() {} }), ANSWER);
});

test('스트리밍: 안전 정책 차단(첫 조각의 blockReason, SAFETY 종료, 후보 없음)', async () => {
  for (const body of [
    sseEvent({ promptFeedback: { blockReason: 'OTHER' } }),
    sseOf(fullJson(ANSWER), 2, { finishReason: 'SAFETY' }),
    '',
    sseEvent({ usageMetadata: {} }),
  ]) {
    fakeServer(() => streamResponse(body));
    await assert.rejects(AI.gmTurn(start(), 'a', KEY, { onNarration() {} }), (e) => e.code === 'blocked', body.slice(0, 40));
  }
});

test('스트리밍: 깨진 JSON, 객체가 아닌 응답은 해석 오류', async () => {
  for (const text of ['{"narration": "끊김', '[1,2]', '그냥 글']) {
    fakeServer(() => streamResponse(sseOf(text, 2)));
    await assert.rejects(AI.gmTurn(start(), 'a', KEY, { onNarration() {} }), (e) => e.code === 'parse', text);
  }
});

test('스트리밍: 중간에 연결이 끊기면 다른 모델로 넘어가지 않고 오류를 알린다', async () => {
  const text = sseOf(fullJson(ANSWER), 6);
  fakeServer(() => streamResponse(text, { size: 20, failAfter: 60 }));
  const seen = [];
  await assert.rejects(AI.gmTurn(start(), 'a', KEY, { onNarration: (t) => seen.push(t) }), (e) => e.code === 'network' && /끊어/.test(e.message));
  assert.equal(calls.length, 1, '글이 섞이지 않게 다른 모델로 이어 받지 않는다');
});

test('스트리밍: 스트림 안에 서버 오류 이벤트가 오면 서버 오류', async () => {
  fakeServer(() => streamResponse(chunkOf('{"narration":"일부') + sseEvent({ error: { code: 503, message: 'overloaded' } })));
  await assert.rejects(AI.gmTurn(start(), 'a', KEY, { onNarration() {} }), (e) => e.code === 'server' && /overloaded/.test(e.message));
});

test('스트리밍: 네트워크 오류와 중지(AbortSignal)를 구분한다', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(AI.gmTurn(start(), 'a', KEY, { onNarration() {} }), (e) => e.code === 'network');
  // 시작 전에 이미 중지됨
  fakeServer(() => streamResponse(sseOf(fullJson(ANSWER), 3)));
  const ac0 = new AbortController(); ac0.abort();
  await assert.rejects(AI.gmTurn(start(), 'a', KEY, { onNarration() {}, signal: ac0.signal }), (e) => e.code === 'aborted');
  // 받는 도중 중지
  const ac = new AbortController();
  fakeServer((c) => streamResponse(chunkOf('{"narration":"받는 중'), { signal: c.signal }));
  const seen = [];
  const p = AI.gmTurn(start(), 'a', KEY, { onNarration: (t) => { seen.push(t); if (t) ac.abort(); }, signal: ac.signal });
  await assert.rejects(p, (e) => e.code === 'aborted' && /중지/.test(e.message));
  assert.deepEqual(seen, ['받는 중']);
  assert.equal(calls[0].signal, ac.signal, 'fetch에 signal을 넘긴다');
});

test('스트리밍: 스트림 본문을 못 읽는 환경에서는 통째로 받아 같은 방식으로 처리한다', async () => {
  fakeServer(() => ({ __text: sseOf(fullJson(ANSWER), 3) }));
  globalThis.fetch = async () => ({ ok: true, status: 200, body: null, text: async () => sseOf(fullJson(ANSWER), 3) });
  const seen = [];
  assert.deepEqual(await AI.gmTurn(start(), 'a', KEY, { onNarration: (t) => seen.push(t) }), ANSWER);
  assert.equal(seen.at(-1), ANSWER.narration);
});

test('스트리밍: 여러 이벤트에 나눠 담긴 parts와 줄바꿈이 이어 붙는다', async () => {
  const j = fullJson({ narration: '가나다', minutes: 5 });
  const body = sseEvent({ candidates: [{ content: { parts: [{ text: j.slice(0, 10) }, { text: j.slice(10, 20) }] } }] }) + chunkOf(j.slice(20), { finishReason: 'STOP' });
  fakeServer(() => streamResponse(body));
  assert.deepEqual(await AI.gmTurn(start(), 'a', KEY, { onNarration() {} }), { narration: '가나다', minutes: 5 });
});

// ---------- 이어쓰기 ----------
test('이어쓰기: 플레이어 입력 없이 이어가라는 지시가 들어가고, 입력을 지어내지 않게 한다', async () => {
  fakeServer(() => ({ json: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: fullJson(ANSWER) }] } }] } }));
  const g = start();
  g.log.push({ role: 'player', text: '인사한다' }, { role: 'gm', text: '*미라가 웃었다.*' });
  await AI.gmTurn(g, '', KEY, { kind: 'continue' });
  const user = calls[0].body.contents[0].parts[0].text;
  assert.ok(user.includes(AI.CONTINUE_PROMPT));
  assert.ok(user.includes('미라가 웃었다'), '직전 장면이 문맥에 있다');
  assert.match(AI.CONTINUE_PROMPT, /입력 없이/);
  assert.match(AI.CONTINUE_PROMPT, /새로 만들어 내지 마라/);
  calls = [];
  await AI.gmTurn(g, '문을 연다', KEY);
  assert.ok(!calls[0].body.contents[0].parts[0].text.includes('이어쓰기'), '일반 입력에는 들어가지 않는다');
});

// ---------- 테스트 모드(키 없음) ----------
test('테스트 모드 스트리밍: 지문을 조금씩 나눠 알리고 결과는 같다', async () => {
  const g = start();
  const seen = [];
  const r = await AI.gmTurn(g, '안녕하세요', { apiKey: '' }, { onNarration: (t) => seen.push(t) });
  assert.ok(seen.length > 3);
  assert.ok(seen.every((t, i) => i === 0 || (t.startsWith(seen[i - 1]) && t.length > seen[i - 1].length)));
  assert.equal(seen.at(-1), r.narration);
  const quiet = [];
  await AI.gmTurn(g, '안녕', { apiKey: '', stream: false }, { onNarration: (t) => quiet.push(t) });
  assert.deepEqual(quiet, [], '스트리밍을 끄면 알림 없음');
});

test('테스트 모드 스트리밍: 중지하면 바로 멈춘다', async () => {
  const ac = new AbortController();
  const seen = [];
  const p = AI.gmTurn(start(), '안녕하세요', { apiKey: '' }, { onNarration: (t) => { seen.push(t); ac.abort(); }, signal: ac.signal });
  await assert.rejects(p, (e) => e.code === 'aborted');
  assert.equal(seen.length, 1);
  const ac2 = new AbortController(); ac2.abort();
  await assert.rejects(AI.gmTurn(start(), 'a', { apiKey: '', stream: false }, { signal: ac2.signal }), (e) => e.code === 'aborted');
});

test('테스트 모드 이어쓰기: 입력 없이 이야기가 이어지고 선택지가 나온다', async () => {
  const g = start();
  const r = await AI.gmTurn(g, '', { apiKey: '' }, { kind: 'continue' });
  assert.match(r.narration, /이어졌다/);
  assert.ok(r.choices.length >= 2);
  assert.equal(r.relationshipChanges, undefined);
  const lonely = start(); lonely.location = 'forest';
  assert.match((await AI.gmTurn(lonely, '', { apiKey: '' }, { kind: 'continue' })).narration, /정적/);
});

// ---------- 추천 답변 ----------
test('추천 답변: 3개까지만 받고 빈 값·중복·너무 긴 글은 거른다', () => {
  assert.deepEqual(AI.cleanSuggestions(['  가  ', '가', '나\n다', '', null, 5, '라', '마']), ['가', '나 다', '라']);
  assert.deepEqual(AI.cleanSuggestions(['x'.repeat(201), '정상']), ['정상']);
  for (const bad of [undefined, null, 'x', {}, 42]) assert.deepEqual(AI.cleanSuggestions(bad), []);
});

test('추천 답변: 가벼운 모델부터 쓰고, 성격과 상황과 안전 규칙이 요청에 들어간다', async () => {
  fakeServer(() => ({ json: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: fullJson({ suggestions: ['"안녕하세요."', '주변을 살핀다.', '샘으로 간다.', '넷째'] }) }] } }] } }));
  const g = start();
  g.log.push({ role: 'gm', text: '*미라가 의뢰판 앞에 서 있다.*' });
  const r = await AI.suggestReplies(g, { ...KEY, adultMode: true });
  assert.deepEqual(r, ['"안녕하세요."', '주변을 살핀다.', '샘으로 간다.']);
  assert.match(calls[0].model, /lite/, '요약류와 같은 가벼운 모델부터');
  assert.ok(!calls[0].stream, '추천은 스트리밍하지 않는다');
  const sys = calls[0].body.systemInstruction.parts[0].text;
  for (const t of ['정확히 3개', g.player.personality, '미성년자', '성인 모드', '60자 이내']) assert.ok(sys.includes(t), t);
  assert.ok(calls[0].body.contents[0].parts[0].text.includes('미라가 의뢰판 앞에 서 있다'));
});

test('추천 답변: 오류는 그대로 알리고, 비어 있으면 빈 목록', async () => {
  fakeServer(() => ({ status: 403, json: { error: { message: 'API key not valid' } } }));
  await assert.rejects(AI.suggestReplies(start(), KEY), (e) => e.code === 'key');
  fakeServer(() => ({ json: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: fullJson({ nope: 1 }) }] } }] } }));
  assert.deepEqual(await AI.suggestReplies(start(), KEY), []);
});

test('추천 답변: 테스트 모드는 상황에 맞는 3개를 돌려준다', async () => {
  const g = start();
  const here = S.npcsHere(g)[0];
  const r = await AI.suggestReplies(g, { apiKey: '' });
  assert.equal(r.length, 3);
  assert.equal(new Set(r).size, 3);
  assert.ok(r[0].includes(here.name));
  const lonely = start(); lonely.location = 'forest';
  const r2 = await AI.suggestReplies(lonely, { apiKey: '' });
  assert.equal(r2.length, 2, '주변에 사람이 없으면 2개');
  assert.ok(r2.every((x) => x && !x.includes('undefined')));
});
