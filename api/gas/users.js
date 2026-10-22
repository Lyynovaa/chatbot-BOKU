import handler from '../index.js';

export default async function usersEndpoint(req, res) {
  return handler(req, res);
}
