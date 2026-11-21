// Phone notifications (spec 051): Web Push with the application's VAPID keys. No third-party
// account: the browser's own push service delivers. A gone subscription (404/410) is forgotten.
// Never blocks the gesture that caused it.
import * as core from '@struo/core';
import webpush from 'web-push';
import { reportError } from './monitor.server.ts';
import type { Runtime } from './runtime.server.ts';

export interface PushPayload { title: string; body: string; url: string; tag?: string }

let configured: string | null = null;
export function pushReady(rt: Runtime): boolean {
  if (!rt.env.VAPID_PUBLIC_KEY || !rt.env.VAPID_PRIVATE_KEY) return false;
  if (configured !== rt.env.VAPID_PUBLIC_KEY) {
    webpush.setVapidDetails(rt.env.APP_BASE_URL.startsWith('https://') ? rt.env.APP_BASE_URL : 'mailto:noreply@struo.app', rt.env.VAPID_PUBLIC_KEY, rt.env.VAPID_PRIVATE_KEY);
    configured = rt.env.VAPID_PUBLIC_KEY;
  }
  return true;
}

export async function sendPush(rt: Runtime, targets: core.PushTarget[], payload: PushPayload): Promise<number> {
  if (!targets.length || !pushReady(rt)) return 0;
  let delivered = 0;
  await Promise.all(targets.map(async (target) => {
    try {
      await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
      delivered++;
      await core.touchPush(rt.owner, target.id);
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await core.removePush(rt.owner, target.endpoint).catch(() => undefined);
      else reportError(error, { where: 'push:send' });
    }
  }));
  return delivered;
}
