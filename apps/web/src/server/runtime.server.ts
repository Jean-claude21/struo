import { createPool, type Db, type Drafter, type Mailer, type Messenger, type Storage, type Transcriber, type DocumentReader, type Answerer } from '@struo/core';
import { mcp } from '@better-auth/mcp';
import { betterAuth } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { createDrafter, createMailer, createMessenger, createStorage, createTranscriber, createDocumentReader, createAnswerer, secretBox } from './adapters.server.ts';
import { env, type Env } from './env.server.ts';
import { localeOfRequest, mailMessage, type MailContent } from './mail.server.ts';
import { translate, type Locale } from '@/i18n/index.tsx';
import { startJobs } from './jobs.server.ts';

function createAuth(environment: Env, db: Db, mailer: Mailer) {
  const app = environment.APP_BASE_URL;
  // Account e-mails (spec 040). A failed send is logged and never blocks the account action.
  const send = (to: string, request: Request | undefined, kind: string, build: (locale: Locale) => { subject: string; content: MailContent }) => {
    const locale = localeOfRequest(request);
    const { subject, content } = build(locale);
    return mailer.send(mailMessage(locale, to, subject, content, app)).catch((error: unknown) => console.error(`[mail] ${kind}`, error));
  };
  return betterAuth({
    appName: 'Struo',
    secret: environment.BETTER_AUTH_SECRET,
    baseURL: environment.APP_BASE_URL,
    basePath: '/api/auth',
    // The application role: identity tables are reachable, company tables only under RLS.
    database: db,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
      // Forgotten password: a one-hour link; every session is closed once the password changes.
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }, request) => {
        await send(user.email, request, 'reset', (locale) => ({
          subject: translate(locale, 'mail.reset.subject'),
          content: {
            preheader: translate(locale, 'mail.reset.preheader'),
            title: translate(locale, 'mail.reset.title'),
            paragraphs: [translate(locale, 'mail.hello', { name: user.name }), translate(locale, 'mail.reset.body')],
            button: { label: translate(locale, 'mail.reset.button'), url },
            footnote: translate(locale, 'mail.reset.footnote'),
          },
        }));
      },
      onPasswordReset: async ({ user }, request) => {
        await send(user.email, request, 'password-changed', (locale) => ({
          subject: translate(locale, 'mail.changed.subject'),
          content: {
            preheader: translate(locale, 'mail.changed.preheader'),
            title: translate(locale, 'mail.changed.title'),
            paragraphs: [translate(locale, 'mail.hello', { name: user.name }), translate(locale, 'mail.changed.body')],
            button: { label: translate(locale, 'mail.changed.button'), url: `${app}/forgot-password` },
            footnote: translate(locale, 'mail.changed.footnote'),
          },
        }));
      },
    },
    // Address verification: sent at sign-up (it is also the welcome message), valid 24 hours.
    // Not verifying does not block work; the application reminds the person until it is done.
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }, request) => {
        await send(user.email, request, 'verify', (locale) => ({
          subject: translate(locale, 'mail.verify.subject'),
          content: {
            preheader: translate(locale, 'mail.verify.preheader'),
            title: translate(locale, 'mail.verify.title', { name: user.name }),
            paragraphs: [translate(locale, 'mail.verify.body'), translate(locale, 'mail.verify.next')],
            button: { label: translate(locale, 'mail.verify.button'), url },
            footnote: translate(locale, 'mail.verify.footnote'),
          },
        }));
      },
    },
    user: {
      // Changing the address: the old address is told and must confirm; the new one is then verified.
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }, request) => {
          await send(user.email, request, 'change-email', (locale) => ({
            subject: translate(locale, 'mail.changeEmail.subject'),
            content: {
              preheader: translate(locale, 'mail.changeEmail.preheader'),
              title: translate(locale, 'mail.changeEmail.title'),
              paragraphs: [translate(locale, 'mail.hello', { name: user.name }), translate(locale, 'mail.changeEmail.body', { email: newEmail })],
              button: { label: translate(locale, 'mail.changeEmail.button'), url },
              footnote: translate(locale, 'mail.changeEmail.footnote'),
            },
          }));
        },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: {
      enabled: environment.APP_ENV === 'production',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 }, '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 300, max: 3 }, '/send-verification-email': { window: 300, max: 3 },
        '/change-password': { window: 60, max: 5 }, '/change-email': { window: 300, max: 3 },
      },
    },
    advanced: { cookiePrefix: 'struo', useSecureCookies: environment.APP_BASE_URL.startsWith('https://') },
    plugins: [
      jwt(),
      // OAuth for MCP clients (spec 016): Claude.ai, ChatGPT or Claude Code register themselves, the
      // person signs in, chooses the company on the consent page, and the client gets a token.
      mcp({
        resource: `${environment.APP_BASE_URL}/mcp`,
        loginPage: '/login',
        consentPage: '/oauth/consent',
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: 'infer',
      }),
      tanstackStartCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export interface Runtime {
  env: Env;
  /** Connects as struo_app: row-level security applies. */
  db: Db;
  /** Owner connection: portal payments, webhooks, platform console and jobs only. */
  owner: Db;
  auth: Auth;
  storage: Storage;
  mailer: Mailer;
  messenger: Messenger;
  drafter: Drafter;
  transcriber: Transcriber;
  reader: DocumentReader;
  answerer: Answerer;
  secrets: ReturnType<typeof secretBox>;
}

let current: Runtime | undefined;

export function runtime(): Runtime {
  if (current) return current;
  const environment = env();
  const db = createPool(environment.DATABASE_URL, 10);
  const owner = createPool(environment.DATABASE_OWNER_URL || environment.DATABASE_URL, 3);
  const mailer = createMailer(environment);
  current = {
    env: environment,
    db,
    owner,
    auth: createAuth(environment, db, mailer),
    storage: createStorage(environment),
    mailer,
    messenger: createMessenger(environment),
    drafter: createDrafter(environment),
    transcriber: createTranscriber(environment),
    reader: createDocumentReader(environment),
    answerer: createAnswerer(environment),
    secrets: secretBox(environment),
  };
  if (environment.JOBS_ENABLED && environment.APP_ENV !== 'test') startJobs(current);
  return current;
}
