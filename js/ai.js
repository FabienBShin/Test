// AI 게임 마스터. 제공자(provider)를 분리해 두어 나중에 다른 AI를 추가할 수 있다.
import { npcPlace, timeLabel, placeName, npcsHere, STAMINA, PERIODS } from './state.js';

// ---------- 모델 ----------

export const MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
];

// 작업 종류별 모델 순서. 이야기 진행은 상위 모델부터, 요약처럼 부담 없는 작업은 가벼운 모델부터 써서
// 상위 모델의 무료 한도를 이야기 진행에 아껴 둔다. 한도를 넘으면 다음 모델로 넘어간다.
export const CHAINS = {
  story: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'],
  daily: ['gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-2.5-pro', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'],
  summary: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-2.5-pro'],
};

const cooldown = new Map(); // 모델 id → 다시 써볼 수 있는 시각(ms)
export const aiStatus = { lastModel: null };
export function resetCooldowns() { cooldown.clear(); }

export function modelOrder(settings, task, now = Date.now()) {
  let chain = CHAINS[task] ?? CHAINS.story;
  if (settings.model && settings.model !== 'auto') chain = [settings.model, ...chain.filter((m) => m !== settings.model)];
  const ready = chain.filter((m) => (cooldown.get(m) ?? 0) <= now);
  return ready;
}

// ---------- 프롬프트 ----------

const LENGTH_GUIDE = {
  short: '2~3문장으로 짧게',
  normal: '한 문단(4~6문장) 정도로',
  long: '두세 문단으로 풍부하게',
};

const SAFETY_RULE = '절대 규칙: 미성년자(18세 미만)이거나 미성년자로 보이는 인물이 등장하는 성적 콘텐츠는 어떤 경우에도 만들지 않는다. 요청받으면 이야기 안에서 자연스럽게 다른 방향으로 돌린다.';

const RELATIONSHIP_RULE = `관계 수치(-100~100) 변화 규칙: 실제 사람이 상대를 대할 때처럼 판단한다.
- 호감: 즐겁거나 배려받은 경험에 오르고 무례, 불쾌한 경험에 내린다. 평범한 대화는 0~2, 인상적인 일은 3~8.
- 신뢰: 약속을 지키고 말과 행동이 일치할 때 천천히(1~3) 쌓이고, 거짓말과 배신에는 크게(-10~-20) 무너진다.
- 애정: 호감과 신뢰가 충분히 쌓인 뒤에야 조금씩 오른다. 첫 만남에서 급격히 오르지 않는다.
- 성격에 따라 반응이 다르다(예: 의심 많은 인물은 신뢰가 더 느리게 쌓인다). 같은 행동을 반복하면 효과가 줄어든다.
- 중요한 사건(위기에서 도와줌, 큰 거짓말이 들킴)은 10~20.
- 목숨을 구하거나 배신하는 등 관계를 뒤흔드는 결정적 사건은 한 번에 최대 ±50까지 바뀐다.
- NPC끼리의 관계도 같은 규칙으로 바뀐다(npcRelationChanges).`;

const STATS_RULE = `능력치 반영 규칙: 플레이어 능력치가 이야기와 대화의 결과와 디테일을 바꾼다.
- 행동과 관련된 능력치가 높으면 성공하기 쉽고, 더 많은 정보, 숨은 단서, 인물의 속마음을 알아챈다. 낮으면 실패하거나 놓치는 것이 생긴다.
- 대화에서도 능력치에 맞게 NPC의 반응과 묘사의 깊이를 바꾼다(예: 매력이 높으면 상대가 더 마음을 연다).
- 행동으로 능력치가 조금씩 성장하거나 줄 수 있다. 힘든 활동은 ${STAMINA}을(를) 소모한다. ${STAMINA}이(가) 낮으면 행동에 지장이 생긴다.`;

function contentRule(settings) {
  return settings.adultMode
    ? '성인 모드: 플레이어는 성인 확인을 마쳤다. 폭력, 잔혹함, 성적 묘사 등 성인 콘텐츠를 이야기에 맞게 제한 없이 다룬다.'
    : '일반 모드: 노골적인 성적 묘사와 과도한 잔혹 묘사는 암시로만 처리한다.';
}

// 이번 요청에 깊게 관련된 NPC: 같은 장소에 있거나, 행동이나 최근 대화에 이름이 나온 인물
function focusNpcIds(g, text) {
  const ids = new Set(npcsHere(g).map((n) => n.id));
  const recent = g.log.slice(-4).map((l) => l.text).join(' ') + ' ' + (text ?? '');
  for (const n of g.world.npcs) if (recent.includes(n.name)) ids.add(n.id);
  return ids;
}

function npcRelationBrief(g) {
  const names = Object.fromEntries(g.world.npcs.map((n) => [n.id, n.name]));
  const lines = [];
  for (const [a, row] of Object.entries(g.npcRelations ?? {})) {
    for (const [b, r] of Object.entries(row)) {
      if (r.affection || r.trust || r.love) lines.push(`${names[a]}→${names[b]} 호감${r.affection} 신뢰${r.trust} 애정${r.love}`);
    }
  }
  return lines.join('; ') || '아직 특별한 관계 없음(모두 0)';
}

export function worldBrief(g, focusText) {
  const w = g.world;
  const focus = focusNpcIds(g, focusText);
  const npcs = w.npcs.map((n) => {
    const s = g.npcs[n.id];
    const recent = s.memories.slice(s.summarizedCount);
    const mem = focus.has(n.id)
      ? [s.memorySummary && `요약: ${s.memorySummary}`, recent.length && `최근: ${recent.join(' / ')}`].filter(Boolean).join(' | ')
      : [s.memorySummary, recent.slice(-2).join(' / ')].filter(Boolean).join(' | ');
    return `- ${n.id} | ${n.name}(${n.age}세, ${n.role}) 성격:${n.personality}. 현재 위치:${placeName(g, npcPlace(n, g.time.minute))}. 플레이어에 대한 호감${s.affection} 신뢰${s.trust} 애정${s.love}. 플레이어와의 기억: ${mem || '없음'}`;
  }).join('\n');
  const overdue = g.time.day > w.goal.days;
  return [
    `세계관: ${w.name} — ${w.summary} (분위기: ${w.tone})`,
    `메인 목표: ${w.goal.title} — ${w.goal.description} (진행도 ${g.goalProgress}/100, 기준 기간 ${w.goal.days}일${overdue ? ', 기준 기간 지남' : ''})`,
    `엔딩 후보: ${w.endings.map((e) => `${e.id}=${e.title}`).join(', ')}${g.ending ? ` (이미 도달한 엔딩: ${g.ending.title}, 이후 자유 플레이 중)` : ''}`,
    `장소: ${w.places.map((p) => `${p.id}=${p.name}`).join(', ')}`,
    `세력: ${w.factions.map((f) => `${f.id}=${f.name}(평판 ${g.factions[f.id]})`).join(', ')}`,
    `NPC:\n${npcs}`,
    `NPC 사이 관계: ${npcRelationBrief(g)}`,
    `플레이어: ${g.player.name} (${g.player.role}). 성격: ${g.player.personality}. 외모: ${g.player.appearance}. 배경: ${g.player.background}`,
    w.modules.stats ? `능력치: ${JSON.stringify(g.player.stats)} (최대 ${STAMINA}: ${g.player.statMax?.[STAMINA] ?? '없음'})` : '',
    w.modules.economy ? `소지금: ${g.player.money}${w.currency}, 소지품: ${g.player.inventory.join(', ') || '없음'}` : '',
    `현재: ${timeLabel(g.time)}, 위치 ${placeName(g, g.location)}, 여기 있는 인물: ${npcsHere(g).map((n) => n.name).join(', ') || '없음'}`,
    `진행 중 퀘스트: ${g.quests.filter((q) => !q.done).map((q) => q.title).join(', ') || '없음'}`,
    `플래그: ${JSON.stringify(g.flags)}`,
  ].filter(Boolean).join('\n');
}

const GOAL_RULE = `목표 진행도 규칙: 플레이어 행동이 메인 목표에 실제로 얼마나 기여했는지로 goalProgressDelta를 정한다.
관계없는 행동은 0, 작은 기여는 1~3, 중요한 진전은 5~15, 목표를 방해하면 음수.`;

const ENDING_RULE = `엔딩 규칙: 엔딩은 기간이 아니라 이야기 상황으로 판단한다.
- 목표를 이뤘거나(진행도 100 근처), 되돌릴 수 없게 실패했거나, 이야기가 자연스럽게 결말에 이르렀을 때 "ending"을 넣는다.
- 기준 기간은 세계관에 따라 중요할 수도, 아닐 수도 있다. 기한이 핵심인 목표(예: 축제 날짜)라면 기간이 지났을 때 결말을 내고, 그렇지 않다면 계속 진행한다.
- 이미 엔딩에 도달했다면 다시 넣지 않는다.`;

function turnSchema(g) {
  const t = g.world.time;
  return `다음 JSON 형식으로만 답한다:
{
 "narration": "상황 묘사와 NPC 대사 (한국어)",
 "minutes": 이 행동에 걸린 시간(분, ${t.minMinutes}~${t.maxMinutes}, 보통 ${t.defaultMinutes}. 잠이나 휴식은 실제로 쉰 시간, 최대 960),
 "resting": 이 행동이 잠이나 휴식이면 true (${STAMINA} 회복), 아니면 생략,
 "location": "이동했다면 장소 id, 아니면 생략",
 "relationshipChanges": [{"npc":"npc id","affection":0,"trust":0,"love":0,"memory":"이 NPC가 기억할 이번 상호작용 한 줄(구체적으로)"}],
 "npcRelationChanges": [{"from":"npc id","to":"npc id","affection":0,"trust":0,"love":0}],
 ${g.world.modules.economy ? '"moneyDelta": 숫자, "itemsAdded": [], "itemsRemoved": [],' : ''}
 ${g.world.modules.stats ? '"statChanges": {"능력치 이름": 변화량},' : ''}
 "factionChanges": {"세력 id": 변화량},
 "flags": {"키": 값},
 "questsAdded": ["새 서브 퀘스트"], "questsCompleted": ["완료된 퀘스트 제목"],
 "goalProgressDelta": 숫자,
 "ending": {"id":"엔딩 id","title":"","description":"결말 묘사"} 또는 생략,
 "choices": ["다음 행동 선택지 3~4개"]
}`;
}

function storyContext(g) {
  const recent = g.log.slice(g.story?.upTo ?? 0).filter((l) => l.role !== 'error')
    .map((l) => `${l.role === 'player' ? '플레이어' : l.role === 'gm' ? 'GM' : '알림'}: ${l.text}`).join('\n');
  return `${g.story?.summary ? `지금까지의 줄거리 요약:\n${g.story.summary}\n\n` : ''}최근 진행:\n${recent}`;
}

export async function gmTurn(g, actionText, settings) {
  if (!settings.apiKey) return mockTurn(g, actionText);
  const system = [
    '너는 시뮬레이션 RP 게임의 게임 마스터다. 세계관의 뼈대(장소, 인물, 세력)를 지키면서 플레이어 행동에 반응한다. 지난 줄거리와 인물의 기억에 나온 세부 사항(약속, 이름, 물건, 사건)을 일관되게 이어간다.',
    `묘사는 ${LENGTH_GUIDE[settings.responseLength] ?? LENGTH_GUIDE.normal} 쓴다. 플레이어의 성격을 묘사에 반영한다.`,
    RELATIONSHIP_RULE, g.world.modules.stats ? STATS_RULE : '', GOAL_RULE, ENDING_RULE,
    contentRule(settings), SAFETY_RULE,
    worldBrief(g, actionText), turnSchema(g),
  ].filter(Boolean).join('\n\n');
  return callGemini(settings, 'story', system, `${storyContext(g)}\n\n플레이어 행동: ${actionText}`);
}

export async function dailyEvents(g, settings) {
  if (!settings.apiKey) return mockDaily(g);
  const system = [
    '너는 시뮬레이션 RP 게임의 세계 시뮬레이터다. 하루가 끝났다. 플레이어가 보지 못한 곳에서 NPC들 사이에 일어난 일과 세계의 변화를 1~3개 만든다. 각 NPC의 성격, 일과, 서로의 관계를 바탕으로 개연성 있게 만든다.',
    RELATIONSHIP_RULE, contentRule(settings), SAFETY_RULE, worldBrief(g, ''),
    '다음 JSON으로만 답한다: {"news":["플레이어가 듣게 되는 소문/소식 한 줄"],"npcRelationChanges":[{"from":"npc id","to":"npc id","affection":0,"trust":0,"love":0}],"factionChanges":{"세력 id":변화량},"flags":{},"questsAdded":[]}',
  ].join('\n\n');
  return callGemini(settings, 'daily', system, `${g.story?.summary ? `줄거리 요약:\n${g.story.summary}\n\n` : ''}오늘 하루 동안 생긴 일을 만들어라.`);
}

// ---------- 요약 (토큰 절약 + 디테일 보존) ----------

export const SUMMARY = { logTrigger: 30, keepRecent: 12, memTrigger: 15, memKeep: 5 };

export function needsSummary(g) {
  const logOver = g.log.length - (g.story?.upTo ?? 0) > SUMMARY.logTrigger;
  const memOver = Object.values(g.npcs).some((s) => s.memories.length - s.summarizedCount > SUMMARY.memTrigger);
  return logOver || memOver;
}

// 오래된 대화와 기억을 요약에 합친다. 원본 대화 기록과 원본 기억은 지우지 않는다.
export async function summarize(g, settings) {
  if (!needsSummary(g)) return false;
  const upTo = g.story.upTo;
  const logEnd = Math.max(upTo, g.log.length - SUMMARY.keepRecent);
  const chunk = g.log.slice(upTo, logEnd).filter((l) => l.role !== 'error').map((l) => `${l.role}: ${l.text}`).join('\n');
  const memJobs = {};
  for (const n of g.world.npcs) {
    const s = g.npcs[n.id];
    const end = s.memories.length - SUMMARY.memKeep;
    if (s.memories.length - s.summarizedCount > SUMMARY.memTrigger) memJobs[n.id] = { name: n.name, prev: s.memorySummary, add: s.memories.slice(s.summarizedCount, end), end };
  }
  let r;
  if (!settings.apiKey) {
    r = { story: [g.story.summary, chunk].filter(Boolean).join('\n'), npcs: Object.fromEntries(Object.entries(memJobs).map(([id, j]) => [id, [j.prev, ...j.add].filter(Boolean).join(' / ')])) };
  } else {
    const system = [
      '너는 RP 게임의 기록 담당이다. 이전 요약에 새 내용을 합쳐 더 짧게 정리한다.',
      '반드시 보존: 인물 이름, 약속과 거짓말, 주고받은 물건, 돈, 장소, 비밀, 감정의 변화와 그 이유, 해결되지 않은 일. 잡담과 반복은 뺀다.',
      '다음 JSON으로만 답한다: {"story":"전체 줄거리 요약","npcs":{"npc id":"이 인물이 플레이어와 겪은 일의 요약"}}',
    ].join('\n');
    const user = JSON.stringify({ previousStory: g.story.summary, newLog: chunk, npcMemories: memJobs });
    r = await callGemini(settings, 'summary', system, user);
  }
  if (typeof r?.story === 'string' && r.story.trim()) { g.story.summary = r.story; g.story.upTo = logEnd; }
  for (const [id, j] of Object.entries(memJobs)) {
    const text = r?.npcs?.[id];
    if (typeof text === 'string' && text.trim()) { g.npcs[id].memorySummary = text; g.npcs[id].summarizedCount = j.end; }
  }
  return true;
}

// ---------- 시작 능력치 ----------

// 게임 시작 때 주인공의 성격·외모·배경을 보고 능력치 값을 정한다. 능력치 종류는 세계관 것을 그대로 쓴다.
export async function decideStats(world, player, settings) {
  const base = world.protagonist.stats;
  const system = [
    '너는 RP 게임의 캐릭터 설계자다. 주인공의 성격, 외모, 배경에 맞게 능력치 값을 정한다.',
    `능력치 종류는 바꾸지 않는다: ${Object.keys(base).join(', ')}. 기준값: ${JSON.stringify(base)}.`,
    '성격에서 드러나는 강점은 기준보다 높게, 약점은 낮게 정하되 전체 합은 기준 합과 비슷하게 한다. 모든 값은 1 이상의 정수.',
    '다음 JSON으로만 답한다: {"stats":{"능력치 이름":값},"reason":"이렇게 정한 이유 한 줄"}',
  ].join('\n');
  const user = `세계관: ${world.name} — ${world.summary}\n역할: ${world.protagonist.role}\n배경: ${world.protagonist.background}\n이름: ${player.name}\n성격: ${player.personality}\n외모: ${player.appearance}`;
  const r = await callGemini(settings, 'story', system, user);
  const stats = {};
  for (const [k, v] of Object.entries(base)) {
    const n = Math.round(Number(r?.stats?.[k]));
    stats[k] = Number.isFinite(n) ? Math.max(1, Math.min(n, Math.max(10, v * 3))) : v;
  }
  return { stats, reason: typeof r?.reason === 'string' ? r.reason : '' };
}

// ---------- 세계관 생성 ----------

export async function generateWorld(prompt, settings) {
  if (!settings.apiKey) throw new AiError('need_key', '세계관 자동 생성은 API 키가 필요합니다.');
  const system = [
    '너는 시뮬레이션 RP 게임의 세계관 설계자다. 한 줄 설명을 받아 세계관 JSON을 만든다.',
    'NPC는 모두 성인(18세 이상)으로 만든다. 장소 4~6개, NPC 3~5명, 세력 2~3개.',
    `능력치 모듈을 켜면 주인공 능력치 3~5개를 세계관에 맞게 정하고, 그중 하나는 반드시 "${STAMINA}"로 한다.`,
    'goal.days는 목표의 기준 기간이다. 시간 흐름 단위(time)는 세계관의 활동 단위에 맞게 정한다.',
    `NPC 일과(schedule)는 시간대 ${PERIODS.map((p) => `${p.key}=${p.label}(${p.from}시~)`).join(', ')}마다 있을 장소 id다.`,
    'npcRelations에는 NPC끼리의 초기 관계를 넣는다: {"npc id":{"다른 npc id":{"affection":0,"trust":0,"love":0}}}',
    '형식은 아래 예시와 같은 키를 그대로 사용한다. id는 영문 소문자.',
    JSON.stringify(EXAMPLE_SHAPE),
  ].join('\n\n');
  return callGemini(settings, 'story', system, prompt);
}

const EXAMPLE_SHAPE = {
  id: 'custom-id', emoji: '🌍', name: '이름', summary: '요약', tone: '분위기',
  modules: { economy: true, stats: true }, currency: '화폐',
  time: { startDay: 1, startHour: 8, defaultMinutes: 60, minMinutes: 10, maxMinutes: 480 },
  goal: { title: '목표', description: '설명', days: 30 },
  endings: [{ id: 'good', title: '', description: '' }, { id: 'normal', title: '', description: '' }, { id: 'bad', title: '', description: '' }],
  protagonist: { role: '', background: '', name: '', personality: '', appearance: '', stats: { [STAMINA]: 10, 능력치: 3 }, money: 0, inventory: [] },
  startLocation: 'place-id',
  places: [{ id: 'place-id', name: '', description: '' }],
  npcs: [{ id: 'npc-id', name: '', age: 25, role: '', personality: '', description: '',
    schedule: Object.fromEntries(PERIODS.map((p) => [p.key, 'place-id'])),
    relationship: { affection: 0, trust: 0, love: 0 } }],
  npcRelations: {},
  factions: [{ id: 'faction-id', name: '', description: '', standing: 0 }],
};

// ---------- Gemini 제공자 ----------

export class AiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const SAFETY_CATEGORIES = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'];

export function buildRequest(system, user) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
    // 사용자 결정: 안전 필터는 모드와 관계없이 최하 단계
    safetySettings: SAFETY_CATEGORIES.map((category) => ({ category, threshold: 'BLOCK_NONE' })),
  };
}

function retryDelayMs(data) {
  const info = data?.error?.details?.find((d) => String(d['@type']).includes('RetryInfo'));
  const s = parseFloat(info?.retryDelay);
  return Number.isFinite(s) ? s * 1000 : 60_000;
}

async function callGemini(settings, task, system, user) {
  const order = modelOrder(settings, task);
  if (!order.length) throw new AiError('quota', '모든 모델의 요청 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.');
  const body = JSON.stringify(buildRequest(system, user));
  let lastErr = null;
  for (const model of order) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey }, body });
    } catch {
      throw new AiError('network', '네트워크 오류로 AI에 연결하지 못했습니다.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error?.message ?? String(res.status);
      if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(msg))) {
        throw new AiError('key', `API 키를 확인해 주세요. (${msg})`);
      }
      // 한도 초과, 과부하, 없는 모델 → 다음 모델로
      if (res.status === 429) cooldown.set(model, Date.now() + retryDelayMs(data));
      else if (res.status === 404) cooldown.set(model, Date.now() + 3_600_000);
      else cooldown.set(model, Date.now() + 30_000);
      lastErr = res.status === 429
        ? new AiError('quota', '모든 모델의 요청 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.')
        : new AiError('server', `AI 서버 오류 (${res.status}: ${msg})`);
      continue;
    }
    aiStatus.lastModel = model;
    const cand = data.candidates?.[0];
    if (data.promptFeedback?.blockReason || !cand || cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT') {
      throw new AiError('blocked', '응답이 AI 안전 정책으로 차단되었습니다. 표현을 바꿔 다시 시도해 주세요.');
    }
    const text = (cand.content?.parts ?? []).map((p) => p.text ?? '').join('');
    let parsed;
    try {
      parsed = JSON.parse(text.replace(/^\s*```(json)?|```\s*$/g, '').trim());
    } catch {
      throw new AiError('parse', 'AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new AiError('parse', 'AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.');
    return parsed;
  }
  throw lastErr;
}

// ---------- 테스트 모드 (API 키 없음) ----------

const pick = (a) => a[Math.floor(Math.random() * a.length)];

function mockTurn(g, actionText) {
  const here = npcsHere(g);
  const npc = here.find((n) => actionText.includes(n.name)) ?? here[0];
  const lines = npc
    ? [`${npc.name}이(가) ${g.player.name}을(를) 바라본다. "${pick(['그래서, 무슨 일이야?', '오늘은 좀 한가하네.', '흠, 생각해 볼게.'])}"`]
    : [`${placeName(g, g.location)}에는 아무도 없다. 조용한 공기만 흐른다.`];
  const resting = /잠|잔다|자기|쉰다|쉬기|쉬어|휴식/.test(actionText);
  const delta = pick([0, 1, 2]);
  const reached = !g.ending && g.goalProgress + delta >= 100;
  return {
    narration: `(테스트 모드) ${g.player.name}은(는) "${actionText}" 행동을 했다. ${lines.join(' ')}`,
    minutes: resting ? 120 : g.world.time.defaultMinutes,
    resting: resting || undefined,
    relationshipChanges: npc ? [{ npc: npc.id, affection: pick([1, 2, 3]), trust: pick([0, 1]), love: 0, memory: `${g.player.name}이(가) "${actionText}"라고 했다` }] : [],
    goalProgressDelta: delta,
    ending: reached ? { id: 'good' } : undefined,
    choices: [
      ...here.slice(0, 2).map((n) => `${n.name}에게 말을 건다`),
      '주변을 살펴본다',
      '잠시 쉰다',
    ],
  };
}

function mockDaily(g) {
  const [a, b] = [...g.world.npcs].sort(() => Math.random() - 0.5);
  if (!a) return { news: ['(테스트 모드) 조용한 하루가 지나갔다.'], factionChanges: {} };
  const kind = pick([['크게 다퉜다는', -5], ['함께 술을 마셨다는', 4], ['비밀 이야기를 나눴다는', 3]]);
  return {
    news: [`(테스트 모드) 밤사이 ${a.name}와(과) ${b?.name ?? '누군가'}가 ${kind[0]} 소문이 돈다.`],
    npcRelationChanges: b ? [{ from: a.id, to: b.id, affection: kind[1], trust: Math.sign(kind[1]) }, { from: b.id, to: a.id, affection: kind[1], trust: Math.sign(kind[1]) }] : [],
    factionChanges: {},
  };
}
