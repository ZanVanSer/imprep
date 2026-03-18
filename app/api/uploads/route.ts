import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { SUPPORTED_MIME_TYPES } from '@/lib/upload-limits';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [...SUPPORTED_MIME_TYPES],
        addRandomSuffix: true
      }),
      onUploadCompleted: async () => {
        // No-op for MVP. Local dev does not receive this callback without a tunnel.
      }
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Blob upload setup failed.' },
      { status: 400 }
    );
  }
}
