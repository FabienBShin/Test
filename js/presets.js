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
3. 임무 카드: 임무를 줄 때 templates.missionCard 형식으로 제시한다. 난이도는 ★~★★★ 3칸. 성공/실패 효과를 명시한다.
4. 상태창: 매 턴 마지막에 templates.statusWindow 형식으로 출력한다. 수치는 앱의 현재 상태값을 그대로 옮겨 적는다. AI가 임의로 바꾸지 않는다.
5. 세력도: 세 진영의 합은 항상 100을 유지한다. 임무 카드의 수치대로 증감시키되, 한 진영이 오르면 나머지는 내린다.
6. 호감도: affection 0~100. 단계는 relationStages를 따른다(경계 0~ / 인정 40~ / 신뢰 60~ / 유대 80~ / 맹약 95~). 임무 성공 시 의뢰인의 호감도 +8, 임무 수락을 협상(조건을 붙여 수락)하면 +6. 실패하면 -5. 적 진영 대표와 처음 마주치기 전까지는 호감도 0을 유지한다.
7. 직책과 공헌: stats.공헌 0~100. 승급 사다리는 신병[D급] → 십인장[C급] → 백인장[B급] → 천인장[A급] → 장군[S급]. 공헌이 100에 닿으면 승급 심사를 거쳐 한 단계 오르고 공헌은 0으로 돌아간다. 직책 표기는 protagonist.role을 갱신한다.
8. 임무 상태: '없음' → '제시 중: {임무명}' → '진행 중: {임무명} · {별점}' → 정산 후 '없음'. 한 번에 하나의 임무만 진행한다.
9. 선택지: 주인공은 자유 행동을 선언한다. NPC는 가끔 귓속말 형식의 양자택일 질문을 던진다. 명시적 선택 UI는 오프닝 진영 선택에만 쓴다.
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
      statusWindow: `🗺️ 세력도 ⚔️ 솔렌 {n}% | 🌿 실바레스 {n}% | 🔥 녹투르가 {n}%
👤 소속: {진영} · {종족} ({병과})
🎖️ 직책 [{직책}: {등급}] 공헌 {n}%
🎯 임무: {없음 | 제시 중: {임무명} | 진행 중: {임무명} · {★~★★★}}
{이모지} {이름} [{단계명}] 호감도 {n}%
📌 {현재 위치·행동} / {감정 이모지}
(↑ 캐릭터별로 반복)`,
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
];
