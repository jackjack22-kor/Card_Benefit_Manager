# Firebase Hosting 전환 계획서

작성일: 2026-07-06

## 결론

CardFit 프론트엔드는 GitHub Pages에서 Firebase Hosting으로 전환해도 구조적 리스크가 낮습니다. 앱은 정적 Vite/PWA이고 Firebase Auth/Firestore 설정도 이미 `cardfit-ee4b5` 프로젝트를 바라보고 있습니다.

다만 전환은 단순 URL 변경이 아니라 **origin 변경**입니다. GitHub Pages와 Firebase Hosting은 브라우저 저장소, 서비스워커, PWA 설치 상태가 서로 분리됩니다. 따라서 Firebase Hosting 배포를 먼저 검증하고, 기존 GitHub Pages는 일정 기간 병행한 뒤 정리하는 방식이 가장 안전합니다.

## 목표 주소

- 기본 Hosting 주소: `https://cardfit-ee4b5.web.app`
- 보조 Hosting 주소: `https://cardfit-ee4b5.firebaseapp.com`

`cardfit.firebaseapp.com`은 사용할 수 없습니다. Firebase 기본 도메인은 프로젝트 ID를 기반으로 자동 생성되며, 현재 프로젝트 ID가 `cardfit-ee4b5`입니다. 짧은 주소가 필요하면 나중에 별도 커스텀 도메인을 연결하는 방식이 맞습니다.

## 적용한 저장소 설정

- `.firebaserc`: 기본 Firebase project를 `cardfit-ee4b5`로 고정
- `firebase.json`: Hosting public 디렉터리, SPA rewrite, 캐시 헤더, Firestore rules 경로 정의
- `tools/prepare-hosting-build.mjs`: Vite 빌드 후 `image/clean` 카드 이미지를 `dist`로 복사
- `package.json`
  - `build:hosting`: Firebase Hosting용 빌드
  - `deploy:hosting`: 로컬 Firebase CLI 배포용 보조 명령
- `.github/workflows/firebase-hosting.yml`: GitHub Actions 기반 Firebase Hosting live 배포 워크플로

## 코드 변경 범위

이번 전환 준비 단계에서는 앱 런타임 로직을 바꾸지 않습니다.

- 카드/혜택 계산 로직 변경 없음
- Firebase Auth/Firestore 동기화 로직 변경 없음
- 앱 기능 UI 변경 없음. 설정 화면의 저장 안내 문구만 Firebase Hosting 기준으로 갱신
- 배포 산출물과 캐시 정책만 Hosting에 맞게 분리

Auth 유지 문제가 계속 재현되면 별도 작업으로 `src/lib/sync/firebaseClient.js`의 Auth persistence fallback을 더 보강합니다. Hosting 전환과 분리해서 검증하는 편이 원인 추적에 유리합니다.

## 배포 전략

1. 저장소 설정 반영
2. Firebase Console에서 Hosting 활성화 및 Auth 허용 도메인 확인
3. GitHub secret을 추가한 뒤 GitHub Actions로 Firebase Hosting 배포
4. `web.app` / `firebaseapp.com` 주소에서 로그인, 동기화, PWA 설치, iOS/Android 동작 확인
5. 문제가 없으면 README와 앱 안내에서 Firebase Hosting을 최종 기본 주소로 확정
6. 기존 GitHub Pages는 자동 배포를 중단하고 필요할 때만 수동 fallback으로 유지

## 사용자가 해야 할 Firebase 설정

### 1. Authentication 허용 도메인 확인

Firebase Console > Authentication > Settings > Authorized domains에서 아래 도메인을 확인합니다.

- `cardfit-ee4b5.firebaseapp.com`
- `cardfit-ee4b5.web.app`
- `jackjack22-kor.github.io`는 병행 기간 동안 유지

### 2. Hosting 활성화

Firebase Console > Hosting에서 시작을 눌러 Hosting을 활성화합니다. 이미 활성화되어 있으면 건너뛰어도 됩니다.

### 3. GitHub Actions 배포 secret 추가

GitHub Actions에서 자동 배포하려면 저장소 secret이 필요합니다.

권장 방법:

1. 로컬 PC에서 Firebase CLI 로그인
2. `firebase init hosting:github`
3. 프로젝트 `cardfit-ee4b5`, 사이트 `cardfit-ee4b5` 선택
4. GitHub 저장소 `jackjack22-kor/Card_Benefit_Manager` 연결
5. 생성된 service account secret을 GitHub에 저장

수동으로 설정할 경우 GitHub 저장소 > Settings > Secrets and variables > Actions > New repository secret에 아래 이름으로 추가합니다.

```text
FIREBASE_SERVICE_ACCOUNT_CARDFIT_EE4B5
```

secret이 없으면 GitHub Actions 워크플로는 빌드까지만 실행하고 배포 단계는 건너뜁니다.

## 로컬 배포 명령

Firebase CLI가 설치되어 있고 로그인되어 있다면 아래 명령으로 직접 배포할 수 있습니다.

```bash
npm run build:hosting
firebase deploy --only hosting
```

Firestore rules는 Hosting 배포와 별개입니다. 규칙을 바꿨을 때만 아래 명령으로 별도 배포합니다.

```bash
firebase deploy --only firestore:rules
```

## 주요 리스크와 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| origin 변경 | 기존 GitHub Pages localStorage와 PWA가 Firebase URL로 자동 이전되지 않음 | Google 동기화 사용자는 로그인 후 복구, 비로그인 사용자는 JSON 백업/복원 안내 |
| PWA 재설치 필요 | 홈화면 아이콘이 기존 Pages URL을 계속 열 수 있음 | Firebase URL에서 새로 홈 화면 추가 |
| Auth 허용 도메인 누락 | Google 로그인 실패 또는 리다이렉트 실패 | `web.app`, `firebaseapp.com`, 병행 기간의 GitHub Pages 도메인 등록 |
| 서비스워커 캐시 | 구버전 앱이 남아 보일 수 있음 | `/`, `index.html`, `sw.js`를 no-cache로 설정 |
| dual hosting drift | Pages와 Firebase 중 어느 URL이 최신인지 혼란 | Firebase Hosting을 기본 주소로 쓰고, Pages 자동 배포는 끈 상태에서 수동 fallback으로만 유지 |
| GitHub secret 누락 | Actions에서 배포가 실행되지 않음 | workflow가 빌드 성공 후 deploy skip 메시지를 출력하도록 구성 |
| Firebase 무료 한도 | 개인 사용량에서는 문제 가능성이 낮음 | Hosting 전송량과 Firestore 읽기/쓰기 사용량을 Firebase Usage에서 주기 확인 |

## 검증 체크리스트

- `npm run audit:check`
- `npm run build:hosting`
- `npm run build:pages`
- `git diff --check`
- Firebase Hosting URL에서 첫 로딩 확인
- iPhone Safari/PWA에서 Google 로그인 유지 확인
- Galaxy Samsung Internet/PWA에서 Google 로그인 유지 확인
- 한 기기에서 금액 입력 후 다른 기기에서 동기화 확인
- 오프라인 상태에서 앱이 열리는지 확인
- 설정 > JSON 내보내기/불러오기 동작 확인

## 전환 완료 기준

아래 항목을 모두 만족하면 Firebase Hosting을 기본 운영 주소로 전환해도 됩니다.

- Firebase Hosting URL에서 2대 이상 기기 동기화 성공
- 앱 재실행 후 Google 로그인 상태 유지
- iOS/Android 홈화면 PWA 진입 성공
- 주요 화면 카드 이미지와 서비스워커 캐시 정상
- GitHub Actions Firebase Hosting 워크플로 성공
- 기존 GitHub Pages 자동 배포가 중단되어 Firebase Hosting이 유일한 최신 운영 주소임
