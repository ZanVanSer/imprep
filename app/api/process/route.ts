import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import {
  getFileValidationError,
  processImageBuffer,
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
import { getStorageBucket, getSupabaseAdminClient } from '@/lib/supabase-server';

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

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const supabase = getSupabaseAdminClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

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

    const bucket = getStorageBucket();
    const settled = await Promise.allSettled(
      validFiles.map(async (file) => {
        const { data, error } = await supabase.storage.from(bucket).download(file.storagePath);

        if (error || !data) {
          throw new ProcessingError(error?.message ?? `Failed to download "${file.name}".`);
        }

        return processImageBuffer({
          file,
          inputBuffer: Buffer.from(await data.arrayBuffer()),
          settings
        });
      })
    );

    const successful = settled.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof processImageBuffer>>> =>
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
        const resultPath = `${user.id}/results/${runId}/${value.result.outputName}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(resultPath, value.buffer, {
          contentType: value.result.finalMimeType,
          upsert: false
        });

        if (uploadError) {
          throw new ProcessingError(uploadError.message);
        }

        const { data: signedPreview, error: previewError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(resultPath, 3600);

        if (previewError || !signedPreview) {
          throw new ProcessingError(previewError?.message ?? 'Failed to sign result preview URL.');
        }

        const { data: signedDownload, error: downloadError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(resultPath, 3600, {
            download: value.result.outputName
          });

        if (downloadError || !signedDownload) {
          throw new ProcessingError(downloadError?.message ?? 'Failed to sign result download URL.');
        }

        return {
          ...value.result,
          previewUrl: signedPreview.signedUrl,
          downloadUrl: signedDownload.signedUrl
        };
      })
    );

    const zipBuffer = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    const zipPath = `${user.id}/zips/${runId}/imprep-results.zip`;
    const { error: zipUploadError } = await supabase.storage
      .from(bucket)
      .upload(zipPath, Buffer.from(zipBuffer), {
        contentType: 'application/zip',
        upsert: false
      });

    if (zipUploadError) {
      throw new ProcessingError(zipUploadError.message);
    }

    const { data: signedZip, error: zipSignError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(zipPath, 3600, {
        download: 'imprep-results.zip'
      });

    if (zipSignError || !signedZip) {
      throw new ProcessingError(zipSignError?.message ?? 'Failed to sign ZIP URL.');
    }

    const response: ProcessResponse = {
      zipDownloadUrl: uploadedResults.length > 0 ? signedZip.signedUrl : null,
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
