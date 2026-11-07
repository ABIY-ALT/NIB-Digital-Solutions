'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/shared/errors/report-error';

/** Last-resort boundary (the root layout itself failed). Dependency-free on purpose. */
export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => reportClientError(error, { kind: 'global', digest: error.digest }), [error]);
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'Segoe UI, sans-serif',
          display: 'grid',
          placeItems: 'center',
          minHeight: '100vh',
          margin: 0,
          background: '#faf9f8',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <p style={{ color: '#605e5c', fontSize: 14 }}>
            An unexpected error occurred. Please try again.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, color: '#8a8886' }}>Reference: {error.digest}</p>
          ) : null}
          <button
            onClick={reset}
            style={{
              marginTop: 12,
              background: '#FEB914',
              border: 0,
              borderRadius: 4,
              padding: '8px 16px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
