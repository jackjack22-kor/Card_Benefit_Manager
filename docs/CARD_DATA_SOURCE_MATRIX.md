# 카드 데이터 출처 매트릭스

## 목적

이 문서는 공개 배포판 카드 데이터를 확장하기 전에 현재 카드별 검증 상태를 추적하는 작업대입니다. `src/data/cards.js`의 데이터가 계산과 추천에 직접 쓰이므로, 공개판에 노출되는 카드일수록 공식 상품 페이지와 상품설명서 PDF 기준으로 재확인해야 합니다.

## 공식 출처 진입점

카드별 최종 수치는 각 카드의 공식 상품 페이지 또는 상품설명서 PDF에서 확인합니다. 검색 또는 메뉴 구조가 바뀔 수 있으므로, 아래 카드사 공식 사이트를 출발점으로 삼고 확인일을 기록합니다.

| 카드사 | 공식 진입점 | 확인할 항목 |
| --- | --- | --- |
| 신한카드 | https://www.shinhancard.com/ | 카드 상품 페이지, 상품설명서, 연회비, 전월/연간 실적, 제휴 서비스 |
| 현대카드 | https://www.hyundaicard.com/ | American Express 카드 상품 페이지, MR 적립, 호텔/공항/다이닝 서비스, 연회비 |
| 삼성카드 | https://www.samsungcard.com/ | THE O/THE 1 상품설명서, 기프트/마일리지/AMEX 서비스 |
| KB국민카드 | https://card.kbcard.com/ | 카드소개, 상품공시실, 플래티늄/VISA/Master/AMEX 서비스 차이 |
| 롯데카드 | https://www.lottecard.co.kr/ | LOCA/AMEX/마일리지 카드 상품설명서, 제휴 브랜드 차이 |
| 우리카드 | https://pc.wooricard.com/ | 카드의정석/SKT/Infinite 상품설명서, 제휴 멤버십 조건 |
| 하나카드 | https://www.hanacard.co.kr/ | MG+ S 상품설명서, 통합 할인한도와 제외 조건 |
| BC카드 | https://www.bccard.com/ | 바로카드 상품설명서, Paybooc 적립, VISA/Mastercard 서비스 |

## 현재 카드 검증 현황

상태 의미:

- `코드 반영`: 현재 앱에 카드와 혜택 모델이 있음
- `출처 메모 있음`: `sourceNote`가 있음
- `공식 재검증 필요`: 공개판 확장 전 공식 페이지/PDF로 최신 조건 확인 필요
- `브랜드 차이 확인 필요`: VISA/Mastercard/AMEX 등 제휴 브랜드별 연회비 또는 부가서비스 차이 확인 필요

| 카드 ID | 카드명 | 카드사 | 혜택 수 | 현재 상태 | 다음 확인 |
| --- | --- | --- | ---: | --- | --- |
| `shinhan-ace-blue` | 신한 The ACE 블루라벨 | 신한카드 | 7 | 코드 반영, 출처 메모 있음 | 공식 PDF 최신본, Gift Option, 라운지/호텔 서비스 |
| `marriott-best-shinhan` | 신한 메리어트 본보이 더 베스트 | 신한카드 | 8 | 코드 반영, 출처 메모 있음 | 연간 무료숙박권/보너스 포인트, 실적 제외 항목 |
| `marriott-classic-shinhan` | 신한 메리어트 본보이 더 클래식 | 신한카드 | 8 | 코드 반영, 출처 메모 있음 | 연간 기프트, 라운지, 메리어트 적립 제외 조건 |
| `hyundai-amex-platinum` | American Express The Platinum Card | 현대카드 | 14 | 코드 반영, 출처 메모 있음 | 연회비 시작월, 10만 MR 조건, FHR/THC/BMG 최신 대상점 |
| `samsung-the-o-asiana` | 삼성 THE O 아시아나 | 삼성카드 | 10 | 코드 반영, 출처 메모 있음 | 단종/신규발급 여부, 기프트 조건, 호텔/다이닝 대상점 |
| `samsung-the1-skypass` | 삼성 THE 1 스카이패스 | 삼성카드 | 22 | 코드 반영, 출처 메모 있음 | AMEX PLATINUM ELITE 서비스, 특별 적립 월 한도 |
| `woori-point-main` | 카드의정석 POINT 주거래 | 우리카드 | 6 | 코드 반영, 출처 메모 있음 | 통합 포인트 한도, 간편결제 대상, 주거래 조건 |
| `skt-woori-card` | SKT 우리카드 | 우리카드 | 6 | 코드 반영, 출처 메모 있음 | SKT 자동납부/T라이트할부 중복 조건, 통신요금 할인 구간 |
| `kb-skypass-platinum` | 스카이패스 KB국민 플래티늄카드 | KB국민카드 | 2 | 코드 반영, 출처 메모 있음 | Mastercard/VISA/AMEX 플래티늄 서비스 차이 |
| `kb-talktalk-my-point` | 톡톡 my point카드 | KB국민카드 | 3 | 코드 반영, 출처 메모 있음 | KB Pay 적립 제외 조건, 연간 리워드 기준 |
| `lotte-green-card` | 어디로든 그린카드 X LOCA | 롯데카드 | 5 | 코드 반영, 출처 메모 있음 | 친환경/대중교통/커피 대상 업종과 월 한도 |
| `mg-s-hana` | MG+ S 하나카드 | 하나카드 | 4 | 코드 반영, 출처 메모 있음 | 새마을금고 결제계좌 조건, 간편결제/OTT/멤버십 대상 |
| `lotte-amex-skypass` | SKYPASS 롯데 아멕스카드 | 롯데카드 | 5 | 코드 반영, 출처 메모 있음 | AMEX 서비스, 해외 2마일 적립 제외 조건 |
| `shinhan-always-on` | 신한카드 Always On | 신한카드 | 2 | 코드 반영, 출처 메모 있음 | SOL페이 추가 적립 조건, 온라인 영화 할인 조건 |
| `coupang-wow-card` | 쿠팡 와우카드 | KB국민카드 | 1 | 코드 반영, 출처 메모 있음 | 공개판 추천 포함 여부, 쿠팡캐시 월 한도/제외 조건 |
| `bc-goat-card` | GOAT BC 바로카드 | BC카드 | 4 | 코드 반영, 출처 메모 있음 | Mastercard/VISA Platinum 서비스, 국내/해외 Paybooc 적립 |
| `all-woori-infinite` | ALL 우리카드 Infinite | 우리카드 | 7 | 코드 반영, 출처 메모 있음 | ALL Accor+ 멤버십, 리무진/라운지, 연간 포인트 조건 |
| `lotte-hilton-amex` | 힐튼 아너스 아멕스 | 롯데카드 | 5 | 코드 반영, 출처 메모 있음 | 힐튼 주말 무료숙박권, 골드 등급, AMEX 서비스 |

## 카드 추가 후보군

공개판의 첫 확장 후보는 대중성이 높고 공식 조건 확인이 쉬운 카드부터 선정합니다.

| 우선순위 | 카드사 | 후보군 | 이유 |
| ---: | --- | --- | --- |
| 1 | 신한카드 | SOL트래블, Deep Dream, Mr.Life 계열 | 범용 사용자에게 익숙하고 카테고리 추천 영향이 큼 |
| 1 | 현대카드 | ZERO Edition, M/MX 계열 | 무실적/포인트형 비교 축으로 유용 |
| 1 | KB국민카드 | 탄탄대로, WE:SH, My WE:SH 계열 | 간편결제/생활형 추천 확장에 유리 |
| 2 | 삼성카드 | iD 계열, taptap 계열 | 카페/쇼핑/간편결제 사용자층이 넓음 |
| 2 | 우리카드 | DA@카드, 카드의정석 계열 | 무실적/간편결제 비교군 보강 |
| 2 | 롯데카드 | LOCA LIKIT, LOCA 365 계열 | 생활비/구독/교통 카테고리 보강 |
| 3 | 하나카드 | MULTI, JADE 계열 | 프리미엄/생활형 양쪽 후보 확보 |
| 3 | BC카드 | 바로카드 생활/여행형 | Paybooc 기반 카드 비교 확장 |

## 데이터 모델 보강 후보

공식 재검증 후 다음 필드를 카드 객체에 추가하는 방향을 검토합니다.

```js
source: {
  status: 'official_verified | needs_official_recheck',
  url: 'https://...',
  pdf: '상품설명서 파일명 또는 URL',
  appCapture: '앱 캡처 또는 텍스트 확인 메모',
  checkedAt: 'YYYY-MM-DD',
  note: '검증 메모'
},
networks: [
  {
    name: 'Mastercard',
    annualFee: 120000,
    services: ['Platinum'],
    note: '서비스 조건 확인 필요'
  }
]
```

`sourceNote`는 사람이 읽는 기존 메모로 유지하고, 구조화된 `source`는 모든 카드에 필수로 둡니다. `networks`는 제휴 브랜드 차이가 계산이나 안내에 영향을 주는 카드부터 선택 필드로 추가합니다. 현재 전체 카드는 공식 상품 페이지/PDF 최신 재확인 전까지 `needs_official_recheck` 상태를 유지하며, 첫 `networks` 적용 샘플은 `hyundai-amex-platinum`입니다. 공개판에서 카드 조건이 오래된 상태로 보이지 않게, 출처 확인일이 오래된 카드에는 앱 내부 안내 또는 관리용 감사 경고를 붙이는 방안도 검토합니다.
