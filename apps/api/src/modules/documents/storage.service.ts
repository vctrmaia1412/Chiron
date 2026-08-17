import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env, publicStorageEndpoint } from '../../config/env';
import { logger } from '../../common/logger';

/** Janela do cache da checagem de bucket. Curta: o storage pode subir depois da API. */
const BUCKET_CHECK_TTL_MS = 60_000;

/** O endpoint pode vir como host puro; sem esquema, assume https. */
function normalizeEndpoint(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Armazenamento S3-compatível (MinIO local, S3, R2 ou B2 na cloud).
 * Chave sempre prefixada por tenant; bucket privado; leitura só por URL
 * assinada de curta duração emitida pelo backend.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  /** Endpoint interno: put, get e delete feitos pelo servidor. */
  private client: S3Client | null = null;
  /** Endpoint que o navegador alcança: usado só para assinar URL. */
  private signer: S3Client | null = null;
  private bucketReadyUntil = 0;
  private pendingCheck: Promise<boolean> | null = null;

  onModuleInit(): void {
    const cfg = env();
    if (!cfg.S3_ACCESS_KEY || !cfg.S3_SECRET_KEY) {
      logger.warn('Storage S3 não configurado: uploads e PDFs ficarão indisponíveis.');
      return;
    }

    const credentials = { accessKeyId: cfg.S3_ACCESS_KEY, secretAccessKey: cfg.S3_SECRET_KEY };
    this.client = this.buildClient(cfg.S3_ENDPOINT, credentials);

    // O endpoint interno (http://minio:9000) não existe para o navegador, e a
    // assinatura SigV4 cobre o host: a URL já sai assinada com o endereço
    // público. Sem endereço público, assina com o interno, como antes.
    const internalEndpoint = normalizeEndpoint(cfg.S3_ENDPOINT);
    const publicEndpoint = normalizeEndpoint(publicStorageEndpoint());
    this.signer =
      publicEndpoint && publicEndpoint !== internalEndpoint
        ? this.buildClient(publicEndpoint, credentials)
        : this.client;
  }

  /**
   * Disponibilidade conferida sob demanda, com cache curto: se o storage subir
   * depois da API, o upload volta sozinho, sem reiniciar o processo. A falha
   * não é memorizada, para a próxima requisição tentar de novo.
   */
  async isAvailable(): Promise<boolean> {
    if (!this.client) return false;
    if (Date.now() < this.bucketReadyUntil) return true;
    if (this.pendingCheck) return this.pendingCheck;

    const check = this.ensureBucket().finally(() => {
      this.pendingCheck = null;
    });
    this.pendingCheck = check;
    return check;
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
    if (!this.signer) throw new Error('Storage indisponível');
    return getSignedUrl(
      this.signer,
      new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn },
    );
  }

  async presignDownload(key: string, filename: string, expiresIn = 300): Promise<string> {
    if (!this.signer) throw new Error('Storage indisponível');
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: env().S3_BUCKET,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
      }),
      { expiresIn },
    );
  }

  /** Tamanho do objeto sem baixar o conteúdo. `null` quando não existe. */
  async head(key: string): Promise<number | null> {
    if (!this.client) return null;
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
      return result.ContentLength ?? null;
    } catch {
      return null;
    }
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

  private buildClient(
    endpoint: string | undefined,
    credentials: { accessKeyId: string; secretAccessKey: string },
  ): S3Client {
    const cfg = env();
    return new S3Client({
      endpoint,
      region: cfg.S3_REGION,
      forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
      credentials,
      // R2 e B2 recusam o x-amz-checksum-crc32 que o SDK passou a assinar por padrão.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      // Storage fora do ar não pode segurar a requisição do usuário.
      requestHandler: { connectionTimeout: 3000, requestTimeout: 15000 },
      maxAttempts: 3,
    });
  }

  private async ensureBucket(): Promise<boolean> {
    const client = this.client;
    if (!client) return false;
    const bucket = env().S3_BUCKET;

    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      this.bucketReadyUntil = Date.now() + BUCKET_CHECK_TTL_MS;
      return true;
    } catch {
      try {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        this.bucketReadyUntil = Date.now() + BUCKET_CHECK_TTL_MS;
        logger.info({ bucket }, 'Bucket criado');
        return true;
      } catch (error) {
        this.bucketReadyUntil = 0;
        logger.warn({ err: error, bucket }, 'Armazenamento indisponível: bucket não pôde ser preparado');
        return false;
      }
    }
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
