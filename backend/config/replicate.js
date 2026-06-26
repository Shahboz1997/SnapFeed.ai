import Replicate from 'replicate';
import { createError } from '../utils/errors.js';

let replicateClient = null;

export function getReplicate() {
  const token = process.env.REPLICATE_API_TOKEN?.trim();

  if (!token || token === 'your_replicate_api_token_here') {
    throw createError('Replicate API token is not configured.', 500);
  }

  if (!replicateClient) {
    replicateClient = new Replicate({ auth: token });
  }

  return replicateClient;
}

export function isReplicateConfigured() {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  return Boolean(token && token !== 'your_replicate_api_token_here');
}
