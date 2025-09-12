function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryDiscordError(err) {
  const status = err && (err.status ?? err.httpStatus ?? null);
  const code = err && err.code;
  const msg = (err && err.message) || '';

  // Do not retry on client/permission/not found errors
  if (status === 400 || status === 401 || status === 403 || status === 404) return false;
  if (code === 10008) return false; // Unknown Message (deleted)

  // Retry on rate limits and transient server/network conditions
  if (status === 429) return true;
  if (status === 500 || status === 502 || status === 503 || status === 504) return true;
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(msg)) return true;

  return false;
}

async function retryable(fn, { retries = 3, minDelay = 500, maxDelay = 4000 } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !shouldRetryDiscordError(err)) break;
      const backoff = Math.min(minDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * 0.25 * backoff;
      await delay(backoff + jitter);
      attempt += 1;
    }
  }
  throw lastErr;
}

module.exports = {
  delay,
  retryable,
  shouldRetryDiscordError
};


