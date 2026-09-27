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
    flags: {},
    quests: [],
    goalProgress: 0,
    ending: null,
    story: { summary: '', upTo: 0 },
    log: [{ role: 'system', text: `${w.emoji} ${w.name}\n${w.summary}` }],
    choices: [],
    createdAt: Date.now(),
  };
}

export const placeName = (g, id) => g.world.places.find((p) => p.id === id)?.name ?? id;
export const npcById = (g, id) => g.world.npcs.find((n) => n.id === id);

export function npcsHere(g) {
  return g.world.npcs.filter((n) => npcPlace(n, g.time.minute) === g.location);
}

// AI가 정한 경과 시간을 세계관 범위로 제한해 적용한다. 지나간 날 수를 돌려준다.
export function advanceTime(g, minutes, { clampToWorld = true } = {}) {
  const t = g.world.time;
  let m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) m = t.defaultMinutes;
  if (clampToWorld) m = clamp(m, t.minMinutes, t.maxMinutes);
  g.time.minute += Math.round(m);
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
  const days = advanceTime(g, m, { clampToWorld: false });
  const max = g.player.statMax?.[STAMINA];
  let gained = 0;
  if (STAMINA in g.player.stats && max != null) {
    const before = g.player.stats[STAMINA];
    g.player.stats[STAMINA] = Math.min(max, before + Math.ceil(max * Math.min(1, m / FULL_SLEEP_MINUTES)));
    gained = g.player.stats[STAMINA] - before;
  }
  return { days, gained };
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
  g.version = 2;
  return g;
}
