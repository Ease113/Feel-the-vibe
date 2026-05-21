import type { GenerationMode } from '../api/types';

/** LLM provider chain generation_mode → UI 라벨 */
export function generationModeLabel(mode: GenerationMode): string {
  switch (mode) {
    case 'gemini':
      return 'Gemini';
    case 'cli':
      return 'Claude CLI';
    case 'template':
      return '템플릿';
    default:
      return mode;
  }
}
