import 'dotenv/config';
import * as Sentry from '@sentry/node';

const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment,
  release: process.env.SENTRY_RELEASE
    || process.env.RENDER_GIT_COMMIT
    || `gritmode-be@${process.env.npm_package_version || '1.0.0'}`,
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations: [Sentry.expressIntegration()],
});
