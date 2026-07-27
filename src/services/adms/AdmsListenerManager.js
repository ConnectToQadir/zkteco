'use strict';

const { createAdmsServer, listenLan } = require('../../http/admsServer');

/**
 * Starts and stops the LAN-facing ADMS HTTP listener based on config.
 */
class AdmsListenerManager {
  /**
   * @param {{
   *   admsPushService: import('./AdmsPushService').AdmsPushService,
   *   logger?: { info: Function, error: Function },
   * }} deps
   */
  constructor(deps) {
    this._admsPushService = deps.admsPushService;
    this._logger = deps.logger || {
      info: async () => {},
      error: async () => {},
    };
    /** @type {import('http').Server | null} */
    this._server = null;
    this._port = null;
  }

  /**
   * @param {import('../config/defaults').AppConfig} config
   */
  async sync(config) {
    const enabled = config.connectionMode === 'push' || config.connectionMode === 'both';
    if (!enabled) {
      await this.stop();
      return;
    }

    if (this._server && this._port === config.admsPort) {
      return;
    }

    await this.stop();

    try {
      const app = createAdmsServer({ admsPushService: this._admsPushService });
      this._server = await listenLan(app, config.admsPort);
      this._port = config.admsPort;
      this._admsPushService.setListening(true, config.admsPort);
      await this._logger.info('ADMS push listener started', { port: config.admsPort });
    } catch (error) {
      this._admsPushService.setListening(false, null);
      await this._logger.error('ADMS push listener failed to start', {
        error: error.message,
        port: config.admsPort,
      });
      throw error;
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async stop() {
    if (this._server) {
      await new Promise((resolve) => {
        this._server.close(() => resolve());
      });
      this._server = null;
      this._port = null;
    }
    this._admsPushService.setListening(false, null);
  }
}

module.exports = {
  AdmsListenerManager,
};
