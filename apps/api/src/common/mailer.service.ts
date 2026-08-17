import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from './errors';
import { logger } from './logger';
import { env, isProduction } from '../config/env';

/**
 * Envio de e-mail transacional pela API HTTP da Resend. Não é SMTP de
 * propósito: a saída na porta 25 vem bloqueada por padrão na Oracle Cloud e em
 * boa parte dos PaaS, então um mailer SMTP funcionaria na máquina do
 * desenvolvedor e falharia calado no servidor. A chamada usa o `fetch` do
 * próprio Node, sem dependência nova.
 *
 * Sem chave configurada o serviço entra em modo seco: registra destinatário e
 * link no log, que é como o fluxo se conclui em desenvolvimento. Em produção
 * modo seco não existe, porque um convite que ninguém recebe é pior que um
 * erro visível.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Teto de cada tentativa. Acima disso a requisição é abortada. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Uma tentativa e uma retentativa: falha de rede costuma ser passageira. */
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 750;

/** Acompanha `now() + interval '14 days'` em `iam.invitations`. */
const INVITATION_VALIDITY = '14 dias';

/** Acompanha `now() + interval '30 minutes'` em `iam.password_reset_tokens`. */
const PASSWORD_RESET_VALIDITY = '30 minutos';

/** Nome do produto usado nos textos, para não repetir literal em cada template. */
const PRODUCT_NAME = 'CHIRON';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Rótulo curto do envio, só para o log. Nunca leva conteúdo nem token. */
  kind: string;
  /** Endereço de ação, registrado apenas no modo seco fora de produção. */
  link: string;
}

/**
 * Falha da chamada ao provedor. `retryable` separa o que vale repetir (rede,
 * timeout, 429 e 5xx) do que só se resolve corrigindo a configuração.
 */
class MailerError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'MailerError';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Descrição segura do erro: nunca inclui destinatário nem corpo da mensagem. */
function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return `o provedor não respondeu em ${REQUEST_TIMEOUT_MS} ms`;
    }
    return error.message;
  }
  return 'falha desconhecida na chamada ao provedor';
}

/** Identificador devolvido pela Resend, útil para rastrear a entrega no suporte. */
function providerId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const id = (body as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

/** Endereço da tela de aceite de convite. Um lugar só, para os dois chamadores. */
export function invitationUrl(token: string): string {
  return `${appBaseUrl()}/convite/${encodeURIComponent(token)}`;
}

/** Endereço da tela de nova senha. */
export function passwordResetUrl(token: string): string {
  return `${appBaseUrl()}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

/** A barra final é comum em variável de ambiente e viraria `//` no link. */
function appBaseUrl(): string {
  return env().PUBLIC_APP_URL.replace(/\/+$/, '');
}

/** Layout único: cabeçalho, parágrafos, botão e o link em texto para copiar. */
function htmlLayout(input: {
  title: string;
  paragraphs: string[];
  actionLabel: string;
  url: string;
  note: string;
}): string {
  const href = escapeHtml(input.url);
  const paragraphs = input.paragraphs
    .map((text) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(text)}</p>`)
    .join('');

  return [
    '<!doctype html>',
    '<html lang="pt-BR"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"',
    ' style="max-width:560px;background:#ffffff;border-radius:8px;padding:32px"><tr><td>',
    `<h1 style="margin:0 0 20px;font-size:20px">${escapeHtml(input.title)}</h1>`,
    paragraphs,
    `<p style="margin:24px 0"><a href="${href}"`,
    ' style="display:inline-block;padding:12px 20px;background:#1f6feb;color:#ffffff;',
    `text-decoration:none;border-radius:6px">${escapeHtml(input.actionLabel)}</a></p>`,
    '<p style="margin:0 0 16px;font-size:13px;color:#52606d">',
    'Se o botão não funcionar, copie este endereço e cole no navegador:<br>',
    `<span style="word-break:break-all">${href}</span></p>`,
    `<p style="margin:0;font-size:13px;color:#52606d">${escapeHtml(input.note)}</p>`,
    '</td></tr></table></td></tr></table></body></html>',
  ].join('');
}

@Injectable()
export class MailerService {
  /**
   * Entrega a mensagem ou lança. Nunca devolve normalmente sem ter enviado,
   * exceto no modo seco fora de produção, que é explícito no log.
   */
  async send(message: MailMessage): Promise<void> {
    const cfg = env();
    const apiKey = cfg.EMAIL_API_KEY?.trim();

    if (cfg.EMAIL_PROVIDER === 'none' || !apiKey) {
      if (isProduction()) {
        throw new AppError(
          'INTERNAL_ERROR',
          'Envio de e-mail não configurado. Defina EMAIL_PROVIDER=resend, EMAIL_API_KEY e EMAIL_FROM.',
        );
      }
      // Modo seco: sem provedor o link precisa aparecer em algum lugar para o
      // fluxo poder ser concluído à mão. Só o destinatário e o link, nunca o
      // corpo da mensagem, e nunca em produção.
      logger.info({ kind: message.kind, to: message.to, link: message.link }, 'E-mail não enviado: modo seco');
      return;
    }

    const payload = JSON.stringify({
      from: cfg.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    // A mesma chave nas duas tentativas: se a primeira chamada chegou ao
    // provedor e apenas a resposta se perdeu, a retentativa não gera um
    // segundo e-mail para a mesma pessoa.
    const idempotencyKey = randomUUID();

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const id = await this.post(payload, apiKey, idempotencyKey);
        logger.info({ kind: message.kind, providerId: id, attempt }, 'E-mail enviado');
        return;
      } catch (error) {
        lastError = error;
        const retryable = error instanceof MailerError && error.retryable;
        if (!retryable || attempt === MAX_ATTEMPTS) break;
        await delay(RETRY_DELAY_MS);
      }
    }

    logger.error({ err: lastError, kind: message.kind }, 'Falha ao enviar e-mail');
    throw new AppError('INTERNAL_ERROR', 'Não foi possível enviar o e-mail agora. Tente novamente em instantes.');
  }

  /** Convite para participar de uma organização. */
  async sendInvitation(input: {
    to: string;
    recipientName?: string | null;
    organizationName: string;
    url: string;
  }): Promise<void> {
    const greeting = input.recipientName ? `Olá, ${input.recipientName}.` : 'Olá.';
    const org = input.organizationName;
    const note =
      `O link vale por ${INVITATION_VALIDITY} e pode ser usado uma única vez. ` +
      'Se você não esperava este convite, basta ignorar esta mensagem.';
    const paragraphs = [
      greeting,
      `Você foi convidado a participar de ${org} no ${PRODUCT_NAME}, o sistema de gestão da clínica.`,
      'Para aceitar o convite e definir sua senha de acesso, use o botão abaixo.',
      'Se este e-mail já tem conta no sistema, informe a senha atual para concluir o aceite.',
    ];

    await this.send({
      kind: 'invitation',
      to: input.to,
      link: input.url,
      subject: `Convite para ${org} no ${PRODUCT_NAME}`,
      text: [paragraphs.join('\n\n'), input.url, note, PRODUCT_NAME].join('\n\n'),
      html: htmlLayout({
        title: `Convite para ${org}`,
        paragraphs,
        actionLabel: 'Aceitar convite',
        url: input.url,
        note,
      }),
    });
  }

  /**
   * Redefinição de senha. A mensagem não cita organização nenhuma: a mesma
   * conta pode participar de várias, e listá-las contaria a quem recebeu o
   * e-mail (que pode ser o endereço errado) de quais clínicas a pessoa faz parte.
   */
  async sendPasswordReset(input: { to: string; recipientName?: string | null; url: string }): Promise<void> {
    const greeting = input.recipientName ? `Olá, ${input.recipientName}.` : 'Olá.';
    const note =
      `O link vale por ${PASSWORD_RESET_VALIDITY} e pode ser usado uma única vez. ` +
      'Se não foi você quem pediu, ignore esta mensagem: sua senha continua a mesma.';
    const paragraphs = [
      greeting,
      `Recebemos um pedido para redefinir a senha da sua conta no ${PRODUCT_NAME}.`,
      'Para escolher uma senha nova, use o botão abaixo.',
      'Ao concluir, as sessões abertas nesta conta serão encerradas e será preciso entrar de novo.',
    ];

    await this.send({
      kind: 'password_reset',
      to: input.to,
      link: input.url,
      subject: `Redefinição de senha no ${PRODUCT_NAME}`,
      text: [paragraphs.join('\n\n'), input.url, note, PRODUCT_NAME].join('\n\n'),
      html: htmlLayout({
        title: 'Redefinição de senha',
        paragraphs,
        actionLabel: 'Definir nova senha',
        url: input.url,
        note,
      }),
    });
  }

  /** Uma tentativa contra a API do provedor, com teto de tempo próprio. */
  private async post(payload: string, apiKey: string, idempotencyKey: string): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: payload,
        signal: controller.signal,
      });

      if (!response.ok) {
        // 429 e 5xx passam; o resto é chave inválida ou remetente não
        // verificado, e repetir só adiaria o erro.
        const retryable = response.status === 429 || response.status >= 500;
        // O corpo de erro do provedor repete o destinatário, então em produção
        // fica de fora e resta o código de status.
        let detail = '';
        if (!isProduction()) {
          const body = await response.text().catch(() => '');
          if (body) detail = `: ${body.slice(0, 300)}`;
        }
        throw new MailerError(`o provedor respondeu ${response.status}${detail}`, retryable);
      }

      const body: unknown = await response.json().catch(() => null);
      return providerId(body);
    } catch (error) {
      if (error instanceof MailerError) throw error;
      // Timeout e falha de rede entram aqui e valem uma segunda tentativa.
      throw new MailerError(describeFailure(error), true);
    } finally {
      clearTimeout(timer);
    }
  }
}
