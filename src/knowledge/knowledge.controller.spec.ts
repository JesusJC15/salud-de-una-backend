import { KnowledgeController } from './knowledge.controller';

describe('KnowledgeController', () => {
  const knowledgeService = {
    listSources: jest.fn(),
    createSource: jest.fn(),
    updateSource: jest.fn(),
    listDocuments: jest.fn(),
    ingestUploadedDocument: jest.fn(),
    ingestDocumentFromUrl: jest.fn(),
    getDocument: jest.fn(),
    getDocumentChunks: jest.fn(),
    reprocessDocument: jest.fn(),
    reviewDocument: jest.fn(),
    listJobs: jest.fn(),
  };

  const user = { userId: 'admin-1' };
  const req = { user, correlationId: 'corr-1' };

  let controller: KnowledgeController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new KnowledgeController(knowledgeService as never);
  });

  it('delegates source and document listing endpoints', () => {
    controller.listSources();
    controller.createSource({ name: 'Fuente' } as never);
    controller.updateSource('source-1', { name: 'Fuente 2' });
    controller.listDocuments({ status: 'APPROVED' });
    controller.getDocument('doc-1');
    controller.getDocumentChunks('doc-1');
    controller.listJobs();

    expect(knowledgeService.listSources).toHaveBeenCalled();
    expect(knowledgeService.createSource).toHaveBeenCalledWith({
      name: 'Fuente',
    });
    expect(knowledgeService.updateSource).toHaveBeenCalledWith('source-1', {
      name: 'Fuente 2',
    });
    expect(knowledgeService.listDocuments).toHaveBeenCalledWith({
      status: 'APPROVED',
    });
    expect(knowledgeService.getDocument).toHaveBeenCalledWith('doc-1');
    expect(knowledgeService.getDocumentChunks).toHaveBeenCalledWith('doc-1');
    expect(knowledgeService.listJobs).toHaveBeenCalled();
  });

  it('delegates ingestion and review flows with user context', () => {
    const file = {
      originalname: 'doc.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from('contenido'),
    };

    controller.uploadDocument({ title: 'Doc' } as never, req as never, file);
    controller.ingestUrl(
      { sourceUrl: 'https://example.com' } as never,
      req as never,
    );
    controller.reprocessDocument('doc-1', req as never);
    controller.reviewDocument(
      'doc-1',
      { status: 'APPROVED' } as never,
      req as never,
    );

    expect(knowledgeService.ingestUploadedDocument).toHaveBeenCalledWith(
      { title: 'Doc' },
      user,
      'corr-1',
      file,
    );
    expect(knowledgeService.ingestDocumentFromUrl).toHaveBeenCalledWith(
      { sourceUrl: 'https://example.com' },
      user,
      'corr-1',
    );
    expect(knowledgeService.reprocessDocument).toHaveBeenCalledWith(
      'doc-1',
      user,
      'corr-1',
    );
    expect(knowledgeService.reviewDocument).toHaveBeenCalledWith(
      'doc-1',
      { status: 'APPROVED' },
      user,
    );
  });
});
