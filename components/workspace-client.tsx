'use client';

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { formatBytes, getPresetDescription, getPresetLabel } from '@/lib/presets';
import {
  AppSettings,
  ProcessRequest,
  Preset,
  ProcessResponse,
  ProcessedImageResult,
  UploadedSource,
  UploadItemStatus
} from '@/lib/types';
import {
  MAX_BATCH_SIZE_BYTES,
  MAX_FILE_SIZE_BYTES,
  SUPPORTED_MIME_TYPES,
  getBatchLimitLabel,
  getFileLimitLabel
} from '@/lib/upload-limits';

const PRESETS: Preset[] = ['hero', 'content', 'half', 'logo', 'screenshot', 'custom'];

const DEFAULT_SETTINGS: AppSettings = {
  preset: 'content',
  outputFormat: 'auto',
  retina: true,
  compressionMode: 'balanced',
  preserveTransparency: true,
  fileSuffix: '-email',
  customDisplayWidth: 600
};

function StatusPill({ status }: { status: ProcessedImageResult['status'] }) {
  return <span className={`status-pill status-${status}`}>{status.replace('-', ' ')}</span>;
}

function ResultCard({ result }: { result: ProcessedImageResult }) {
  return (
    <article className="result-card">
      <div className="result-preview-wrap">
        <img className="result-preview" src={result.previewUrl} alt={result.outputName} loading="lazy" />
      </div>
      <div className="result-body">
        <div className="result-topline">
          <div>
            <h3>{result.outputName}</h3>
            <p>{result.originalName}</p>
          </div>
          <StatusPill status={result.status} />
        </div>
        <dl className="result-stats">
          <div>
            <dt>Preset</dt>
            <dd>{getPresetLabel(result.preset)}</dd>
          </div>
          <div>
            <dt>Format</dt>
            <dd>{result.finalMimeType.replace('image/', '').toUpperCase()}</dd>
          </div>
          <div>
            <dt>Dimensions</dt>
            <dd>
              {result.originalWidth}x{result.originalHeight} {'->'} {result.finalWidth}x
              {result.finalHeight}
            </dd>
          </div>
          <div>
            <dt>File size</dt>
            <dd>
              {formatBytes(result.originalSizeBytes)} {'->'} {formatBytes(result.finalSizeBytes)}
            </dd>
          </div>
          <div>
            <dt>Reduction</dt>
            <dd>{result.reductionPercent}%</dd>
          </div>
        </dl>
        <p className="result-recommendation">{result.recommendation}</p>
        {result.warnings.length > 0 ? (
          <ul className="warning-list compact-list">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        <a className="primary-button download-link" href={result.downloadUrl}>
          Download image
        </a>
      </div>
    </article>
  );
}

interface UploadListItem {
  key: string;
  file: File;
  status: UploadItemStatus;
  note?: string;
  source?: UploadedSource;
}

function getUploadStatusLabel(status: UploadItemStatus) {
  switch (status) {
    case 'uploading':
      return 'Uploading';
    case 'processing':
      return 'Processing';
    case 'done':
      return 'Done';
    case 'skipped-too-large':
      return 'Too large';
    case 'skipped-unsupported':
      return 'Unsupported';
    case 'failed':
      return 'Failed';
    default:
      return 'Ready';
  }
}

function validateClientFile(file: File) {
  if (!SUPPORTED_MIME_TYPES.has(file.type)) {
    return {
      status: 'skipped-unsupported' as const,
      note: 'Unsupported file type.'
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      status: 'skipped-too-large' as const,
      note: `Larger than the ${getFileLimitLabel()} file limit.`
    };
  }

  return {
    status: 'ready' as const,
    note: 'Ready to process.'
  };
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-');
}

export function WorkspaceClient({ initialSession }: { initialSession: Session }) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(initialSession);
  const [uploadItems, setUploadItems] = useState<UploadListItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [results, setResults] = useState<ProcessedImageResult[]>([]);
  const [zipDownloadUrl, setZipDownloadUrl] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const validFiles = useMemo(
    () =>
      uploadItems.filter(
        (item) => item.status === 'ready' || item.status === 'done' || item.status === 'failed'
      ),
    [uploadItems]
  );
  const submittableSize = useMemo(
    () => validFiles.reduce((total, item) => total + item.file.size, 0),
    [validFiles]
  );

  useEffect(() => {
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (!nextSession) {
        router.replace('/login');
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, supabase.auth]);

  useEffect(() => {
    setResults([]);
    setZipDownloadUrl('');
    setUploadItems((current) =>
      current.map((item) =>
        item.status === 'done' || item.status === 'failed'
          ? { ...item, status: 'ready', note: 'Ready to process.', source: undefined }
          : item
      )
    );
  }, [settings]);

  function updateFiles(files: FileList | null) {
    setErrors([]);
    setResults([]);
    setZipDownloadUrl('');
    const nextItems = files
      ? Array.from(files).map((file) => {
          const validation = validateClientFile(file);
          return {
            key: `${file.name}-${file.size}-${file.lastModified}`,
            file,
            status: validation.status,
            note: validation.note
          };
        })
      : [];

    setUploadItems(nextItems);
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    updateFiles(event.target.files);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    updateFiles(event.dataTransfer.files);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUploadItems([]);
    setResults([]);
    setZipDownloadUrl('');
    setErrors([]);
    router.replace('/login');
    router.refresh();
  }

  async function handlePrepare() {
    if (!session) {
      setErrors(['Sign in to process images.']);
      return;
    }

    if (uploadItems.length === 0) {
      setErrors(['Upload at least one image to continue.']);
      return;
    }

    if (submittableSize > MAX_BATCH_SIZE_BYTES) {
      setErrors([
        `This batch is larger than the ${getBatchLimitLabel()} upload limit. Split it into smaller batches.`
      ]);
      return;
    }

    if (validFiles.length === 0) {
      setErrors(['No valid files are ready to process. Remove skipped files or upload smaller images.']);
      return;
    }

    setIsProcessing(true);
    setErrors([]);
    setUploadItems((current) =>
      current.map((item) =>
        item.status === 'ready' || item.status === 'done' || item.status === 'failed'
          ? { ...item, status: 'uploading', note: 'Uploading source…', source: undefined }
          : item
      )
    );

    try {
      const uploadMap = new Map<string, UploadedSource>();
      const sourceRunId = crypto.randomUUID();
      const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'imprep-assets';
      const userId = session.user.id;

      for (const item of validFiles) {
        const storagePath = `${userId}/sources/${sourceRunId}/${sanitizeFilename(item.file.name)}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, item.file, {
          contentType: item.file.type,
          upsert: false
        });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        const source: UploadedSource = {
          storagePath,
          name: item.file.name,
          mimeType: item.file.type,
          sizeBytes: item.file.size
        };
        uploadMap.set(item.key, source);
        setUploadItems((current) =>
          current.map((entry) =>
            entry.key === item.key
              ? { ...entry, status: 'processing', note: 'Preparing export…', source }
              : entry
          )
        );
      }

      const requestBody: ProcessRequest = {
        settings,
        sources: validFiles
          .map((item) => uploadMap.get(item.key))
          .filter((source): source is UploadedSource => Boolean(source))
      };

      const response = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(requestBody)
      });
      const payload = (await response.json()) as ProcessResponse | { error: string };

      if (!response.ok || 'error' in payload) {
        throw new Error('error' in payload ? payload.error : 'Processing failed.');
      }

      setResults(payload.results);
      setZipDownloadUrl(payload.zipDownloadUrl ?? '');
      setErrors(payload.errors);
      setUploadItems((current) =>
        current.map((item) => {
          const matchedResult = payload.results.find((result) => result.originalName === item.file.name);
          const matchedSkipped = payload.skipped.find((skipped) => skipped.name === item.file.name);

          if (matchedResult) {
            return {
              ...item,
              status: 'done',
              note: 'Processed successfully.',
              source: uploadMap.get(item.key)
            };
          }

          if (matchedSkipped) {
            return {
              ...item,
              status:
                matchedSkipped.code === 'unsupported'
                  ? 'skipped-unsupported'
                  : matchedSkipped.code === 'too-large'
                    ? 'skipped-too-large'
                    : 'failed',
              note: matchedSkipped.reason,
              source: uploadMap.get(item.key)
            };
          }

          if (item.status === 'processing') {
            return {
              ...item,
              status: 'failed',
              note: 'Processing failed.',
              source: uploadMap.get(item.key)
            };
          }

          return item;
        })
      );
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Processing failed.']);
      setResults([]);
      setZipDownloadUrl('');
      setUploadItems((current) =>
        current.map((item) =>
          item.status === 'processing' || item.status === 'uploading'
            ? { ...item, status: 'failed', note: 'Processing failed.' }
            : item
        )
      );
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            im
          </div>
          <div>
            <h1>imprep</h1>
            <p>Prepare email-safe image exports with one batch workflow.</p>
          </div>
        </div>
        <div className="header-actions">
          <div className="header-meta">
            <span>{session?.user.email ?? 'Signed in'}</span>
            <span>{uploadItems.length} files in queue</span>
          </div>
          <button className="secondary-button" type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <section className="workspace-layout">
        <div className="workspace-main">
          <section className="section-card">
            <div className="section-head">
              <div>
                <h2>Upload</h2>
                <p>Use JPG, PNG, WebP, or GIF files. Files over {getFileLimitLabel()} are skipped.</p>
              </div>
            </div>

            <label
              className={`dropzone ${isDragging ? 'dragging' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handleFileInput}
              />
              <strong>Drop images here</strong>
              <span>Or click to select files from your computer.</span>
            </label>

            {uploadItems.length > 0 ? (
              <ul className="file-list">
                {uploadItems.map((item) => (
                  <li key={item.key}>
                    <div className="file-meta">
                      <strong>{item.file.name}</strong>
                      <span>{item.note}</span>
                    </div>
                    <div className="file-trailing">
                      <span>{formatBytes(item.file.size)}</span>
                      <span className={`upload-status upload-status-${item.status}`}>
                        {getUploadStatusLabel(item.status)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="section-card">
            <div className="section-head">
              <div>
                <h2>Results</h2>
                <p>Processed files appear here with download links and export details.</p>
              </div>
              {zipDownloadUrl ? (
                <a className="primary-button" href={zipDownloadUrl}>
                  Download ZIP
                </a>
              ) : null}
            </div>

            {results.length === 0 ? (
              <p className="empty-state">Run a batch to see previews, file savings, and recommendations.</p>
            ) : (
              <div className="results-grid">
                {results.map((result) => (
                  <ResultCard key={result.id} result={result} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="workspace-sidebar">
          <section className="section-card">
            <div className="section-head">
              <div>
                <h2>Settings</h2>
                <p>These options apply to every file in the current batch.</p>
              </div>
            </div>

            <div className="preset-grid">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`preset-card ${settings.preset === preset ? 'active' : ''}`}
                  onClick={() => setSettings((current) => ({ ...current, preset }))}
                >
                  <strong>{getPresetLabel(preset)}</strong>
                  <span>{getPresetDescription(preset)}</span>
                </button>
              ))}
            </div>

            <div className="field-grid">
              <label className="field">
                <span>Output format</span>
                <select
                  value={settings.outputFormat}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      outputFormat: event.target.value as AppSettings['outputFormat']
                    }))
                  }
                >
                  <option value="auto">Auto</option>
                  <option value="jpeg">JPEG</option>
                  <option value="png">PNG</option>
                  <option value="webp">WebP</option>
                </select>
                {settings.outputFormat === 'webp' ? (
                  <small>WebP support still varies across email clients.</small>
                ) : null}
              </label>

              <label className="field">
                <span>Compression mode</span>
                <select
                  value={settings.compressionMode}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      compressionMode: event.target.value as AppSettings['compressionMode']
                    }))
                  }
                >
                  <option value="small">Smaller file</option>
                  <option value="balanced">Balanced</option>
                  <option value="sharp">Sharper image</option>
                </select>
              </label>

              <label className="field">
                <span>Retina export</span>
                <select
                  value={String(settings.retina)}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      retina: event.target.value === 'true'
                    }))
                  }
                >
                  <option value="true">On</option>
                  <option value="false">Off</option>
                </select>
              </label>

              <label className="field">
                <span>Filename suffix</span>
                <input
                  type="text"
                  value={settings.fileSuffix}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      fileSuffix: event.target.value
                    }))
                  }
                />
              </label>

              <label className="field checkbox-field">
                <input
                  type="checkbox"
                  checked={settings.preserveTransparency}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      preserveTransparency: event.target.checked
                    }))
                  }
                />
                <span>Preserve transparency when Auto selects the output format.</span>
              </label>

              {settings.preset === 'custom' ? (
                <label className="field">
                  <span>Custom display width</span>
                  <input
                    type="number"
                    min={50}
                    max={2000}
                    value={settings.customDisplayWidth ?? 600}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        customDisplayWidth: Number.parseInt(event.target.value, 10) || 600
                      }))
                    }
                  />
                </label>
              ) : null}
            </div>

            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                onClick={handlePrepare}
                disabled={uploadItems.length === 0 || isProcessing}
              >
                {isProcessing ? 'Preparing…' : 'Prepare batch'}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setUploadItems([]);
                  setResults([]);
                  setErrors([]);
                  setZipDownloadUrl('');
                }}
              >
                Clear
              </button>
            </div>
          </section>

          {errors.length > 0 ? (
            <section className="section-card">
              <h2>Notices</h2>
              <ul className="warning-list">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
