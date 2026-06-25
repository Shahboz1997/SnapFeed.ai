import OpenAI from 'openai';

export function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function mapOpenAIError(error) {
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return createError(
      'OpenAI request timed out. Generation can take a few minutes — try again, or check your VPN / OPENAI_BASE_URL in .env.',
      504,
    );
  }

  if (error instanceof OpenAI.APIConnectionError) {
    return createError(
      'Could not connect to OpenAI. Check your internet connection, VPN, or OPENAI_BASE_URL in .env.',
      502,
    );
  }

  if (error instanceof OpenAI.APIError) {
    const status = error.status || 502;
    let message = error.message || 'OpenAI API request failed.';

    if (status === 401) {
      message = 'Invalid OpenAI API key. Check OPENAI_API_KEY in .env.';
    } else if (status === 403) {
      message = 'OpenAI API is not available in your region. Use a supported VPN or set OPENAI_BASE_URL to a proxy endpoint in .env.';
    } else if (status === 429) {
      message = 'OpenAI rate limit exceeded. Please try again later.';
    } else if (status === 400) {
      message = error.message || 'Invalid request to OpenAI API.';
    } else if (/model.*does not exist|not found|not allowed/i.test(message)) {
      message = 'Image model is not enabled. Open OpenAI Dashboard → Project → Limits and add gpt-image-1.5 or dall-e-2.';
    } else if (status === 502 || /timed out|ETIMEDOUT|ECONNRESET/i.test(message)) {
      message = 'OpenAI is unreachable or timed out. Enable VPN (US/EU) or add OPENAI_BASE_URL in backend/.env.';
    }

    return createError(message, status);
  }

  return error;
}

export function errorHandler(err, req, res, _next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Image is too large. Try a smaller photo.' });
  }

  console.error(err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({ error: message });
}
