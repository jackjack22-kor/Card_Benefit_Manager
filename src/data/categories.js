export const CATEGORIES = [
  { id: 'coffee', label: '커피' },
  { id: 'overseas', label: '해외' },
  { id: 'hotel', label: '호텔' },
  { id: 'marriott', label: '메리어트' },
  { id: 'airline', label: '항공' },
  { id: 'simplepay', label: '간편결제' },
  { id: 'ott', label: 'OTT' },
  { id: 'golf', label: '골프' },
  { id: 'dutyfree', label: '면세점' },
  { id: 'transit', label: '대중교통' },
  { id: 'evcharge', label: '전기차충전' },
  { id: 'movie', label: '영화' },
  { id: 'themepark', label: '테마파크' },
  { id: 'taxi', label: '택시' },
  { id: 'telecom', label: '통신비' },
  { id: 'department', label: '백화점' },
  { id: 'fuel', label: '주유' },
  { id: 'medical', label: '의료' },
  { id: 'restaurant', label: '다이닝' },
  { id: 'parking', label: '공항주차' },
  { id: 'shopping', label: '쇼핑' },
  { id: 'small', label: '소액결제' },
  { id: 'breakfast', label: '조식' },
  { id: 'lounge', label: '라운지' },
  { id: 'spa', label: '스파' },
  { id: 'premiumgift', label: '기프트' },
  { id: 'other', label: '기타' }
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((item) => [item.id, item]));

export const SUBCATEGORIES = {
  coffee: [
    { id: 'starbucks', label: '스타벅스', keywords: ['스타벅스', '스벅', 'starbucks'] },
    { id: 'artisee', label: '아티제', keywords: ['아티제', 'artisee'] },
    { id: 'baekmidang', label: '백미당', keywords: ['백미당'] },
    { id: 'paul-basset', label: '폴바셋', keywords: ['폴바셋', 'paul'] },
    { id: 'ediya', label: '이디야', keywords: ['이디야', 'ediya'] },
    { id: 'angelinus', label: '엔제리너스', keywords: ['엔제리너스', 'angel'] },
    { id: 'coffee-bean', label: '커피빈', keywords: ['커피빈', 'coffee bean'] },
    { id: 'twosome', label: '투썸', keywords: ['투썸', 'twosome'] },
    { id: 'hollys', label: '할리스', keywords: ['할리스', 'hollys'] },
    { id: 'other-coffee', label: '기타 커피', keywords: ['커피', '카페', '커피 업종'] }
  ],
  movie: [
    { id: 'cgv', label: 'CGV', keywords: ['cgv'] },
    { id: 'lotte-cinema', label: '롯데시네마', keywords: ['롯데시네마'] },
    { id: 'megabox', label: '메가박스', keywords: ['메가박스'] },
    { id: 'other-movie', label: '기타 영화', keywords: ['영화', '영화관'] }
  ],
  telecom: [
    { id: 'skt', label: 'SKT', keywords: ['skt', 'sk텔레콤', 'sk telecom'] },
    { id: 'kt', label: 'KT', keywords: ['kt'] },
    { id: 'lgu', label: 'LG U+', keywords: ['lgu', 'lg u+', 'lgu+', 'lg유플러스'] },
    { id: 'mvno', label: '알뜰폰', keywords: ['알뜰폰'] },
    { id: 'other-telecom', label: '기타 통신', keywords: ['통신', '이동통신'] }
  ],
  simplepay: [
    { id: 'kbpay', label: 'KB Pay', keywords: ['kb pay', 'kbpay'] },
    { id: 'naverpay', label: '네이버페이', keywords: ['네이버페이'] },
    { id: 'kakaopay', label: '카카오페이', keywords: ['카카오페이'] },
    { id: 'tosspay', label: '토스페이', keywords: ['토스페이'] },
    { id: 'ssgpay', label: 'SSG페이', keywords: ['ssg페이', 'ssgpay'] },
    { id: 'payco', label: 'PAYCO', keywords: ['payco'] },
    { id: 'other-pay', label: '기타 간편결제', keywords: ['간편결제', '페이'] }
  ],
  ott: [
    { id: 'youtube', label: '유튜브', keywords: ['유튜브', 'youtube'] },
    { id: 'netflix', label: '넷플릭스', keywords: ['넷플릭스', 'netflix'] },
    { id: 'disney', label: '디즈니+', keywords: ['디즈니', 'disney'] },
    { id: 'wavve', label: 'Wavve', keywords: ['wavve', '웨이브'] },
    { id: 'tving', label: '티빙', keywords: ['티빙', 'tving'] },
    { id: 'other-ott', label: '기타 OTT', keywords: ['ott', '스트리밍'] }
  ],
  hotel: [
    { id: 'marriott-hotel', label: '메리어트', keywords: ['메리어트', 'marriott'] },
    { id: 'hotel-restaurant', label: '호텔 레스토랑', keywords: ['호텔 레스토랑', '호텔식당', '레스토랑'] },
    { id: 'hotel-deli', label: '호텔 델리', keywords: ['호텔 델리', '델리'] },
    { id: 'hotel-spa', label: '호텔 스파', keywords: ['스파'] },
    { id: 'fhr', label: 'FHR', keywords: ['fine hotels', 'fhr'] },
    { id: 'thc', label: 'THC', keywords: ['the hotel collection', 'hotel collection'] },
    { id: 'other-hotel', label: '기타 호텔', keywords: ['호텔', '특급호텔'] }
  ],
  marriott: [
    { id: 'marriott-stay', label: '숙박/적립', keywords: ['메리어트', '숙박', '포인트', 'bonvoy'] },
    { id: 'marriott-breakfast', label: '조식', keywords: ['조식'] },
    { id: 'marriott-lounge', label: '라운지/음료', keywords: ['라운지', '음료'] }
  ],
  airline: [
    { id: 'korean-air', label: '대한항공', keywords: ['대한항공', '스카이패스', 'skypass'] },
    { id: 'asiana', label: '아시아나', keywords: ['아시아나'] },
    { id: 'other-airline', label: '기타 항공', keywords: ['항공', '항공권'] }
  ],
  taxi: [
    { id: 'general-taxi', label: '일반 택시', keywords: ['택시'] },
    { id: 'premium-taxi', label: '서울 모범택시', keywords: ['모범택시', '서울'] }
  ],
  evcharge: [
    { id: 'ev-general', label: '전기차 충전', keywords: ['전기차', '충전', '환경부', '한전', 'kt'] },
    { id: 'hydrogen', label: '수소차 충전', keywords: ['수소차'] }
  ],
  dutyfree: [
    { id: 'jdc', label: '제주 JDC', keywords: ['jdc', '제주'] },
    { id: 'general-dutyfree', label: '일반 면세점', keywords: ['면세점'] }
  ],
  themepark: [
    { id: 'lotteworld', label: '롯데월드', keywords: ['롯데월드'] },
    { id: 'everland', label: '에버랜드', keywords: ['에버랜드'] },
    { id: 'other-park', label: '기타 테마파크', keywords: ['놀이공원', '워터파크', '아쿠아리움'] }
  ],
  parking: [
    { id: 'incheon-airport', label: '인천공항', keywords: ['인천공항'] },
    { id: 'airport-valet', label: '공항 발렛', keywords: ['공항 발레파킹', '공항 발렛'] },
    { id: 'hotel-valet', label: '호텔 발렛', keywords: ['호텔 발레파킹', '호텔 발렛'] },
    { id: 'other-parking', label: '기타 주차', keywords: ['주차'] }
  ],
  restaurant: [
    { id: 'outback', label: '아웃백', keywords: ['아웃백', 'outback'] },
    { id: 'hotel-restaurant', label: '호텔 레스토랑', keywords: ['호텔 레스토랑', '호텔식당'] },
    { id: 'hotel-deli', label: '호텔 델리', keywords: ['호텔 델리', '델리'] },
    { id: 'family-restaurant', label: '패밀리 레스토랑', keywords: ['패밀리 레스토랑', '패밀리레스토랑'] },
    { id: 'other-restaurant', label: '기타 다이닝', keywords: ['다이닝', '레스토랑', '식당'] }
  ]
};

export const SUBCATEGORY_MAP = Object.fromEntries(
  Object.entries(SUBCATEGORIES).flatMap(([categoryId, items]) => items.map((item) => [`${categoryId}:${item.id}`, { ...item, categoryId }]))
);

export function getSubcategories(categoryId) {
  return SUBCATEGORIES[categoryId] || [];
}
