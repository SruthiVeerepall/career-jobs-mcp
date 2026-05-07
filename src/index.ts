#!/usr/bin/env node
import 'dotenv/config';
import { startServer } from './server.js';
import { logger } from './utils/logger.js';

startServer().catch((err) => {
  logger.error('Fatal error starting server', err);
  process.exit(1);
});
