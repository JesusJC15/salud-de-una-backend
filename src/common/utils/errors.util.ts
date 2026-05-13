export function normalizeError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: 'UnknownError', message: String(error) };
}

export function isDuplicateKeyError(error: unknown, field?: string): boolean {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    (error as { code?: unknown }).code !== 11000
  ) {
    return false;
  }
  if (!field) {
    return true;
  }
  const keyPattern = (error as Record<string, unknown>).keyPattern;
  return (
    typeof keyPattern === 'object' && keyPattern !== null && field in keyPattern
  );
}
