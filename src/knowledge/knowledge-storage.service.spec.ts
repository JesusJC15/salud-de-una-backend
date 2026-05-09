import { InternalServerErrorException } from '@nestjs/common';
import { EventEmitter } from 'events';
import { KnowledgeStorageService } from './knowledge-storage.service';

describe('KnowledgeStorageService', () => {
  it('saveFile should resolve the uploaded GridFS id', async () => {
    const service = new KnowledgeStorageService({ db: {} } as never);
    const uploadStream = new EventEmitter() as EventEmitter & {
      id: string;
      end: (buffer: Buffer) => void;
    };
    uploadStream.id = 'gridfs-file-id';
    uploadStream.end = () => {
      uploadStream.emit('finish');
    };
    jest.spyOn(service as never, 'getBucket' as never).mockReturnValue({
      openUploadStream: jest.fn(() => uploadStream),
    } as unknown as never);

    await expect(
      service.saveFile('file.txt', 'text/plain', Buffer.from('hola')),
    ).resolves.toBe('gridfs-file-id');
  });

  it('saveFile should map upload errors to InternalServerErrorException', async () => {
    const service = new KnowledgeStorageService({ db: {} } as never);
    const uploadStream = new EventEmitter() as EventEmitter & {
      id: string;
      end: (buffer: Buffer) => void;
    };
    uploadStream.id = 'gridfs-file-id';
    uploadStream.end = () => {
      uploadStream.emit('error', new Error('disk full'));
    };
    jest.spyOn(service as never, 'getBucket' as never).mockReturnValue({
      openUploadStream: jest.fn(() => uploadStream),
    } as unknown as never);

    await expect(
      service.saveFile('file.txt', 'text/plain', Buffer.from('hola')),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('getBucket should throw when MongoDB is not ready', () => {
    const service = new KnowledgeStorageService({ db: null } as never);

    expect(() =>
      (service as unknown as { getBucket: () => unknown }).getBucket(),
    ).toThrow(InternalServerErrorException);
  });

  it('toErrorMessage should normalize Error and non-Error values', () => {
    const service = new KnowledgeStorageService({ db: {} } as never);
    const privateApi = service as unknown as {
      toErrorMessage: (error: unknown) => string;
    };

    expect(privateApi.toErrorMessage(new Error('boom'))).toBe('boom');
    expect(privateApi.toErrorMessage('plain')).toBe('plain');
  });
});
