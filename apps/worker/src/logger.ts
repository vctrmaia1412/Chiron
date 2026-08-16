import pino from 'pino';
import { config } from './config';

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'chiron-worker' },
  redact: {
    paths: ['*.password', '*.token', 'email', '*.email', 'document', '*.document'],
    censor: '[redacted]',
  },
});
