/**
 * 숫자를 로케일에 맞는 비용 표기 문자열로 변환한다.
 *
 * @param value - 포맷할 숫자 값.
 * @returns 소수점 최대 2자리의 로케일 문자열 (예: '1,234.56').
 */
export function formatCost(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * 점수(pt) 포맷 — 정수 반올림 후 천 단위 구분 + ' pt' 접미사.
 *
 * @param value - 포맷할 점수 값.
 * @returns 예: 478047 → '478,047 pt'
 */
export function formatPt(value: number): string {
  return Math.round(value).toLocaleString(undefined) + ' pt';
}
