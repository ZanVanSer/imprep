export const MAX_FILES = 20;
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
export const MAX_BATCH_SIZE_BYTES = 350 * 1024 * 1024;

export const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

export function getFileLimitLabel() {
  return '100 MB';
}

export function getBatchLimitLabel() {
  return '350 MB';
}
