# 변경 이력 (Changelog)

사람이 읽는 변경 요약입니다. 상세 diff는 git 로그를 참고하세요.
**새 작업을 이어서 할 때는 이 파일 최상단에 최신 변경을 추가**해 항상 최신 기준을 유지하세요. (Codex/Claude 공용 기준 문서)

## 2026-07-04

### 클라우드 동기화 준비
- **Firebase 적용 계획서 추가**: 비로그인=localStorage 전용, 로그인=Firebase Auth + Firestore 동기화 구조를 전제로 `docs/FIREBASE_SYNC_PLAN.md` 작성. 사용자 Firebase 콘솔 설정 체크리스트, Firestore 데이터 모델, 보안 규칙 초안, 구현 단계, 확인 질문을 정리. README/ROADMAP에서 참조 연결.
- **Firebase Auth + Firestore 동기화 1차 구현**: `CardFit` Firebase 웹앱 설정(`cardfit-ee4b5`)을 연결하고, 설정/백업 탭에 Google 로그인, 동기화 상태, 수동 동기화, 로그아웃 UI 추가. 비로그인 localStorage 모드는 유지하고, 로그인 시 `users/{uid}/private/cardfit` 문서에 현재 상태 스냅샷을 저장/병합/구독.

### 추천 정확도 · 입력 개선
- **결제추천 조건 미충족 힌트**: 조건 때문에 혜택가치가 밀린 카드에 사유를 앰버 힌트로 표시(예: `최소 12,000원 이상 필요`, `전월실적 미달`). `scoreCard()`가 `conditions` 배열을 반환하고, `renderRankItem()`이 렌더링. 혜택가치 0(예: SKT 우리카드)이면 큰 힌트, 기본 소액 혜택은 있으나 일부 조건 미충족(예: The O)이면 작은(compact) 힌트를 함께 표시. 중복을 줄이려 설명문장의 `· 조건 확인:` 꼬리표는 제거. (src/lib/recommend.js, src/main.js)
- **금액 입력 천단위 콤마 통일**: 결제 예정 금액, 혜택 `이번달 사용금액` / `혜택 사용액·적립액`, 횟수형 `혜택금액` 입력을 `type="text" inputmode="numeric" data-money-input`으로 변경, 저장 시 콤마 제거 파싱(`replace(/[^\d]/g,'')`). 포인트 가치 입력은 소수점 값이라 제외.
- **혜택 메모**: 입력마다 전체 `render()`를 호출하던 것을 **blur 저장**으로 변경(모바일 커서/포커스 흔들림 방지). 숫자 필드는 기존대로 change+blur.
- **정렬 모드 탭 가드**: `state.isSortingCards`일 때 대시보드 카드 탭으로 상세 진입하지 않도록 차단(순서 변경에 집중).

### 실적 / 혜택 UI
- **대시보드 진행바 상태 색상화**: 달성=초록(발광), 부족=앰버, 관리없음=중립 회색. (카드사 브랜드색을 따라 회색으로 묻히던 달성 여부를 명확화)
- **카드상세 혜택 박스 접기/펼치기**: `<details>` 기반. 기본은 요약(혜택명 + 월/연/한도 라벨 칩)만, 탭하면 상세·입력·메모 노출. 세션 내 펼침 상태 유지(`openBenefits` Set — 값 입력 재렌더 시 접히지 않음).

### 리디자인 · 브랜딩 · PWA
- **CardFit 브랜딩**: 앱 이름·로고·파비콘·앱 아이콘(`public/icons/`).
- **설치형 + 오프라인 PWA**: `public/manifest.webmanifest`(standalone), `public/sw.js`(network-first), iOS 홈화면 메타. `public/`는 Vite 빌드 시 `dist/`로 자동 복사.
- **4개 화면 UI 리디자인**(카드현황/결제추천/카드상세/설정): 소프트 라운드, 카드사 브랜드 그라데이션(`theme-*` → `--card-accent`), 아이콘 하단 탭, 상단 요약 칩.
- 결제추천 실적 채우기 랭킹의 세로 깨짐·중복 표시 수정(부족액 배지).

## 참고: 데이터 저장 규칙
- localStorage 키 `cardBenefitManager.v1` **고정**. `migrateState()`가 기본값 위에 저장값을 병합하므로 앱을 업데이트해도 기존 입력값(실적·혜택 사용내역·메모·순서·포인트 가치)은 보존됩니다.
- **스키마를 크게 바꿀 때(키 변경 등)만 별도 마이그레이션이 필요**합니다. 그 외 새 카드/새 필드 추가는 병합으로 안전하게 보존됩니다.
