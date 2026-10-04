/** Thrown by the provider; T21 maps these to the conversation-failed path. */
export class ProviderError extends Error {
  readonly retryable: boolean;
  readonly code: string;

  constructor(code: string, message: string, retryable = false, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProviderError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof ProviderError) {
    return error.retryable;
  }
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return true;
  }
  const status = statusOf(error);
  return status === 429 || (status !== undefined && status >= 500);
}

export function statusOf(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    return error.status;
  }
  return undefined;
}
