import type { CreateUpload } from '@chiron/contracts';
import { api, openSignedUrl } from './api';

/** Tipos aceitos pelo servidor; a câmera do celular entra como JPEG. */
export const UPLOAD_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

/**
 * Envio em três passos: o servidor registra o documento e devolve uma URL
 * assinada, o navegador manda o arquivo direto ao armazenamento e o
 * servidor confere os bytes contra o tipo declarado antes de ativar.
 */
export async function uploadDocument(
  file: File,
  input: Pick<CreateUpload, 'kind' | 'title' | 'links'>,
): Promise<string> {
  const created = await api.post<{
    documentId: string;
    uploadUrl: string;
    method: 'PUT' | 'POST';
    headers: Record<string, string>;
  }>('/documents/uploads', {
    ...input,
    mimeType: file.type,
    sizeBytes: file.size,
  });

  const upload = await fetch(created.uploadUrl, { method: created.method, headers: created.headers, body: file });
  if (!upload.ok) throw new Error('Falha ao enviar o arquivo para o armazenamento.');

  await api.post(`/documents/${created.documentId}/complete`, {});
  return created.documentId;
}

/** Abre o documento por link assinado de curta duração. */
export function openDocument(documentId: string): Promise<void> {
  return openSignedUrl(async () => {
    const result = await api.get<{ url: string }>(`/documents/${documentId}/download`);
    return result.url;
  });
}
