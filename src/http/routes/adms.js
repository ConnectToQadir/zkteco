'use strict';

const express = require('express');

/**
 * ZKTeco ADMS iclock routes.
 * @param {{ admsPushService: import('../../services/adms/AdmsPushService').AdmsPushService }} deps
 */
function createAdmsRouter(deps) {
  const router = express.Router();
  const service = deps.admsPushService;

  const sendText = (res, body) => {
    res.status(200).type('text/plain').send(body);
  };

  router.get('/iclock/cdata', (req, res) => {
    sendText(res, service.handleCdataGet(req));
  });

  router.post('/iclock/cdata', async (req, res, next) => {
    try {
      const body = await service.handleCdataPost(req);
      sendText(res, body);
    } catch (error) {
      next(error);
    }
  });

  router.get('/iclock/getrequest', (req, res) => {
    sendText(res, service.handleGetRequest());
  });

  router.post('/iclock/devicecmd', (req, res) => {
    sendText(res, service.handleDeviceCmd());
  });

  router.get('/iclock/registry', (req, res) => {
    sendText(res, service.handleRegistry());
  });

  router.use((error, _req, res, _next) => {
    const message = error && error.message ? error.message : 'ADMS handler error';
    res.status(500).type('text/plain').send(`ERROR:${message}`);
  });

  return router;
}

module.exports = {
  createAdmsRouter,
};
