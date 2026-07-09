import type { CSSProperties } from 'react';
import { getPreset } from '@/lib/theme-presets';

export function portalThemeStyle(temaPortal: string | null | undefined): CSSProperties {
  const preset = getPreset(temaPortal);
  return {
    ['--portal-brand' as string]: preset.primary,
    ['--portal-brand-foreground' as string]: preset.foreground,
    ['--portal-brand-secondary' as string]: preset.secondary,
  };
}
