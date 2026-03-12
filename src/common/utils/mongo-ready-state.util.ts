const READY_STATE_DESCRIPTIONS: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export function describeReadyState(readyState: number): string {
  return READY_STATE_DESCRIPTIONS[readyState] ?? 'unknown';
}
