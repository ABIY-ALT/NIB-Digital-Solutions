import { NextResponse } from 'next/server';

/** BFF liveness probe. */
export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'appcore-bff',
    time: new Date().toISOString(),
  });
}
