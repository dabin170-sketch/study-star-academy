import { Link } from 'react-router-dom';
import { Card, InfoBox, PageHeader, StatusChip, type FeatureStatus } from '../components/ui';
import { PixelBuilding } from '../components/PixelBuilding';

const GAMES: { name: string; desc: string; status: FeatureStatus; to?: string }[] = [
  { name: '개념 던전', desc: '문제를 풀어 방을 지나고 보스를 물리쳐요. 틀린 문제는 복습 문제로 바뀌어요.', status: 'ready', to: '/adventure/dungeon' },
  { name: '기억 카드 배틀', desc: '제한 시간 안에 개념과 정의를 짝지어요.', status: 'planned' },
  { name: '오류 탐정 사무소', desc: '잘못된 설명에서 틀린 부분과 그 근거를 찾아요. (지금은 암기 실험실의 ‘틀린 설명 찾기’로 연습할 수 있어요.)', status: 'planned' },
  { name: '지식 연금술', desc: '여러 개념을 조합해 상위 개념과 적용 사례를 완성해요.', status: 'planned' },
  { name: '분류 퍼즐 연구소', desc: '개념 카드를 분류 체계에 맞게 배치해요.', status: 'planned' },
  { name: '최종 시험 보스전', desc: '단원별 핵심 문제를 차례로 해결해요. (지금은 개념 던전의 보스방으로 체험할 수 있어요.)', status: 'planned' },
];

export default function Adventure() {
  return (
    <div>
      <PageHeader title="모험 훈련장" subtitle="게임처럼 즐기되, 점수는 실제로 맞힌 문제로만 계산해요." icon={<PixelBuilding roof="#e8c13d" wall="#fff8d6" size={56} />} />
      <InfoBox tone="butter">지금은 ‘개념 던전’을 플레이할 수 있어요. 나머지 게임은 개발 예정이며, 완성 전에는 버튼을 열어 두지 않았어요.</InfoBox>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((g) => (
          <Card key={g.name} className={`flex flex-col gap-2 ${g.status === 'planned' ? 'opacity-75' : ''}`}>
            <div className="flex items-center justify-between">
              <h2 className="font-pixel text-lg font-bold">{g.name}</h2>
              <StatusChip status={g.status} />
            </div>
            <p className="flex-1 text-sm text-ink-soft">{g.desc}</p>
            {g.to ? (
              <Link to={g.to} className="btn-primary">
                플레이
              </Link>
            ) : (
              <span className="text-xs text-ink-soft">개발 예정</span>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
