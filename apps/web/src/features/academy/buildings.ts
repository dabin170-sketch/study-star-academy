import type { FeatureStatus } from '../../components/ui';

export interface Building {
  id: string;
  name: string;
  role: string;
  route: string;
  status: FeatureStatus;
  roof: string;
  wall: string;
  /** 지도 격자 위치(열, 행) — 4열 기준 */
  col: number;
  row: number;
  note?: string;
}

export const BUILDINGS: Building[] = [
  { id: 'library', name: '별빛 도서관', role: '학습 자료 관리', route: '/library', status: 'ready', roof: '#9b83e6', wall: '#f0eaff', col: 1, row: 0 },
  { id: 'lecture', name: '마법 강의실', role: '개념 학습 · 백지 복습', route: '/lecture', status: 'ready', roof: '#f08fb0', wall: '#ffe3ec', col: 2, row: 0 },
  { id: 'greenhouse', name: '기억 온실', role: '플래시카드 · 간격 반복', route: '/greenhouse', status: 'ready', roof: '#4fbf93', wall: '#e6faf1', col: 3, row: 0 },
  { id: 'tower', name: '시험의 탑', role: '모의고사 · 출제자 모드', route: '/tower', status: 'ready', roof: '#6fa8e8', wall: '#eaf5ff', col: 0, row: 1, note: '연결형·순서 배열·사례형은 개발 예정' },
  { id: 'detective', name: '탐정 연구소', role: '오답 원인 분석', route: '/detective', status: 'ready', roof: '#c98a3a', wall: '#fff8d6', col: 1, row: 1 },
  { id: 'observatory', name: '학습 관측소', role: '통계 · 취약점 지도', route: '/observatory', status: 'ready', roof: '#7b5ea7', wall: '#f0eaff', col: 2, row: 1 },
  { id: 'garden', name: '성장 정원', role: '경험치 · 성취', route: '/garden', status: 'ready', roof: '#4fbf93', wall: '#fff8d6', col: 3, row: 1 },
  { id: 'adventure', name: '모험 훈련장', role: '게임형 학습', route: '/adventure', status: 'partial', roof: '#e8c13d', wall: '#fff8d6', col: 0, row: 2, note: '개념 던전 플레이 가능, 나머지 게임은 개발 예정' },
  { id: 'plaza', name: '친구 광장', role: '4인 실시간 스터디', route: '/plaza', status: 'ready', roof: '#f08fb0', wall: '#eaf5ff', col: 1, row: 2, note: '실시간 서버 연결 필요' },
  { id: 'theater', name: '이야기 극장', role: '만화 · 스토리 학습', route: '/theater', status: 'planned', roof: '#b9b0c6', wall: '#f4f1f7', col: 2, row: 2 },
];
