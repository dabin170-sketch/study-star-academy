import { EmptyState, LinkButton } from '../components/ui';
import { PixelCharacter } from '../components/PixelCharacter';

export default function NotFound() {
  return <EmptyState icon={<PixelCharacter id="kongi" size={72} />} title="길을 잃었어요" desc="주소가 바뀌었거나 없는 화면이에요." action={<LinkButton to="/">아카데미로 돌아가기</LinkButton>} />;
}
