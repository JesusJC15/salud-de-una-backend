import { describeReadyState } from './mongo-ready-state.util';

describe('describeReadyState', () => {
  it('should describe known ready states', () => {
    expect(describeReadyState(0)).toBe('disconnected');
    expect(describeReadyState(1)).toBe('connected');
  });

  it('should return unknown for unexpected values', () => {
    expect(describeReadyState(99)).toBe('unknown');
  });
});
