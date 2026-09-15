/**
 * The development authentication bypass is intentionally fail-closed. It is available only while
 * Next.js is running in development mode and the deployment explicitly identifies itself as development.
 */
export const DEV_AUTH_ENABLED = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ENV === 'development';
