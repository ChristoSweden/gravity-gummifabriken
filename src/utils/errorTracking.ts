/**
 * Lightweight error tracking utility.
 *
 * In development, errors are logged to the console.
 * In production, this integrates with any external service (Sentry, LogRocket, etc.)
 * by updating the `reportToService` function below.
 *
 * Usage:
 *   import { captureError, captureMessage } from '../utils/errorTracking';
 *   captureError(error, { context: 'ChatPage.sendMessage' });
 *   captureMessage('Something unexpected happened', { userId: '123' });
 */

interface ErrorContext {
  [key: string]: unknown;
}

/** Replace this with Sentry.captureException / LogRocket.captureException etc. */
function reportToService(error: unknown, context?: ErrorContext): void {
  // Example Sentry integration (uncomment when ready):
  // import * as Sentry from '@sentry/react';
  // Sentry.captureException(error, { extra: context });

  // For now, structured console logging in production
  if (import.meta.env.PROD) {
    console.error('[Gravity Error]', error, context);
  }
}

function reportMessageToService(message: string, context?: ErrorContext): void {
  // Example: Sentry.captureMessage(message, { extra: context });
  if (import.meta.env.PROD) {
    console.warn('[Gravity]', message, context);
  }
}

/**
 * Capture and report an error with optional context.
 * Safe to call with any value -- won't throw.
 */
export function captureError(error: unknown, context?: ErrorContext): void {
  try {
    if (import.meta.env.DEV) {
      console.error('[captureError]', error, context);
    }
    reportToService(error, context);
  } catch {
    // Error tracking itself must never crash the app
  }
}

/**
 * Capture a non-error message / warning with optional context.
 */
export function captureMessage(message: string, context?: ErrorContext): void {
  try {
    if (import.meta.env.DEV) {
      console.warn('[captureMessage]', message, context);
    }
    reportMessageToService(message, context);
  } catch {
    // Must never crash
  }
}

/**
 * Install global handlers for uncaught errors and unhandled promise rejections.
 * Call once at app startup (e.g. in main.tsx).
 */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    captureError(event.error ?? event.message, {
      context: 'window.onerror',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    captureError(event.reason, {
      context: 'unhandledrejection',
    });
  });
}
