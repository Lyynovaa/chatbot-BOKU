import handler from '../index.js';

export default async function bundleEndpoint(req, res) {
  return handler(req, res);
}
