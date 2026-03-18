import { AppSettings, CompressionMode, OutputFormat, Preset } from '@/lib/types';

export interface PresetConfig {
  label: string;
  description: string;
  displayWidth: number;
  idealSizeRangeKb: [number, number];
  preferredFormat?: Exclude<OutputFormat, 'auto' | 'webp'>;
}

export const PRESET_CONFIGS: Record<Exclude<Preset, 'custom'>, PresetConfig> = {
  hero: {
    label: 'Hero',
    description: 'For main banner images at the top of an email.',
    displayWidth: 600,
    idealSizeRangeKb: [120, 300],
    preferredFormat: 'jpeg'
  },
  content: {
    label: 'Content',
    description: 'For regular full-width content blocks.',
    displayWidth: 600,
    idealSizeRangeKb: [80, 200],
    preferredFormat: 'jpeg'
  },
  half: {
    label: 'Half-width',
    description: 'For two-column layouts and side-by-side blocks.',
    displayWidth: 300,
    idealSizeRangeKb: [40, 120],
    preferredFormat: 'jpeg'
  },
  logo: {
    label: 'Logo',
    description: 'For logos and simple graphics that need crisp edges.',
    displayWidth: 200,
    idealSizeRangeKb: [0, 50],
    preferredFormat: 'png'
  },
  screenshot: {
    label: 'Screenshot',
    description: 'Best for app captures, UI, and graphics with text.',
    displayWidth: 600,
    idealSizeRangeKb: [80, 250],
    preferredFormat: 'png'
  }
};

export interface ResolvedPreset {
  displayWidth: number;
  exportWidth: number;
  idealSizeRangeKb: [number, number];
}

export function resolvePreset(settings: AppSettings): ResolvedPreset {
  const displayWidth =
    settings.preset === 'custom'
      ? Math.max(50, settings.customDisplayWidth ?? 600)
      : PRESET_CONFIGS[settings.preset].displayWidth;

  return {
    displayWidth,
    exportWidth: settings.retina ? displayWidth * 2 : displayWidth,
    idealSizeRangeKb:
      settings.preset === 'custom' ? [80, 220] : PRESET_CONFIGS[settings.preset].idealSizeRangeKb
  };
}

export function getPresetLabel(preset: Preset): string {
  return preset === 'custom' ? 'Custom' : PRESET_CONFIGS[preset].label;
}

export function getPresetDescription(preset: Preset): string {
  return preset === 'custom'
    ? 'Set your own width, format, and compression preferences.'
    : PRESET_CONFIGS[preset].description;
}

export function getJpegQuality(mode: CompressionMode): number {
  switch (mode) {
    case 'small':
      return 64;
    case 'sharp':
      return 86;
    default:
      return 76;
  }
}

export function getWebpQuality(mode: CompressionMode): number {
  switch (mode) {
    case 'small':
      return 62;
    case 'sharp':
      return 84;
    default:
      return 74;
  }
}

export function resolveOutputFormat(params: {
  requestedFormat: OutputFormat;
  preset: Preset;
  hasTransparency: boolean;
  preserveTransparency: boolean;
}): Exclude<OutputFormat, 'auto'> {
  const { requestedFormat, preset, hasTransparency, preserveTransparency } = params;

  if (requestedFormat !== 'auto') {
    return requestedFormat;
  }

  if (preset === 'logo' || preset === 'screenshot') {
    return 'png';
  }

  if (hasTransparency && preserveTransparency) {
    return 'png';
  }

  return 'jpeg';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
