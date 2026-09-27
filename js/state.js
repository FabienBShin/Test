// 게임 상태: 생성, 시간 흐름, AI 결과 반영, 목표/엔딩 판정.

export const SLOTS = { morning: '아침', day: '낮', evening: '저녁', night: '밤' };
const MEMORY_LIMIT = 20; // 임시값: NPC별 기억 보관 개수

export function slotOf(minute) {
  const h = Math.floor(minute / 60) % 24;
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'day';
  if (h >= 18 && h < 22) return 'evening';
  return 'night';
}

export function timeLabel(time) {
  const h = String(Math.floor(time.minute / 60)).padStart(2, '0');
  const m = String(time.minute % 60).padStart(2, '0');
  return `${time.day}일차 ${h}:${m} (${SLOTS[slotOf(time.minute)]})`;
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function newGame(world, custom) {
  const w = clone(world);
  const p = w.protagonist;
  return {
    version: 1,
    world: w,
    player: {
      name: custom.name || p.name,
      personality: custom.personality || p.personality,
      appearance: custom.appearance || p.appearance,
      role: p.role,
      background: p.background,
      stats: w.modules.stats ? { ...p.stats } : {},
      money: w.modules.economy ? p.money : 0,
      inventory: w.modules.economy ? [...p.inventory] : [],
    },
    time: { day: w.time.startDay, minute: w.time.startHour * 60 },
    location: w.startLocation,
    npcs: Object.fromEntries(w.npcs.map((n) => [n.id, { ...n.relationship, memories: [] }])),
    factions: Object.fromEntries(w.factions.map((f) => [f.id, f.standing])),
    flags: {},
    quests: [],
    goalProgress: 0,
    ending: null,
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
  let m = Number(minutes) || t.defaultMinutes;
  if (clampToWorld) m = clamp(m, t.minMinutes, t.maxMinutes);
  g.time.minute += Math.round(m);
  let days = 0;
  while (g.time.minute >= 1440) { g.time.minute -= 1440; g.time.day++; days++; }
  return days;
}

export function applyResult(g, r) {
  if (r.location && g.world.places.some((p) => p.id === r.location)) g.location = r.location;
  for (const c of r.relationshipChanges ?? []) {
    const s = g.npcs[c.npc];
    if (!s) continue;
    for (const k of ['affection', 'trust', 'love']) s[k] = clamp(s[k] + (Number(c[k]) || 0), -100, 100);
    if (c.memory) { s.memories.push(`[${g.time.day}일차] ${c.memory}`); s.memories = s.memories.slice(-MEMORY_LIMIT); }
  }
  if (g.world.modules.economy) {
    g.player.money = Math.max(0, g.player.money + (Number(r.moneyDelta) || 0));
    for (const it of r.itemsAdded ?? []) g.player.inventory.push(it);
    for (const it of r.itemsRemoved ?? []) {
      const i = g.player.inventory.indexOf(it);
      if (i >= 0) g.player.inventory.splice(i, 1);
    }
  }
  if (g.world.modules.stats) {
    for (const [k, v] of Object.entries(r.statChanges ?? {})) {
      if (k in g.player.stats) g.player.stats[k] = Math.max(0, g.player.stats[k] + (Number(v) || 0));
    }
  }
  for (const [k, v] of Object.entries(r.factionChanges ?? {})) {
    if (k in g.factions) g.factions[k] = clamp(g.factions[k] + (Number(v) || 0), -100, 100);
  }
  Object.assign(g.flags, r.flags ?? {});
  for (const q of r.questsAdded ?? []) g.quests.push({ title: q, done: false });
  for (const q of r.questsCompleted ?? []) {
    const found = g.quests.find((x) => x.title === q);
    if (found) found.done = true;
  }
  g.goalProgress = clamp(g.goalProgress + (Number(r.goalProgressDelta) || 0), 0, 100);
  g.choices = Array.isArray(r.choices) ? r.choices.slice(0, 4) : [];
}

// 엔딩 판정. 조건은 임시값(OPEN_QUESTIONS.md 참고).
export function checkEnding(g) {
  if (g.ending) return null;
  const deadline = g.world.goal.days;
  let id = null;
  if (g.goalProgress >= 100) id = 'good';
  else if (g.time.day > deadline) id = g.goalProgress >= 50 ? 'normal' : 'bad';
  if (!id) return null;
  g.ending = g.world.endings.find((e) => e.id === id) ?? { id, title: id, description: '' };
  return g.ending;
}
