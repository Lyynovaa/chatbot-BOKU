import handler from '../index.js';

export default async function statusEndpoint(req, res) {
  return handler(req, res);
}
