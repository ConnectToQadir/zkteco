'use strict';

const { LoggerService } = require('./LoggerService');

/**
 * @deprecated Use LoggerService. Kept so older imports keep working.
 */
class MemoryLogger extends LoggerService {
  constructor() {
    super({ enabled: true, mirrorToConsole: true });
  }
}

module.exports = {
  MemoryLogger,
  LoggerService,
};
