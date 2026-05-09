import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types, mongo } from 'mongoose';
import { KNOWLEDGE_BUCKET_NAME } from './knowledge.constants';

@Injectable()
export class KnowledgeStorageService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async saveFile(
    filename: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<Types.ObjectId> {
    const bucket = this.getBucket();

    return await new Promise<Types.ObjectId>((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(filename, {
        metadata: {
          mimeType,
        },
      });

      uploadStream.on('error', (error) => reject(error));
      uploadStream.on('finish', () => resolve(uploadStream.id));
      uploadStream.end(buffer);
    }).catch((error: unknown) => {
      throw new InternalServerErrorException(
        `No fue posible almacenar el archivo: ${this.toErrorMessage(error)}`,
      );
    });
  }

  private getBucket(): mongo.GridFSBucket {
    if (!this.connection.db) {
      throw new InternalServerErrorException(
        'MongoDB no está listo para GridFS',
      );
    }

    return new mongo.GridFSBucket(this.connection.db, {
      bucketName: KNOWLEDGE_BUCKET_NAME,
    });
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
