import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import {
  getFileValidationError,
  processImageFile,
  ProcessingError,
  sanitizeFileSuffix,
  toSkippedUpload,
  validateBatchSize,
  validateUploadCount
} from '@/lib/image-processing';
import {
  AppSettings,
  CompressionMode,
  OutputFormat,
  Preset,
  ProcessRequest,
  ProcessResponse
} from '@/lib/types';
import JSZip from 'jszip';

export const runtime = 'nodejs';

const VALID_PRESETS: Preset[] = ['hero', 'content', 'half', 'logo', 'screenshot', 'custom'];
const VALID_OUTPUT_FORMATS: OutputFormat[] = ['auto', 'jpeg', 'png', 'webp'];
const VALID_COMPRESSION_MODES: CompressionMode[] = ['small', 'balanced', 'sharp'];

function parseJsonSettings(settings: Partial<AppSettings> | undefined): AppSettings {
  const preset = settings?.preset as Preset;
  const outputFormat = settings?.outputFormat as OutputFormat;
  const compressionMode = settings?.compressionMode as CompressionMode;

  return {
    preset: VALID_PRESETS.includes(preset) ? preset : 'content',
    outputFormat: VALID_OUTPUT_FORMATS.includes(outputFormat) ? outputFormat : 'auto',
    retina: settings?.retina !== false,
    customDisplayWidth: settings?.customDisplayWidth,
    compressionMode: VALID_COMPRESSION_MODES.includes(compressionMode)
      ? compressionMode
      : 'balanced',
    preserveTransparency: settings?.preserveTransparency !== false,
    fileSuffix: sanitizeFileSuffix(settings?.fileSuffix ?? '')
  };
}

function buildBlobPath(params: { kind: 'source' | 'result' | 'zip'; runId: string; filename: string }) {
  const safeName = params.filename.replace(/[^a-zA-Z0-9._-]/g, '-');
  return `imprep/${params.kind}/${params.runId}/${safeName}`;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ProcessRequest;
    const sources = Array.isArray(payload.sources) ? payload.sources : [];

    validateUploadCount(sources.length);
    validateBatchSize(sources.map((source) => ({ size: source.sizeBytes })));
    const settings = parseJsonSettings(payload.settings);
    const skipped = sources
      .map((source) => {
        const message = getFileValidationError({
          name: source.name,
          size: source.sizeBytes,
          type: source.mimeType
        });
        return message
          ? toSkippedUpload(
              {
                name: source.name,
                size: source.sizeBytes,
                type: source.mimeType
              },
              message
            )
          : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const validFiles = sources.filter(
      (source) =>
        !getFileValidationError({
          name: source.name,
          size: source.sizeBytes,
          type: source.mimeType
        })
    );

    const settled = await Promise.allSettled(validFiles.map((file) => processImageFile(file, settings)));
    const successful = settled.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof processImageFile>>> =>
        result.status === 'fulfilled'
    );
    const failed = settled
      .map((result, index) => ({ result, file: validFiles[index] }))
      .filter(
        (entry): entry is { result: PromiseRejectedResult; file: (typeof validFiles)[number] } =>
          entry.result.status === 'rejected'
      );

    if (successful.length === 0) {
      throw failed[0]?.result.reason ?? new ProcessingError('No files could be processed.');
    }

    const runId = crypto.randomUUID();
    const zip = new JSZip();

    const uploadedResults = await Promise.all(
      successful.map(async ({ value }) => {
        zip.file(value.result.outputName, value.buffer);
        const blob = await put(
          buildBlobPath({
            kind: 'result',
            runId,
            filename: value.result.outputName
          }),
          value.buffer,
          {
            access: 'public',
            addRandomSuffix: true,
            contentType: value.result.finalMimeType
          }
        );

        return {
          ...value.result,
          previewUrl: blob.url,
          downloadUrl: blob.downloadUrl
        };
      })
    );

    const zipBuffer = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    const zipBlob = await put(
      buildBlobPath({
        kind: 'zip',
        runId,
        filename: 'imprep-results.zip'
      }),
      Buffer.from(zipBuffer),
      {
        access: 'public',
        addRandomSuffix: true,
        contentType: 'application/zip'
      }
    );

    const response: ProcessResponse = {
      zipDownloadUrl: uploadedResults.length > 0 ? zipBlob.downloadUrl : null,
      results: uploadedResults,
      skipped: [
        ...skipped,
        ...failed.map(({ result, file }) => ({
          name: file.name,
          sizeBytes: file.sizeBytes,
          reason:
            result.reason instanceof Error
              ? result.reason.message
              : 'Processing failed for one image.',
          code: 'failed' as const
        }))
      ],
      errors: failed.map(({ result }) =>
        result.reason instanceof Error ? result.reason.message : 'Processing failed for one image.'
      )
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Image processing failed. Please try again.';

    return NextResponse.json(
      {
        error: message
      },
      { status: 400 }
    );
  }
}
