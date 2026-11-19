/**
 * The doors to the outside world. The core declares what it needs; adapters (S3, Resend,
 * WhatsApp Cloud API, Moneroo, OpenAI…) live in the app, each with a local fallback.
 */

export interface StoredFile {
  body: Uint8Array;
  mediaType: string;
}

export interface Storage {
  put(key: string, body: Uint8Array, mediaType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  /** Removes every file under a prefix (erasure of a company). */
  removePrefix(prefix: string): Promise<void>;
}

export interface MailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  readonly configured: boolean;
  send(message: MailMessage): Promise<void>;
}

export interface Messenger {
  readonly configured: boolean;
  /** Sends a text message to a phone number in E.164 form. */
  send(to: string, text: string): Promise<void>;
}

export interface CheckoutRequest {
  amountMinor: number;
  currencyCode: string;
  reference: string;
  description: string;
  returnUrl: string;
  customer: { email: string; name: string };
  metadata: Record<string, string>;
}

export interface CheckoutOutcome {
  providerRef: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  amountMinor: number;
  currencyCode: string;
}

export interface PaymentGateway {
  readonly code: string;
  initiate(request: CheckoutRequest): Promise<{ providerRef: string; checkoutUrl: string }>;
  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean;
  /** Reads the provider's own record of the payment the webhook talks about. */
  resolve(rawBody: string): Promise<CheckoutOutcome | null>;
}

export interface Drafter {
  readonly configured: boolean;
  /** Writes a letter from facts. Never invents a figure: every figure is in `facts`. */
  draft(input: { kind: 'reminder' | 'formal_notice'; locale: 'fr' | 'en'; facts: Record<string, string> }): Promise<string>;
}

export interface DeliveryNoteFields {
  supplier: string | null;
  item: string | null;
  quantity: number | null;
  unit: string | null;
  date: string | null;
  reference: string | null;
}

export interface DocumentReader {
  readonly configured: boolean;
  /** Reads a photographed delivery note. Unknown fields stay null: nothing is guessed. */
  readDeliveryNote(image: { body: Uint8Array; mediaType: string }, locale: 'fr' | 'en'): Promise<DeliveryNoteFields>;
}

export interface Transcriber {
  readonly configured: boolean;
  /** Turns a recorded voice note into text, in the company's language. */
  transcribe(audio: { body: Uint8Array; mediaType: string }, locale: 'fr' | 'en'): Promise<string>;
}
