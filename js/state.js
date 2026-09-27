// 게임 상태: 생성, 시간 흐름, AI 결과 반영, 수면, 엔딩.

// NPC 일과 구간 (세계관 데이터의 schedule 키)
export const SLOTS = { morning: '아침', day: '낮', evening: '저녁', night: '밤' };
export const MAX_REL_STEP = 20; // 한 번의 상호작용으로 바뀔 수 있는 관계 수치의 최대폭
export const STAMINA = '체력';
const FULL_SLEEP_MINUTES = 6 * 60;

export function slotOf(minute) {
  const h = Math.floor(minute / 60) % 24;
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'day';
  if (h >= 18 && h < 21) return 'evening';
  return 'night';
}

// 사회적 통념에 따른 시간대 이름 (화면 표시와 AI 설명용)
export function periodOf(minute) {
  const h = Math.floor(minute / 60) % 24;
  if (h < 6) return '새벽';
  if (h < 9) return '아침';
  if (h < 12) return '오전';
  if (h < 13) return '점심';
  if (h < 18) return '오후';
  if (h < 21) return '저녁';
  return '밤';
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
      stats: w.modules.stats ? { ...p.stats } : {},
      statMax: w.modules.stats ? { ...p.stats } : {},
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
  const slot = slotOf(g.time.minute);
  return g.world.npcs.filter((n) => n.schedule[slot] === g.location);
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

// 수면: 6시간 이상 자면 체력 완전 회복, 그보다 짧으면 잔 시간에 비례해 회복.
export function sleep(g, minutes) {
  const days = advanceTime(g, minutes, { clampToWorld: false });
  const max = g.player.statMax?.[STAMINA];
  if (STAMINA in g.player.stats && max != null) {
    const gain = Math.ceil(max * Math.min(1, minutes / FULL_SLEEP_MINUTES));
    g.player.stats[STAMINA] = Math.min(max, g.player.stats[STAMINA] + gain);
  }
  return days;
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
