// 게임 상태: 생성, 시간 흐름, AI 결과 반영, 수면, 엔딩.

// 사회적 통념에 따른 시간대. NPC 일과(schedule)도 이 7구간을 키로 쓴다.
export const PERIODS = [
  { key: 'dawn', label: '새벽', from: 0 },
  { key: 'morning', label: '아침', from: 6 },
  { key: 'forenoon', label: '오전', from: 9 },
  { key: 'lunch', label: '점심', from: 12 },
  { key: 'afternoon', label: '오후', from: 13 },
  { key: 'evening', label: '저녁', from: 18 },
  { key: 'night', label: '밤', from: 21 },
];
// 예전 4구간 일과(morning/day/evening/night)로 만든 세계관을 위한 대응표
const LEGACY_SLOT = { dawn: 'night', morning: 'morning', forenoon: 'morning', lunch: 'day', afternoon: 'day', evening: 'evening', night: 'night' };
export const LEGACY_SLOTS = ['morning', 'day', 'evening', 'night'];

export const MAX_REL_STEP = 50; // 한 번에 바뀔 수 있는 관계 수치의 최대폭 (목숨을 구하거나 배신하는 등 결정적 사건)
export const STAMINA = '체력';
const FULL_SLEEP_MINUTES = 6 * 60;
const MAX_REST_MINUTES = 16 * 60;

function period(minute) {
  const h = Math.floor(minute / 60) % 24;
  return PERIODS.findLast((p) => h >= p.from);
}
export const periodKey = (minute) => period(minute).key;
export const periodOf = (minute) => period(minute).label;

// 지금 시각에 NPC가 있는 장소
export function npcPlace(npc, minute) {
  const k = periodKey(minute);
  return npc.schedule?.[k] ?? npc.schedule?.[LEGACY_SLOT[k]];
}

export function timeLabel(time) {
  const h = String(Math.floor(time.minute / 60)).padStart(2, '0');
  const m = String(time.minute % 60).padStart(2, '0');
  return `${time.day}일차 ${h}:${m} (${periodOf(time.minute)})`;
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const relKeys = ['affection', 'trust', 'love'];

// custom.stats: 게임 시작 때 AI가 정한 능력치 (없으면 세계관 기본값)
export function newGame(world, custom) {
  const w = clone(world);
  const p = w.protagonist;
  const npcRelations = {};
  for (const a of w.npcs) {
    npcRelations[a.id] = {};
    for (const b of w.npcs) {
      if (a.id !== b.id) npcRelations[a.id][b.id] = { affection: 0, trust: 0, love: 0, ...(w.npcRelations?.[a.id]?.[b.id] ?? {}) };
    }
  }
  return {
    version: 2,
    world: w,
    player: {
      name: custom.name || p.name,
      personality: custom.personality || p.personality,
      appearance: custom.appearance || p.appearance,
      role: p.role,
      background: p.background,
      stats: w.modules.stats ? { ...(custom.stats ?? p.stats) } : {},
      statMax: w.modules.stats ? { ...(custom.stats ?? p.stats) } : {},
      money: w.modules.economy ? p.money : 0,
      inventory: w.modules.economy ? [...p.inventory] : [],
    },
    time: { day: w.time.startDay, minute: w.time.startHour * 60 },
    location: w.startLocation,
    npcs: Object.fromEntries(w.npcs.map((n) => [n.id, { ...n.relationship, memories: [], memorySummary: '', summarizedCount: 0 }])),
    npcRelations,
    factions: Object.fromEntries(w.factions.map((f) => [f.id, f.standing])),
    flags: { ...(w.initialFlags ?? {}) },
    quests: [],
    goalProgress: 0,
    ending: null,
    story: { summary: '', upTo: 0 },
    log: [{ role: 'system', text: `${w.emoji} ${w.name}\n${w.summary}` }],
    choices: [],
    createdAt: Date.now(),
    // 선택 필드 startChoices가 있으면 오프닝 전에 선택을 기다린다
    ...(w.startChoices?.length ? { pendingStart: true, faction: null } : {}),
    // 선택 필드 meters가 있으면 생존 수치를 만든다
    ...(w.meters?.length ? { meters: initMeters(w) } : {}),
  };
}

// ---------- 선택 필드 meters: 시간이 지나면 앱이 줄이는 수치 (포만감, 수분 등) ----------
// { id, name, start, max(기본 100), decayPerHour, restFactor(잘 때 감소 배율, 기본 0.5), restRecoverPerHour(잘 때 시간당 회복, 기본 0), levels:[{min,label}], restoreWords?, restore? }
const meterMax = (m) => (Number.isFinite(Number(m.max)) && Number(m.max) > 0 ? Number(m.max) : 100);
const round1 = (v) => Math.round(v * 10) / 10;
function initMeters(w) {
  return Object.fromEntries(w.meters.map((m) => [m.id, clamp(num(m.start ?? meterMax(m)), 0, meterMax(m))]));
}

// 값에 맞는 단계 이름. 단계는 min이 큰 것부터 맞는 첫 항목을 쓴다.
export function meterLabel(meter, value) {
  const levels = [...(meter.levels ?? [])].sort((a, b) => b.min - a.min);
  return levels.find((l) => value >= l.min)?.label ?? null;
}

// 화면과 AI 프롬프트가 같이 쓰는 목록
export function meterList(g) {
  return (g.world.meters ?? []).map((m) => {
    const value = round1(g.meters?.[m.id] ?? 0);
    return { id: m.id, name: m.name, value, max: meterMax(m), label: meterLabel(m, value) };
  });
}

function decayMeters(g, minutes, resting) {
  if (!g.meters) return;
  for (const m of g.world.meters ?? []) {
    const factor = resting ? num(m.restFactor ?? 0.5) : 1;
    const recover = resting ? num(m.restRecoverPerHour) : 0;
    const next = num(g.meters[m.id]) + ((recover - num(m.decayPerHour) * factor) * minutes) / 60;
    g.meters[m.id] = round1(clamp(next, 0, meterMax(m)));
  }
}

// 선택 필드 startChoices: 고른 선택지의 시작 장소, 주인공 패치, NPC 관계 패치, 소속 진영을 게임에 적용한다.
export function applyStartChoice(g, choiceId) {
  const c = g.world.startChoices?.find((x) => x.id === choiceId);
  if (!c) return false;
  if (g.world.places.some((p) => p.id === c.startLocation)) g.location = c.startLocation;
  const base = g.world.protagonist;
  for (const [k, v] of Object.entries(c.protagonistPatch ?? {})) {
    if (k === 'stats') {
      if (g.world.modules.stats) { g.player.stats = { ...v }; g.player.statMax = { ...v }; }
    } else if (k === 'inventory' || k === 'money') {
      if (g.world.modules.economy) g.player[k] = Array.isArray(v) ? [...v] : v;
    } else if (['name', 'personality', 'appearance'].includes(k)) {
      if (g.player[k] === base[k]) g.player[k] = v; // 플레이어가 직접 바꾼 값은 유지
    } else {
      g.player[k] = v;
    }
  }
  for (const [id, patch] of Object.entries(c.npcPatch ?? {})) {
    if (g.npcs[id] && patch?.relationship) {
      for (const k of relKeys) if (k in patch.relationship) g.npcs[id][k] = num(patch.relationship[k]);
    }
  }
  g.faction = c.factionId ?? null;
  g.startChoice = c.id;
  g.pendingStart = false;
  return true;
}

// 선택 필드 relationStages: affection 이상인 min 중 가장 큰 단계의 이름. 단계가 없거나 해당 없으면 null.
export function relationStage(world, affection) {
  let best = null;
  for (const s of Array.isArray(world.relationStages) ? world.relationStages : []) {
    if (affection >= s.min && (!best || s.min > best.min)) best = s;
  }
  return best?.name ?? null;
}

export const placeName = (g, id) => g.world.places.find((p) => p.id === id)?.name ?? id;
export const npcById = (g, id) => g.world.npcs.find((n) => n.id === id);

export function npcsHere(g) {
  return g.world.npcs.filter((n) => npcPlace(n, g.time.minute) === g.location);
}

// AI가 정한 경과 시간을 세계관 범위로 제한해 적용한다. 지나간 날 수를 돌려준다.
export function advanceTime(g, minutes, { clampToWorld = true, resting = false } = {}) {
  const t = g.world.time;
  let m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) m = t.defaultMinutes;
  if (clampToWorld) m = clamp(m, t.minMinutes, t.maxMinutes);
  g.time.minute += Math.round(m);
  decayMeters(g, Math.round(m), resting);
  let days = 0;
  while (g.time.minute >= 1440) { g.time.minute -= 1440; g.time.day++; days++; }
  return days;
}

// 수면·휴식: 6시간 이상이면 체력 완전 회복, 짧으면 쉰 시간에 비례해 조금만 회복.
// 세계관의 행동 시간 범위와 관계없이 쉴 수 있다(AI 판단은 최대 16시간, 버튼은 제한 없음). 회복량을 돌려준다.
export function rest(g, minutes, { cap = true } = {}) {
  let m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) m = g.world.time.defaultMinutes;
  if (cap) m = Math.min(m, MAX_REST_MINUTES);
  const days = advanceTime(g, m, { clampToWorld: false, resting: true });
  const max = g.player.statMax?.[STAMINA];
  let gained = 0;
  if (STAMINA in g.player.stats && max != null) {
    const before = g.player.stats[STAMINA];
    g.player.stats[STAMINA] = Math.min(max, before + Math.ceil(max * Math.min(1, m / FULL_SLEEP_MINUTES)));
    gained = g.player.stats[STAMINA] - before;
  }
  return { days, gained };
}

// "다음 날 아침까지 자기": 지금부터 세계관의 시작 시각(아침)까지의 분. 이미 그 시각이면 하룻밤 분량(8시간)만 잔다.
// (예전에는 정확히 그 시각에 누르면 24시간을 잤다.)
export const NIGHT_MINUTES = 8 * 60;
export function minutesUntilMorning(g) {
  const wake = (Number(g.world.time.startHour) || 0) * 60;
  const left = (wake - g.time.minute + 1440) % 1440;
  return left || NIGHT_MINUTES;
}

function applyRel(target, change) {
  for (const k of relKeys) target[k] = clamp(num(target[k]) + clamp(num(change[k]), -MAX_REL_STEP, MAX_REL_STEP), -100, 100);
}

export function applyResult(g, r) {
  if (!r || typeof r !== 'object') return;
  if (r.location && g.world.places.some((p) => p.id === r.location)) g.location = r.location;
  for (const c of arr(r.relationshipChanges)) {
    const s = g.npcs[c?.npc];
    if (!s) continue;
    applyRel(s, c);
    if (c.memory) s.memories.push(`[${g.time.day}일차] ${String(c.memory)}`);
  }
  for (const c of arr(r.npcRelationChanges)) {
    const rel = g.npcRelations?.[c?.from]?.[c?.to];
    if (rel) applyRel(rel, c);
  }
  if (g.world.modules.economy) {
    g.player.money = Math.max(0, g.player.money + num(r.moneyDelta));
    for (const it of arr(r.itemsAdded)) if (it) g.player.inventory.push(String(it));
    for (const it of arr(r.itemsRemoved)) {
      const i = g.player.inventory.indexOf(it);
      if (i >= 0) g.player.inventory.splice(i, 1);
    }
  }
  if (g.world.modules.stats && r.statChanges && typeof r.statChanges === 'object') {
    for (const [k, v] of Object.entries(r.statChanges)) {
      if (!(k in g.player.stats)) continue;
      let next = Math.max(0, g.player.stats[k] + num(v));
      if (k === STAMINA && g.player.statMax?.[k] != null) next = Math.min(g.player.statMax[k], next);
      g.player.stats[k] = next;
    }
  }
  if (g.meters && r.meterChanges && typeof r.meterChanges === 'object' && !Array.isArray(r.meterChanges)) {
    for (const m of g.world.meters ?? []) {
      if (m.id in r.meterChanges) g.meters[m.id] = round1(clamp(num(g.meters[m.id]) + num(r.meterChanges[m.id]), 0, meterMax(m)));
    }
  }
  if (r.factionChanges && typeof r.factionChanges === 'object') {
    for (const [k, v] of Object.entries(r.factionChanges)) {
      if (k in g.factions) g.factions[k] = clamp(g.factions[k] + num(v), -100, 100);
    }
  }
  if (r.flags && typeof r.flags === 'object' && !Array.isArray(r.flags)) Object.assign(g.flags, r.flags);
  for (const q of arr(r.questsAdded)) if (q && !g.quests.some((x) => x.title === q)) g.quests.push({ title: String(q), done: false });
  for (const q of arr(r.questsCompleted)) {
    const found = g.quests.find((x) => x.title === q);
    if (found) found.done = true;
  }
  g.goalProgress = clamp(g.goalProgress + num(r.goalProgressDelta), 0, 100);
  if (Array.isArray(r.choices)) g.choices = r.choices.filter((c) => typeof c === 'string' && c.trim()).slice(0, 4);
  if (r.ending && !g.ending && typeof r.ending === 'object') {
    const known = g.world.endings.find((e) => e.id === r.ending.id);
    g.ending = { id: r.ending.id ?? 'custom', title: r.ending.title || known?.title || '결말', description: r.ending.description || known?.description || '' };
  }
}

const arr = (v) => (Array.isArray(v) ? v : []);

// ---------- 체크포인트: 한 턴을 시작하기 전의 상태 ----------
// 마지막 답변 다시 생성, 마지막 메시지 수정은 "그 턴이 없었던 상태"로 되돌린 뒤 다시 실행하는 방식이다.
// 한 턴이 관계, 수치, 시간, 플래그, 세력, 퀘스트, 요약 위치까지 바꾸므로 하나씩 되돌리지 않고 통째로 보관한다.
// 최신 턴 하나만 보관한다(마지막 메시지만 고칠 수 있다).
const NOT_STATE = new Set(['world', 'log', 'checkpoint', 'id', 'title', 'createdAt', 'updatedAt']);

// turn: { kind: 'act' | 'continue' | 'skip', text?, skipMinutes? }
export function makeCheckpoint(g, turn) {
  const state = {};
  for (const [k, v] of Object.entries(g)) if (!NOT_STATE.has(k)) state[k] = structuredClone(v);
  return { turn: { kind: turn.kind, text: turn.text ?? '', skipMinutes: turn.skipMinutes ?? null }, logLength: g.log.length, state };
}

// 보관한 상태로 되돌리고 대화 기록도 그 시점까지 자른다. 보관한 게 없으면 false.
export function restoreCheckpoint(g, cp = g.checkpoint) {
  if (!cp?.state || !Number.isInteger(cp.logLength)) return false;
  for (const k of Object.keys(g)) if (!NOT_STATE.has(k) && !(k in cp.state)) delete g[k];
  Object.assign(g, structuredClone(cp.state));
  g.log.length = Math.min(g.log.length, cp.logLength);
  return true;
}

// 다시 생성이나 수정이 실패했을 때 원래 답변으로 돌아가기 위한 전체 복사본(대화 기록과 체크포인트 포함)
export function snapshotAll(g) {
  const { world, ...rest } = g; // 작품 정보는 바뀌지 않으므로 뺀다
  return structuredClone(rest);
}

export function applySnapshot(g, snap) {
  for (const k of Object.keys(g)) if (k !== 'world' && !(k in snap)) delete g[k];
  Object.assign(g, structuredClone(snap));
}

// 마지막 AI 답변을 다시 만들 수 있나: 마지막 턴이 입력(act)이나 이어쓰기(continue)이고 답변이 남아 있을 때.
// 시간 넘기기(skip)는 다시 만들 의미가 없어 제외한다.
export function canRegenerate(g) {
  const cp = g.checkpoint;
  return !!cp && !g.pendingStart && (cp.turn.kind === 'act' || cp.turn.kind === 'continue') && g.log.length > cp.logLength;
}

// 마지막 플레이어 메시지를 고칠 수 있나: 마지막 턴이 입력(act)이고 그 메시지가 남아 있을 때.
export function canEditLast(g) {
  const cp = g.checkpoint;
  return !!cp && !g.pendingStart && cp.turn.kind === 'act' && g.log[cp.logLength]?.role === 'player';
}

// 이전 버전 세이브에 없는 항목을 채운다.
export function migrate(g) {
  if (!g || typeof g !== 'object' || !g.world || !g.player) return g;
  g.story ??= { summary: '', upTo: 0 };
  g.player.statMax ??= { ...(g.player.stats ?? {}) };
  for (const s of Object.values(g.npcs ?? {})) { s.memories ??= []; s.memorySummary ??= ''; s.summarizedCount ??= 0; }
  if (!g.npcRelations) {
    g.npcRelations = {};
    for (const a of g.world.npcs) {
      g.npcRelations[a.id] = {};
      for (const b of g.world.npcs) if (a.id !== b.id) g.npcRelations[a.id][b.id] = { affection: 0, trust: 0, love: 0 };
    }
  }
  if (g.world.meters?.length && !g.meters) g.meters = initMeters(g.world);
  g.version = 2;
  return g;
}
