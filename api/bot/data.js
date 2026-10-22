import handler from '../index.js';

export default async function botDataEndpoint(req, res) {
  return handler(req, res);
}
