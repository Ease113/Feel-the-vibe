/**
 * 숫자를 로케일에 맞는 비용 표기 문자열로 변환한다.
 *
 * @param value - 포맷할 숫자 값.
 * @returns 소수점 최대 2자리의 로케일 문자열 (예: '1,234.56').
 */
export function formatCost(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
