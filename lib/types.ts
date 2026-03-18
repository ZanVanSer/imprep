export type Preset =
  | 'hero'
  | 'content'
  | 'half'
  | 'logo'
  | 'screenshot'
  | 'custom';

export type OutputFormat = 'auto' | 'jpeg' | 'png' | 'webp';

export type CompressionMode = 'small' | 'balanced' | 'sharp';

export type ResultStatus = 'email-ready' | 'acceptable' | 'needs-review';
export type UploadItemStatus =
  | 'ready'
  | 'processing'
  | 'uploading'
  | 'done'
  | 'skipped-too-large'
  | 'skipped-unsupported'
  | 'failed';

export interface UploadCandidate {
  name: string;
  size: number;
  type: string;
}

export interface AppSettings {
  preset: Preset;
  outputFormat: OutputFormat;
  retina: boolean;
  customDisplayWidth?: number;
  compressionMode: CompressionMode;
  preserveTransparency: boolean;
  fileSuffix: string;
}

export interface ProcessedImageResult {
  id: string;
  originalName: string;
  outputName: string;
  preset: Preset;
  originalWidth: number;
  originalHeight: number;
  finalWidth: number;
  finalHeight: number;
  originalSizeBytes: number;
  finalSizeBytes: number;
  originalMimeType: string;
  finalMimeType: string;
  reductionPercent: number;
  status: ResultStatus;
  recommendation: string;
  warnings: string[];
  downloadUrl: string;
  previewUrl: string;
}

export interface SkippedUpload {
  name: string;
  sizeBytes: number;
  reason: string;
  code: 'too-large' | 'unsupported' | 'failed';
}

export interface UploadedSource {
  storagePath: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ProcessRequest {
  settings: AppSettings;
  sources: UploadedSource[];
}

export interface ProcessResponse {
  zipDownloadUrl: string | null;
  results: ProcessedImageResult[];
  skipped: SkippedUpload[];
  errors: string[];
}
