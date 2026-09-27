import { PRESETS } from './presets.js';
import * as S from './state.js';
import * as AI from './ai.js';
import * as Store from './storage.js';

const modelSelect = document.querySelector('#settings-form [name=model]');
modelSelect.append(...AI.MODELS.map((m) => Object.assign(document.createElement('option'), { value: m.id, textContent: m.label })));

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.filter((k) => k != null));
  return e;
};

let settings = Store.loadSettings();
let game = null;
let pendingWorld = null;
let busy = false;
let tab = 'me';

// ---------- 화면 전환 ----------

function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== `screen-${name}`;
  if (name === 'title') renderTitle();
  if (name === 'game') renderGame();
}
document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => show(b.dataset.goto)));

function autosave() {
  if (!Store.autosave(game)) toast('⚠️ 브라우저 저장 공간이 부족해 자동 저장하지 못했습니다. 파일로 내보내 두세요.');
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2500);
}

// ---------- 타이틀 ----------

function worldCard(w, { editable } = {}) {
  const tags = [w.modules.economy && '💰 경제', w.modules.stats && '📊 능력치', `📅 ${w.goal.days}일`].filter(Boolean).join(' · ');
  const actions = el('div', { className: 'row' },
    el('button', { className: 'primary', textContent: '플레이', onclick: () => openSetup(w) }),
    el('button', { textContent: editable ? '수정' : '복사해서 수정', onclick: () => openEditor(editable ? w : { ...structuredClone(w), id: `${w.id}-copy-${Date.now().toString(36)}`, name: `${w.name} (사본)` }) }),
    editable ? el('button', { textContent: '📤', title: '파일로 내보내기', onclick: () => Store.downloadJson(`world-${w.id}.json`, w) }) : null,
    editable ? el('button', { textContent: '🗑️', title: '삭제', onclick: () => { if (confirm(`"${w.name}"을(를) 삭제할까요?`)) { Store.deleteWorld(w.id); renderTitle(); } } }) : null,
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
  $('#btn-continue').disabled = !Store.loadAutosave();
  $('#mode-note').textContent = settings.apiKey
    ? `AI 연결됨 (${settings.model === 'auto' ? '모델 자동 선택' : settings.model})${settings.adultMode ? ' · 성인 모드' : ''}`
    : '테스트 모드: API 키 없이 미리 짜둔 반응으로 플레이합니다. 설정에서 Gemini API 키를 넣으면 AI가 이야기를 만듭니다.';
}

$('#btn-continue').onclick = () => { const g = Store.loadAutosave(); if (g) { game = S.migrate(g); show('game'); } };
$('#btn-open-settings').onclick = openSettings;
$('#btn-open-slots').onclick = () => openSlots('load');
$('#btn-new-world').onclick = () => openEditor(null);

$('#file-import-save').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const g = await Store.readJsonFile(f);
    if (!g?.world || !g?.player) throw new Error();
    game = S.migrate(g); autosave(); show('game');
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

$('#setup-form').onsubmit = (e) => {
  e.preventDefault();
  const f = e.target;
  game = S.newGame(pendingWorld, { name: f.name.value.trim(), personality: f.personality.value.trim(), appearance: f.appearance.value.trim() });
  game.log.push({ role: 'system', text: `${S.timeLabel(game.time)} · ${S.placeName(game, game.location)}에서 이야기가 시작됩니다.` });
  game.choices = ['주변을 둘러본다', ...S.npcsHere(game).slice(0, 2).map((n) => `${n.name}에게 인사한다`)];
  autosave();
  show('game');
};

// ---------- 게임 ----------

function renderGame() {
  $('#g-world').textContent = `${game.world.emoji || '🌍'} ${game.world.name}`;
  $('#g-time').textContent = `${S.timeLabel(game.time)} · 📍 ${S.placeName(game, game.location)}`;
  const log = $('#log');
  log.replaceChildren(...game.log.map((m) => el('div', { className: `msg ${m.role}`, textContent: m.text })));
  log.scrollTop = log.scrollHeight;
  $('#choices').replaceChildren(...game.choices.map((c) => el('button', { textContent: `▸ ${c}`, onclick: () => act(c) })));
  for (const b of document.querySelectorAll('#screen-game button, #action-input')) {
    if (!b.closest('.tabs') && !b.closest('.topbar')) b.disabled = busy;
  }
  $('#status').hidden = !busy;
  $('#status').textContent = '이야기를 만드는 중…';
  renderTab();
}

async function act(text, { skipMinutes, sleeping = false } = {}) {
  if (busy || !text) return;
  busy = true;
  game.log.push({ role: 'player', text });
  renderGame();
  const hadEnding = game.ending;
  try {
    let days = 0;
    if (skipMinutes != null) {
      days = sleeping ? S.sleep(game, skipMinutes) : S.advanceTime(game, skipMinutes, { clampToWorld: false });
      if (sleeping && S.STAMINA in game.player.stats) game.log.push({ role: 'system', text: `잠을 자고 ${S.STAMINA}이(가) 회복되었다. (${game.player.stats[S.STAMINA]}/${game.player.statMax[S.STAMINA]})` });
      game.log.push({ role: 'system', text: `시간이 흘렀다. ${S.timeLabel(game.time)}` });
      game.choices = defaultChoices();
    } else {
      const r = await AI.gmTurn(game, text, settings);
      game.log.push({ role: 'gm', text: r.narration ?? '' });
      S.applyResult(game, r);
      days = S.advanceTime(game, r.minutes);
    }
    if (days > 0) await endOfDay(days);
    if (!hadEnding && game.ending) game.log.push({ role: 'system', text: `🏁 엔딩: ${game.ending.title}\n${game.ending.description}\n\n엔딩 이후에도 계속 플레이할 수 있습니다.` });
    await AI.summarize(game, settings).catch(() => {}); // 요약 실패는 다음 턴에 다시 시도
  } catch (err) {
    game.log.pop(); // 실패한 행동은 기록에서 뺀다
    game.log.push({ role: 'error', text: `⚠️ ${err.message}` });
    $('#action-input').value = text;
  } finally {
    busy = false;
    autosave();
    renderGame();
  }
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

$('#action-form').onsubmit = (e) => {
  e.preventDefault();
  const v = $('#action-input').value.trim();
  $('#action-input').value = '';
  act(v);
};
document.querySelectorAll('[data-skip]').forEach((b) => b.addEventListener('click', () => {
  const v = b.dataset.skip;
  if (v === 'sleep') {
    const target = 1440 - game.time.minute + game.world.time.startHour * 60;
    act('잠자리에 든다', { skipMinutes: target % 1440 || 1440, sleeping: true });
  } else act(`${Number(v) / 60}시간을 보낸다`, { skipMinutes: Number(v) });
}));
$('#btn-save').onclick = () => openSlots('save');
$('#btn-settings-2').onclick = openSettings;
$('#btn-to-title').onclick = () => { autosave(); show('title'); };

// ---------- 사이드 패널 ----------

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  renderTab();
});

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
      g.world.modules.stats ? el('div', { className: 'kv' }, ...Object.entries(g.player.stats).flatMap(([k, v]) => [el('span', { textContent: k }), el('b', { textContent: v })])) : null,
      g.world.modules.economy ? el('div', { textContent: `💰 ${g.player.money.toLocaleString()} ${g.world.currency}` }) : null,
    ],
    people: () => g.world.npcs.map((n) => {
      const s = g.npcs[n.id];
      const where = S.placeName(g, n.schedule[S.slotOf(g.time.minute)]);
      const here = n.schedule[S.slotOf(g.time.minute)] === g.location;
      return el('div', { className: `item${here ? ' here' : ''}` },
        el('b', { textContent: `${n.name} (${n.role})` }),
        el('div', { className: 'small muted', textContent: `📍 ${where}${here ? ' · 여기 있음' : ''}` }),
        meter('호감', s.affection), meter('신뢰', s.trust), meter('애정', s.love),
        s.memories.length ? el('details', {}, el('summary', { className: 'small', textContent: `기억 ${s.memories.length}개` }), ...s.memories.map((m) => el('div', { className: 'small', textContent: m }))) : null,
        npcRelText(n.id) ? el('div', { className: 'small muted', textContent: npcRelText(n.id) }) : null,
        here ? el('button', { textContent: '💬 말 걸기', disabled: busy, onclick: () => act(`${n.name}에게 말을 건다`) }) : null);
    }),
    map: () => g.world.places.map((p) => {
      const here = p.id === g.location;
      const who = g.world.npcs.filter((n) => n.schedule[S.slotOf(g.time.minute)] === p.id).map((n) => n.name).join(', ');
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
      el('div', { className: 'small muted', textContent: `기준 기간: ${g.world.goal.days}일 (현재 ${g.time.day}일차)${g.ending ? ` · 달성한 엔딩: ${g.ending.title}` : ''}` }),
      el('b', { textContent: '서브 퀘스트' }),
      ...(g.quests.length ? g.quests.map((q) => el('div', { className: 'small', textContent: `${q.done ? '✅' : '⬜'} ${q.title}` })) : [el('div', { className: 'small muted', textContent: '없음' })]),
    ],
    world: () => [
      el('b', { textContent: '세력 평판' }),
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
  $('#dlg-settings').showModal();
}
$('#settings-form').adultMode.addEventListener('change', (e) => {
  if (e.target.checked && !confirm('성인 모드는 성인만 사용할 수 있습니다. 만 19세 이상입니까?')) e.target.checked = false;
});
$('#dlg-settings').addEventListener('close', () => {
  if ($('#dlg-settings').returnValue !== 'ok') return;
  const f = $('#settings-form');
  if (f.apiKey.value.trim() !== settings.apiKey) AI.resetCooldowns(); // 새 키는 한도가 따로다
  settings = { apiKey: f.apiKey.value.trim(), model: f.model.value || Store.DEFAULT_SETTINGS.model, responseLength: f.responseLength.value, adultMode: f.adultMode.checked };
  Store.saveSettings(settings);
  toast('설정을 저장했습니다.');
  if (!$('#screen-title').hidden) renderTitle();
});

// ---------- 세이브 슬롯 ----------

function openSlots(mode) {
  $('#slots-title').textContent = mode === 'save' ? '저장할 슬롯 선택' : '불러올 슬롯 선택';
  $('#btn-export-save').hidden = mode !== 'save';
  const slots = Store.listSlots();
  $('#slot-list').replaceChildren(...slots.map((s, i) => {
    const label = s ? `${s.game.world.emoji || ''} ${s.game.world.name} · ${s.game.player.name} · ${S.timeLabel(s.game.time)}` : '빈 슬롯';
    const btn = mode === 'save'
      ? el('button', { textContent: '저장', onclick: () => { toast(Store.saveSlot(i, game) ? `슬롯 ${i + 1}에 저장했습니다.` : '⚠️ 저장 공간이 부족해 저장하지 못했습니다.'); $('#dlg-slots').close(); } })
      : el('button', { textContent: '불러오기', disabled: !s, onclick: () => { game = S.migrate(structuredClone(s.game)); autosave(); $('#dlg-slots').close(); show('game'); } });
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
  const places = new Set(w.places.map((p) => p.id));
  if (!places.has(w.startLocation)) return 'startLocation이 places에 없습니다.';
  for (const n of w.npcs) {
    if (Number(n.age) < 18) return `${n.name}: NPC는 성인(18세 이상)이어야 합니다.`; // 임시 규칙
    for (const slot of Object.keys(S.SLOTS)) if (!places.has(n.schedule?.[slot])) return `${n.name}의 ${S.SLOTS[slot]} 일과 장소가 places에 없습니다.`;
  }
  return null;
}

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
    e.target.disabled = false; e.target.textContent = '✨ 생성';
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
