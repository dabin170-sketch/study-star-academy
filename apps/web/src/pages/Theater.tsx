import { Card, InfoBox, LinkButton, PageHeader, StatusChip } from '../components/ui';
import { PixelBuilding } from '../components/PixelBuilding';

export default function Theater() {
  return (
    <div>
      <PageHeader title="이야기 극장" subtitle="개념을 문제 상황·오개념·단서·해결로 이어지는 에피소드로 배우는 곳이에요." icon={<PixelBuilding roof="#b9b0c6" wall="#f4f1f7" size={56} />} actions={<StatusChip status="planned" />} />
      <InfoBox tone="butter">이야기 극장은 개발 예정이에요(구현 5단계). 완성되지 않은 기능을 쓸 수 있는 것처럼 보이지 않도록, 지금은 계획만 안내해요.</InfoBox>
      <Card className="mt-4 space-y-2 text-sm">
        <h2 className="font-bold">만들어질 모습</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>문제 상황 등장 → 등장인물의 오개념 → 단서 발견 → 개념 탐구 → 해결 → 개념 정리 → 확인 문제</li>
          <li>재사용 가능한 캐릭터·배경·소품 템플릿으로 장면을 구성(장면마다 AI 이미지를 만들지 않음)</li>
          <li>이야기 속 대사의 핵심 개념은 원문 근거와 연결하고, 연출용 허구 상황은 ‘이야기 설정’으로 따로 표시</li>
          <li>선택지 분기, 표정 변화, 장면 전환, 개념 발견 효과</li>
        </ol>
        <p className="text-ink-soft">그동안에는 마법 강의실의 ‘친구에게 가르치기’ 튜터 모드로 개념을 이야기하듯 설명해 보세요.</p>
        <LinkButton to="/lecture">마법 강의실로</LinkButton>
      </Card>
    </div>
  );
}
