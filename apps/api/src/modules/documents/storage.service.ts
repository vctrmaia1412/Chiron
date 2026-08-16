import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env';
import { logger } from '../../common/logger';

/**
 * Armazenamento S3-compatível (MinIO local, S3 na cloud).
 * Chave sempre prefixada por tenant; bucket privado; leitura só por URL
 * assinada de curta duração emitida pelo backend.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private client: S3Client | null = null;
  private available = false;

  async onModuleInit(): Promise<void> {
    const cfg = env();
    if (!cfg.S3_ACCESS_KEY || !cfg.S3_SECRET_KEY) {
      logger.warn('Storage S3 não configurado: uploads e PDFs ficarão indisponíveis.');
      return;
    }

    this.client = new S3Client({
      endpoint: cfg.S3_ENDPOINT,
      region: cfg.S3_REGION,
      forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: cfg.S3_ACCESS_KEY, secretAccessKey: cfg.S3_SECRET_KEY },
    });

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: cfg.S3_BUCKET }));
      this.available = true;
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: cfg.S3_BUCKET }));
        this.available = true;
        logger.info({ bucket: cfg.S3_BUCKET }, 'Bucket criado');
      } catch (error) {
        logger.error({ err: error }, 'Não foi possível preparar o bucket de armazenamento');
      }
    }
  }

  isAvailable(): boolean {
    return this.available && this.client !== null;
  }

  buildKey(tenantId: string, kind: string, documentId: string, extension: string): string {
    return `tenant/${tenantId}/${kind}/${documentId}.${extension}`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (!this.client) throw new Error('Storage indisponível');
    await this.client.send(
      new PutObjectCommand({
        Bucket: env().S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: undefined, // MinIO local; em produção usar SSE-S3/SSE-KMS
      }),
    );
  }

  /** URL de upload direto (presigned PUT) com expiração curta. */
  async presignUpload(key: string, contentType: string, expiresIn = 900): Promise<string> {
    if (!this.client) throw new Error('Storage indisponível');
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn },
    );
  }

  async presignDownload(key: string, filename: string, expiresIn = 300): Promise<string> {
    if (!this.client) throw new Error('Storage indisponível');
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: env().S3_BUCKET,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
      }),
      { expiresIn },
    );
  }

  async get(key: string): Promise<Buffer | null> {
    if (!this.client) return null;
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
      const chunks: Buffer[] = [];
      const stream = result.Body as AsyncIterable<Uint8Array>;
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
  }

  /** Verificação de magic bytes: o tipo declarado precisa bater com o conteúdo. */
  static detectMime(buffer: Buffer): string | null {
    if (buffer.length < 4) return null;
    const hex = buffer.subarray(0, 4).toString('hex').toUpperCase();
    if (hex.startsWith('25504446')) return 'application/pdf';
    if (hex.startsWith('FFD8FF')) return 'image/jpeg';
    if (hex.startsWith('89504E47')) return 'image/png';
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
      return 'image/webp';
    }
    return null;
  }
}
