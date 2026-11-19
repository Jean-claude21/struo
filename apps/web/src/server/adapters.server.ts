import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  fromMinor, type CheckoutOutcome, type Drafter, type Transcriber, type DocumentReader, type Answerer, type Mailer, type Messenger, type PaymentGateway, type Storage,
} from '@struo/core';
import type { Env } from './env.server.ts';

// ---------------------------------------------------------------- storage

/** S3-compatible object storage (Neon Object Storage, R2, MinIO…) when configured, else disk. */
export function createStorage(env: Env): Storage {
  if (env.S3) {
    const { bucket, ...config } = env.S3;
    const client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    return {
      async put(key, body, mediaType) {
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: mediaType }));
      },
      async get(key) {
        try {
          const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
          const bytes = await object.Body?.transformToByteArray();
          return bytes ? { body: bytes, mediaType: object.ContentType ?? 'application/octet-stream' } : null;
        } catch {
          return null;
        }
      },
      async removePrefix(prefix) {
        let token: string | undefined;
        do {
          const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
          const keys = (page.Contents ?? []).map((object) => ({ Key: object.Key! }));
          if (keys.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));
          token = page.IsTruncated ? page.NextContinuationToken : undefined;
        } while (token);
      },
    };
  }
  const root = path.resolve(env.STORAGE_DIR);
  const safe = (key: string) => {
    const target = path.resolve(root, key);
    if (!target.startsWith(root + path.sep)) throw new Error('invalid storage key');
    return target;
  };
  return {
    async put(key, body, mediaType) {
      const target = safe(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
      await writeFile(`${target}.type`, mediaType);
    },
    async get(key) {
      try {
        const target = safe(key);
        const [body, mediaType] = await Promise.all([readFile(target), readFile(`${target}.type`, 'utf8')]);
        return { body: new Uint8Array(body), mediaType };
      } catch {
        return null;
      }
    },
    async removePrefix(prefix) {
      if (!/^org\/[\w-]+\/$/u.test(prefix)) throw new Error('invalid prefix');
      await rm(safe(prefix.slice(0, -1)), { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------- mail

/** Resend when configured; else the message is written to the log (development). */
export function createMailer(env: Env): Mailer {
  if (!env.RESEND_API_KEY) {
    return {
      configured: false,
      async send(message) {
        console.info('[mail:log]', JSON.stringify({ to: message.to, subject: message.subject }));
      },
    };
  }
  return {
    configured: true,
    async send(message) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.MAIL_FROM, to: message.to, subject: message.subject, text: message.text, html: message.html }),
      });
      if (!response.ok) throw new Error(`mail ${response.status}`);
    },
  };
}

// ---------------------------------------------------------------- WhatsApp

/** WhatsApp Cloud API when configured; else simulated (logged, never sent). */
export function createMessenger(env: Env): Messenger {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return {
      configured: false,
      async send(to) {
        console.info('[whatsapp:simulated]', JSON.stringify({ to: to.replace(/\d(?=\d{3})/gu, '•') }));
      },
    };
  }
  return {
    configured: true,
    async send(to, text) {
      const response = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/[^\d]/gu, ''), type: 'text', text: { body: text } }),
      });
      if (!response.ok) throw new Error(`whatsapp ${response.status}`);
    },
  };
}

// ---------------------------------------------------------------- AI drafting

/**
 * OpenAI when configured: it only rewrites a letter around the facts it is given (every figure is
 * in the facts). Without a key, the caller uses the catalog template.
 */
export function createDrafter(env: Env): Drafter {
  return {
    configured: Boolean(env.OPENAI_API_KEY),
    async draft({ kind, locale, facts }) {
      if (!env.OPENAI_API_KEY) throw new Error('drafter not configured');
      const instruction =
        locale === 'fr'
          ? `Rédige ${kind === 'formal_notice' ? 'une mise en demeure' : 'une lettre de relance courtoise'} en français, ton professionnel, pour une entreprise du BTP. Utilise UNIQUEMENT les faits fournis ; n'invente aucun chiffre, aucune date, aucun nom. Commence par une ligne « Objet : ». Termine par le nom de l'entreprise.`
          : `Write ${kind === 'formal_notice' ? 'a formal notice' : 'a courteous payment reminder'} in English, professional tone, for a construction company. Use ONLY the facts given; invent no figure, date or name. Start with a "Subject:" line. End with the company name.`;
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.OPENAI_MODEL,
          temperature: 0.3,
          messages: [
            { role: 'system', content: instruction },
            { role: 'user', content: JSON.stringify(facts) },
          ],
        }),
      });
      if (!response.ok) throw new Error(`ai ${response.status}`);
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('ai empty');
      return text;
    },
  };
}

// ---------------------------------------------------------------- secrets at rest

/** AES-256-GCM with SECRETS_KEY (or a key derived from the auth secret in development). */
export function secretBox(env: Env) {
  const key = env.SECRETS_KEY
    ? Buffer.from(env.SECRETS_KEY, 'base64')
    : createHash('sha256').update(`struo-secrets:${env.BETTER_AUTH_SECRET}`).digest();
  if (key.length !== 32) throw new Error('SECRETS_KEY must be 32 bytes (base64).');
  return {
    seal(plain: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.');
    },
    open(sealed: string): string {
      const [iv, tag, data] = sealed.split('.').map((part) => Buffer.from(part, 'base64'));
      const decipher = createDecipheriv('aes-256-gcm', key, iv!);
      decipher.setAuthTag(tag!);
      return Buffer.concat([decipher.update(data!), decipher.final()]).toString('utf8');
    },
  };
}

// ---------------------------------------------------------------- payments

/**
 * Moneroo (hosted checkout, signed webhook, payment re-read at Moneroo before applying), with the
 * company's own keys. Pattern taken from DYM (spec 088).
 */
export function monerooGateway(secretKey: string, webhookSecret: string): PaymentGateway {
  const api = 'https://api.moneroo.io';
  const headers = { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  return {
    code: 'moneroo',
    async initiate(request) {
      const [first, ...rest] = request.customer.name.trim().split(/\s+/u);
      const response = await fetch(`${api}/v1/payments/initialize`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: fromMinor(request.amountMinor, request.currencyCode),
          currency: request.currencyCode,
          description: request.description,
          return_url: request.returnUrl,
          metadata: request.metadata,
          customer: { email: request.customer.email, first_name: first || 'Client', last_name: rest.join(' ') || first || 'Client' },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { data?: { id?: string; checkout_url?: string } };
      if (!response.ok || !body.data?.id || !body.data.checkout_url) throw new Error(`moneroo ${response.status}`);
      return { providerRef: body.data.id, checkoutUrl: body.data.checkout_url };
    },
    verifyWebhook(rawBody, hdrs) {
      if (!webhookSecret) return false;
      const given = hdrs['x-moneroo-signature'] ?? '';
      const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    },
    async resolve(rawBody): Promise<CheckoutOutcome | null> {
      const event = JSON.parse(rawBody) as { data?: { id?: string } };
      const id = event.data?.id;
      if (!id) return null;
      const response = await fetch(`${api}/v1/payments/${encodeURIComponent(id)}/verify`, { headers });
      if (!response.ok) throw new Error(`moneroo verify ${response.status}`);
      const body = (await response.json()) as { data?: { status?: string; amount?: number; currency?: { code?: string } | string } };
      const data = body.data ?? {};
      const status = data.status === 'success' ? 'succeeded' : data.status === 'failed' ? 'failed' : data.status === 'cancelled' ? 'cancelled' : null;
      const currencyCode = typeof data.currency === 'string' ? data.currency : (data.currency?.code ?? '');
      if (!status || !currencyCode) return null;
      const decimals = new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode }).resolvedOptions().maximumFractionDigits ?? 0;
      return { providerRef: id, status, amountMinor: Math.round(Number(data.amount ?? 0) * 10 ** decimals), currencyCode };
    },
  };
}

/** Test and demo provider: the checkout is a page of this app where the outcome is chosen. */
export function simulatorGateway(baseUrl: string): PaymentGateway {
  return {
    code: 'simulator',
    async initiate(request) {
      const ref = `sim_${randomBytes(8).toString('hex')}`;
      const intent = request.metadata.intent_id ?? '';
      return { providerRef: ref, checkoutUrl: `${baseUrl}/pay/simulate/${intent}` };
    },
    verifyWebhook: () => false,
    resolve: async () => null,
  };
}

// ---------------------------------------------------------------- voice notes

/** OpenAI speech-to-text when configured; without a key, notes stay audio-only (never invented). */
export function createTranscriber(env: Env): Transcriber {
  return {
    configured: Boolean(env.OPENAI_API_KEY),
    async transcribe(audio, locale) {
      if (!env.OPENAI_API_KEY) throw new Error('transcriber not configured');
      const extension = audio.mediaType.includes('mp4') || audio.mediaType.includes('m4a') ? 'm4a' : audio.mediaType.includes('ogg') ? 'ogg' : 'webm';
      const form = new FormData();
      form.append('file', new Blob([audio.body as unknown as BlobPart], { type: audio.mediaType }), `note.${extension}`);
      form.append('model', env.OPENAI_TRANSCRIBE_MODEL);
      form.append('language', locale);
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: form,
      });
      if (!response.ok) throw new Error(`transcription ${response.status}`);
      const body = (await response.json()) as { text?: string };
      return (body.text ?? '').trim();
    },
  };
}

// ---------------------------------------------------------------- assistant (questions on the data)

/** OpenAI answers from the company's facts only; without a key the assistant is simply unavailable. */
export function createAnswerer(env: Env): Answerer {
  return {
    configured: Boolean(env.OPENAI_API_KEY),
    async answer({ locale, question, facts }) {
      if (!env.OPENAI_API_KEY) throw new Error('answerer not configured');
      const system = locale === 'en'
        ? 'You are the assistant of a construction company. Answer the question using ONLY the JSON facts given (amounts are in minor units of their currency; XOF has no decimals). Be short and concrete: a sentence, then at most 5 bullet points naming sites by their code. Never invent a figure, a date or a name. If the facts do not answer, say so plainly and suggest where to look in the app.'
        : 'Tu es l’assistant d’une entreprise du BTP. Réponds à la question en utilisant UNIQUEMENT les faits JSON fournis (montants en unités mineures de leur devise ; le XOF n’a pas de décimales). Sois court et concret : une phrase, puis 5 puces au plus, en nommant les chantiers par leur code. N’invente jamais un chiffre, une date ou un nom. Si les faits ne répondent pas, dis-le simplement et indique où regarder dans l’application.';
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.OPENAI_MODEL,
          temperature: 0.1,
          messages: [{ role: 'system', content: system }, { role: 'user', content: `FACTS:\n${JSON.stringify(facts)}\n\nQUESTION: ${question}` }],
        }),
      });
      if (!response.ok) throw new Error(`answerer ${response.status}`);
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      return (body.choices?.[0]?.message?.content ?? '').trim();
    },
  };
}

// ---------------------------------------------------------------- delivery notes (OCR)

/** Reads a delivery note photo with OpenAI vision; returns only what is printed (null otherwise). */
export function createDocumentReader(env: Env): DocumentReader {
  const clean = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : null);
  return {
    configured: Boolean(env.OPENAI_API_KEY),
    async readDeliveryNote(image, locale) {
      if (!env.OPENAI_API_KEY) throw new Error('reader not configured');
      const dataUrl = `data:${image.mediaType};base64,${Buffer.from(image.body).toString('base64')}`;
      const instructions = locale === 'en'
        ? 'You read a photographed delivery note from a building site. Answer JSON only with keys supplier, item, quantity (number), unit, date (YYYY-MM-DD), reference. Use null for anything not clearly printed. Never guess.'
        : 'Tu lis la photo d’un bon de livraison de chantier. Réponds uniquement en JSON avec les clés supplier, item, quantity (nombre), unit, date (AAAA-MM-JJ), reference. Mets null pour tout ce qui n’est pas clairement imprimé. Ne devine jamais.';
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.OPENAI_MODEL,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }] },
          ],
        }),
      });
      if (!response.ok) throw new Error(`reader ${response.status}`);
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? '{}') as Record<string, unknown>;
      const quantity = typeof parsed.quantity === 'number' ? parsed.quantity : Number.parseFloat(String(parsed.quantity ?? '').replace(',', '.'));
      const date = clean(parsed.date);
      return {
        supplier: clean(parsed.supplier), item: clean(parsed.item), quantity: Number.isFinite(quantity) ? quantity : null, unit: clean(parsed.unit),
        date: date && /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : null, reference: clean(parsed.reference),
      };
    },
  };
}
