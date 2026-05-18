import type { PlanItem, WarningSeverity } from '../api/types';
import { SEVERITY_UI } from '../api/types';

const CATEGORY_KO: Record<string, string> = {
  light:   '밝은색',
  mid:     '중간색',
  dark:    '어두운색',
  metal:   '메탈',
  special: '특수색',
  normal:  '일반색',
};

interface WarningInfo {
  severity: WarningSeverity;
  toSkuName: string;
  ruleId: string;
}

interface Props {
  item: PlanItem;
  index: number;
  /** 커스텀 서브태그. 미지정 시 category 한국어 */
  subTag?: string;
  /** 이 카드 다음 전환의 위험 정보 (현재안 열에서 사용) */
  warning?: WarningInfo | null;
}

/**
 * 단일 SKU 생산 계획 항목 카드.
 *
 * warning 전달 시: 좌측 보더 강조 + 이름 옆 severity 리스크 필
 *   + 서브태그 "다음: {toSkuName} 전환 · {ruleId}".
 * 추천안 열에서는 warning 없이 category를 서브태그로 표시.
 */
export default function SkuCard({ item, index, subTag, warning }: Props) {
  const isWarn = !!warning;
  const uiSev  = warning ? SEVERITY_UI[warning.severity] : null;

  const displaySub = warning
    ? `다음: ${warning.toSkuName} 전환 · ${warning.ruleId}`
    : (subTag ?? CATEGORY_KO[item.category] ?? item.category);

  return (
    <article className={`sku-card${isWarn ? ' sku-card--warn' : ''}`}>
      <span className="sku-num">{index}</span>
      <span className="sku-dot" style={{ backgroundColor: item.hexCode }} />
      <div className="sku-info">
        <div className={`sku-name${isWarn ? ' sku-name--risk' : ''}`}>
          <span>{item.skuName} {item.quantity}L</span>
          {uiSev && (
            <span className={`risk-pill${warning!.severity !== 'HIGH' ? ' risk-pill--med' : ''}`}>
              {uiSev}
            </span>
          )}
        </div>
        <div className="sku-tag">{displaySub}</div>
      </div>
    </article>
  );
}
