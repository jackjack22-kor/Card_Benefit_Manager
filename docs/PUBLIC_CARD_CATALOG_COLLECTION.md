# 공개 카드 카탈로그 대량 수집 기준

## 목적

공개 배포판은 기존 개인용 `CARDS` 계산 모델과 별도로 `src/data/publicCardCatalog.js`를 둔다. 대량 수집 데이터는 카드 선택지를 넓히기 위한 카탈로그 후보이며, 공식 상세 혜택 계산에 바로 쓰지 않는다.

## 현재 수집·검증 배치

- 기준일: 2026-07-09
- 총 레코드: 1,591종
- 중복 제거 공개 레코드: 1,588종
- `official_detail_verified`: 4종
- `official_catalog`: 12종
- `candidate_index`: 1,572종
- 공식 목록 시드: KB국민카드 신용 10종, 체크 5종
- 후보 인덱스: CardGorilla 카드 검색 API 기준 신용 1,124종, 체크 452종
- 알려진 중복 후보: 3종(원본 보존, 공개 목록·검증 대기열에서 제외)

## 상태값

- `official_catalog`: 카드사 공식 목록에서 상품명, 상품코드, 이미지 URL을 확인한 상태다. 상세 혜택, 연회비, 전월실적, 제휴 브랜드별 차이는 아직 공식 상세 페이지 또는 상품설명서로 추가 검증해야 한다.
- `candidate_index`: 제3자 카드 비교 서비스에서 대량 후보로 수집한 상태다. 사용자에게 “공식 검증 완료”처럼 보이면 안 되고, 추천 계산에도 직접 연결하지 않는다.
- `official_detail_verified`: 카드사 공식 상세 페이지 또는 상품설명서 기준으로 주요 혜택, 실적 조건, 연회비, 제휴 브랜드 차이까지 검증한 뒤 사용할 승격 상태다.

## 운영 원칙

1. `src/data/cards.js`는 계산 가능한 카드만 담는다.
2. `src/data/publicCardCatalog.js`는 공개 배포용 후보/공식 목록 인덱스를 담는다.
3. `candidate_index` 카드는 공식 출처 검증 전까지 추천 점수, 월 실적 목표, 연간 실적 목표, 연회비 시작월의 기본값으로 쓰지 않는다.
4. 카드 상세 계산에 반영할 때는 공식 출처 URL, 확인일, 혜택별 조건, 전월/연간 실적 기준, 제휴 브랜드 차이를 `audit:check`에 함께 추가한다.
5. 사용자가 입력한 설정값이나 사용 실적은 어떤 카탈로그 기본값으로도 덮어쓰지 않는다.

## 명령

```bash
npm run catalog:report
npm run catalog:collect
npm run catalog:verify
npm run catalog:queue
npm run audit:check
```

`catalog:collect`는 네트워크 수집 명령이다. 재수집 후에는 `catalog:report`로 총량과 카드사별 분포를 확인하고, `audit:check`로 품질 게이트를 통과해야 한다.

공식 검증 결과는 재수집 원본과 분리된 `src/data/publicCardVerificationOverlays.js`에 보관한다. 상세 절차는 `docs/CARD_VERIFICATION_PIPELINE.md`를 따른다.
