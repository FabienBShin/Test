// 기본 프리셋 세계관 6종.
// 능력치 값은 기준값이다. API 키가 있으면 게임 시작 때 AI가 주인공 성격에 맞게 다시 정한다.

// 일과: 새벽 아침 오전 점심 오후 저녁 밤 순서로 장소 id를 적는다.
const PERIOD_KEYS = ['dawn', 'morning', 'forenoon', 'lunch', 'afternoon', 'evening', 'night'];
const sch = (s) => Object.fromEntries(s.split(' ').map((place, i) => [PERIOD_KEYS[i], place]));
// NPC끼리의 관계는 방향이 있다(A가 B를 어떻게 보는지).
const rels = (list) => {
  const o = {};
  for (const [a, b, affection, trust, love = 0] of list) (o[a] ??= {})[b] = { affection, trust, love };
  return o;
};

const baseEndings = [
  { id: 'good', title: '좋은 결말', description: '목표를 이뤄냈다.' },
  { id: 'normal', title: '평범한 결말', description: '절반의 성공.' },
  { id: 'bad', title: '나쁜 결말', description: '목표를 이루지 못했다.' },
];

export const PRESETS = [
  {
    id: 'fantasy',
    emoji: '🏰',
    name: '판타지 왕국: 변방 마을',
    summary: '변방 마을 에른에 도착한 신입 모험가. 길드, 여관, 영주 사이의 갈등이 커지고 있다.',
    tone: '모험, 정치적 긴장, 따뜻한 마을 사람들',
    modules: { economy: true, stats: true },
    currency: '골드',
    time: { startDay: 1, startHour: 8, defaultMinutes: 60, minMinutes: 10, maxMinutes: 480 },
    goal: { title: '마을의 신뢰 얻기', description: '30일 안에 길드 등급을 올리고 마을의 분쟁을 해결한다.', days: 30 },
    endings: baseEndings,
    protagonist: {
      role: '신입 모험가', background: '먼 도시에서 온 떠돌이 검사.',
      name: '레온', personality: '솔직하고 정의감이 강함', appearance: '짧은 갈색 머리, 낡은 가죽 갑옷',
      stats: { 힘: 3, 지혜: 2, 매력: 2, 체력: 10 }, money: 50, inventory: ['낡은 검', '빵 2개'],
    },
    startLocation: 'guild',
    places: [
      { id: 'guild', name: '모험가 길드', description: '의뢰 게시판과 시끄러운 모험가들.' },
      { id: 'inn', name: '은빛 여관', description: '따뜻한 스튜와 소문이 모이는 곳.' },
      { id: 'smithy', name: '대장간', description: '망치 소리가 끊이지 않는다.' },
      { id: 'manor', name: '영주 저택', description: '높은 담장과 경비병.' },
      { id: 'forest', name: '검은 숲', description: '마물이 출몰하는 마을 외곽의 숲.' },
    ],
    npcs: [
      { id: 'mira', name: '미라', age: 27, role: '길드 접수원', personality: '꼼꼼하고 잔소리가 많지만 다정함', description: '안경을 쓴 접수원.',
        schedule: sch('inn guild guild inn guild inn inn'), relationship: { affection: 10, trust: 10, love: 0 } },
      { id: 'borg', name: '보르그', age: 45, role: '대장장이', personality: '무뚝뚝하지만 의리 있음', description: '팔뚝이 굵은 드워프 혼혈.',
        schedule: sch('smithy smithy smithy inn smithy inn smithy'), relationship: { affection: 0, trust: 0, love: 0 } },
      { id: 'elena', name: '엘레나', age: 24, role: '영주의 딸', personality: '호기심 많고 반항적', description: '몰래 저택을 빠져나오곤 한다.',
        schedule: sch('manor manor manor manor forest inn manor'), relationship: { affection: 0, trust: 0, love: 0 } },
    ],
    // NPC끼리의 첫 관계 [누가, 누구를, 호감, 신뢰, 애정]
    npcRelations: rels([['mira', 'borg', 20, 30], ['borg', 'mira', 15, 30], ['mira', 'elena', 10, 5], ['elena', 'mira', 25, 20], ['borg', 'elena', -5, -10], ['elena', 'borg', 10, 0]]),
    factions: [
      { id: 'guild', name: '모험가 길드', description: '마을의 치안을 맡은 모험가들.', standing: 10 },
      { id: 'lord', name: '영주 가문', description: '세금을 올리려는 영주.', standing: 0 },
    ],
  },
  {
    id: 'campus',
    emoji: '🎓',
    name: '현대 대학 캠퍼스',
    summary: '2학년 1학기에 편입한 대학생. 동아리, 과제, 그리고 학기 말 축제.',
    tone: '청춘, 일상, 로맨스, 코미디',
    modules: { economy: false, stats: true },
    currency: '원',
    time: { startDay: 1, startHour: 9, defaultMinutes: 60, minMinutes: 10, maxMinutes: 240 },
    goal: { title: '축제 무대 성공시키기', description: '30일 뒤 축제에서 동아리 공연을 성공시킨다.', days: 30 },
    endings: baseEndings,
    protagonist: {
      role: '편입생', background: '지방에서 올라와 자취를 시작했다.',
      name: '서준', personality: '낯을 가리지만 한번 친해지면 장난이 많음', appearance: '검은 머리, 후드티',
      stats: { 학업: 3, 인기: 1, 체력: 5 }, money: 0, inventory: [],
    },
    startLocation: 'lecture',
    places: [
      { id: 'lecture', name: '인문관 강의실', description: '졸음을 부르는 오전 강의.' },
      { id: 'club', name: '밴드 동아리방', description: '낡은 앰프와 포스터가 가득하다.' },
      { id: 'cafe', name: '정문 앞 카페', description: '과제하는 학생들로 붐빈다.' },
      { id: 'dorm', name: '자취방', description: '좁지만 내 공간.' },
    ],
    npcs: [
      { id: 'yuna', name: '유나', age: 21, role: '밴드 보컬', personality: '밝고 직설적', description: '동아리 회장.',
        schedule: sch('dorm cafe lecture cafe club club cafe'), relationship: { affection: 5, trust: 5, love: 0 } },
      { id: 'minho', name: '민호', age: 22, role: '과 동기', personality: '느긋하고 눈치 빠름', description: '족보를 다 가진 선배 같은 동기.',
        schedule: sch('dorm dorm lecture cafe cafe cafe dorm'), relationship: { affection: 10, trust: 5, love: 0 } },
      { id: 'prof', name: '한 교수', age: 52, role: '지도교수', personality: '엄격하지만 공정함', description: '출석에 까다롭다.',
        schedule: sch('lecture lecture lecture cafe lecture lecture lecture'), relationship: { affection: 0, trust: 0, love: 0 } },
    ],
    // NPC끼리의 첫 관계 [누가, 누구를, 호감, 신뢰, 애정]
    npcRelations: rels([['yuna', 'minho', 15, 10], ['minho', 'yuna', 20, 15, 10], ['prof', 'minho', -10, -5], ['minho', 'prof', -5, 10], ['yuna', 'prof', 0, 5], ['prof', 'yuna', 10, 10]]),
    factions: [
      { id: 'band', name: '밴드 동아리', description: '해체 위기의 동아리.', standing: 5 },
      { id: 'council', name: '학생회', description: '축제 무대 배정을 쥐고 있다.', standing: 0 },
    ],
  },
  {
    id: 'station',
    emoji: '🚀',
    name: 'SF 우주 정거장 아르고스',
    summary: '외곽 정거장에 새로 배치된 엔지니어. 세력 갈등 속에 정체불명의 신호가 잡힌다.',
    tone: 'SF 미스터리, 긴장감, 세력 정치',
    modules: { economy: true, stats: true },
    currency: '크레딧',
    time: { startDay: 1, startHour: 7, defaultMinutes: 60, minMinutes: 10, maxMinutes: 480 },
    goal: { title: '신호의 정체 밝히기', description: '30일 안에 신호의 출처를 밝히고 정거장을 지킨다.', days: 30 },
    endings: baseEndings,
    protagonist: {
      role: '정비 엔지니어', background: '본성 조선소에서 좌천되어 왔다.',
      name: '카이', personality: '냉소적이지만 동료를 버리지 않음', appearance: '회색 작업복, 의수 왼팔',
      stats: { 기술: 4, 전투: 2, 교섭: 2, 체력: 10 }, money: 200, inventory: ['멀티툴', '출입 카드(C등급)'],
    },
    startLocation: 'dock',
    places: [
      { id: 'dock', name: '도킹 베이', description: '화물선이 오가는 소음.' },
      { id: 'bridge', name: '관제실', description: '출입 제한 구역.' },
      { id: 'bar', name: '저중력 바', description: '정보와 밀수품이 오간다.' },
      { id: 'lab', name: '통신 연구실', description: '신호를 분석 중인 장비들.' },
    ],
    npcs: [
      { id: 'vega', name: '베가 사령관', age: 48, role: '정거장 사령관', personality: '냉정한 원칙주의자', description: '연방 소속.',
        schedule: sch('bridge bridge bridge bar bridge bridge bar'), relationship: { affection: 0, trust: 0, love: 0 } },
      { id: 'rin', name: '린', age: 29, role: '통신 연구원', personality: '수줍고 집요함', description: '신호를 처음 발견했다.',
        schedule: sch('lab lab lab bar lab bar lab'), relationship: { affection: 5, trust: 0, love: 0 } },
      { id: 'jax', name: '잭스', age: 35, role: '밀수업자', personality: '능글맞고 계산적', description: '뭐든 구해준다.',
        schedule: sch('dock dock bar bar bar bar dock'), relationship: { affection: 0, trust: 0, love: 0 } },
    ],
    // NPC끼리의 첫 관계 [누가, 누구를, 호감, 신뢰, 애정]
    npcRelations: rels([['vega', 'rin', 10, 20], ['rin', 'vega', 5, 15], ['vega', 'jax', -20, -30], ['jax', 'vega', -10, -20], ['rin', 'jax', 5, -10], ['jax', 'rin', 15, 5]]),
    factions: [
      { id: 'fed', name: '연방군', description: '정거장을 통제한다.', standing: 0 },
      { id: 'union', name: '광부 조합', description: '파업을 준비 중.', standing: 0 },
    ],
  },
  {
    id: 'joseon',
    emoji: '🏯',
    name: '조선 궁중 사극',
    summary: '궁에 갓 들어온 신입 궁인. 중전과 후궁 세력 사이의 음모에 휘말린다.',
    tone: '궁중 암투, 예법, 은밀한 감정',
    modules: { economy: true, stats: false },
    currency: '냥',
    time: { startDay: 1, startHour: 6, defaultMinutes: 60, minMinutes: 10, maxMinutes: 720 },
    goal: { title: '살아남아 자리를 잡기', description: '30일 안에 음모의 전말을 밝히고 신임을 얻는다.', days: 30 },
    endings: baseEndings,
    protagonist: {
      role: '신입 궁인', background: '몰락한 양반가의 딸로 생계를 위해 입궁했다.',
      name: '연화', personality: '침착하고 영리함', appearance: '단정한 궁인 복장',
      stats: {}, money: 5, inventory: ['어머니의 노리개'],
    },
    startLocation: 'quarters',
    places: [
      { id: 'quarters', name: '궁인 처소', description: '좁고 엄격한 공간.' },
      { id: 'palace', name: '중궁전', description: '중전이 머무는 곳.' },
      { id: 'garden', name: '후원', description: '은밀한 만남이 이뤄지는 정원.' },
      { id: 'kitchen', name: '소주방', description: '궁의 소문이 모이는 부엌.' },
    ],
    npcs: [
      { id: 'queen', name: '중전 윤씨', age: 30, role: '중전', personality: '온화해 보이나 속을 알 수 없음', description: '후사가 없어 불안하다.',
        schedule: sch('palace palace palace palace garden garden palace'), relationship: { affection: 0, trust: 0, love: 0 } },
      { id: 'sanggung', name: '최 상궁', age: 50, role: '제조상궁', personality: '엄격하고 노련함', description: '궁인들의 우두머리.',
        schedule: sch('quarters quarters kitchen kitchen kitchen quarters quarters'), relationship: { affection: 0, trust: 5, love: 0 } },
      { id: 'guard', name: '이 무관', age: 28, role: '내금위 무관', personality: '과묵하고 충직함', description: '후원 경비를 맡는다.',
        schedule: sch('garden garden palace palace garden garden garden'), relationship: { affection: 0, trust: 0, love: 0 } },
    ],
    // NPC끼리의 첫 관계 [누가, 누구를, 호감, 신뢰, 애정]
    npcRelations: rels([['queen', 'sanggung', 20, 30], ['sanggung', 'queen', 30, 40], ['guard', 'queen', 10, 40], ['queen', 'guard', 5, 20], ['sanggung', 'guard', 0, 10], ['guard', 'sanggung', 5, 10]]),
    factions: [
      { id: 'queen', name: '중전 세력', description: '정통성을 지키려 한다.', standing: 0 },
      { id: 'consort', name: '희빈 세력', description: '권력을 넓히려 한다.', standing: 0 },
    ],
  },
  {
    id: 'apocalypse',
    emoji: '🧟',
    name: '아포칼립스 생존 캠프',
    summary: '폐허가 된 도시의 생존자 캠프에 새로 합류했다. 식량은 줄고 감염자는 늘어난다.',
    tone: '생존, 긴장, 신뢰와 배신',
    modules: { economy: true, stats: true },
    currency: '배급표',
    time: { startDay: 1, startHour: 7, defaultMinutes: 120, minMinutes: 10, maxMinutes: 600 },
    goal: { title: '겨울 나기', description: '30일 안에 캠프의 식량과 방어를 확보한다.', days: 30 },
    endings: baseEndings,
    protagonist: {
      role: '신입 생존자', background: '혼자 버티다 캠프를 발견했다.',
      name: '도윤', personality: '신중하고 말수가 적음', appearance: '낡은 군용 점퍼, 흉터',
      stats: { 생존: 3, 전투: 2, 의술: 1, 체력: 8 }, money: 3, inventory: ['쇠파이프', '통조림 1개'],
    },
    startLocation: 'camp',
    places: [
      { id: 'camp', name: '캠프 광장', description: '천막과 모닥불.' },
      { id: 'clinic', name: '임시 진료소', description: '약품이 거의 없다.' },
      { id: 'wall', name: '방벽', description: '감시탑과 바리케이드.' },
      { id: 'ruins', name: '폐허 시가지', description: '물자가 있지만 위험하다.' },
    ],
    npcs: [
      { id: 'hana', name: '하나', age: 33, role: '캠프 리더', personality: '단호하고 책임감 강함', description: '전직 소방관.',
        schedule: sch('wall camp wall camp wall camp wall'), relationship: { affection: 0, trust: 0, love: 0 } },
      { id: 'doc', name: '박 선생', age: 61, role: '의사', personality: '지쳤지만 따뜻함', description: '유일한 의료인.',
        schedule: sch('camp clinic clinic camp clinic clinic camp'), relationship: { affection: 5, trust: 0, love: 0 } },
      { id: 'tae', name: '태식', age: 38, role: '수색대장', personality: '거칠고 의심 많음', description: '신입을 믿지 않는다.',
        schedule: sch('camp ruins ruins ruins ruins camp camp'), relationship: { affection: -10, trust: -10, love: 0 } },
    ],
    // NPC끼리의 첫 관계 [누가, 누구를, 호감, 신뢰, 애정]
    npcRelations: rels([['hana', 'doc', 25, 40], ['doc', 'hana', 20, 35], ['hana', 'tae', 10, 20], ['tae', 'hana', 15, 30, 15], ['doc', 'tae', -5, 0], ['tae', 'doc', 0, 10]]),
    factions: [
      { id: 'camp', name: '캠프 주민', description: '지친 생존자들.', standing: 0 },
      { id: 'raiders', name: '약탈자 무리', description: '캠프를 노린다.', standing: -30 },
    ],
  },
  {
    id: 'cafe',
    emoji: '🍵',
    name: '힐링 카페: 바닷가 마을',
    summary: '할머니에게 작은 카페를 물려받았다. 단골손님과 마을 주민들과의 느린 일상.',
    tone: '힐링, 잔잔함, 소소한 로맨스',
    modules: { economy: true, stats: true },
    currency: '원',
    time: { startDay: 1, startHour: 8, defaultMinutes: 60, minMinutes: 10, maxMinutes: 300 },
    goal: { title: '카페 흑자 만들기', description: '30일 안에 카페를 흑자로 만들고 단골을 늘린다.', days: 30 },
    endings: baseEndings,
    protagonist: {
      role: '카페 사장', background: '도시 회사를 그만두고 내려왔다.',
      name: '하윤', personality: '다정하지만 걱정이 많음', appearance: '앞치마, 묶은 머리',
      stats: { 요리: 2, 친화: 3, 체력: 10 }, money: 300000, inventory: ['할머니의 레시피 노트'],
    },
    startLocation: 'cafe',
    places: [
      { id: 'cafe', name: '카페 파도', description: '낡았지만 햇살이 좋은 카페.' },
      { id: 'market', name: '어시장', description: '신선한 재료와 수다.' },
      { id: 'beach', name: '해변 산책로', description: '노을이 예쁘다.' },
      { id: 'library', name: '마을 도서관', description: '조용한 오후.' },
    ],
    npcs: [
      { id: 'jiho', name: '지호', age: 31, role: '어부', personality: '무뚝뚝하지만 섬세함', description: '매일 아침 커피를 사러 온다.',
        schedule: sch('market cafe market market market beach market'), relationship: { affection: 5, trust: 5, love: 0 } },
      { id: 'sora', name: '소라', age: 26, role: '사서', personality: '조용하고 상상력 풍부', description: '소설을 쓰고 있다.',
        schedule: sch('library library library cafe library cafe beach'), relationship: { affection: 0, trust: 0, love: 0 } },
      { id: 'grandpa', name: '김 영감', age: 78, role: '이장', personality: '고집스럽지만 정 많음', description: '할머니의 오랜 친구.',
        schedule: sch('market market market cafe cafe market library'), relationship: { affection: 10, trust: 10, love: 0 } },
    ],
    // NPC끼리의 첫 관계 [누가, 누구를, 호감, 신뢰, 애정]
    npcRelations: rels([['jiho', 'sora', 10, 5, 15], ['sora', 'jiho', 10, 5], ['grandpa', 'jiho', 30, 30], ['jiho', 'grandpa', 25, 30], ['grandpa', 'sora', 20, 15], ['sora', 'grandpa', 15, 15]]),
    factions: [
      { id: 'village', name: '마을 주민회', description: '작은 마을의 여론.', standing: 10 },
      { id: 'franchise', name: '프랜차이즈 카페', description: '마을 입구에 들어설 예정.', standing: 0 },
    ],
  },
  {
    id: 'racewar',
    emoji: '⚔️',
    name: '종족전쟁: 벨테른 대륙',
    summary: '세 종족이 맞붙은 벨테른 대륙. 한 진영의 신병으로 입대해 임무를 수행하고, 세력도를 뒤집어 전쟁의 향방을 바꿔라.',

    tone: `
벨테른 대륙은 세 종족의 전면전 중이다. 인간의 솔렌 성왕국(성법과 성기사단), 엘프의 실바레스 대수림(정령술과 숲의 가호), 마족의 녹투르가 마왕국(계약술과 마물의 군세). 어느 한쪽이 대륙의 패권을 쥐기 전까지 전쟁은 끝나지 않는다. 주인공은 국경의 모병소에서 세 진영 중 하나를 택해 신병으로 입대한다.


- 3인칭 '—었다'체 서술과 캐릭터 대사를 교대한다.
- 감각적인 묘사(소리·냄새·온기·피로)를 곁들인다.
- 캐릭터별 말투를 구분한다. 모르가나는 1인칭 '짐'을 쓰는 오만하고 여유로운 말투. 카엘은 단호한 군인 말투. 엘윈은 침착하고 함축적인 말투.
- 단역은 [솔렌 병사], [모병관]처럼 역할명으로 표기한다.
- 효과음은 단독 행으로 쓴다. (예: 쾅—!)
- 전투에 주사위나 수치 판정을 쓰지 않는다. 서술로 승패의 흐름을 만들고, 장면 끝은 클리프행어로 끊어 주인공의 다음 행동을 유도한다.


1. 오프닝: 앱이 startChoices를 지원하면 버튼 선택으로 진영을 정한다. 지원하지 않으면 첫 응답에서 세 진영의 소개와 함께 셋 중 하나를 고르라는 선택지를 제시하고, 주인공이 고르기 전에는 모병소 장면을 진행하지 않는다.
2. 장면 헤더: 매 장면 시작 시 templates.sceneHeader 형식으로 장소·날씨·일차를 적는다. 시간은 앱의 시간 상태값을 그대로 쓴다. AI가 임의로 계산하지 않는다.
3. 임무 흐름: 임무는 반드시 ①→② 순서로만 진행한다. ① 먼저 templates.missionCard 형식의 임무 카드를 제시한다. 카드에는 임무명, 의뢰인, 난이도(★~★★★ 3칸), 목표 내용, 성공 시와 실패 시의 진영별 세력도 증감 수치, 의뢰인 호감도 변화(6번 규칙의 수치)를 빠짐없이 적는다. ② 카드를 제시한 뒤에만(같은 응답의 카드 아래 또는 다음 턴) 수락·조건 협상·거절·정보 탐색 선택지를 낸다. 금지: 카드 없이 "임무 수락", "조건 협상", "임무를 수행하겠다" 취지의 선택지나 서술을 내지 않는다. choices 필드도 같다. 임무 내용이 없는 수락 선택지는 절대 내지 않는다. 오프닝 직후 신병의 첫 임무도 예외가 아니다. 임무를 맡길 때는 반드시 카드부터 보여준다.
4. 상태창: 매 턴 마지막에 templates.statusWindow 형식으로 출력한다. 수치는 앱의 현재 상태값을 그대로 옮겨 적는다. AI가 임의로 바꾸지 않는다.
5. 세력도: 세 진영의 합은 항상 100을 유지한다. 임무 카드의 수치대로 증감시키되, 한 진영이 오르면 나머지는 내린다.
6. 호감도: affection 0~100. 단계는 relationStages를 따른다(경계 0~ / 인정 40~ / 신뢰 60~ / 유대 80~ / 맹약 95~). 임무 성공 시 의뢰인의 호감도 +8, 임무 수락을 협상(조건을 붙여 수락)하면 +6. 실패하면 -5. 적 진영 대표와 처음 마주치기 전까지는 호감도 0을 유지한다.
7. 직책과 공헌: stats.공헌 0~100. 승급 사다리는 신병[D급] → 십인장[C급] → 백인장[B급] → 천인장[A급] → 장군[S급]. 공헌이 100에 닿으면 승급 심사를 거쳐 한 단계 오르고 공헌은 0으로 돌아간다. 직책 표기는 protagonist.role을 갱신한다.
8. 임무 상태: '없음' → '제시 중: {임무명}' → '진행 중: {임무명} · {별점}' → 정산 후 '없음'. 한 번에 하나의 임무만 진행한다.
9. 선택지: 주인공은 자유 행동을 선언한다. NPC는 가끔 귓속말 형식의 양자택일 질문을 던진다. 명시적 선택 UI는 오프닝 진영 선택과 3번 규칙의 임무 응답(카드 제시 이후의 수락·조건 협상·거절·정보 탐색)에만 쓴다.
10. 시간: 장거리 이동이나 행군은 서술을 압축하고 시간을 점프시킨다(최대 12시간).
11. 미조우 NPC: 주인공과 떨어진 주요 인물의 행방은 📌행에 '첩보에 따르면 ○○ 방면에서 군을 움직이는 중' 수준의 소문으로만 쓴다. 정확한 위치·감정·속마음은 첫 조우 전까지 공개하지 않는다.
12. 수위: 일반 수위. 신체 강조 묘사를 하지 않는다. 캐릭터의 매력은 위압감·말투·권위·분위기로 표현한다.`,

    modules: { economy: false, stats: true},
    currency: '은화',
    time: { startDay: 1, startHour: 6, defaultMinutes: 30, minMinutes: 10, maxMinutes: 720},

    goal: {
      title: '소속 진영 세력도 60% 달성',
      description: '30일 안에 소속 진영의 세력도를 60%까지 끌어올려라. 임무를 완수할 때마다 전황이 움직인다. 진영이 무너지면 모든 것이 끝난다.',
      days: 30,
    },
    endings: [
      {
        id: 'victory',
        title: '대륙의 패권',
        description: '소속 진영의 세력도가 60%를 넘었다. 전쟁의 향방이 기울고, 주인공은 쌓아온 직책에 걸맞은 자리에서 새로운 시대를 맞는다.',
      },
      {
        id: 'fall',
        title: '무너진 전선',
        description: '소속 진영의 세력도가 10% 아래로 떨어졌다. 전선이 붕괴하고, 주인공은 폐허 속에서 생존을 건 선택에 직면한다.',
      },
      {
        id: 'armistice',
        title: '불완전한 휴전',
        description: '30일이 지나도 어느 진영도 60%에 닿지 못했다. 세 나라는 휴전 협정에 서명한다. 적 진영 대표와 깊은 유대를 쌓았다면, 전후의 화친을 잇는 가교가 된다.',
      },
    ],

    protagonist: {
      role: '지원병 [미배속]',
      background: '국경 마을 출신. 전쟁으로 고향을 잃고 모병소의 문을 두드렸다. 어느 진영에도 속하지 않은 채, 선택의 기로에 서 있다.',
      name: '아덴',
      personality: '결단력이 있고 의리가 있음',
      appearance: '검은 머리, 단단한 체격, 낡은 여행자 복장',
      stats: { '공헌': 0, '무력': 2, '지략': 2, '체력': 3},
      money: 20,
      inventory: ['낡은 단검', '행군 배낭', '건빵 3개'],
    },

    startLocation: 'border-post',

    places: [
      { id: 'border-post', name: '국경 모병소', description: '세 나라의 경계에 선 중립지대. 전쟁을 피해 모여든 지원병들로 북적이는 목책 요새.'},
      { id: 'solen-camp', name: '솔렌 전진 막사', description: '성기사단의 깃발이 펄럭이는 인간 진영의 전진 기지. 규율과 기도로 돌아가는 강철의 진지.'},
      { id: 'silvares-grove', name: '실바레스 대수림 경계', description: '수천 년 묵은 거목들이 늘어선 엘프의 영토. 숲 자체가 살아서 침입자를 감시한다.'},
      { id: 'nocturga-fort', name: '녹투르가 흑요새', description: '검은 돌로 쌓은 마족의 요새. 계약의 문양이 새겨진 성벽 너머로 마물의 울음소리가 울린다.'},
      { id: 'ash-plain', name: '잿빛 평원', description: '세 진영의 군세가 맞부딪치는 격전지. 불탄 깃발과 부러진 창이 뒹구는 회색 벌판.'},
      { id: 'belcross', name: '교역도시 벨크로스', description: '전쟁 중에도 장이 서는 중립 교역도시. 정보상과 용병, 첩보원들이 오가는 소문의 심장.'},
    ],
    npcs: [
      {
        id: 'kael',
        name: '카엘',
        age: 32,
        role: '솔렌 성왕국 성기사단 부단장',
        personality: '엄격하고 원칙주의적이나, 부하를 위해서는 목숨도 아끼지 않는 군인.',
        description: '은빛 갑주에 성법의 문신을 새긴 장신한 사내. 눈빛 하나로 병사들을 움직인다.',
        schedule: { dawn: 'solen-camp', morning: 'solen-camp', forenoon: 'ash-plain', lunch: 'solen-camp', afternoon: 'solen-camp', evening: 'solen-camp', night: 'solen-camp' },
        relationship: { affection: 0, trust: 0, love: 0 },
      },
      {
        id: 'elwin',
        name: '엘윈',
        age: 210,
        role: '실바레스 대수림 숲 파수대장',
        personality: '침착하고 통찰력이 뛰어나며, 숲을 위해서라면 냉혹한 결단도 마다하지 않는다.',
        description: '외형은 20대 후반의 여성. 210세를 살아온 눈이 모든 것을 꿰뚫는다. 활시위보다 말이 먼저 나가는 법이 없다.',
        schedule: { dawn: 'silvares-grove', morning: 'silvares-grove', forenoon: 'silvares-grove', lunch: 'silvares-grove', afternoon: 'ash-plain', evening: 'silvares-grove', night: 'silvares-grove' },
        relationship: { affection: 0, trust: 0, love: 0 },
      },
      {
        id: 'morgana',
        name: '모르가나',
        age: 340,
        role: '녹투르가 마왕국 마왕',
        personality: '오만하고 여유로우며, 흥미를 끄는 존재에게는 뜻밖의 관대함을 보인다. 1인칭은 짐.',
        description: '외형은 20대의 여성. 340세를 살아온 마왕. 검은 왕관을 쓰고 옥좌에 앉아 전쟁을 장기판처럼 내려다본다.',
        schedule: { dawn: 'nocturga-fort', morning: 'nocturga-fort', forenoon: 'nocturga-fort', lunch: 'nocturga-fort', afternoon: 'nocturga-fort', evening: 'nocturga-fort', night: 'nocturga-fort' },
        relationship: { affection: 0, trust: 0, love: 0 },
      },
      {
        id: 'dante',
        name: '단테',
        age: 28,
        role: '솔렌 성왕국 부관 (카엘의 직속)',
        personality: '깐깐한 교관형. 신병을 혹독하게 굴리지만, 살아남은 자에게는 평생의 충성을 바친다.',
        description: '턱에 흉터가 있는 정통 군인. 카엘의 명령이라면 불 속에도 뛰어든다.',
        schedule: { dawn: 'solen-camp', morning: 'solen-camp', forenoon: 'solen-camp', lunch: 'solen-camp', afternoon: 'ash-plain', evening: 'solen-camp', night: 'solen-camp' },
        relationship: { affection: 0, trust: 0, love: 0 },
      },
      {
        id: 'silvan',
        name: '실반',
        age: 150,
        role: '실바레스 파수대 부관 (엘윈의 직속)',
        personality: '과묵한 저격수. 말보다 화살이 빠르고, 숲의 뜻을 거역하는 법이 없다.',
        description: '외형은 20대의 남성. 150세를 살아온 엘프. 엘윈의 그림자처럼 따라다니며 경계를 선다.',
        schedule: { dawn: 'silvares-grove', morning: 'silvares-grove', forenoon: 'silvares-grove', lunch: 'silvares-grove', afternoon: 'silvares-grove', evening: 'silvares-grove', night: 'silvares-grove' },
        relationship: { affection: 0, trust: 0, love: 0 },
      },
      {
        id: 'aza',
        name: '아자',
        age: 120,
        role: '녹투르가 마왕 직속 부관',
        personality: '냉소적이고 계산적. 마왕의 눈치를 살피며, 쓸모 있는 자를 가려내는 데 능하다.',
        description: '외형은 20대 초반의 여성. 120세를 살아온 마족. 모르가나의 명령을 한 치의 오차도 없이 집행한다.',
        schedule: { dawn: 'nocturga-fort', morning: 'nocturga-fort', forenoon: 'nocturga-fort', lunch: 'nocturga-fort', afternoon: 'ash-plain', evening: 'nocturga-fort', night: 'nocturga-fort' },
        relationship: { affection: 0, trust: 0, love: 0 },
      },
      {
        id: 'pio',
        name: '피오',
        age: 19,
        role: '국경 모병소의 지원병 동기',
        personality: '밝고 수다스러운 분위기 메이커. 겁은 많지만 동료를 버리는 법이 없다.',
        description: '인간 청년. 전쟁 고아 출신으로, 모병소에서 만난 동기들을 진짜 가족처럼 여긴다.',
        schedule: { dawn: 'border-post', morning: 'border-post', forenoon: 'border-post', lunch: 'border-post', afternoon: 'border-post', evening: 'border-post', night: 'border-post' },
        relationship: { affection: 15, trust: 15, love: 0 },
      },
      {
        id: 'mia',
        name: '미아',
        age: 20,
        role: '국경 모병소의 지원병 동기',
        personality: '차분하고 손재주가 좋아 부상병들의 치료를 돕는다. 관찰력이 예리하다.',
        description: '인간 여성. 약초꾼 집안 출신. 모병소의 의무실에서 일하며 전황의 소식을 가장 먼저 듣는다.',
        schedule: { dawn: 'border-post', morning: 'border-post', forenoon: 'border-post', lunch: 'border-post', afternoon: 'border-post', evening: 'border-post', night: 'border-post' },
        relationship: { affection: 15, trust: 15, love: 0 },
      },
    ],

    npcRelations: {
      kael: {
        elwin: { affection: 0, trust: 0, love: 0 },
        morgana: { affection: 0, trust: 0, love: 0 },
        dante: { affection: 45, trust: 80, love: 0 },
      },
      elwin: {
        kael: { affection: 0, trust: 0, love: 0 },
        morgana: { affection: 0, trust: 0, love: 0 },
        silvan: { affection: 40, trust: 85, love: 0 },
        dante: { affection: 20, trust: 30, love: 0 },
      },
      morgana: {
        kael: { affection: 0, trust: 0, love: 0 },
        elwin: { affection: 0, trust: 0, love: 0 },
        aza: { affection: 30, trust: 70, love: 0 },
      },
      dante: {
        kael: { affection: 50, trust: 90, love: 0 },
        elwin: { affection: 20, trust: 30, love: 0 },
      },
      silvan: { elwin: { affection: 45, trust: 90, love: 0 } },
      aza: { morgana: { affection: 35, trust: 75, love: 0 } },
      pio: { mia: { affection: 40, trust: 50, love: 0 } },
      mia: { pio: { affection: 40, trust: 50, love: 0 } },
    },

    factions: [
      { id: 'solen', name: '솔렌 성왕국', description: '인간의 나라. 성법과 성기사단으로 뭉친 강철의 왕국. 세력의 균형을 쥔 최강 진영.', standing: 40 },
      { id: 'silvares', name: '실바레스 대수림', description: '엘프의 나라. 정령술과 숲의 가호로 요새화된 신비의 영토.', standing: 30 },
      { id: 'nocturga', name: '녹투르가 마왕국', description: '마족의 나라. 계약술과 마물의 군세로 대륙을 위협하는 어둠의 왕국.', standing: 30 },
    ],
    // AI 출력 포맷 지시 (선택 필드 — 없으면 tone의 규칙만 따른다)
    templates: {
      sceneHeader: `🏠 장소: {대장소} · {소장소} | 🌤️ 날씨: {날씨}
⏰ 시간: {N}일차 | {HH:MM}`,
      missionCard: `⚜️ 임무 — {임무명} · {의뢰인}
| {임무명} | 난이도 {★~★★★} |
| 내용 | {목표} |
| 성공 | {진영} +{n} · {진영} -{n} · {의뢰인} ▲ |
| 실패 | {진영} +{n} · {진영} -{n}`,
      statusWindow: `\`\`\`
🗺️ 세력도 ⚔️ 솔렌 {n}% | 🌿 실바레스 {n}% | 🔥 녹투르가 {n}%
👤 소속: {진영} · {종족} ({병과})
🎖️ 직책 [{직책}: {등급}] 공헌 {n}%
🎯 임무: {없음 | 제시 중: {임무명} | 진행 중: {임무명} · {★~★★★}}
{이모지} {이름} [{단계명}] 호감도 {n}%
📌 {현재 위치·행동} / {감정 이모지}
(↑ 캐릭터별로 반복)
\`\`\``,
    },

    // 호감도 단계 (affection 기준, 선택 필드)
    relationStages: [
      { min: 0, name: '경계' },
      { min: 40, name: '인정' },
      { min: 60, name: '신뢰' },
      { min: 80, name: '유대' },
      { min: 95, name: '맹약' },
    ],

    // 오프닝 진영 선택 (선택 필드 — 앱 미지원 시 tone의 1번 규칙으로 대체)
    startChoices: [
      {
        id: 'join-solen',
        label: '⚔️ 솔렌 성왕국에 입대한다 (인간)',
        factionId: 'solen',
        startLocation: 'solen-camp',
        protagonistPatch: {
          role: '신병 [D급]',
          background: '국경 마을 출신의 인간. 전쟁으로 고향을 잃고 솔렌 성왕국의 성기사단에 지원했다.',
          appearance: '검은 머리, 단단한 체격의 인간 청년. 성기사단 견습 갑주를 걸쳤다.',
          stats: { '공헌': 0, '무력': 3, '지략': 2, '체력': 3 },
          inventory: ['성기사단 견습검', '행군 배낭', '건빵 3개'],
        },
        npcPatch: {
          kael: { relationship: { affection: 10, trust: 10, love: 0 } },
          dante: { relationship: { affection: 10, trust: 10, love: 0 } },
        },
      },
      {
        id: 'join-silvares',
        label: '🌿 실바레스 대수림에 입대한다 (엘프)',
        factionId: 'silvares',
        startLocation: 'silvares-grove',
        protagonistPatch: {
          role: '신병 [D급]',
          background: '국경 마을 출신의 엘프. 전쟁으로 고향을 잃고 실바레스 대수림의 파수대에 지원했다.',
          appearance: '긴 귀와 은발이 특징인 엘프. 파수대 견습 복장을 갖췄다.',
          stats: { '공헌': 0, '무력': 2, '지략': 3, '체력': 3 },
          inventory: ['파수대 단궁', '행군 배낭', '건빵 3개'],
        },
        npcPatch: {
          elwin: { relationship: { affection: 10, trust: 10, love: 0 } },
          silvan: { relationship: { affection: 10, trust: 10, love: 0 } },
        },
      },
      {
        id: 'join-nocturga',
        label: '🔥 녹투르가 마왕국에 입대한다 (마족)',
        factionId: 'nocturga',
        startLocation: 'nocturga-fort',
        protagonistPatch: {
          role: '신병 [D급]',
          background: '국경 마을 출신의 마족. 전쟁으로 고향을 잃고 녹투르가 마왕국 마왕군에 지원했다.',
          appearance: '작은 뿔과 붉은 눈동자의 마족. 마왕군 견습 복장을 갖췄다.',
          stats: { '공헌': 0, '무력': 3, '지략': 3, '체력': 2 },
          inventory: ['마왕군 단검', '행군 배낭', '건빵 3개'],
        },
        npcPatch: {
          morgana: { relationship: { affection: 10, trust: 10, love: 0 } },
          aza: { relationship: { affection: 10, trust: 10, love: 0 } },
        },
      },
    ],
  },
  {
    id: 'island',
    emoji: '🏝️',
    name: '무인도 표류: 해무의 섬',
    summary: '폭풍에 탐사선이 가라앉고 낯선 섬에 밀려온 네 명의 생존자. 먹을 것과 마실 물을 구하고, 거처를 짓고, 서로 의지하며 구조를 기다려라.',
    tone: `
해무가 자주 끼는 아열대의 이름 모를 섬. 해양 탐사선이 폭풍에 침몰하면서 주인공과 세 명의 동료가 이 섬에 밀려왔다. 구조 신호를 보낼 수단도, 먹을 것도, 마실 물도 없는 상태에서 시작한다. 섬에는 모래해변, 민물 샘, 열대 숲, 암초 해안, 능선 전망대가 있고 야생동물과 날씨 변화가 위협이 된다. 동료 서하린·도예은·윤채원은 모두 성인이며 각자 판단하고 주장한다.

- 3인칭 '—었다'체 지문과 인물 대사를 번갈아 쓴다. 지문은 문단 전체를 별표 한 쌍으로 감싸고, 대사는 한 줄에 한 사람씩 **이름**: "대사" 형식으로 쓴다.
- 감각 묘사(소리·냄새·온기·피로·허기·갈증)를 곁들인다.
- 인물별 말투를 구분한다. 서하린은 차분하게 설명하는 존댓말, 도예은은 거침없는 반말, 윤채원은 부드럽고 조심스러운 존댓말.
- 단역은 나오지 않는다. 섬에는 이 네 명뿐이며 위협은 동물·날씨·부상·결핍에서 온다.
- 장면 끝은 주인공이 다음 행동을 고를 여지를 남기며 끊는다.

1. 오프닝: 첫 장면(opening)이 이미 화면에 있다. 그 장면에서 이어서 진행하고 소개를 반복하지 않는다.
2. 장면 헤더: 매 장면 시작 시 templates.sceneHeader 형식으로 장소·날씨·시간·거처를 적는다. 시간과 거처 단계는 앱의 현재 상태 값을 그대로 쓴다. AI가 임의로 계산하지 않는다.
3. 상태창: 매 응답 끝에 templates.statusWindow 형식의 코드블록으로 출력한다. 수치와 단계명은 앱의 현재 상태 값을 그대로 옮겨 적고 임의로 바꾸지 않는다.
4. 생존 수치: 포만감·수분·컨디션은 각각 0~100이고 앱이 시간에 따라 자동으로 줄인다. 단계는 양호(70 이상) / 보통(40 이상) / 나쁨(20 이상) / 위험(20 미만). 나쁨 이하면 서술에 허기·갈증·피로 증상을 반드시 넣고, 위험이면 해당 인물의 행동을 제한한다(집중력 저하, 거부, 실신 직전, 판정 불이익). 회복량 기준: 과일 +10~20, 구운 생선·조개 +25~35, 사냥한 고기 +40~50, 끓이거나 거른 맑은 물 +25~40. 날것의 고인 물은 탈이 날 수 있고, 바닷물은 마시면 수분이 오히려 줄고 컨디션이 떨어진다. 부상과 격한 노동은 컨디션을 5~30 깎는다. 잠과 휴식으로 인한 컨디션 회복은 앱이 계산하므로 meterChanges에 넣지 않는다. 수치 변화는 meterChanges로만 알리고, 서술에서 숫자를 지어내지 않는다.
5. 거처: 단계는 flags의 거처단계로 관리한다. 1 임시 쉘터 → 2 조잡한 움막 → 3 통나무 오두막 → 4 화덕을 갖춘 오두막. 단계를 올리려면 재료 채집과 며칠간의 작업이 필요하고 한 번의 행동으로 끝내지 않는다. 비·바람·야수 대응력과 수면의 질이 단계에 따라 좋아진다. 단계가 오르는 순간 flags에 거처단계의 새 값을 넣어 알린다.
6. 관계: 호감도 단계는 relationStages를 따른다(경계 → 동료 → 이성 → 썸 → 연인). 단계가 한 번에 둘 이상 오르지 않는다. 신뢰는 위기를 함께 넘긴 경험으로, 애정은 신뢰가 쌓인 뒤 천천히 쌓인다. 한 동료만 편애하면 다른 동료와의 관계에 균열이 생긴다(질투·소외·갈등).
7. 동료의 판단: 동료는 시키는 대로만 움직이지 않는다. 위험하거나 비효율적인 제안은 반대하고 대안을 낸다. 컨디션이 나쁘면 일을 거부할 수 있다. 서하린은 식물·해류·정수, 도예은은 사냥·수영·체력 노동, 윤채원은 응급처치·위생으로 돕는다.
8. 날씨: 맑음 / 구름조금 / 흐림 / 해무 / 비 / 폭우 중 하나로, 전날과 이어지게 바꾼다. 비는 수분 확보에 도움이 되지만 야외 작업을 막고, 폭우와 해무는 위험을 키운다.
9. 시간: 일상 행동은 5~60분, 채집·사냥·제작은 1~4시간, 건축은 반나절 이상 걸린다. 같은 일의 반복은 서술을 압축하고 시간을 점프시킨다(최대 12시간).
10. 구조: 목표 진행도는 신호 수단(봉화, 거울 신호, 해변 글자, 무전기 수리)과 식수·식량·거처의 안정으로 오른다. 구조는 하루 이틀 만에 오지 않는다. 지나가는 배나 비행기는 신호가 준비된 뒤에만 나타난다.
11. 수위: 모든 인물은 성인이다. 성적 수위는 앱의 성인 모드 설정을 따르고, 합의 없는 성적 행위는 묘사하지 않는다. 일반 모드에서는 장면 전환으로 넘어간다. 캐릭터의 매력은 말투·몸짓·분위기로 표현한다.`,

    modules: { economy: false, stats: true },
    currency: '없음',
    time: { startDay: 1, startHour: 8, defaultMinutes: 30, minMinutes: 5, maxMinutes: 480 },
    goal: { title: '구조될 때까지 살아남기', description: '30일 안에 구조 신호를 올려 구조선을 맞이하라. 식수와 식량을 안정시키고, 거처를 키우고, 동료들과 신뢰를 쌓아야 한다.', days: 30 },
    endings: [
      { id: 'rescued', title: '수평선 위의 배', description: '신호를 본 구조선이 섬에 닿았다. 네 사람은 함께 배에 오른다.' },
      { id: 'settled', title: '섬에서의 겨울', description: '구조는 오지 않았지만 거처와 식량은 안정되었다. 이 섬이 네 사람의 집이 되어 간다.' },
      { id: 'collapsed', title: '해무 속으로', description: '결핍과 부상을 이기지 못했다. 섬의 해무가 모든 것을 덮는다.' },
    ],
    protagonist: {
      role: '조난자 (탐사선 갑판원)', background: '탐사선에서 갑판 일을 하던 선원. 폭풍 속에서 의식을 잃고 섬에 밀려왔다.',
      name: '도하', personality: '침착하고 책임감이 있음', appearance: '젖은 작업복, 그을린 피부',
      stats: { 힘: 3, 손재주: 3, 관찰: 2 }, money: 0, inventory: [],
    },
    startLocation: 'beach',
    initialFlags: { 거처단계: 1 },
    meters: [
      { id: 'satiety', name: '포만감', start: 100, decayPerHour: 3.5, restFactor: 0.5,
        levels: [{ min: 70, label: '양호' }, { min: 40, label: '보통' }, { min: 20, label: '나쁨' }, { min: 0, label: '위험' }],
        restoreWords: ['먹', '식사', '요리', '과일'], restore: 25 },
      { id: 'hydration', name: '수분', start: 100, decayPerHour: 4, restFactor: 0.5,
        levels: [{ min: 70, label: '양호' }, { min: 40, label: '보통' }, { min: 20, label: '나쁨' }, { min: 0, label: '위험' }],
        restoreWords: ['마신', '마시', '물을', '샘물'], restore: 30 },
      { id: 'condition', name: '컨디션', start: 100, decayPerHour: 1.2, restFactor: 0.5, restRecoverPerHour: 8,
        levels: [{ min: 70, label: '양호' }, { min: 40, label: '보통' }, { min: 20, label: '나쁨' }, { min: 0, label: '위험' }],
        restoreWords: [] },
    ],
    places: [
      { id: 'beach', name: '모래해변', description: '파도에 떠밀려온 잔해가 흩어진 하얀 해변. 구조 신호를 보내기 좋은 탁 트인 곳.' },
      { id: 'camp', name: '거처', description: '네 사람이 지내는 쉼터. 단계가 오를수록 비바람을 더 잘 막아 준다.' },
      { id: 'spring', name: '민물 샘', description: '숲 가장자리의 맑은 샘. 마실 물을 길을 수 있고 빨래와 목욕도 한다.' },
      { id: 'forest', name: '열대 숲', description: '과일과 목재가 풍부하지만 짐승의 흔적이 많은 울창한 숲.' },
      { id: 'reef', name: '암초 해안', description: '썰물 때 드러나는 암초 지대. 조개와 물고기를 잡을 수 있지만 밀물이 빠르다.' },
      { id: 'ridge', name: '능선 전망대', description: '섬 전체와 수평선이 내려다보이는 높은 능선. 봉화를 올리기 알맞다.' },
    ],
    opening: `> 🏝️ 장소: 모래해변 | 🌤️ 날씨: ☀️ 맑음
> ⏰ 시간: 1일차 | 08:00
> 🏕️ 거처: 1단계 임시 쉘터

*파도 소리가 귓가를 두드렸다.*

*뜨거운 햇볕이 눈꺼풀 위로 내려앉았다. 입 안이 소금기로 껄끄러웠다. 천천히 눈을 뜨자 흐릿하던 하늘이 서서히 또렷해졌다.*

*모래 위에는 탐사선의 부서진 널빤지와 구명조끼가 흩어져 있었다. 폭풍, 기울어지던 갑판, 누군가 외치던 이름. 기억이 조각조각 떠올랐다.*

*등 뒤에서 인기척이 났다. 먼저 깨어난 세 사람이 해변 한쪽에 모여 있다가 일제히 이쪽을 돌아보았다.*

**서하린**: "정신이 들었군요. 다행이에요. 저는 서하린, 31살이고 탐사선에서 해양생물을 연구했어요. 식물이나 해류는 조금 알아요."

**도예은**: "난 도예은, 26. 배에서 잡일 하던 서핑 강사야. 몸 쓰는 일이면 맡겨. 대신 머리 쓰는 건 저쪽 박사님한테 넘길게."

**윤채원**: "저는 윤채원이에요, 스물아홉... 선의로 승선했던 응급구조사예요. 다친 데는 없는지 먼저 볼게요. 어디 아프진 않죠?"

*세 사람의 시선이 모두 당신에게 모였다. 당신이 입을 열기도 전에, 도예은이 팔짱을 낀 채 턱짓을 했다.*

**도예은**: "자, 이제 네 차례야. 이름이랑, 할 줄 아는 거 말해 봐. {이름}, 맞지? 이름표에 그렇게 적혀 있던데."

\`\`\`
📊 생존 상태
포만감 100 (양호) | 수분 100 (양호) | 컨디션 100 (양호)

🤍 서하린 [경계] 호감도 0%
 - 📌 상태: 상황을 정리하며 경계 / 🧐
🧡 도예은 [경계] 호감도 0%
 - 📌 상태: 낯선 사람을 살피는 중 / 😑
💚 윤채원 [경계] 호감도 0%
 - 📌 상태: 부상 여부를 확인하려는 중 / 😟
\`\`\``,
    npcs: [
      { id: 'harin', name: '서하린', age: 31, role: '해양생물 연구원', personality: '침착하고 분석적이며 책임감이 강하다. 감정 표현에 서툴다.', description: '안경을 쓴 차분한 인상. 식물과 해류, 정수 방법을 안다.',
        schedule: sch('camp spring spring camp forest camp camp'), relationship: { affection: 0, trust: 0, love: 0 } },
      { id: 'yeeun', name: '도예은', age: 26, role: '서핑 강사', personality: '활달하고 직설적이다. 귀찮은 일은 질색이지만 몸 쓰는 일엔 앞장선다.', description: '그을린 피부에 탄탄한 체격. 수영과 사냥에 능하다.',
        schedule: sch('camp reef reef beach reef beach camp'), relationship: { affection: 0, trust: 0, love: 0 } },
      { id: 'chaewon', name: '윤채원', age: 29, role: '응급구조사', personality: '온화하고 세심하다. 겁이 많지만 다친 사람 앞에서는 단호해진다.', description: '단정하게 묶은 머리. 응급처치와 위생 관리를 맡는다.',
        schedule: sch('camp camp spring camp camp beach camp'), relationship: { affection: 0, trust: 0, love: 0 } },
    ],
    // NPC끼리의 첫 관계 [누가, 누구를, 호감, 신뢰, 애정]
    npcRelations: rels([['harin', 'chaewon', 10, 15], ['chaewon', 'harin', 15, 20], ['yeeun', 'harin', -5, 5], ['harin', 'yeeun', 0, 5], ['yeeun', 'chaewon', 10, 10], ['chaewon', 'yeeun', 10, 5]]),
    factions: [],
    templates: {
      sceneHeader: `> 🏝️ 장소: {장소} | 🌤️ 날씨: {날씨}
> ⏰ 시간: {N}일차 | {HH:MM}
> 🏕️ 거처: {단계}단계 {거처 이름}`,
      statusWindow: `\`\`\`
📊 생존 상태
포만감 {n} ({단계}) | 수분 {n} ({단계}) | 컨디션 {n} ({단계})

{이모지} {이름} [{관계 단계명}] 호감도 {n}%
 - 📌 상태: {지금 상태} / {감정 이모지}
(↑ 동료별로 반복)
\`\`\``,
    },
    relationStages: [
      { min: 0, name: '경계' },
      { min: 25, name: '동료' },
      { min: 50, name: '이성' },
      { min: 75, name: '썸' },
      { min: 92, name: '연인' },
    ],
  },
  {
    id: 'blockade',
    emoji: '🧟',
    name: '봉쇄 도시: 청암시',
    summary: '감염 사태로 봉쇄된 지 2년, 25개 구역으로 쪼개진 항구도시. 방주회·철책대·흑익회 사이에서 누구와 살아남을지 정하고, 도시의 판을 흔들어라.',
    tone: `
봉쇄 2년째의 항구도시 청암시. 치료약이 나올 때까지 정부는 도시를 봉쇄했고 구조대는 끝내 오지 않았다. 하늘에서 이따금 떨어지는 보급 상자만이 바깥세상이 있다는 증거다. 거리는 감염자가 메우고, 도시는 25개 구역으로 나뉘어 세 세력이 나눠 차지했다. 방주회(시립병원을 거점으로 한 구호·의료 자치조직, 대표 한서윤), 철책대(구 도청 청사의 군 잔존 부대, 사령관 강하은), 흑익회(항만 컨테이너 부두의 약탈 조직, 두목 마수진). 주인공은 어느 세력에도 속하지 않은 채 폐허의 빌라촌에서 물자를 뒤지다 스캐빈저 서가을과 마주친다.

- 3인칭 '—었다'체 지문과 인물 대사를 번갈아 쓴다. 지문은 문단 전체를 별표 한 쌍으로 감싸고, 대사는 한 줄에 한 사람씩 **이름 (소속)**: "대사" 형식으로 쓴다. 속마음은 **이름**: 💭 '생각' 형식으로 쓴다.
- 감각 묘사(소리·냄새·온기·피로)를 곁들이고, 총성·비명 같은 효과음은 단독 행으로 쓴다.
- 인물별 말투를 구분한다. 서가을은 능글맞고 건조한 반말, 한서윤은 부드럽지만 단호한 존댓말, 강하은은 짧고 단호한 군인 말투, 마수진은 거칠고 비웃는 말투, 문채영은 깍듯한 존댓말.
- 단역은 [철책대 순찰병], [방주회 의무병]처럼 역할명으로 표기한다.
- 한 번의 실수가 죽음으로 이어진다. 안전한 선택지는 거의 없고 어느 선택에도 대가가 따른다. 장면 끝은 긴장을 남기며 끊는다.

1. 오프닝: 첫 장면(opening)이 이미 화면에 있다. 그 장면에서 이어서 진행하고 소개를 반복하지 않는다. 주인공은 무소속으로 시작하며, 소속은 이야기 속에서 스스로 정한다.
2. 장면 헤더: 매 장면 시작 시 templates.sceneHeader 형식으로 날짜·시각·시간대·구역을 적는다. 시간은 앱의 현재 상태 값을 그대로 쓴다. 시간대는 06~18시 주간, 18~22시 저녁, 22~06시 심야다.
3. 상태창: 매 응답 끝에 templates.statusWindow 형식의 INFO 코드블록으로 출력한다. 수치와 단계명은 앱의 현재 상태 값을 그대로 옮겨 적고 임의로 바꾸지 않는다.
4. 판정: 사격·잠입·추격·제압·협상처럼 결과가 불확실한 행동은 장면 헤더 아래에 "> 시도: {행동}" 과 "> 결과: {성공|부분성공|실패}" 두 줄을 적고 결과를 서술한다. 근거는 주인공의 능력치, 장비, 상황의 위험도다. 준비가 부족하거나 위험한 상황이면 부분성공이나 실패를 준다. 성공만 반복하지 않는다. 부분성공은 목적을 이루되 대가를 치른다(부상, 소음, 소모품 손실, 평판 하락).
5. 구역 점령: 앱의 세력도 숫자는 각 세력이 차지한 구역 수다. 미확보(위험구역)는 25에서 세 세력의 합을 뺀 값이다. 임무 결과로 구역이 넘어갈 때만 factionChanges로 알리고, 구역이 한 세력에서 다른 세력으로 넘어가면 한쪽은 −1, 다른 쪽은 +1이다.
6. 임무 흐름: 임무는 반드시 ①→② 순서로만 진행한다. ① 먼저 templates.missionCard 형식의 임무 카드를 제시한다. 카드에는 임무명, 임무종류(히로인·세력·기타), 의뢰인, 난이도(★~★★★), 목표, 성공 시와 실패 시의 구역 증감, 의뢰인 호감도 변화를 빠짐없이 적는다. ② 카드를 제시한 뒤에만 수락·조건 협상·거절·정보 탐색 선택지를 낸다. 금지: 카드 없이 "임무 수락", "조건 협상", "임무를 수행하겠다" 취지의 선택지나 서술을 내지 않는다. choices 필드도 같다. 한 번에 하나의 임무만 진행하고, 정산 후 퀘스트를 비운다.
7. 호감도: relationStages를 따른다(Lv.1 0~ / Lv.2 40~ / Lv.3 70~). 임무 성공 시 의뢰인 +8, 조건을 붙여 수락하면 +6, 실패하면 −5. 아직 만나지 않은 인물은 상태창에 ⏳ 대기로 표기하고 호감도 0을 유지하며, 위치와 속마음은 소문 수준으로만 쓴다.
8. 위험: 심야에는 감염자와 약탈자가 늘어난다. 구역 상태 태그는 🔴위험구역 / 🕊️방주회 / 🛡️철책대 / 🦅흑익회 / ⚪중립 중 하나다. 탄약과 의약품은 한정되어 있고 쓰면 줄어든다.
9. 시간: 대화와 짧은 행동은 5~20분, 수색·잠입은 1~3시간이 걸린다. 장거리 이동은 서술을 압축하고 시간을 점프시킨다(최대 6시간).
10. 수위: 모든 인물은 성인이다. 성적 수위는 앱의 성인 모드 설정을 따르고, 합의 없는 성적 행위는 묘사하지 않는다. 일반 모드에서는 장면 전환으로 넘어간다. 캐릭터의 매력은 위압감·말투·권위·분위기로 표현한다.`,

    modules: { economy: true, stats: true },
    currency: '보급표',
    time: { startDay: 1, startHour: 14, defaultMinutes: 15, minMinutes: 5, maxMinutes: 360 },
    goal: { title: '청암시의 판을 바꿔라', description: '30일 안에 한 세력이 도시의 절반(13구역)을 넘게 하거나, 봉쇄 너머와 연결되는 통신을 확보하라.', days: 30 },
    endings: [
      { id: 'order', title: '도시의 새 질서', description: '한 세력이 도시의 절반을 넘겼다. 주인공의 선택이 청암시의 다음 2년을 정한다.' },
      { id: 'breakout', title: '봉쇄 너머로', description: '봉쇄 너머와 닿는 통신이 열렸다. 도시는 처음으로 바깥의 답을 듣는다.' },
      { id: 'fallen', title: '폐허의 끝', description: '주인공은 쓰러졌고, 청암시의 밤은 아무 일 없었다는 듯 이어진다.' },
    ],
    protagonist: {
      role: '무소속 생존자', background: '봉쇄 이후 2년을 혼자 버텨 온 생존자. 어느 세력의 깃발도 아직 고르지 않았다.',
      name: '서진', personality: '냉정하고 눈치가 빠름', appearance: '낡은 군용 점퍼, 날카로운 눈매',
      stats: { 사격: 3, 근접: 2, 은신: 2, 교섭: 2, 체력: 10 }, money: 3, inventory: ['리볼버 (6발)', '단검', '구급 키트'],
    },
    startLocation: 'ruins',
    places: [
      { id: 'ruins', name: '외곽 빌라촌', description: '2년째 비어 있는 폐허 주거지. 물자가 남았지만 감염자가 자주 드나드는 위험구역.' },
      { id: 'ark', name: '방주회 거점: 시립병원', description: '바리케이드와 소독 천막으로 둘러싼 병원. 치료와 구호가 이뤄지는 가장 평화로운 곳.' },
      { id: 'hq', name: '철책대 거점: 구 도청', description: '철조망과 장갑차가 늘어선 군 잔존 부대의 요새. 규율이 빡빡하고 물자가 가장 많다.' },
      { id: 'port', name: '흑익회 거점: 컨테이너 부두', description: '컨테이너를 쌓아 올린 약탈 조직의 소굴. 밤마다 술판과 비명이 번갈아 들린다.' },
      { id: 'bazaar', name: '중립 시장: 지하상가', description: '세 세력 누구도 건드리지 않는 암시장. 정보와 물자, 소문이 오간다.' },
      { id: 'drop', name: '보급 투하지: 백화점 옥상', description: '공중 보급 상자가 떨어지는 옥상. 상자가 내려올 때마다 세 세력이 몰려든다.' },
    ],
    opening: `> 📅 봉쇄 2년 1일차 | ⏰ 14:00 | 주간 | 📍 외곽 구역[🔴 위험구역], 폐허가 된 빌라촌

*전 세계를 덮친 감염 사태는 대도시를 차례로 삼켰고, 항구도시 청암시도 예외가 아니었다.*

*정부는 치료약이 나올 때까지 도시를 봉쇄했다. 그로부터 2년. 구조대는 오지 않았고, 이따금 하늘에서 떨어지는 보급 상자만이 바깥세상이 아직 있다는 증거였다.*

*당신은 텅 빈 빌라 건물을 뒤지고 있었다. 부엌 서랍을 열던 순간, 등 뒤에서 공이치기를 당기는 소리가 났다.*

**서가을 (스캐빈저)**: "거기, 멈춰. 손에 든 거 천천히 내려놓고."

*돌아보니 낡은 군용 재킷을 걸친 여자가 권총을 겨누고 있었다. 청암시에서 낯선 사람과의 만남은 대개 죽음으로 끝났지만, 총구 너머의 눈에는 적의보다 호기심이 어려 있었다.*

**서가을 (스캐빈저)**: "빈손으로 이런 데를 뒤지다니, 배짱 한번 좋네. 세력 소속은 아닌 것 같은데... 이름이 뭐야? {이름}이라고 적힌 이름표가 나오긴 하던데, 맞아?"

\`\`\`INFO
[기본정보]
🏷️ 소속: 무소속
🔫 무장: 리볼버 · 단검

[세력별 점령 현황] (총 25개 구역)
🕊️ 방주회: 2/25 구역
🛡️ 철책대: 4/25 구역
🦅 흑익회: 5/25 구역
🔴 위험구역·미확보: 14/25 구역

[진행 중인 퀘스트]
📋 없음

[호감도]
[서가을 (스캐빈저)]
❤️ 호감도: 5% [Lv.1]
(한서윤 ⏳ 대기)
(강하은 ⏳ 대기)
(마수진 ⏳ 대기)
(문채영 ⏳ 대기)
\`\`\``,
    npcs: [
      { id: 'gaeul', name: '서가을', age: 30, role: '스캐빈저 (무소속)', personality: '능글맞고 건조하다. 정보통이며 쓸모 있는 사람을 알아보는 눈이 있다.', description: '낡은 군용 재킷에 권총. 폐허 곳곳의 지름길을 꿰고 있다.',
        schedule: sch('ruins ruins bazaar bazaar ruins bazaar ruins'), relationship: { affection: 5, trust: 5, love: 0 } },
      { id: 'seoyun', name: '한서윤', age: 34, role: '방주회 대표 (전직 의사)', personality: '부드럽지만 단호하다. 식구를 지키려 폐쇄적이 된 이상주의자.', description: '흰 가운 위에 방탄 조끼를 걸친 여의사. 피로가 눈 밑에 깔려 있다.',
        schedule: sch('ark ark ark ark ark ark ark'), relationship: { affection: 0, trust: 0, love: 0 } },
      { id: 'haeun', name: '강하은', age: 36, role: '철책대 사령관', personality: '규율과 명령을 신봉하는 냉정한 지휘관. 부하를 버리지 않는다.', description: '짧은 머리에 흉터가 있는 장교. 한 번 본 얼굴은 잊지 않는다.',
        schedule: sch('hq hq hq hq drop hq hq'), relationship: { affection: 0, trust: 0, love: 0 } },
      { id: 'sujin', name: '마수진', age: 33, role: '흑익회 두목', personality: '거칠고 변덕스럽다. 약자를 비웃고 강한 상대에게 흥미를 보인다.', description: '검은 깃털 장식의 가죽 코트. 웃을 때 눈은 웃지 않는다.',
        schedule: sch('port port port port port port bazaar'), relationship: { affection: 0, trust: 0, love: 0 } },
      { id: 'chaeyoung', name: '문채영', age: 27, role: '철책대 정보장교', personality: '깍듯하고 계산이 빠르다. 사령관에게 절대적으로 충성한다.', description: '서류 가방을 들고 다니는 단정한 장교. 도시 지도를 머릿속에 넣고 있다.',
        schedule: sch('hq hq bazaar hq hq hq hq'), relationship: { affection: 0, trust: 0, love: 0 } },
    ],
    // NPC끼리의 첫 관계 [누가, 누구를, 호감, 신뢰, 애정]
    npcRelations: rels([
      ['seoyun', 'haeun', -5, 10], ['haeun', 'seoyun', 0, 15], ['haeun', 'sujin', -35, -40], ['sujin', 'haeun', -20, -25],
      ['seoyun', 'sujin', -40, -50], ['sujin', 'seoyun', -10, -15], ['chaeyoung', 'haeun', 40, 70], ['haeun', 'chaeyoung', 30, 60],
      ['gaeul', 'seoyun', 15, 20], ['gaeul', 'sujin', -15, -20],
    ]),
    factions: [
      { id: 'ark', name: '방주회', description: '시립병원을 거점으로 한 구호·의료 자치조직. 점령 구역 수.', standing: 2 },
      { id: 'guard', name: '철책대', description: '구 도청 청사의 군 잔존 부대. 점령 구역 수.', standing: 4 },
      { id: 'raven', name: '흑익회', description: '항만 컨테이너 부두의 약탈 조직. 점령 구역 수.', standing: 5 },
    ],
    templates: {
      sceneHeader: `> 📅 봉쇄 2년 {N}일차 | ⏰ {HH:MM} | {주간|저녁|심야} | 📍 {구역}[{상태 태그}], {세부 장소}`,
      missionCard: `📋 임무 — {임무명} · {의뢰인}
| 임무종류 | {히로인|세력|기타} | 난이도 {★~★★★} |
| 목표 | {목표 내용} |
| 성공 | {세력} 구역 +{n} · {세력} 구역 −{n} · {의뢰인} 호감도 +{n} |
| 실패 | {결과} · {의뢰인} 호감도 −{n} |`,
      statusWindow: `\`\`\`INFO
[기본정보]
🏷️ 소속: {소속}
🔫 무장: {무장}

[세력별 점령 현황] (총 25개 구역)
🕊️ 방주회: {n}/25 구역
🛡️ 철책대: {n}/25 구역
🦅 흑익회: {n}/25 구역
🔴 위험구역·미확보: {n}/25 구역

[진행 중인 퀘스트]
📋 {없음 | 임무명 | 임무종류: {히로인|세력|기타}}
임무목표: {목표}

[호감도]
[{이름} ({소속})]
❤️ 호감도: {n}% [{단계명}]
(↑ 만난 인물별로 반복, 아직 만나지 않은 인물은 (이름 ⏳ 대기))
\`\`\``,
    },
    relationStages: [
      { min: 0, name: 'Lv.1' },
      { min: 40, name: 'Lv.2' },
      { min: 70, name: 'Lv.3' },
    ],
  },
];
