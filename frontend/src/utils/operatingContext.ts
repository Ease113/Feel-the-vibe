import type { OperatingContext } from '../api/types';

/** shift·crew·lineId 동일 여부 (draft dirty / hook 분기용) */
export function operatingContextEqual(a: OperatingContext, b: OperatingContext): boolean {
  return a.shift === b.shift && a.crewSize === b.crewSize && a.lineId === b.lineId;
}

/** API override — shift·crew만 전송 */
export function toOperatingContextOverride(ctx: OperatingContext): {
  shift: OperatingContext['shift'];
  crewSize: number;
} {
  return { shift: ctx.shift, crewSize: ctx.crewSize };
}
