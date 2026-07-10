export const PUBLIC_CARD_VERIFICATION_OVERLAYS = {
  'cg-crd-2280': {
    collectionStatus: 'official_detail_verified',
    calculationStatus: 'modeled',
    localImage: 'image/clean/hyundai-amex-platinum.png',
    officialUrl: 'https://www.hyundaicard.com/cpc/cr/CPCCR0201_01.hc?cardWcd=AMPT&cardflag=&eventCode=00000',
    officialDocumentUrls: [
      'https://www.hyundaicard.com/upload/card/AMEX_Ed1_The%20Platinum_2603.pdf',
      'https://www.hyundaicard.com/upload/card/T_AVI-20260309-1018-06_%EA%B8%88%EC%86%8C%EB%B2%95_Amex_%ED%94%8C%EB%9E%98%ED%8B%B0%EB%84%98_V1.pdf',
      'https://www.hyundaicard.com/upload/card/26%20AMEX%20THE%20PLATINUM.pdf'
    ],
    networks: ['American Express'],
    annualFeeText: '국내외겸용 [1,000,000원]',
    previousMonthSpend: 500000,
    performanceRequirements: {
      baseReward: 0,
      specialReward: 500000,
      firstYearAnnual: 1000000,
      renewalAnnual: 36000000
    },
    summaryBenefits: [
      { title: '기본 적립', tags: ['국내외 가맹점', '1천원당 1.5MR', '한도 없음'] },
      { title: '특별 적립', tags: ['해외·특급호텔 3MR', '골프·면세점 4.5MR', '전월 50만원'] },
      { title: '연간 리워드', tags: ['10만 MR', '첫해 100만원', '2차년도 3,600만원'] }
    ],
    verification: {
      verifiedAt: '2026-07-10',
      method: 'official_product_page_and_documents',
      fields: ['annualFee', 'networks', 'previousMonthSpend', 'annualSpend', 'benefits', 'exclusions'],
      relatedCardModelId: 'hyundai-amex-platinum',
      note: '현대카드 공식 상품 페이지, 2026년 상품설명서와 AMEX 서비스 가이드에서 핵심 산식과 연간 조건을 교차 확인했습니다.'
    },
    source: {
      type: 'official_issuer_detail',
      label: '현대카드 공식 상품 페이지·상품설명서',
      url: 'https://www.hyundaicard.com/cpc/cr/CPCCR0201_01.hc?cardWcd=AMPT&cardflag=&eventCode=00000',
      checkedAt: '2026-07-10',
      note: '공식 상품 페이지와 2026년 3월 상품설명서, 2026년 AMEX 서비스 가이드 기준 상세 검증 완료.'
    }
  },
  'kb-09297': {
    collectionStatus: 'official_detail_verified',
    calculationStatus: 'catalog_only',
    localImage: 'image/clean/kb-wesh-all-plus.png',
    officialDocumentUrls: [],
    networks: ['Mastercard'],
    annualFeeText: '국내전용·Mastercard 일반 [55,000원] / 모바일 단독 [49,000원]',
    previousMonthSpend: 400000,
    performanceRequirements: {
      monthly: 400000,
      quarterlyBonus: 4000000
    },
    candidateAliases: ['cg-crd-2837'],
    summaryBenefits: [
      { title: '국내외 할인', tags: ['국내 1%', '해외 2%', '전월 40만원'] },
      { title: '자동납부', tags: ['멤버십 50%', 'OTT 10%', '통신 5%', '월 5천원'] },
      { title: '분기 보너스', tags: ['분기 400만원', '포인트리 1만점', '연 최대 4만점'] }
    ],
    verification: {
      verifiedAt: '2026-07-10',
      method: 'official_product_page',
      fields: ['annualFee', 'networks', 'previousMonthSpend', 'quarterlySpend', 'benefits', 'exclusions'],
      note: 'KB국민카드 공식 상세 페이지에서 연회비, 전월·분기 실적, 할인율, 한도와 제외 항목을 확인했습니다.'
    },
    source: {
      type: 'official_issuer_detail',
      label: 'KB국민카드 공식 상품 상세',
      url: 'https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0076?mainCC=a&cooperationcode=09297',
      checkedAt: '2026-07-10',
      note: '카드사 공식 상세 페이지 기준 상세 검증 완료.'
    }
  },
  'kb-09922': {
    collectionStatus: 'official_detail_verified',
    calculationStatus: 'catalog_only',
    localImage: 'image/clean/kb-all-card.png',
    officialDocumentUrls: [],
    networks: ['VISA'],
    annualFeeText: '국내전용·VISA 일반 [20,000원] / 모바일 단독 [14,000원]',
    previousMonthSpend: 400000,
    performanceRequirements: {
      baseReward: 0,
      automaticPayment: 400000
    },
    candidateAliases: ['cg-crd-2440'],
    summaryBenefits: [
      { title: '국내 할인', tags: ['국내 가맹점', '1%', '실적 없음'] },
      { title: '해외 할인', tags: ['해외 가맹점', '2%', '월 4만원'] },
      { title: '자동납부', tags: ['멤버십 50%', 'OTT 10%', '통신 5%', '월 3천원'] }
    ],
    verification: {
      verifiedAt: '2026-07-10',
      method: 'official_product_page',
      fields: ['annualFee', 'networks', 'previousMonthSpend', 'benefits', 'exclusions'],
      note: 'KB국민카드 공식 상세 페이지에서 무실적 기본 할인과 전월 40만원 자동납부 혜택을 구분해 확인했습니다.'
    },
    source: {
      type: 'official_issuer_detail',
      label: 'KB국민카드 공식 상품 상세',
      url: 'https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0076?mainCC=a&cooperationcode=09922',
      checkedAt: '2026-07-10',
      note: '카드사 공식 상세 페이지 기준 상세 검증 완료.'
    }
  },
  'kb-07964': {
    collectionStatus: 'official_detail_verified',
    calculationStatus: 'catalog_only',
    localImage: 'image/clean/kb-nori2-check.png',
    officialDocumentUrls: [],
    networks: ['VISA', 'Mastercard'],
    annualFeeText: '연회비 없음',
    previousMonthSpend: 200000,
    performanceRequirements: {
      coffee: 0,
      daily: 200000,
      kbPay: 300000,
      monthlyCapTiers: [200000, 400000, 600000, 800000]
    },
    candidateAliases: ['cg-chk-2422'],
    summaryBenefits: [
      { title: '일상 할인', tags: ['커피 10%', '모바일·문화 10%', '뷰티·편의점 5%'] },
      { title: '생활 할인', tags: ['구독·배달', '통신·영화', '놀이공원'] },
      { title: 'KB Pay', tags: ['온·오프라인 2% 추가', '전월 30만원', '통합한도 적용'] }
    ],
    verification: {
      verifiedAt: '2026-07-10',
      method: 'official_product_page',
      fields: ['annualFee', 'networks', 'previousMonthSpend', 'benefits', 'monthlyCaps', 'exclusions'],
      note: 'KB국민카드 공식 상세 페이지에서 일상·KB Pay 혜택의 서로 다른 실적 조건과 월 통합한도를 확인했습니다.'
    },
    source: {
      type: 'official_issuer_detail',
      label: 'KB국민카드 공식 상품 상세',
      url: 'https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0076?mainCC=a&cooperationcode=07964',
      checkedAt: '2026-07-10',
      note: '카드사 공식 상세 페이지 기준 상세 검증 완료.'
    }
  }
};

export const PUBLIC_CARD_VERIFICATION_OVERLAY_IDS = Object.keys(PUBLIC_CARD_VERIFICATION_OVERLAYS);
