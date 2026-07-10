# 공개 카드 공식 검증·계산 승격 파이프라인

## 목적

대량 수집 원본, 공식 상세 검증, 계산·추천 반영을 서로 다른 단계로 관리한다. 카드사 페이지 변경이나 재수집이 발생해도 이미 확인한 공식 정보가 사라지지 않고, 미완성 계산식이 사용자 추천에 섞이지 않게 하는 것이 목적이다.

## 데이터 흐름

1. `src/data/publicCardCatalog.js`: 재수집 가능한 원본 1,591건을 보관한다.
2. `src/data/publicCardVerificationOverlays.js`: 공식 상세 페이지와 상품설명서로 확인한 값만 별도 기록한다.
3. `src/data/publicCardCatalogIndex.js`: 원본에 검증 오버레이를 적용하고 알려진 중복 후보를 제거한다.
4. `src/data/cards.js`: 계산식과 감사 시나리오까지 준비된 카드만 편입한다.

원본 카탈로그를 다시 생성해도 검증 오버레이와 사용자 저장 데이터에는 접근하지 않는다.

## 상태

- `candidate_index`: 제3자 후보 인덱스. 공식 검증과 계산에 사용할 수 없다.
- `official_catalog`: 카드사 공식 목록에서 상품명·상품코드·이미지를 확인했다. 상세 계산에는 사용할 수 없다.
- `official_detail_verified`: 공식 상세 페이지 또는 상품설명서로 연회비, 실적, 주요 혜택, 한도, 제외 조건을 확인했다.
- `calculationStatus: catalog_only`: 공식 정보는 확인했지만 계산 모델은 아직 준비되지 않았다.
- `calculationStatus: modeled`: `src/data/cards.js`의 공식 검증 카드와 연결되고 계산 감사 시나리오가 존재한다.

## 2026-07-10 1차 검증 배치

| 카탈로그 ID | 카드 | 공식 상세 검증 | 계산 모델 |
| --- | --- | --- | --- |
| `cg-crd-2280` | 현대 American Express The Platinum Card | 완료 | `hyundai-amex-platinum` 연결 |
| `kb-09297` | KB WE:SH All+ 카드 | 완료 | 준비 중 |
| `kb-09922` | KB ALL 카드 | 완료 | 준비 중 |
| `kb-07964` | KB 노리2 체크카드(KB Pay) | 완료 | 준비 중 |

KB 공식 레코드와 중복되던 CardGorilla 후보 3건은 원본에는 남기고 공개 목록·대기열에서만 제외한다.

## 검증 명령

```bash
npm run catalog:report
npm run catalog:verify
npm run catalog:queue
npm run audit:check
```

- `catalog:report`: 원본/중복 제거/상태별 현황을 출력한다.
- `catalog:verify`: 공식 URL, 검증일, 검증 필드, 로컬 이미지, 계산 모델 연결을 검사한다.
- `catalog:queue`: 미검증 카드를 카드사·상품 우선순위로 정렬하고 다음 100건을 출력한다.

## 승격 규칙

1. 카드사 공식 상품 페이지 또는 최신 상품설명서를 확보한다.
2. 연회비, 제휴 브랜드, 전월·연간 실적, 주요 혜택, 월·연 한도, 제외 조건을 확인한다.
3. 공식 이미지를 `image/clean`에 고정한다.
4. 검증 오버레이를 추가하고 `catalog:verify`를 통과한다.
5. 계산 모델이 필요한 경우 별도 카드 ID, 혜택 ID와 대표 산식 감사를 추가한다.
6. `calculationStatus: modeled`는 연결된 카드의 `source.status`가 `official_verified`일 때만 허용한다.

## 사용자 데이터 보호

이 파이프라인은 `cardOverrides`, `monthlyCardUsage`, `usage`, `settings`, `cardOrder`, `hiddenCardIds`를 읽거나 쓰지 않는다. 신규 계산 카드가 추가되더라도 기존 사용자 카드 설정은 필드별 사용자 입력 플래그와 시각을 우선하며, 새 기본값은 기존 값을 덮지 않는다.
