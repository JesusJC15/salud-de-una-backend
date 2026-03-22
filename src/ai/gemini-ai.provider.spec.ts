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
});
