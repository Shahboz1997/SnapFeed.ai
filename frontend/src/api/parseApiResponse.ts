import { ApiError } from './generateImage';

export async function parseApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();

  if (!text.trim()) {
    const message =
      response.status === 502 || response.status === 503 || response.status === 504
        ? 'Backend is starting or timed out. Please try again in a moment.'
        : 'Empty response from server.';

    throw new ApiError(message, response.status, 'api.invalidResponse');
  }

  if (!contentType.includes('application/json')) {
    const message =
      response.status === 413
        ? 'Image is too large. Try a smaller photo.'
        : response.status >= 500
          ? 'Backend is starting or timed out. Please try again in a moment.'
          : `Unexpected server response (${response.status}).`;

    throw new ApiError(message, response.status, 'api.invalidResponse');
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      'Received an invalid response from the server.',
      response.status,
      'api.invalidResponse',
    );
  }
}
