export type FetchWithTimeoutOptions = RequestInit & {
  timeoutMs: number;
};

export async function fetchWithTimeout(
  input: string | URL,
  options: FetchWithTimeoutOptions,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    return await fetch(input, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export function shouldRetryHttpRequest(
  response: Response | null,
  error: unknown,
): boolean {
  if (response) {
    return response.status === 429 || response.status >= 500;
  }

  return error instanceof Error;
}

export async function delayMs(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}
