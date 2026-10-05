# 시뮬레이션 RP

Gemini AI가 게임 마스터가 되는 웹앱 시뮬레이션 RP 게임.

- 설계서: [docs/SPEC.md](docs/SPEC.md)
- 결정 기록: [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)

## 플레이
- 주소: https://fabienbshin.github.io/Test/ (GitHub Pages를 켠 뒤)
- **앱으로 설치**: 휴대폰 크롬은 메뉴 → "홈 화면에 추가", 아이폰 사파리는 공유 → "홈 화면에 추가", PC 크롬은 주소창 오른쪽의 설치 버튼
- API 키가 없으면 테스트 모드로 동작합니다. 설정(⚙️)에서 Gemini API 키를 넣으면 AI가 이야기를 만듭니다.
- 한 번 열어두면 인터넷이 끊겨도 앱이 열립니다(AI 응답에는 인터넷 필요).

## 화면과 프리셋
- 상단 **Aa** 버튼: 채팅형/소설형, 글자 크기, 줄 간격 (이 브라우저에 저장)
- 프리셋에 선택 필드를 둘 수 있다: `templates`, `relationStages`, `startChoices`, `opening`, `meters`, `initialFlags` (설명은 `docs/OPEN_QUESTIONS.md`)

## 배포
`main` 브랜치에 올라가면 GitHub Actions가 테스트를 돌리고, 통과하면 GitHub Pages에 자동으로 배포합니다.
처음 한 번은 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿔야 합니다.

## 개발
빌드 과정 없는 정적 웹앱입니다.
- 로컬 실행: `python3 -m http.server` 후 `http://localhost:8000`
- 테스트: `npm install` 후 `npm test`(단위), `npm run test:e2e`(브라우저)
