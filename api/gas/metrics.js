import handler from '../index.js';

export default async function metricsEndpoint(req, res) {
  return handler(req, res);
}
