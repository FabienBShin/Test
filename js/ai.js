// AI 게임 마스터. 제공자(provider)를 분리해 두어 나중에 다른 AI를 추가할 수 있다.
import { slotOf, timeLabel, placeName, npcsHere } from './state.js';

const LENGTH_GUIDE = {
  short: '2~3문장으로 짧게',
  normal: '한 문단(4~6문장) 정도로',
  long: '두세 문단으로 풍부하게',
};

const SAFETY_RULE = '절대 규칙: 미성년자(18세 미만)이거나 미성년자로 보이는 인물이 등장하는 성적 콘텐츠는 어떤 경우에도 만들지 않는다. 요청받으면 이야기 안에서 자연스럽게 다른 방향으로 돌린다.';

function contentRule(settings) {
  return settings.adultMode
    ? '성인 모드: 플레이어는 성인 확인을 마쳤다. 폭력, 잔혹함, 성적 묘사 등 성인 콘텐츠를 이야기에 맞게 제한 없이 다룬다.'
    : '일반 모드: 노골적인 성적 묘사와 과도한 잔혹 묘사는 암시로만 처리한다.';
}

function worldBrief(g) {
  const w = g.world;
  const slot = slotOf(g.time.minute);
  const npcs = w.npcs.map((n) => {
    const s = g.npcs[n.id];
    const mem = s.memories.slice(-5).join(' / ') || '없음';
    return `- ${n.id} | ${n.name}(${n.age}세, ${n.role}) 성격:${n.personality}. 현재 위치:${placeName(g, n.schedule[slot])}. 플레이어에 대한 호감${s.affection} 신뢰${s.trust} 애정${s.love}. 기억: ${mem}`;
  }).join('\n');
  return [
    `세계관: ${w.name} — ${w.summary} (분위기: ${w.tone})`,
    `메인 목표: ${w.goal.title} — ${w.goal.description} (진행도 ${g.goalProgress}/100, 기한 ${w.goal.days}일)`,
    `장소: ${w.places.map((p) => `${p.id}=${p.name}`).join(', ')}`,
    `세력: ${w.factions.map((f) => `${f.id}=${f.name}(평판 ${g.factions[f.id]})`).join(', ')}`,
    `NPC:\n${npcs}`,
    `플레이어: ${g.player.name} (${g.player.role}). 성격: ${g.player.personality}. 외모: ${g.player.appearance}. 배경: ${g.player.background}`,
    w.modules.stats ? `능력치: ${JSON.stringify(g.player.stats)}` : '',
    w.modules.economy ? `소지금: ${g.player.money}${w.currency}, 소지품: ${g.player.inventory.join(', ') || '없음'}` : '',
    `현재: ${timeLabel(g.time)}, 위치 ${placeName(g, g.location)}, 여기 있는 인물: ${npcsHere(g).map((n) => n.name).join(', ') || '없음'}`,
    `진행 중 퀘스트: ${g.quests.filter((q) => !q.done).map((q) => q.title).join(', ') || '없음'}`,
    `플래그: ${JSON.stringify(g.flags)}`,
  ].filter(Boolean).join('\n');
}

function turnSchema(g) {
  const t = g.world.time;
  return `다음 JSON 형식으로만 답한다:
{
 "narration": "상황 묘사와 NPC 대사 (한국어)",
 "minutes": 이 행동에 걸린 시간(분, ${t.minMinutes}~${t.maxMinutes}, 보통 ${t.defaultMinutes}),
 "location": "이동했다면 장소 id, 아니면 생략",
 "relationshipChanges": [{"npc":"npc id","affection":-10~10,"trust":-10~10,"love":-10~10,"memory":"NPC가 기억할 한 줄"}],
 ${g.world.modules.economy ? '"moneyDelta": 숫자, "itemsAdded": [], "itemsRemoved": [],' : ''}
 ${g.world.modules.stats ? '"statChanges": {"능력치 이름": 변화량},' : ''}
 "factionChanges": {"세력 id": 변화량},
 "flags": {"키": 값},
 "questsAdded": ["새 서브 퀘스트"], "questsCompleted": ["완료된 퀘스트 제목"],
 "goalProgressDelta": 0~10,
 "choices": ["다음 행동 선택지 3~4개"]
}`;
}

export async function gmTurn(g, actionText, settings) {
  if (!settings.apiKey) return mockTurn(g, actionText);
  const system = [
    '너는 시뮬레이션 RP 게임의 게임 마스터다. 세계관의 뼈대(장소, 인물, 세력)를 지키면서 플레이어 행동에 반응한다.',
    `묘사는 ${LENGTH_GUIDE[settings.responseLength] ?? LENGTH_GUIDE.normal} 쓴다. 플레이어의 성격을 묘사에 반영한다.`,
    '수치 변화는 작고 개연성 있게 준다.',
    contentRule(settings), SAFETY_RULE,
    worldBrief(g), turnSchema(g),
  ].join('\n\n');
  const recent = g.log.slice(-12).map((l) => `${l.role === 'player' ? '플레이어' : 'GM'}: ${l.text}`).join('\n');
  return callGemini(settings, system, `최근 진행:\n${recent}\n\n플레이어 행동: ${actionText}`);
}

export async function dailyEvents(g, settings) {
  if (!settings.apiKey) return mockDaily(g);
  const system = [
    '너는 시뮬레이션 RP 게임의 세계 시뮬레이터다. 하루가 끝났다. 플레이어가 보지 못한 곳에서 NPC들 사이에 일어난 일과 세계의 변화를 1~3개 만든다.',
    contentRule(settings), SAFETY_RULE, worldBrief(g),
    '다음 JSON으로만 답한다: {"news":["소문/소식 한 줄"],"factionChanges":{"세력 id":변화량},"flags":{},"questsAdded":[]}',
  ].join('\n\n');
  return callGemini(settings, system, '오늘 하루 동안 생긴 일을 만들어라.');
}

export async function generateWorld(prompt, settings) {
  if (!settings.apiKey) throw new AiError('need_key', '세계관 자동 생성은 API 키가 필요합니다.');
  const system = [
    '너는 시뮬레이션 RP 게임의 세계관 설계자다. 한 줄 설명을 받아 세계관 JSON을 만든다.',
    'NPC는 모두 성인(18세 이상)으로 만든다. 장소 4~6개, NPC 3~5명, 세력 2~3개.',
    '형식은 아래 예시와 같은 키를 그대로 사용한다. id는 영문 소문자.',
    JSON.stringify(EXAMPLE_SHAPE),
  ].join('\n\n');
  return callGemini(settings, system, prompt);
}

const EXAMPLE_SHAPE = {
  id: 'custom-id', emoji: '🌍', name: '이름', summary: '요약', tone: '분위기',
  modules: { economy: true, stats: true }, currency: '화폐',
  time: { startDay: 1, startHour: 8, defaultMinutes: 60, minMinutes: 10, maxMinutes: 480 },
  goal: { title: '목표', description: '설명', days: 30 },
  endings: [{ id: 'good', title: '', description: '' }, { id: 'normal', title: '', description: '' }, { id: 'bad', title: '', description: '' }],
  protagonist: { role: '', background: '', name: '', personality: '', appearance: '', stats: { 능력치: 3 }, money: 0, inventory: [] },
  startLocation: 'place-id',
  places: [{ id: 'place-id', name: '', description: '' }],
  npcs: [{ id: 'npc-id', name: '', age: 25, role: '', personality: '', description: '',
    schedule: { morning: 'place-id', day: 'place-id', evening: 'place-id', night: 'place-id' },
    relationship: { affection: 0, trust: 0, love: 0 } }],
  factions: [{ id: 'faction-id', name: '', description: '', standing: 0 }],
};

// ---------- Gemini 제공자 ----------

export class AiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const SAFETY_CATEGORIES = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'];

async function callGemini(settings, system, user) {
  const model = settings.model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
    safetySettings: SAFETY_CATEGORIES.map((category) => ({
      category, threshold: settings.adultMode ? 'BLOCK_NONE' : 'BLOCK_MEDIUM_AND_ABOVE',
    })),
  };
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiError('network', '네트워크 오류로 AI에 연결하지 못했습니다.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 400 || res.status === 401 || res.status === 403) throw new AiError('key', `API 키나 모델 설정을 확인해 주세요. (${data.error?.message ?? res.status})`);
    if (res.status === 429) throw new AiError('quota', '요청 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.');
    throw new AiError('server', `AI 서버 오류 (${res.status})`);
  }
  const cand = data.candidates?.[0];
  if (data.promptFeedback?.blockReason || !cand || cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT') {
    throw new AiError('blocked', '응답이 AI 안전 정책으로 차단되었습니다. 표현을 바꿔 다시 시도해 주세요.');
  }
  const text = (cand.content?.parts ?? []).map((p) => p.text ?? '').join('');
  try {
    return JSON.parse(text.replace(/^```(json)?|```$/g, '').trim());
  } catch {
    throw new AiError('parse', 'AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.');
  }
}

// ---------- 테스트 모드 (API 키 없음) ----------

const pick = (a) => a[Math.floor(Math.random() * a.length)];

function mockTurn(g, actionText) {
  const here = npcsHere(g);
  const npc = here.find((n) => actionText.includes(n.name)) ?? here[0];
  const lines = npc
    ? [`${npc.name}이(가) ${g.player.name}을(를) 바라본다. "${pick(['그래서, 무슨 일이야?', '오늘은 좀 한가하네.', '흠, 생각해 볼게.'])}"`]
    : [`${placeName(g, g.location)}에는 아무도 없다. 조용한 공기만 흐른다.`];
  return {
    narration: `(테스트 모드) ${g.player.name}은(는) "${actionText}" 행동을 했다. ${lines.join(' ')}`,
    minutes: g.world.time.defaultMinutes,
    relationshipChanges: npc ? [{ npc: npc.id, affection: pick([1, 2, 3]), trust: pick([0, 1]), love: 0, memory: `${g.player.name}이(가) "${actionText}"라고 했다` }] : [],
    goalProgressDelta: pick([0, 1, 2]),
    choices: [
      ...here.slice(0, 2).map((n) => `${n.name}에게 말을 건다`),
      '주변을 살펴본다',
      '잠시 쉰다',
    ],
  };
}

function mockDaily(g) {
  const [a, b] = [...g.world.npcs].sort(() => Math.random() - 0.5);
  return {
    news: [`(테스트 모드) 어젯밤 ${a.name}와(과) ${b?.name ?? '누군가'}가 ${pick(['크게 다퉜다는', '함께 술을 마셨다는', '비밀 이야기를 나눴다는'])} 소문이 돈다.`],
    factionChanges: {},
  };
}
