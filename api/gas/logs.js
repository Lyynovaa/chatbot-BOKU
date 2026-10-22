import handler from '../index.js';

export default async function logsEndpoint(req, res) {
  return handler(req, res);
}
