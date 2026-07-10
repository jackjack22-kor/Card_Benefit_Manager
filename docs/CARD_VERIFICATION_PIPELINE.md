# 공개 카드 공식 검증·계산 승격 파이프라인

## 목적

대량 수집 원본, 공식 상세 검증, 계산·추천 반영을 서로 다른 단계로 관리한다. 카드사 페이지 변경이나 재수집이 발생해도 이미 확인한 공식 정보가 사라지지 않고, 미완성 계산식이 사용자 추천에 섞이지 않게 하는 것이 목적이다.

## 데이터 흐름

1. `src/data/publicCardCatalog.js`: 재수집 가능한 원본 1,591건을 보관한다.
2. `src/data/publicCardVerificationOverlays.js`: 공식 상세 페이지와 상품설명서로 확인한 값만 별도 기록한다.
3. `src/data/publicCardCatalogIndex.js`: 원본에 검증 오버레이를 적용하고 알려진 중복 후보를 제거한다.
4. `src/data/cards.js`: 계산식과 감사 시나리오까지 준비된 카드만 편입한다.

원본 카탈로그를 다시 생성해도 검증 오버레이와 사용자 저장 데이터에는 접근하지 않는다.

## 검증 범위

- 공개 초기 공식 상세 검증과 계산 승격은 `credit` 신용카드만 진행한다.
- `check` 체크카드는 수집·검색 가능한 `operational_candidate`로만 유지한다.
- 체크카드는 검증 대기열, 공식 상세 검증 진행률, 혜택 계산과 추천에서 제외한다.
- 과거에 준비한 체크카드 계산 초안은 사용자 저장 데이터 보존을 위해 삭제하지 않되 활성 카드 목록에서는 제외한다.

## 상태

- `candidate_index`: 제3자 후보 인덱스. 공식 검증과 계산에 사용할 수 없다.
- `official_catalog`: 카드사 공식 목록에서 상품명·상품코드·이미지를 확인했다. 상세 계산에는 사용할 수 없다.
- `operational_candidate`: 체크카드 운영후보. 검색만 제공하며 공식 상세 검증·계산·추천에 사용하지 않는다.
- `official_detail_verified`: 공식 상세 페이지 또는 상품설명서로 연회비, 실적, 주요 혜택, 한도, 제외 조건을 확인했다.
- `calculationStatus: catalog_only`: 공식 정보는 확인했지만 계산 모델은 아직 준비되지 않았다.
- `calculationStatus: modeled`: `src/data/cards.js`의 공식 검증 카드와 연결되고 계산 감사 시나리오가 존재한다.

## 2026-07-10 1차 검증 배치

| 카탈로그 ID | 카드 | 공식 상세 검증 | 계산 모델 |
| --- | --- | --- | --- |
| `cg-crd-2280` | 현대 American Express The Platinum Card | 완료 | `hyundai-amex-platinum` 연결 |
| `kb-09297` | KB WE:SH All+ 카드 | 완료 | `kb-wesh-all-plus` 연결 |
| `kb-09922` | KB ALL 카드 | 완료 | `kb-all` 연결 |
| `kb-07964` | KB 노리2 체크카드(KB Pay) | 운영후보 | 계산 미반영 |

KB 공식 레코드와 중복되던 CardGorilla 후보 3건은 원본에는 남기고 공개 목록·대기열에서만 제외한다.
신규 KB 신용카드 계산 모델 2종은 기존 사용자의 카드 목록을 갑자기 바꾸지 않도록 기본 숨김으로 추가한다. 노리2 계산 초안은 저장 데이터 보존용으로만 남기고 활성 카드·설정·추천에서는 제외한다.

## 검증 명령

```bash
npm run catalog:report
npm run catalog:verify
npm run catalog:queue
npm run audit:check
```

- `catalog:report`: 원본/중복 제거/상태별 현황을 출력한다.
- `catalog:verify`: 공식 URL, 검증일, 검증 필드, 로컬 이미지, 계산 모델 연결을 검사한다.
- `catalog:queue`: 미검증 신용카드만 카드사·상품 우선순위로 정렬하고 다음 100건을 출력한다. 체크카드는 별도 운영후보 수량으로만 표시한다.

## 승격 규칙

1. 대상이 신용카드인지 확인한다. 체크카드는 `operational_candidate`에서 승격하지 않는다.
2. 카드사 공식 상품 페이지 또는 최신 상품설명서를 확보한다.
3. 연회비, 제휴 브랜드, 전월·연간 실적, 주요 혜택, 월·연 한도, 제외 조건을 확인한다.
4. 공식 이미지를 `image/clean`에 고정한다.
5. 검증 오버레이를 추가하고 `catalog:verify`를 통과한다.
6. 계산 모델이 필요한 경우 별도 카드 ID, 혜택 ID와 대표 산식 감사를 추가한다.
7. `calculationStatus: modeled`는 연결된 신용카드의 `source.status`가 `official_verified`일 때만 허용한다.

## 사용자 데이터 보호

이 파이프라인은 `cardOverrides`, `monthlyCardUsage`, `usage`, `settings`, `cardOrder`, `hiddenCardIds`를 읽거나 쓰지 않는다. 신규 계산 카드가 추가되더라도 기존 사용자 카드 설정은 필드별 사용자 입력 플래그와 시각을 우선하며, 새 기본값은 기존 값을 덮지 않는다. 운영후보로 전환한 체크카드의 저장 슬롯도 삭제하지 않아 과거 입력값을 보존한다.
