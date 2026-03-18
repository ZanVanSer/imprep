import sharp from 'sharp';
import {
  AppSettings,
  Preset,
  ProcessedImageResult,
  ResultStatus,
  SkippedUpload,
  UploadCandidate,
  UploadedSource
} from '@/lib/types';
import {
  getJpegQuality,
  getWebpQuality,
  resolveOutputFormat,
  resolvePreset
} from '@/lib/presets';
import {
  MAX_BATCH_SIZE_BYTES,
  MAX_FILES,
  MAX_FILE_SIZE_BYTES,
  SUPPORTED_MIME_TYPES,
  getBatchLimitLabel,
  getFileLimitLabel
} from '@/lib/upload-limits';

export class ProcessingError extends Error {}

export function validateUploadCount(count: number) {
  if (count === 0) {
    throw new ProcessingError('Upload at least one image to continue.');
  }

  if (count > MAX_FILES) {
    throw new ProcessingError(`Upload up to ${MAX_FILES} images per batch in v1.`);
  }
}

export function validateBatchSize(files: Array<{ size: number }>) {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_BATCH_SIZE_BYTES) {
    throw new ProcessingError(
      `This batch is larger than the ${getBatchLimitLabel()} upload limit. Split it into smaller batches.`
    );
  }
}

export function getFileValidationError(file: UploadCandidate): string | null {
  if (!SUPPORTED_MIME_TYPES.has(file.type)) {
    return `"${file.name}" is not a supported image type.`;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `"${file.name}" is larger than the ${getFileLimitLabel()} file limit.`;
  }

  return null;
}

export function validateFile(file: UploadCandidate) {
  const message = getFileValidationError(file);
  if (message) {
    throw new ProcessingError(message);
  }
}

export function toSkippedUpload(file: UploadCandidate, message: string): SkippedUpload {
  return {
    name: file.name,
    sizeBytes: file.size,
    reason: message,
    code: message.includes('supported image type') ? 'unsupported' : 'too-large'
  };
}

export function sanitizeFileSuffix(suffix: string) {
  const trimmed = suffix.trim();
  if (!trimmed) {
    return '-email';
  }

  return trimmed.startsWith('-') ? trimmed : `-${trimmed}`;
}

function extensionForMimeType(mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'bin';
  }
}

function buildOutputName(originalName: string, suffix: string, mimeType: string) {
  const base = originalName.replace(/\.[^.]+$/, '');
  return `${base}${sanitizeFileSuffix(suffix)}.${extensionForMimeType(mimeType)}`;
}

function clampDimension(value: number | undefined) {
  return value && value > 0 ? value : 1;
}

function evaluateResult(params: {
  preset: Preset;
  idealSizeRangeKb: [number, number];
  finalSizeBytes: number;
  smallerThanRecommended: boolean;
  finalMimeType: string;
}): { status: ResultStatus; recommendation: string } {
  const { preset, idealSizeRangeKb, finalSizeBytes, smallerThanRecommended, finalMimeType } = params;
  const finalSizeKb = finalSizeBytes / 1024;

  if (smallerThanRecommended) {
    return {
      status: 'needs-review',
      recommendation: 'Image is smaller than the recommended retina export size.'
    };
  }

  if (finalSizeKb > 500) {
    return {
      status: 'needs-review',
      recommendation: 'File is heavier than ideal for email and should be reviewed.'
    };
  }

  if (preset === 'screenshot' && finalMimeType === 'image/jpeg') {
    return {
      status: 'acceptable',
      recommendation: 'Looks usable, but PNG usually keeps text sharper for screenshots.'
    };
  }

  if (finalSizeKb <= idealSizeRangeKb[1]) {
    return {
      status: 'email-ready',
      recommendation: 'Looks good for common email use.'
    };
  }

  return {
    status: 'acceptable',
    recommendation: 'Usable for email, but slightly heavier than the ideal target.'
  };
}

async function processGif(
  file: UploadedSource,
  buffer: Buffer,
  settings: AppSettings
): Promise<{ result: Omit<ProcessedImageResult, 'downloadUrl' | 'previewUrl'>; buffer: Buffer }> {
  const image = sharp(buffer, { animated: true, pages: -1 });
  const metadata = await image.metadata();
  const width = clampDimension(metadata.width);
  const height = clampDimension(metadata.height);
  const outputName = buildOutputName(file.name, settings.fileSuffix, 'image/gif');

  return {
    buffer,
    result: {
      id: crypto.randomUUID(),
      originalName: file.name,
      outputName,
      preset: settings.preset,
      originalWidth: width,
      originalHeight: height,
      finalWidth: width,
      finalHeight: height,
      originalSizeBytes: file.sizeBytes,
      finalSizeBytes: buffer.byteLength,
      originalMimeType: file.mimeType,
      finalMimeType: 'image/gif',
      reductionPercent: 0,
      status: 'acceptable',
      recommendation: 'GIF was preserved as-is. Animated GIF optimization is limited in v1.',
      warnings: ['GIF optimization is limited in v1 and the original animation was preserved.']
    }
  };
}

export async function processImageBuffer(params: {
  file: UploadedSource;
  inputBuffer: Buffer;
  settings: AppSettings;
}): Promise<{ result: Omit<ProcessedImageResult, 'downloadUrl' | 'previewUrl'>; buffer: Buffer }> {
  const { file, inputBuffer, settings } = params;

  validateFile({
    name: file.name,
    size: file.sizeBytes,
    type: file.mimeType
  });

  if (file.mimeType === 'image/gif') {
    return processGif(file, inputBuffer, settings);
  }

  let metadata;
  try {
    metadata = await sharp(inputBuffer).metadata();
  } catch {
    throw new ProcessingError(`"${file.name}" could not be processed.`);
  }

  const originalWidth = clampDimension(metadata.width);
  const originalHeight = clampDimension(metadata.height);
  const hasTransparency = Boolean(metadata.hasAlpha);
  const { exportWidth, idealSizeRangeKb } = resolvePreset(settings);
  const smallerThanRecommended = originalWidth < exportWidth;
  const targetWidth = smallerThanRecommended ? originalWidth : exportWidth;
  const outputFormat = resolveOutputFormat({
    requestedFormat: settings.outputFormat,
    preset: settings.preset,
    hasTransparency,
    preserveTransparency: settings.preserveTransparency
  });

  let pipeline = sharp(inputBuffer, { failOn: 'none' })
    .rotate()
    .resize({
      width: targetWidth,
      withoutEnlargement: true
    })
    .toColorspace('srgb');

  if (outputFormat === 'jpeg') {
    pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({
      quality: getJpegQuality(settings.compressionMode),
      progressive: true,
      mozjpeg: true
    });
  } else if (outputFormat === 'png') {
    pipeline = pipeline.png({
      compressionLevel: 9,
      palette: true,
      effort: 8
    });
  } else {
    pipeline = pipeline.webp({
      quality: getWebpQuality(settings.compressionMode),
      effort: 5
    });
  }

  const outputBuffer = await pipeline.toBuffer();
  const finalMetadata = await sharp(outputBuffer).metadata();
  const finalWidth = clampDimension(finalMetadata.width);
  const finalHeight = clampDimension(finalMetadata.height);
  const finalMimeType =
    outputFormat === 'jpeg'
      ? 'image/jpeg'
      : outputFormat === 'png'
        ? 'image/png'
        : 'image/webp';

  const evaluation = evaluateResult({
    preset: settings.preset,
    idealSizeRangeKb,
    finalSizeBytes: outputBuffer.byteLength,
    smallerThanRecommended,
    finalMimeType
  });

  const warnings: string[] = [];
  if (smallerThanRecommended) {
    warnings.push('Smaller than recommended for the selected retina target.');
  }
  if (settings.outputFormat === 'webp') {
    warnings.push('WebP can be useful, but email client support still varies.');
  }

  return {
    buffer: outputBuffer,
    result: {
      id: crypto.randomUUID(),
      originalName: file.name,
      outputName: buildOutputName(file.name, settings.fileSuffix, finalMimeType),
      preset: settings.preset,
      originalWidth,
      originalHeight,
      finalWidth,
      finalHeight,
      originalSizeBytes: file.sizeBytes,
      finalSizeBytes: outputBuffer.byteLength,
      originalMimeType: file.mimeType,
      finalMimeType,
      reductionPercent: Math.max(
        0,
        Math.round(((file.sizeBytes - outputBuffer.byteLength) / Math.max(file.sizeBytes, 1)) * 100)
      ),
      status: evaluation.status,
      recommendation: evaluation.recommendation,
      warnings
    }
  };
}
