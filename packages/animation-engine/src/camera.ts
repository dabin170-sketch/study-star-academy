/**
 * 카메라: 장면 진행률(0~1)에 따른 확대·이동. 화면 흔들림은 최대 3px, 느린 주기로 제한한다(깜빡임 없음).
 */
import type { CameraKind } from '@academy/shared';

export const STAGE = { width: 1600, height: 900 } as const;
export const SLOT_X = { left: 430, center: 800, right: 1170 } as const;
export const MAX_SHAKE_PX = 3;

export interface CameraTransform {
  scale: number;
  /** 화면 중심을 이 좌표에 맞춤 */
  cx: number;
  cy: number;
}

export function cameraAt(kind: CameraKind, progress: number, focusX: number, shake: 0 | 1, timeMs: number, reduced = false): CameraTransform {
  const p = reduced ? 1 : Math.min(1, Math.max(0, progress));
  const e = 0.5 - 0.5 * Math.cos(Math.PI * p);
  let t: CameraTransform = { scale: 1, cx: STAGE.width / 2, cy: STAGE.height / 2 };
  switch (kind) {
    case 'zoom-in':
      t = { scale: 1 + 0.22 * e, cx: 800 + (focusX - 800) * 0.4 * e, cy: 470 };
      break;
    case 'zoom-out':
      t = { scale: 1.25 - 0.25 * e, cx: 800 + (focusX - 800) * 0.4 * (1 - e), cy: 470 };
      break;
    case 'pan-left':
      t = { scale: 1.12, cx: 900 - 200 * e, cy: 450 };
      break;
    case 'pan-right':
      t = { scale: 1.12, cx: 700 + 200 * e, cy: 450 };
      break;
    case 'focus-speaker':
      t = { scale: 1.18, cx: 800 + (focusX - 800) * 0.75, cy: 470 };
      break;
    case 'board':
      t = { scale: 1 + 0.35 * e, cx: 800, cy: 450 - 130 * e };
      break;
    default:
      break;
  }
  if (shake && !reduced) {
    t.cx += Math.sin(timeMs / 70) * MAX_SHAKE_PX;
    t.cy += Math.cos(timeMs / 90) * MAX_SHAKE_PX * 0.6;
  }
  // 무대 밖이 보이지 않도록 중심 위치 제한
  const halfW = STAGE.width / 2 / t.scale;
  const halfH = STAGE.height / 2 / t.scale;
  t.cx = Math.min(STAGE.width - halfW, Math.max(halfW, t.cx));
  t.cy = Math.min(STAGE.height - halfH, Math.max(halfH, t.cy));
  return t;
}

/** SVG viewBox 문자열 */
export function viewBoxOf(t: CameraTransform): string {
  const w = STAGE.width / t.scale;
  const h = STAGE.height / t.scale;
  return `${(t.cx - w / 2).toFixed(1)} ${(t.cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
}
