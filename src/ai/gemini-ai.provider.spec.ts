import { GeminiAiProvider } from './gemini-ai.provider';

describe('GeminiAiProvider', () => {
  const client = {
    models: {
      generateContent: jest.fn(),
    },
  };

  let provider: GeminiAiProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new GeminiAiProvider(client as never);
  });

  it('generateText should map Gemini response', async () => {
    client.models.generateContent.mockResolvedValue({
      text: 'HEALTHY',
      usageMetadata: {
        promptTokenCount: 10,
      },
    });

    const result = await provider.generateText({
      promptKey: 'gemini.connectivity.check',
      promptVersion: 1,
      model: 'gemini-2.5-flash',
      inputText: 'Return HEALTHY',
      systemInstruction: 'Reply shortly',
      correlationId: 'corr-1',
    });

    expect(client.models.generateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: 'Return HEALTHY',
      config: {
        systemInstruction: 'Reply shortly',
      },
    });
    expect(result).toMatchObject({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      text: 'HEALTHY',
      requestId: 'corr-1',
      tokenUsage: {
        promptTokenCount: 10,
      },
    });
  });

  it('healthCheck should surface provider failures as down', async () => {
    client.models.generateContent.mockRejectedValue(new Error('provider down'));

    const result = await provider.healthCheck({
      promptKey: 'gemini.connectivity.check',
      promptVersion: 1,
      model: 'gemini-2.5-flash',
      inputText: 'Return HEALTHY',
      systemInstruction: 'Reply shortly',
      correlationId: 'corr-2',
    });

    expect(result).toMatchObject({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      status: 'down',
      degraded: true,
      requestId: 'corr-2',
      error: 'provider down',
    });
  });

  it('healthCheck should return up when generation succeeds', async () => {
    client.models.generateContent.mockResolvedValue({
      text: 'HEALTHY',
    });

    const result = await provider.healthCheck({
      promptKey: 'gemini.connectivity.check',
      promptVersion: 1,
      model: 'gemini-2.5-flash',
      inputText: 'Return HEALTHY',
      systemInstruction: 'Reply shortly',
      correlationId: 'corr-3',
    });

    expect(result).toMatchObject({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      status: 'up',
      degraded: false,
      requestId: 'corr-3',
    });
  });

  it('generateText should fallback to empty text and generated request id', async () => {
    client.models.generateContent.mockResolvedValue({});

    const result = await provider.generateText({
      promptKey: 'gemini.connectivity.check',
      promptVersion: 1,
      model: 'gemini-2.5-flash',
      inputText: 'Return HEALTHY',
      systemInstruction: 'Reply shortly',
    });

    expect(result.text).toBe('');
    expect(result.requestId).toBeDefined();
    expect(result.tokenUsage).toBeUndefined();
  });

  it('healthCheck should stringify non-Error failures', async () => {
    client.models.generateContent.mockRejectedValue('timeout');

    const result = await provider.healthCheck({
      promptKey: 'gemini.connectivity.check',
      promptVersion: 1,
      model: 'gemini-2.5-flash',
      inputText: 'Return HEALTHY',
      systemInstruction: 'Reply shortly',
    });

    expect(result).toMatchObject({
      provider: 'gemini',
      status: 'down',
      error: 'timeout',
    });
  });
});
