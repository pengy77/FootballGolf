import type { MqttClient } from 'mqtt';
import { seal, unseal } from './crypto';

/**
 * Live rooms talk through a free public MQTT relay over secure WebSockets. Every payload is
 * encrypted (see crypto.ts), so the relay only ever sees random topic names and noise.
 *
 *   fgolf/v1/<room>/s           host's game state (retained)
 *   fgolf/v1/<room>/d/<player>  each player's name, picks and ready flags (retained)
 *   fgolf/v1/<room>/o/<player>  online/offline, with a last will so a closed phone shows as away
 */
export const BROKER = 'wss://broker.emqx.io:8084/mqtt';
const ROOT = 'fgolf/v1';
/** Retained messages vanish from the relay after this; players' phones keep their own copies. */
const EXPIRY_S = 24 * 3600;

export type ConnStatus = 'connecting' | 'online' | 'offline';

export interface RoomHandlers {
  status: (s: ConnStatus) => void;
  state: (value: unknown, retained: boolean) => void;
  doc: (playerId: string, value: unknown) => void;
  presence: (playerId: string, on: boolean) => void;
  /** Fired on every (re)connect, after subscribing: republish anything the room needs from us. */
  connected: () => void;
}

export interface RoomConn {
  sendState: (s: unknown) => void;
  sendDoc: (d: unknown) => void;
  /** Re-announce ourselves; the echo coming back proves the connection is really alive. */
  ping: () => void;
  close: () => void;
}

const toStr = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
const fromStr = (s: string) => {
  try {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
};

export async function openRoom(opts: { roomId: string; key: CryptoKey; playerId: string; handlers: RoomHandlers }): Promise<RoomConn> {
  const { roomId, key, playerId, handlers } = opts;
  const base = `${ROOT}/${roomId}`;
  const T = { state: `${base}/s`, doc: (id: string) => `${base}/d/${id}`, on: (id: string) => `${base}/o/${id}` };
  const pub = { qos: 1 as const, retain: true, properties: { messageExpiryInterval: EXPIRY_S } };

  const sealStr = async (topic: string, v: unknown) => toStr(await seal(key, topic, v));
  const willPayload = await sealStr(T.on(playerId), { on: false });
  const { default: mqtt } = await import('mqtt');

  let closing = false;
  const client: MqttClient = mqtt.connect(BROKER, {
    protocolVersion: 5,
    clientId: `fg_${playerId}_${Math.random().toString(36).slice(2, 8)}`,
    clean: true,
    keepalive: 10,
    reconnectPeriod: 2000,
    connectTimeout: 12_000,
    will: { topic: T.on(playerId), payload: willPayload, qos: 1, retain: true, properties: { messageExpiryInterval: EXPIRY_S } },
  });

  const send = (topic: string, v: unknown) => {
    void sealStr(topic, v).then((p) => {
      if (!closing) client.publish(topic, p, pub);
    });
  };
  const announce = () => send(T.on(playerId), { on: true });

  handlers.status('connecting');
  client.on('connect', () => {
    handlers.status('online');
    client.subscribe(`${base}/#`, { qos: 1 }, () => {
      announce();
      handlers.connected();
    });
  });
  client.on('reconnect', () => handlers.status('connecting'));
  client.on('offline', () => handlers.status('offline'));
  client.on('close', () => !closing && handlers.status('offline'));
  client.on('error', () => {
    /* surfaced through status; mqtt.js keeps retrying */
  });

  // Decrypt in arrival order, so a quick pair of updates can't land the wrong way round.
  let queue = Promise.resolve();
  client.on('message', (topic, payload, packet) => {
    queue = queue.then(async () => {
      const rest = topic.slice(base.length + 1).split('/');
      // We never send anything unencrypted, so empty or undecryptable payloads are someone else's noise.
      const value = await unseal(key, topic, fromStr(payload.toString()) ?? new Uint8Array());
      if (value === null) return;
      if (rest[0] === 's' && rest.length === 1) {
        handlers.state(value, packet.retain);
      } else if (rest[0] === 'd' && rest.length === 2) {
        handlers.doc(rest[1], value);
      } else if (rest[0] === 'o' && rest.length === 2) {
        const on = !!(value as { on?: boolean }).on;
        // Another tab of mine just closed and its last will marked me away: I'm still here.
        if (rest[1] === playerId && !on && !closing && client.connected) return announce();
        handlers.presence(rest[1], on);
      }
    });
  });

  // Phones drop sockets in the background; get straight back in when the page is visible again.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !client.connected && !closing) client.reconnect();
  };
  document.addEventListener('visibilitychange', onVisible);
  // Tab closed or navigated away: tell the room now instead of waiting ~15s for the last will.
  const onHide = () => {
    if (client.connected && !closing) client.publish(T.on(playerId), willPayload, pub);
  };
  const onShow = (e: PageTransitionEvent) => {
    if (e.persisted && client.connected && !closing) announce();
  };
  window.addEventListener('pagehide', onHide);
  window.addEventListener('pageshow', onShow);

  return {
    sendState: (s) => send(T.state, s),
    sendDoc: (d) => send(T.doc(playerId), d),
    ping: () => {
      if (client.connected && !closing) announce();
    },
    close: () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
      // Say goodbye explicitly: a clean disconnect doesn't trigger the last will.
      void sealStr(T.on(playerId), { on: false }).then((p) => {
        closing = true;
        if (client.connected) client.publish(T.on(playerId), p, pub, () => client.end());
        else client.end(true);
      });
    },
  };
}
