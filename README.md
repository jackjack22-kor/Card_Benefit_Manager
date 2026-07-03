# 카드 혜택 매니저

개인 보유 신용카드의 실적, 월/연 혜택 한도, 사용 횟수, 사용처별 추천 카드를 관리하는 개인용 웹앱입니다.

현재 권장 사용 방식은 **GitHub Pages 배포 URL을 스마트폰 브라우저에서 여는 방식**입니다. Android에서 단일 HTML 파일을 직접 여는 방식도 유지하지만, iPhone에서는 `file://` 로컬 파일보다 Safari에서 HTTPS Pages URL로 접속하는 방식이 안정적입니다.

## 바로 쓰는 주소

GitHub Pages 설정이 끝나면 아래 주소로 접속합니다.

```text
https://jackjack22-kor.github.io/Card_Benefit_Manager/
```

스마트폰 홈 화면에 추가할 때도 이 주소를 Safari 또는 Chrome/Samsung Internet에서 연 뒤 브라우저의 공유/메뉴 기능을 사용합니다.

## GitHub Pages 배포

이 저장소는 GitHub Actions로 Pages를 자동 배포합니다.

1. GitHub 저장소에 `main` 브랜치를 push합니다.
2. GitHub 저장소에서 `Settings` > `Pages`로 이동합니다.
3. `Build and deployment`의 `Source`를 `GitHub Actions`로 선택합니다.
4. `Actions` 탭에서 `Deploy GitHub Pages` 워크플로가 성공했는지 확인합니다.
5. `https://jackjack22-kor.github.io/Card_Benefit_Manager/` 주소로 접속합니다.

워크플로는 `npm ci` 후 `npm run build:pages`를 실행하고, `dist/index.html`을 Pages에 올립니다. `dist/index.html`은 단일 HTML 빌드 결과인 `dist/card-benefit-manager.html`을 복사해 생성합니다.

## iPhone 사용 가이드

iPhone에서는 HTML 파일을 `파일` 앱에서 직접 실행하는 방식은 권장하지 않습니다. 빈 화면이 보이거나 Safari 저장소가 안정적으로 연결되지 않을 수 있습니다.

권장 방식:

1. iPhone Safari에서 `https://jackjack22-kor.github.io/Card_Benefit_Manager/` 접속
2. 하단 공유 버튼 선택
3. `홈 화면에 추가` 선택
4. 이름 확인 후 `추가`

이 방식은 PWA 설치가 아니라 Safari 웹 클립 바로가기입니다. 그래도 홈 화면 아이콘으로 바로 진입할 수 있고, 데이터는 Safari의 해당 GitHub Pages 주소 저장소에 보관됩니다.

## Android 사용 가이드

Android는 두 가지 방식이 가능합니다.

- 권장: Chrome 또는 Samsung Internet에서 GitHub Pages 주소 접속 후 메뉴에서 `홈 화면에 추가`
- 보조: `dist/card-benefit-manager.html` 파일을 스마트폰으로 복사해 브라우저에서 직접 열기

로컬 HTML 파일을 직접 열면 브라우저별 `file://` 저장소 정책 차이로 데이터 보관 방식이 달라질 수 있습니다. 여러 기기에서 계속 쓸 계획이라면 GitHub Pages 주소로 접속하는 편이 더 예측 가능합니다.

## 빌드 방법

```bash
npm install
npm run build:pages
```

빌드 후 아래 파일이 생성됩니다.

```text
dist/card-benefit-manager.html
dist/index.html
```

개발 중에는 다음 명령으로 Vite 개발 서버를 사용할 수 있습니다.

```bash
npm run dev
```

## 데이터 저장 방식

이 앱은 카드번호, 계좌, 로그인 정보, 카드사 인증정보를 저장하지 않습니다. 실제 사용 데이터는 현재 브라우저의 `localStorage`에 저장됩니다.

주의할 점:

- GitHub Pages는 앱 파일만 호스팅하며, 개인 사용 데이터는 GitHub로 업로드되지 않습니다.
- Safari, Samsung Internet, Chrome은 저장소가 서로 다를 수 있습니다.
- 같은 스마트폰이라도 다른 브라우저에서 열면 기존 데이터가 보이지 않을 수 있습니다.
- 브라우저 캐시/사이트 데이터 삭제 시 localStorage 데이터도 사라질 수 있습니다.
- 스마트폰 변경, 브라우저 변경, 데이터 삭제 전에는 반드시 JSON 백업을 내보내야 합니다.

## JSON 백업/복원

설정/백업 화면에서 JSON 내보내기와 불러오기를 제공합니다.

- 내보내기 파일명: `card-benefit-backup-YYYY-MM-DD.json`
- 불러오기 방식: `input type=file`로 백업 JSON 선택
- 백업에는 카드 순서, 카드별 설정, 월/연 실적, 혜택 사용내역, 메모, 포인트 가치, 마지막 백업일이 포함됩니다.
- 마지막 백업 후 30일 이상 지나면 앱에서 백업 권장 메시지를 표시합니다.

iPhone Safari의 GitHub Pages 접속 환경에서는 JSON 내보내기/불러오기가 가능합니다. 내보낸 파일은 보통 `파일` 앱의 다운로드 위치에 저장되고, 복원할 때는 설정/백업 화면의 불러오기 버튼으로 해당 JSON 파일을 선택하면 됩니다.

데이터 이동 시나리오:

1. 현재 스마트폰에서 JSON 내보내기
2. 백업 JSON 파일을 새 스마트폰으로 이동
3. 새 스마트폰에서 GitHub Pages 주소 접속
4. 설정/백업 화면에서 JSON 불러오기 실행
5. 기존 카드 설정과 혜택 사용내역 복원 확인

실제 백업 JSON에는 개인 카드 사용 패턴이 들어갑니다. GitHub, 공개 저장소, 공유 링크에 올리지 마세요.

## 핵심 화면

- **카드 현황**: 카드별 전월실적 상태와 이번달 실적 현황을 빠르게 확인
- **결제 추천**: 업종/세부 사용처/금액 기준 최대 혜택 카드 추천 + 실적 채우기 추천
- **카드 상세**: 월/연 실적, 주요 혜택 사용 현황, 혜택 상세 및 사용 관리
- **설정/백업**: 포인트 가치 설정, 카드 순서 편집, JSON 백업/복원, 데이터 이동 안내

## 개발 구조

개발용 소스는 `src/` 구조를 유지합니다.

- 카드/혜택 데이터: `src/data/cards.js`
- 추천 카테고리: `src/data/categories.js`
- 추천 로직: `src/lib/recommend.js`
- 연간 주기 계산: `src/lib/cycles.js`
- localStorage와 백업 스키마: `src/lib/storage.js`
- 화면 렌더링: `src/main.js`
- 스타일: `src/styles.css`
- 단일 HTML 생성: `tools/build-single.mjs`
- GitHub Pages용 index 생성: `tools/build-pages.mjs`

## 카드 추가 방법

`src/data/cards.js`에 카드 객체를 추가합니다.

필수 구조:

```js
{
  id: 'unique-card-id',
  issuer: '카드사',
  name: '카드명',
  shortName: '짧은 이름',
  defaultCycle: { type: 'calendar', startMonth: 1 },
  monthlyTargets: [300000],
  annualTargets: [],
  benefits: [
    {
      id: 'unique-benefit-id',
      name: '혜택명',
      type: 'amount_cap',
      priority: 'core',
      categories: ['coffee'],
      rate: 0.1,
      monthlyCap: 10000,
      summary: '요약',
      targets: '대상 사용처',
      exclusions: '제외 조건',
      conditions: '조건',
      homeLabel: '홈 표시명'
    }
  ]
}
```

## 향후 확장 옵션

이번 버전에서는 GitHub Pages 배포까지 지원합니다. 아직 아래 기능은 구현하지 않습니다.

- service worker, manifest, 오프라인 PWA 설치 프롬프트
- Android WebView/APK 패키징
- NAS 동기화 또는 클라우드 동기화
- 암호화 원격 백업

이 기능들은 현재 웹앱 사용성이 안정화된 뒤 확장 후보로 검토합니다.
