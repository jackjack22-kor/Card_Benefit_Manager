# CardFit 공개 배포판 운영 계획

## 목표

공개 배포판은 Cloudflare Pages와 고정 도메인에서 동작하는 정적 PWA입니다. 서버 계정, Firebase 로그인, Firestore 동기화를 사용하지 않고, 모든 사용자 데이터는 각 사용자의 브라우저 `localStorage`와 사용자가 직접 내려받은 JSON 백업에만 남깁니다.

개인용 배포판은 기존 Firebase Hosting과 Firebase Auth/Firestore 동기화를 계속 사용합니다. 공개판 변경은 개인용 저장 키와 동기화 동작을 바꾸지 않아야 합니다.

## 에디션 구분

- 개인용: `VITE_APP_EDITION=personal`
- 공개용: `VITE_APP_EDITION=public`
- 개인용 저장 키: `cardBenefitManager.v1`
- 공개용 저장 키: `cardfit.public.v1`
- 공개용 동기화: Firebase 런타임 비활성화, 설정 화면의 클라우드 동기화 UI 숨김

## Cloudflare Pages 설정

1. Cloudflare Pages에서 GitHub 저장소를 연결합니다.
2. Framework preset은 `Vite` 또는 직접 설정을 선택합니다.
3. Build command는 `npm run build:public`으로 지정합니다.
4. Build output directory는 `dist`로 지정합니다.
5. Environment variable에 `VITE_APP_EDITION=public`을 지정합니다.
6. 고정 도메인을 Pages custom domain에 연결합니다.
7. DNS가 Cloudflare로 위임되어 있으면 Pages가 CNAME과 TLS 인증서를 자동 관리합니다.

## 산출물 정책

`npm run build:public`은 다음 산출물을 만들어야 합니다.

- Vite 정적 번들
- `image/clean` 카드 이미지 복사본
- SPA 라우팅용 `dist/_redirects`
- 기본 보안/캐시 정책용 `dist/_headers`

공개판 번들에는 Firebase 동기화 청크가 포함되지 않아야 합니다.

## 사용자 설치 흐름

- iPhone: Safari에서 고정 도메인 접속, 공유 버튼, 홈 화면에 추가
- Android: Chrome 또는 Samsung Internet에서 고정 도메인 접속, 앱 설치 또는 홈 화면에 추가
- PC: 브라우저 즐겨찾기 또는 PWA 설치

주소가 바뀌면 브라우저 저장소도 바뀝니다. 공개 도메인을 정한 뒤에는 가능한 한 같은 도메인을 유지합니다.

## 데이터 보관 안내

공개판은 사용자별 서버 저장소가 없습니다. 사용자가 브라우저 데이터를 삭제하거나, 브라우저를 바꾸거나, 휴대폰을 바꾸면 기존 데이터가 자동 이전되지 않습니다.

앱은 설정 화면에서 JSON 백업을 계속 제공해야 하며, 공개판에서는 백업 안내가 클라우드 동기화보다 더 우선되어야 합니다.

## 운영 체크리스트

- `npm run audit:check` 통과
- `npm run build:public` 통과
- `dist`에 `_redirects`, `_headers`, `image/clean` 존재
- 공개판 번들에서 `syncManager` 청크 미생성
- 설정 화면에서 클라우드 동기화 UI 미노출
- 설정 화면에서 JSON 백업 안내 노출
- 개인용 `npm run build:pages` 또는 `npm run build:personal` 회귀 없음

## 광고 적용 원칙

광고는 공개판에만 적용합니다. 개인용 Firebase Hosting 배포판에는 광고 코드를 넣지 않습니다.

광고 스크립트는 별도 에디션 플래그 뒤에 붙여야 하며, 카드 설정/실적 저장 로직과 분리합니다. 광고 적용 전에는 개인정보처리방침, 쿠키/광고 식별자 안내, Google AdSense 승인 요건을 별도 문서로 확인합니다.

## 롤백

Cloudflare Pages는 이전 배포로 되돌릴 수 있습니다. 롤백 후에도 사용자 데이터는 각 브라우저의 기존 localStorage에 남아 있으므로, 저장 키를 임의로 바꾸지 않는 것이 가장 중요합니다.
