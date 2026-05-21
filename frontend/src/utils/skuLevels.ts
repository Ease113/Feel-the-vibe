/** SKU 물리 속성(0~1 또는 0~100)을 카드 표시용 0~100 정수 레벨로 정규화한다. */
export function normalizeSkuLevel(raw: unknown): number | undefined {
  if (raw === '' || raw == null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const level = n > 1 ? n : n * 100;
  return Math.round(level);
}

export interface SkuPhysicalLevels {
  glossLevel?: number;
  viscosityLevel?: number;
  pigmentIntensity?: number;
  brightnessLevel?: number;
}

/** nested sku dict에서 광택·점도·안료 레벨을 추출한다. 밝기는 mapper에서 derive. */
export function mapSkuPhysicalLevels(
  sku: Record<string, unknown> | undefined,
): SkuPhysicalLevels {
  if (!sku) return {};

  const glossLevel = normalizeSkuLevel(sku.gloss_level);
  const viscosityLevel = normalizeSkuLevel(sku.viscosity);
  const pigmentIntensity = normalizeSkuLevel(sku.pigment_intensity);
  const brightnessLevel =
    pigmentIntensity !== undefined ? 100 - pigmentIntensity : undefined;

  return { glossLevel, viscosityLevel, pigmentIntensity, brightnessLevel };
}

/** 카드 상시 메타: 광택·점도·안료 (`광택 80 · 점도 30 · 안료 10`). */
export function formatSkuMetaInline(
  glossLevel?: number,
  viscosityLevel?: number,
  pigmentIntensity?: number,
): string | null {
  const parts: string[] = [];
  if (glossLevel !== undefined) parts.push(`광택 ${glossLevel}`);
  if (viscosityLevel !== undefined) parts.push(`점도 ${viscosityLevel}`);
  if (pigmentIntensity !== undefined) parts.push(`안료 ${pigmentIntensity}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
