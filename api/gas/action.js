import handler from '../index.js';

export default async function actionEndpoint(req, res) {
  return handler(req, res);
}
