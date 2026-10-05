import { PRESETS } from './presets.js';
import * as S from './state.js';
import * as AI from './ai.js';
import * as Store from './storage.js';
import * as Sess from './sessions.js';
import { renderMessage, renderBlocks, parseBlocks, displayVars, normalizeDisplay } from './render.js';

const modelSelect = document.querySelector('#settings-form [name=model]');
modelSelect.append(...AI.MODELS.map((m) => Object.assign(document.createElement('option'), { value: m.id, textContent: m.label })));

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'role' || k.startsWith('aria-')) e.setAttribute(k, v); // 접근성 속성은 속성으로 (프로퍼티 지원이 브라우저마다 달라서)
    else e[k] = v;
  }
  e.append(...kids.filter((k) => k != null));
  return e;
};

let settings = Store.loadSettings();
let display = Store.loadDisplay();
applyDisplay();
const store = await Sess.openStore(); // 채팅방 저장소 (IndexedDB, 안 되면 localStorage)
let game = null; // 지금 열려 있는 채팅방
let pendingWorld = null;
let busy = false;
let tab = 'me';
let sessionsFilter = null; // 채팅 목록을 한 작품으로 좁힐 때 { worldId, worldName }
let draft = null; // 스트리밍으로 오는 중인 AI 응답 { text }
let draftNode = null;
let editing = null; // 수정 중인 플레이어 메시지의 기록 위치
let abortCtl = null;
let turnPromise = null;
let turnKind = null;

// ---------- 화면 전환 ----------

function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== `screen-${name}`;
  if (name === 'title') renderTitle();
  if (name === 'sessions') renderSessions();
  if (name === 'game') renderGame();
}
document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => show(b.dataset.goto)));

// 저장 실패는 한 번만 알린다 (이어서 저장이 되면 다시 알릴 수 있다)
let saveWarned = false;
function persist() {
  if (!game) return Promise.resolve();
  return store.save(game).then(() => { saveWarned = false; }, () => {
    if (!saveWarned) { saveWarned = true; toast('⚠️ 브라우저 저장 공간이 부족해 저장하지 못했습니다. 파일로 내보내 두세요.'); }
  });
}
window.addEventListener('pagehide', () => { if (game && !busy) persist(); });

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2500);
}

// ---------- 타이틀 ----------

function worldCard(w, { editable } = {}) {
  const tags = [w.modules.economy && '💰 경제', w.modules.stats && '📊 능력치'].filter(Boolean).join(' · ');
  const chats = store.countByWorld()[w.id] ?? 0;
  const actions = el('div', { className: 'row' },
    el('button', { className: 'primary', textContent: '새 채팅', onclick: () => openSetup(w) }),
    chats ? el('button', { textContent: `채팅 ${chats}개`, onclick: () => openSessions({ worldId: w.id, worldName: w.name }) }) : null,
    el('button', { textContent: editable ? '수정' : '복사해서 수정', onclick: () => openEditor(editable ? w : { ...structuredClone(w), id: `${w.id}-copy-${Date.now().toString(36)}`, name: `${w.name} (사본)` }) }),
    editable ? el('button', { textContent: '내보내기', title: '파일로 내보내기', onclick: () => Store.downloadJson(`world-${w.id}.json`, w) }) : null,
    editable ? el('button', { textContent: '삭제', title: '삭제', className: 'danger', onclick: () => { if (confirm(`"${w.name}"을(를) 삭제할까요?`)) { Store.deleteWorld(w.id); renderTitle(); } } }) : null,
  );
  return el('div', { className: 'card' },
    el('div', { className: 'emoji', textContent: w.emoji || '🌍' }),
    el('b', { textContent: w.name }),
    el('span', { className: 'muted small', textContent: w.summary }),
    el('span', { className: 'tags', textContent: tags }),
    actions);
}

function renderTitle() {
  $('#preset-list').replaceChildren(...PRESETS.map((w) => worldCard(w)));
  const mine = Store.listWorlds();
  $('#world-list').replaceChildren(...(mine.length ? mine.map((w) => worldCard(w, { editable: true })) : [el('p', { className: 'muted', textContent: '아직 만든 세계관이 없습니다.' })]));
  const n = store.metas().length;
  $('#btn-continue').disabled = !n;
  $('#btn-open-sessions').textContent = n ? `내 채팅 (${n})` : '내 채팅';
  $('#mode-note').textContent = settings.apiKey
    ? `AI 연결됨 (${settings.model === 'auto' ? '모델 자동 선택' : settings.model})${settings.adultMode ? ' · 성인 모드' : ''}`
    : '테스트 모드: API 키 없이 미리 짜둔 반응으로 플레이합니다. 설정에서 Gemini API 키를 넣으면 AI가 이야기를 만듭니다.';
}

$('#btn-continue').onclick = () => { const m = store.metas()[0]; if (m) openSession(m.id); }; // 가장 최근 채팅
$('#btn-open-sessions').onclick = () => openSessions(null);
$('#btn-open-settings').onclick = openSettings;
$('#btn-open-slots').onclick = () => openSlots('load');
$('#btn-new-world').onclick = () => openEditor(null);

$('#file-import-save').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const g = await Store.readJsonFile(f);
    if (!g?.world || !g?.player) throw new Error();
    g.id = Sess.newId(); // 가져온 파일은 항상 새 채팅이 된다 (같은 파일을 다시 가져와도 덮어쓰지 않는다)
    delete g.createdAt;
    game = S.migrate(g); draft = null; editing = null;
    await persist();
    show('game');
  } catch { toast('세이브 파일을 읽지 못했습니다.'); }
};
$('#file-import-world').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const w = await Store.readJsonFile(f);
    const err = validateWorld(w);
    if (err) throw new Error(err);
    Store.saveWorld(w); renderTitle(); toast('세계관을 불러왔습니다.');
  } catch (err) { toast(`세계관 파일 오류: ${err.message || '형식이 맞지 않습니다.'}`); }
};

// ---------- 채팅 목록 ----------

function openSessions(filter) {
  sessionsFilter = filter;
  show('sessions');
}

async function openSession(id) {
  let g = null;
  try { g = await store.load(id); } catch { /* 아래에서 알린다 */ }
  if (!g?.world || !g?.player) { toast('채팅을 불러오지 못했습니다.'); return; }
  game = S.migrate(g); draft = null; editing = null; closeSuggest();
  show('game');
}

function sessionCard(m) {
  return el('div', { className: 'session' },
    el('button', { className: 'session-main', onclick: () => openSession(m.id) },
      el('span', { className: 'avatar', textContent: m.emoji }),
      el('span', { className: 'session-text' },
        el('b', { textContent: m.title }),
        el('span', { className: 'small muted', textContent: `${m.worldName} · ${m.playerName} · ${m.day}일차` }),
        el('span', { className: 'preview', textContent: m.preview || '아직 대화가 없습니다.' })),
      el('span', { className: 'when small muted', textContent: Sess.timeAgo(m.updatedAt) })),
    el('div', { className: 'row session-actions' },
      el('button', { textContent: '이름 변경', onclick: () => renameSession(m) }),
      el('button', { textContent: '삭제', className: 'danger', onclick: () => deleteSession(m) })));
}

function renderSessions() {
  const all = store.metas();
  const list = sessionsFilter ? all.filter((m) => m.worldId === sessionsFilter.worldId) : all;
  $('#sessions-title').textContent = sessionsFilter ? `내 채팅 · ${sessionsFilter.worldName}` : '내 채팅';
  const f = $('#sessions-filter');
  f.hidden = !sessionsFilter;
  f.replaceChildren(...(sessionsFilter ? [el('button', { textContent: '전체 채팅 보기', onclick: () => openSessions(null) })] : []));
  $('#session-list').replaceChildren(...(list.length
    ? list.map(sessionCard)
    : [el('p', { className: 'muted', textContent: sessionsFilter ? '이 작품으로 만든 채팅이 없습니다.' : '아직 채팅이 없습니다. 작품을 골라 새 채팅을 시작해 보세요.' })]));
}

async function renameSession(m) {
  const t = prompt('채팅 이름', m.title);
  if (t === null) return;
  try { await store.rename(m.id, t); } catch { toast('이름을 바꾸지 못했습니다.'); }
  renderSessions();
}

async function deleteSession(m) {
  if (!confirm(`"${m.title}" 채팅을 삭제할까요? 되돌릴 수 없습니다.`)) return;
  try { await store.remove(m.id); } catch { toast('삭제하지 못했습니다.'); }
  renderSessions();
}

// ---------- 캐릭터 설정 ----------

function openSetup(w) {
  pendingWorld = w;
  const p = w.protagonist;
  $('#setup-world').textContent = `${w.emoji || '🌍'} ${w.name}`;
  $('#setup-summary').textContent = w.summary;
  $('#setup-role').textContent = p.role;
  $('#setup-background').textContent = p.background;
  $('#setup-goal').textContent = `${w.goal.title}: ${w.goal.description}`;
  const f = $('#setup-form');
  f.name.value = p.name; f.personality.value = p.personality; f.appearance.value = p.appearance;
  show('setup');
}

$('#setup-form').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('button[type=submit]');
  if (btn.disabled) return;
  const p = pendingWorld.protagonist;
  const custom = { name: f.name.value.trim(), personality: f.personality.value.trim(), appearance: f.appearance.value.trim() };
  let statNote = '';
  // startChoices가 있으면 선택지의 능력치(protagonistPatch.stats)를 쓰므로 AI 능력치 결정은 건너뛴다
  if (pendingWorld.modules.stats && settings.apiKey && !pendingWorld.startChoices?.length) {
    btn.disabled = true; btn.textContent = 'AI가 능력치를 정하는 중…';
    try {
      const r = await AI.decideStats(pendingWorld, { name: custom.name || p.name, personality: custom.personality || p.personality, appearance: custom.appearance || p.appearance }, settings);
      custom.stats = r.stats;
      statNote = `AI가 정한 능력치: ${Object.entries(r.stats).map(([k, v]) => `${k} ${v}`).join(', ')}${r.reason ? `\n(${r.reason})` : ''}`;
    } catch (err) {
      statNote = `⚠️ AI가 능력치를 정하지 못해 기본값으로 시작합니다. (${err.message})`;
    } finally {
      btn.disabled = false; btn.textContent = '게임 시작';
    }
  }
  game = S.newGame(pendingWorld, custom);
  draft = null; editing = null; closeSuggest();
  if (statNote) game.log.push({ role: 'system', text: statNote });
  pushOpening();
  if (game.pendingStart) {
    game.log.push({ role: 'system', text: '이야기를 시작하기 전에 선택하세요.' });
  } else {
    beginStory();
  }
  await persist(); // 새 채팅은 시작하자마자 목록에 올라간다
  show('game');
};

// 선택 필드 opening: 프리셋이 정해 둔 첫 장면(인사말). {이름}은 주인공 이름으로 바뀐다.
function pushOpening() {
  const o = game.world.opening;
  if (typeof o === 'string' && o.trim()) game.log.push({ role: 'gm', text: o.replaceAll('{이름}', game.player.name) });
}

function beginStory() {
  game.log.push({ role: 'system', text: `${S.timeLabel(game.time)} · ${S.placeName(game, game.location)}에서 이야기가 시작됩니다.` });
  game.choices = ['주변을 둘러본다', ...S.npcsHere(game).slice(0, 2).map((n) => `${n.name}에게 인사한다`)];
}

// 선택 필드 startChoices: 오프닝 전 선택
async function chooseStart(c) {
  if (busy || !game.pendingStart || !S.applyStartChoice(game, c.id)) return;
  game.log.push({ role: 'player', text: c.label });
  beginStory();
  renderGame();
  await persist();
}

// ---------- 화면 표시 ----------

function applyDisplay() {
  for (const [k, v] of Object.entries(displayVars(display))) document.documentElement.style.setProperty(k, v);
}

const PREVIEW_SAMPLE = '> 🌤️ 장소: 해변 | ⏰ 3일차 14:20\n\n*파도가 발목을 적시고 지나갔다.* 멀리서 갈매기 소리가 들렸다.\n\n**하린**: "물이 빠지기 전에 조개부터 줍자."\n\n```\n 포만감 62 | 수분 48 | 컨디션 71\n```';

function syncDisplayDialog() {
  const f = $('#display-form');
  for (const b of f.querySelectorAll('[data-mode]')) b.setAttribute('aria-checked', String(b.dataset.mode === display.viewMode));
  f.fontSizeLevel.value = display.fontSizeLevel;
  f.lineHeightLevel.value = display.lineHeightLevel;
  $('#display-preview').replaceChildren(
    el('div', { className: 'msg player', textContent: '해변으로 나가 본다.' }),
    el('div', { className: 'msg gm' }, renderBlocks(parseBlocks(PREVIEW_SAMPLE), { viewMode: display.viewMode })),
  );
}

function changeDisplay(patch) {
  display = normalizeDisplay({ ...display, ...patch });
  applyDisplay();
  Store.saveDisplay(display);
  syncDisplayDialog();
  if (game && !$('#screen-game').hidden) renderGame();
}

$('#btn-display').onclick = () => { syncDisplayDialog(); $('#dlg-display').showModal(); };
for (const b of document.querySelectorAll('#display-form [data-mode]')) b.onclick = () => changeDisplay({ viewMode: b.dataset.mode });
for (const name of ['fontSizeLevel', 'lineHeightLevel']) {
  $('#display-form')[name].addEventListener('input', (e) => changeDisplay({ [name]: e.target.value }));
}

// ---------- 게임 화면 ----------

// 대화 기록 한 줄을 화면 요소로 바꾼다. AI 응답(gm)만 지문·대사·상태창으로 나눠 보여준다.
function messageNodes(m, i, targets) {
  if (m.role === 'gm') {
    const box = el('div', { className: 'msg gm' });
    box.append(renderMessage(m.text, { viewMode: display.viewMode }));
    if (i === targets.regenerate) {
      box.append(el('div', { className: 'msg-actions' },
        el('button', { className: 'link-btn', textContent: '다시 생성', title: '마지막 답변을 지우고 다시 만듭니다', onclick: regenerate })));
    }
    return [box];
  }
  if (m.role === 'player' && i === editing) return [editorNode(m)];
  const bubble = el('div', { className: `msg ${m.role}`, textContent: m.text });
  if (m.role === 'player' && i === targets.edit) {
    return [bubble, el('div', { className: 'msg-actions right' },
      el('button', { className: 'link-btn', textContent: '수정', title: '이 메시지를 고쳐서 다시 진행합니다', onclick: () => { editing = i; renderGame(); } }))];
  }
  return [bubble];
}

function editorNode(m) {
  const ta = el('textarea', { value: m.text, rows: 3, maxLength: 500 });
  ta.setAttribute('aria-label', '메시지 수정');
  const cancel = () => { editing = null; renderGame(); };
  const save = () => editLast(ta.value);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) { e.preventDefault(); save(); }
  });
  return el('div', { className: 'edit-box' }, ta,
    el('div', { className: 'row right' },
      el('button', { textContent: '취소', onclick: cancel }),
      el('button', { className: 'primary', textContent: '저장하고 다시 진행', onclick: save })));
}

// AI 응답이 오는 중인 말풍선: 글이 없으면 입력 중 표시, 있으면 지금까지 온 글
function fillDraft() {
  draftNode.replaceChildren(draft.text
    ? renderMessage(draft.text, { viewMode: display.viewMode })
    : el('div', { className: 'typing', role: 'status', 'aria-label': '답변을 만드는 중' }, el('i'), el('i'), el('i')));
}

function updateDraft() {
  if (!draftNode?.isConnected) return;
  const log = $('#log');
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 120; // 위를 읽는 중이면 따라가지 않는다
  fillDraft();
  if (nearBottom) log.scrollTop = log.scrollHeight;
}

function renderGame() {
  $('#g-world').textContent = `${game.world.emoji || '🌍'} ${game.title ?? game.world.name}`;
  $('#g-time').textContent = `${S.timeLabel(game.time)} · 📍 ${S.placeName(game, game.location)}`;
  const idle = !busy && !game.pendingStart;
  const targets = {
    // 마지막 AI 답변에는 "다시 생성", 마지막 플레이어 메시지에는 "수정"
    regenerate: idle && S.canRegenerate(game) ? game.log.findLastIndex((m, i) => m.role === 'gm' && i >= game.checkpoint.logLength) : -1,
    edit: idle && S.canEditLast(game) ? game.checkpoint.logLength : -1,
  };
  const log = $('#log');
  draftNode = draft ? el('div', { className: 'msg gm draft', 'aria-live': 'off' }) : null;
  if (draftNode) fillDraft();
  log.replaceChildren(...game.log.flatMap((m, i) => messageNodes(m, i, targets)), ...(draftNode ? [draftNode] : []));
  log.setAttribute('aria-busy', String(busy));
  log.scrollTop = log.scrollHeight;
  $('#choices').replaceChildren(...(game.pendingStart
    ? game.world.startChoices.map((c) => el('button', { textContent: c.label, onclick: () => chooseStart(c) }))
    : game.choices.map((c) => el('button', { textContent: c, onclick: () => act(c) }))));
  for (const b of document.querySelectorAll('#screen-game button, #action-input')) {
    if (b.closest('.tabs') || b.closest('.topbar') || b.id === 'btn-stop' || b.closest('.msg-actions') || b.closest('.edit-box')) continue;
    b.disabled = busy || (game.pendingStart && !b.closest('#choices'));
  }
  // 중지는 AI 응답을 기다리는 동안만 보인다 (시간 넘기기는 금방 끝나서 필요 없다)
  const stoppable = busy && turnKind && turnKind !== 'skip';
  $('#btn-stop').hidden = !stoppable;
  $('#btn-send').hidden = stoppable;
  $('#status').hidden = true;
  renderTab();
  if (editing != null) { const ta = $('#log textarea'); ta?.focus(); ta?.setSelectionRange(ta.value.length, ta.value.length); }
}

// ---------- 한 턴 진행 ----------
// turn: { kind: 'act'(입력) | 'continue'(이어쓰기) | 'skip'(시간 넘기기), text, skipMinutes }
// 턴을 시작하기 전의 상태를 체크포인트로 보관해 두었다가, 성공하면 그 턴의 체크포인트로 남긴다.
// 실패하거나 중지하면 이 턴이 없었던 것으로 되돌린다. opts.undo가 있으면 (다시 생성·수정) 원래 답변으로 되돌린다.

function runTurn(turn, opts = {}) {
  if (busy || game.pendingStart) return Promise.resolve();
  if (turn.kind !== 'continue' && !turn.text) return Promise.resolve();
  turnPromise = doTurn(turn, opts);
  return turnPromise;
}

async function doTurn(turn, { undo } = {}) {
  busy = true; turnKind = turn.kind;
  const cp = S.makeCheckpoint(game, turn);
  abortCtl = new AbortController();
  if (turn.kind !== 'continue') game.log.push({ role: 'player', text: turn.text });
  draft = turn.kind === 'skip' ? null : { text: '' };
  closeSuggest();
  renderGame();
  const hadEnding = game.ending;
  let restoreInput = '';
  try {
    let days = 0;
    if (turn.kind === 'skip') {
      const r = S.rest(game, turn.skipMinutes, { cap: false });
      days = r.days;
      logRecovery(r.gained);
      game.log.push({ role: 'system', text: `시간이 흘렀다. ${S.timeLabel(game.time)}` });
      game.choices = defaultChoices();
    } else {
      const r = await AI.gmTurn(game, turn.text, settings, {
        kind: turn.kind, signal: abortCtl.signal,
        onNarration: (t) => { draft.text = t; updateDraft(); },
      });
      draft = null;
      game.log.push({ role: 'gm', text: r.narration ?? '' });
      S.applyResult(game, r);
      if (r.resting) {
        const rr = S.rest(game, r.minutes);
        days = rr.days;
        logRecovery(rr.gained);
      } else days = S.advanceTime(game, r.minutes);
    }
    if (days > 0) await endOfDay(days);
    if (!hadEnding && game.ending) game.log.push({ role: 'system', text: `🏁 엔딩: ${game.ending.title}\n${game.ending.description}\n\n엔딩 이후에도 계속 플레이할 수 있습니다.` });
    await AI.summarize(game, settings).catch(() => {}); // 요약 실패는 다음 턴에 다시 시도
    game.checkpoint = cp;
  } catch (err) {
    if (undo) S.applySnapshot(game, undo); else { S.restoreCheckpoint(game, cp); restoreInput = turn.text ?? ''; }
    if (err.code === 'aborted') toast('생성을 중지했습니다.');
    else game.log.push({ role: 'error', text: `⚠️ ${err.message}` });
  } finally {
    draft = null; abortCtl = null; turnKind = null;
    renderGame(); // 결과를 먼저 보여주고(입력은 아직 잠김)
    await persist(); // 저장이 끝난 뒤에 입력을 푼다: 바로 닫거나 새로고침해도 마지막 턴이 남는다
    busy = false;
    renderGame();
    if (restoreInput) $('#action-input').value = restoreInput;
  }
}

// 입력(턴)을 보내는 기존 호출 모양을 그대로 쓴다
function act(text, { skipMinutes } = {}) {
  return runTurn(skipMinutes != null ? { kind: 'skip', text, skipMinutes } : { kind: 'act', text });
}

// 마지막 AI 답변을 지우고 같은 입력으로 다시 만든다
async function regenerate() {
  if (busy || !S.canRegenerate(game)) return;
  if (!confirm('마지막 답변을 지우고 다시 만들까요?')) return;
  const turn = { ...game.checkpoint.turn };
  const undo = S.snapshotAll(game);
  S.restoreCheckpoint(game);
  await runTurn(turn, { undo });
}

// 마지막 플레이어 메시지를 고치고 그 뒤를 다시 진행한다
async function editLast(text) {
  const t = String(text).trim();
  if (busy || !t || !S.canEditLast(game)) return;
  editing = null;
  const undo = S.snapshotAll(game);
  S.restoreCheckpoint(game);
  await runTurn({ kind: 'act', text: t }, { undo });
}

// 입력 없이 이야기를 이어 간다
function continueStory() {
  return runTurn({ kind: 'continue', text: '' });
}

function logRecovery(gained) {
  if (gained > 0) game.log.push({ role: 'system', text: `쉬면서 ${S.STAMINA}이(가) ${gained} 회복되었다. (${game.player.stats[S.STAMINA]}/${game.player.statMax[S.STAMINA]})` });
}

async function endOfDay(days) {
  try {
    const r = await AI.dailyEvents(game, settings);
    for (const n of r.news ?? []) game.log.push({ role: 'news', text: `📰 ${n}` });
    S.applyResult(game, { ...r, choices: game.choices });
  } catch (err) {
    game.log.push({ role: 'error', text: `⚠️ 하루 소식을 만들지 못했습니다: ${err.message}` });
  }
  if (days > 1) game.log.push({ role: 'system', text: `${days}일이 지났습니다.` });
}

function defaultChoices() {
  return ['주변을 둘러본다', ...S.npcsHere(game).slice(0, 2).map((n) => `${n.name}에게 말을 건다`)];
}

// ---------- 추천 답변 ----------
// 플레이어가 다음에 할 만한 말이나 행동 후보 3개를 보여 준다. 고르면 입력창에 채워지고, 고쳐서 보낼 수 있다.

let suggestToken = 0;
function closeSuggest() {
  suggestToken++;
  const p = $('#suggest-panel');
  if (p) p.hidden = true;
}

async function openSuggest() {
  const panel = $('#suggest-panel');
  if (!panel.hidden) { closeSuggest(); return; } // 열려 있으면 닫기
  if (busy || game.pendingStart) return;
  const token = ++suggestToken;
  panel.hidden = false;
  panel.replaceChildren(el('p', { className: 'muted small', role: 'status', textContent: '추천 답변을 만드는 중…' }));
  const header = (...kids) => el('div', { className: 'suggest-head' }, el('b', { textContent: '추천 답변' }), el('span', { className: 'row' }, ...kids));
  try {
    const list = await AI.suggestReplies(game, settings);
    if (token !== suggestToken) return; // 그 사이 닫았거나 턴을 시작했다
    if (!list.length) throw new Error('추천 답변을 만들지 못했습니다.');
    panel.replaceChildren(
      header(el('button', { className: 'link-btn', textContent: '다시 추천', onclick: () => { closeSuggest(); openSuggest(); } }),
        el('button', { className: 'link-btn', textContent: '닫기', onclick: closeSuggest })),
      el('div', { role: 'listbox', 'aria-label': '추천 답변' }, ...list.map((t) => el('button', {
        role: 'option', textContent: t,
        onclick: () => { const input = $('#action-input'); input.value = t.slice(0, 500); closeSuggest(); input.focus(); },
      }))));
  } catch (err) {
    if (token !== suggestToken) return;
    panel.replaceChildren(header(el('button', { className: 'link-btn', textContent: '닫기', onclick: closeSuggest })),
      el('p', { className: 'error small', textContent: `⚠️ ${err.message}` }));
  }
}

$('#btn-suggest').onclick = openSuggest;
$('#btn-continue-story').onclick = continueStory;
$('#btn-stop').onclick = () => abortCtl?.abort();

$('#action-form').onsubmit = (e) => {
  e.preventDefault();
  const v = $('#action-input').value.trim();
  if (busy) return;
  $('#action-input').value = '';
  act(v);
};
document.querySelectorAll('[data-skip]').forEach((b) => b.addEventListener('click', () => {
  const v = b.dataset.skip;
  if (v === 'sleep') {
    act('잠자리에 든다', { skipMinutes: S.minutesUntilMorning(game) });
  } else act(`${Number(v) / 60}시간 쉰다`, { skipMinutes: Number(v) });
}));
$('#btn-save').onclick = () => openSlots('save');
$('#btn-settings-2').onclick = openSettings;

// 처음 화면으로 나가기: 진행 중인 응답은 멈추고(되돌려지고) 저장한 뒤 나간다
async function leaveGame(target) {
  if (busy) { abortCtl?.abort(); await turnPromise; }
  editing = null; closeSuggest();
  await persist();
  show(target);
}
$('#btn-to-title').onclick = () => leaveGame('title');

// ---------- 사이드 패널 ----------

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  renderTab();
});

// 0~max 게이지. 20% 아래는 위험 색.
const gauge = (m) => el('div', {},
  el('span', { className: 'small', textContent: `${m.name} ${Math.round(m.value)}/${m.max}${m.label ? ` · ${m.label}` : ''}` }),
  el('div', { className: `bar${m.value < m.max * 0.2 ? ' danger' : ''}` }, el('i', { style: `width:${Math.round((m.value / m.max) * 100)}%` })));

const meter = (label, v, shown = v) => el('div', {},
  el('span', { className: 'small', textContent: `${label} ${shown}` }),
  el('div', { className: 'bar' }, el('i', { style: `width:${Math.max(0, (v + 100) / 2)}%` })));

function npcRelText(id) {
  const row = game.npcRelations?.[id] ?? {};
  return Object.entries(row).filter(([, r]) => r.affection || r.trust || r.love)
    .map(([to, r]) => `→ ${S.npcById(game, to)?.name ?? to}: 호감${r.affection} 신뢰${r.trust} 애정${r.love}`).join('\n');
}

function renderTab() {
  const g = game;
  const body = $('#tab-body');
  const views = {
    me: () => [
      el('b', { textContent: `${g.player.name} · ${g.player.role}` }),
      el('div', { className: 'small', textContent: `성격: ${g.player.personality}` }),
      el('div', { className: 'small', textContent: `외모: ${g.player.appearance}` }),
      g.faction ? el('div', { className: 'small', textContent: `소속: ${g.world.factions.find((f) => f.id === g.faction)?.name ?? g.faction}` }) : null,
      g.world.modules.stats ? el('div', { className: 'kv' }, ...Object.entries(g.player.stats).flatMap(([k, v]) => [el('span', { textContent: k }), el('b', { textContent: v })])) : null,
      g.meters ? el('div', { className: 'gauges' }, ...S.meterList(g).map(gauge)) : null,
      g.world.modules.economy ? el('div', { textContent: `💰 ${g.player.money.toLocaleString()} ${g.world.currency}` }) : null,
    ],
    people: () => g.world.npcs.map((n) => {
      const s = g.npcs[n.id];
      const where = S.placeName(g, S.npcPlace(n, g.time.minute));
      const here = S.npcPlace(n, g.time.minute) === g.location;
      return el('div', { className: `item${here ? ' here' : ''}` },
        el('b', { textContent: `${n.name} (${n.role})${S.relationStage(g.world, s.affection) ? ` [${S.relationStage(g.world, s.affection)}]` : ''}` }),
        el('div', { className: 'small muted', textContent: `📍 ${where}${here ? ' · 여기 있음' : ''}` }),
        meter('호감', s.affection), meter('신뢰', s.trust), meter('애정', s.love),
        s.memories.length ? el('details', {}, el('summary', { className: 'small', textContent: `기억 ${s.memories.length}개` }), ...s.memories.map((m) => el('div', { className: 'small', textContent: m }))) : null,
        npcRelText(n.id) ? el('div', { className: 'small muted', textContent: npcRelText(n.id) }) : null,
        here ? el('button', { textContent: '말 걸기', disabled: busy, onclick: () => act(`${n.name}에게 말을 건다`) }) : null);
    }),
    map: () => g.world.places.map((p) => {
      const here = p.id === g.location;
      const who = g.world.npcs.filter((n) => S.npcPlace(n, g.time.minute) === p.id).map((n) => n.name).join(', ');
      return el('div', { className: `item${here ? ' here' : ''}` },
        el('b', { textContent: `${here ? '📍 ' : ''}${p.name}` }),
        el('div', { className: 'small muted', textContent: p.description }),
        el('div', { className: 'small', textContent: who ? `인물: ${who}` : '' }),
        here ? null : el('button', { textContent: '이동', disabled: busy, onclick: () => act(`${p.name}(으)로 이동한다`) }));
    }),
    bag: () => g.world.modules.economy
      ? [el('div', { textContent: `💰 ${g.player.money.toLocaleString()} ${g.world.currency}` }),
        ...(g.player.inventory.length ? g.player.inventory.map((it) => el('div', { className: 'item row' }, el('span', { textContent: it }),
          el('button', { textContent: '사용', disabled: busy, onclick: () => act(`${it}을(를) 사용한다`) }))) : [el('p', { className: 'muted', textContent: '소지품이 없습니다.' })])]
      : [el('p', { className: 'muted', textContent: '이 세계관은 경제/소지품 모듈을 쓰지 않습니다.' })],
    quest: () => [
      el('b', { textContent: `🎯 ${g.world.goal.title}` }),
      el('div', { className: 'small', textContent: g.world.goal.description }),
      meter('진행도', g.goalProgress * 2 - 100, `${g.goalProgress}/100`),
      el('div', { className: 'small muted', textContent: `현재 ${g.time.day}일차${g.ending ? ` · 달성한 엔딩: ${g.ending.title}` : ''}` }),
      el('b', { textContent: '서브 퀘스트' }),
      ...(g.quests.length ? g.quests.map((q) => el('div', { className: 'small', textContent: `${q.done ? '✅' : '⬜'} ${q.title}` })) : [el('div', { className: 'small muted', textContent: '없음' })]),
    ],
    world: () => [
      ...(g.world.factions.length ? [el('b', { textContent: '세력 평판' })] : []),
      ...g.world.factions.map((f) => meter(f.name, g.factions[f.id])),
      el('b', { textContent: '세계 상태' }),
      el('div', { className: 'small', textContent: Object.keys(g.flags).length ? Object.entries(g.flags).map(([k, v]) => `${k}: ${v}`).join('\n') : '변화 없음' }),
    ],
  };
  body.replaceChildren(...views[tab]().filter(Boolean));
}

// ---------- 설정 ----------

function openSettings() {
  const f = $('#settings-form');
  f.apiKey.value = settings.apiKey; f.model.value = settings.model;
  if (!f.model.value) f.model.value = 'auto';
  f.responseLength.value = settings.responseLength; f.adultMode.checked = settings.adultMode;
  f.stream.checked = settings.stream !== false;
  $('#dlg-settings').showModal();
}
// Enter로 제출하면 저장이 눌린다 (취소는 type=button이라 제출 버튼이 아니다)
$('#btn-settings-cancel').onclick = () => $('#dlg-settings').close('cancel');
$('#settings-form').adultMode.addEventListener('change', (e) => {
  if (e.target.checked && !confirm('성인 모드는 성인만 사용할 수 있습니다. 만 19세 이상입니까?')) e.target.checked = false;
});
$('#dlg-settings').addEventListener('close', () => {
  if ($('#dlg-settings').returnValue !== 'ok') return;
  const f = $('#settings-form');
  if (f.apiKey.value.trim() !== settings.apiKey) AI.resetCooldowns(); // 새 키는 한도가 따로다
  settings = { apiKey: f.apiKey.value.trim(), model: f.model.value || Store.DEFAULT_SETTINGS.model, responseLength: f.responseLength.value, adultMode: f.adultMode.checked, stream: f.stream.checked };
  Store.saveSettings(settings);
  toast('설정을 저장했습니다.');
  if (!$('#screen-title').hidden) renderTitle();
});

// ---------- 세이브 슬롯 ----------
// 슬롯은 "이 시점으로 돌아갈 수 있는 복사본"이다. 불러오면 원래 채팅을 덮어쓰지 않고 새 채팅으로 열린다.

async function openSlots(mode) {
  let slots;
  try { slots = await store.listSlots(); } catch { toast('슬롯을 읽지 못했습니다.'); return; }
  $('#slots-title').textContent = mode === 'save' ? '저장할 슬롯 선택' : '불러올 슬롯 선택';
  $('#btn-export-save').hidden = mode !== 'save';
  $('#slot-list').replaceChildren(...slots.map((s, i) => {
    const label = s ? `${s.game.world.emoji || ''} ${s.game.title ?? s.game.world.name} · ${s.game.player.name} · ${S.timeLabel(s.game.time)}` : '빈 슬롯';
    const btn = mode === 'save'
      ? el('button', { textContent: '저장', onclick: async () => {
        $('#dlg-slots').close();
        try { await store.saveSlot(i, game); toast(`슬롯 ${i + 1}에 저장했습니다.`); } catch { toast('⚠️ 저장 공간이 부족해 저장하지 못했습니다.'); }
      } })
      : el('button', { textContent: '불러오기', disabled: !s, onclick: async () => {
        $('#dlg-slots').close();
        const g = structuredClone(s.game);
        g.id = Sess.newId(); // 새 채팅으로 연다
        delete g.createdAt;
        game = S.migrate(g); draft = null; editing = null; closeSuggest();
        await persist();
        show('game');
      } });
    return el('div', { className: 'slot' }, el('span', { className: 'small', textContent: `${i + 1}. ${label}` }), btn);
  }));
  $('#dlg-slots').showModal();
}
$('#btn-export-save').onclick = () => Store.downloadJson(`save-${game.world.id}-day${game.time.day}.json`, game);

// ---------- 세계관 에디터 ----------

let editingId = null;
function openEditor(w) {
  editingId = w?.id ?? null;
  $('#editor-json').value = w ? JSON.stringify(w, null, 2) : '';
  $('#editor-error').textContent = '';
  $('#gen-prompt').value = '';
  $('#dlg-editor').showModal();
}

function validateWorld(w) {
  if (!w || typeof w !== 'object') return 'JSON 객체가 아닙니다.';
  for (const k of ['id', 'name', 'summary', 'modules', 'time', 'goal', 'endings', 'protagonist', 'startLocation', 'places', 'npcs', 'factions']) {
    if (!(k in w)) return `"${k}" 항목이 없습니다.`;
  }
  for (const k of ['places', 'npcs', 'factions', 'endings']) if (!Array.isArray(w[k])) return `"${k}"는 목록이어야 합니다.`;
  const t = w.time ?? {};
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!['startDay', 'startHour', 'defaultMinutes', 'minMinutes', 'maxMinutes'].every((k) => isNum(t[k]))) return 'time에 startDay, startHour, defaultMinutes, minMinutes, maxMinutes 숫자가 모두 있어야 합니다.';
  if (t.startDay < 1 || t.startHour < 0 || t.startHour > 23 || t.minMinutes <= 0 || t.minMinutes > t.maxMinutes || t.defaultMinutes < t.minMinutes || t.defaultMinutes > t.maxMinutes) return 'time 값의 범위가 올바르지 않습니다.';
  if (w.meters !== undefined) {
    if (!Array.isArray(w.meters)) return '"meters"는 목록이어야 합니다.';
    for (const m of w.meters) {
      if (!m || typeof m.id !== 'string' || typeof m.name !== 'string' || !Number.isFinite(Number(m.decayPerHour))) return 'meters 항목에는 id, name, decayPerHour(숫자)가 필요합니다.';
      if (m.levels !== undefined && !Array.isArray(m.levels)) return `meters(${m.name})의 levels는 목록이어야 합니다.`;
    }
  }
  const places = new Set(w.places.map((p) => p.id));
  if (!places.has(w.startLocation)) return 'startLocation이 places에 없습니다.';
  for (const n of w.npcs) {
    if (Number(n.age) < 18) return `${n.name}: NPC는 성인(18세 이상)이어야 합니다.`; // 임시 규칙
    const legacy = n.schedule && S.LEGACY_SLOTS.every((k) => k in n.schedule) && !S.PERIODS.every((p) => p.key in n.schedule);
    const keys = legacy ? S.LEGACY_SLOTS : S.PERIODS.map((p) => p.key);
    for (const k of keys) if (!places.has(n.schedule?.[k])) return `${n.name}의 ${S.PERIODS.find((p) => p.key === k)?.label ?? k} 일과 장소가 places에 없습니다.`;
  }
  return null;
}

$('#btn-editor-cancel').onclick = () => $('#dlg-editor').close('cancel');
$('#gen-prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('#btn-generate').click(); } // Enter가 폼 제출(에디터 닫힘)로 번지지 않게
});
$('#btn-generate').onclick = async (e) => {
  const prompt = $('#gen-prompt').value.trim();
  if (!prompt) return;
  e.target.disabled = true; e.target.textContent = '생성 중…';
  $('#editor-error').textContent = '';
  try {
    const w = await AI.generateWorld(prompt, settings);
    w.id = `custom-${Date.now().toString(36)}`;
    $('#editor-json').value = JSON.stringify(w, null, 2);
  } catch (err) {
    $('#editor-error').textContent = err.message;
  } finally {
    e.target.disabled = false; e.target.textContent = 'AI로 생성';
  }
};

$('#btn-editor-save').onclick = () => {
  let w;
  try { w = JSON.parse($('#editor-json').value); } catch { $('#editor-error').textContent = 'JSON 형식이 올바르지 않습니다.'; return; }
  const err = validateWorld(w);
  if (err) { $('#editor-error').textContent = err; return; }
  if (PRESETS.some((p) => p.id === w.id)) w.id = `${w.id}-copy`;
  if (editingId && editingId !== w.id) Store.deleteWorld(editingId);
  Store.saveWorld(w);
  $('#dlg-editor').close();
  renderTitle();
  toast('세계관을 저장했습니다.');
};

show('title');

// 앱 설치와 오프라인 실행을 위한 서비스 워커
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
