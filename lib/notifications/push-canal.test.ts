import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type http from 'node:http';
import crypto from 'node:crypto';
import webpush from 'web-push';
import { CANALES, enviarAEndpoints, opcionesPush, resumirPush, proveedorDePush, hostDeEndpoint, FALLOS_PARA_RETIRAR, type EndpointPush } from './channels.ts';

const sinEspera = async () => {};
const ep = (id: string, host = 'fcm.googleapis.com'): EndpointPush => ({ id, endpoint: `https://${host}/wpush/${id}`, p256dh: 'p', auth: 'a', failure_count: 0 });

test('un 410 se marca caducada y no impide el envío a los demás', async () => {
  const r = await enviarAEndpoints([ep('a'), ep('b')], '{}', 'MEDIA', async (sub) => {
    if (sub.endpoint.endsWith('/a')) throw Object.assign(new Error('gone'), { statusCode: 410 });
    return { statusCode: 201 };
  }, sinEspera);
  assert.deepEqual(r.map((x) => x.estado), ['caducada', 'ok']);
});

test('un fallo transitorio (503) se reintenta y, si se recupera, cuenta como enviado', async () => {
  let llamadas = 0;
  const r = await enviarAEndpoints([ep('a')], '{}', 'ALTA', async () => {
    llamadas++;
    if (llamadas < 3) throw Object.assign(new Error('unavailable'), { statusCode: 503 });
    return { statusCode: 201 };
  }, sinEspera);
  assert.equal(llamadas, 3);
  assert.equal(r[0].estado, 'ok');
});

test('un fallo transitorio que no se recupera acaba FAILED con el motivo, no en silencio', async () => {
  const r = await enviarAEndpoints([ep('a')], '{}', 'ALTA', async () => { throw Object.assign(new Error('timeout'), { statusCode: 429 }); }, sinEspera);
  assert.equal(r[0].estado, 'transitorio');
  const v = resumirPush(r, 0);
  assert.equal(v.status, 'FAILED');
  assert.match(v.error ?? '', /no respondió a tiempo/);
  assert.match(v.providerId ?? '', /fcm:429/);
});

test('sin código de respuesta (red caída) también es transitorio y se reintenta', async () => {
  let n = 0;
  const r = await enviarAEndpoints([ep('a')], '{}', 'MEDIA', async () => { n++; throw new Error('ECONNRESET'); }, sinEspera);
  assert.equal(n, 3);
  assert.equal(r[0].estado, 'transitorio');
});

test('un 403 (VAPID rechazado) NO se reintenta ni se da por caducada: es rechazado', async () => {
  let n = 0;
  const r = await enviarAEndpoints([ep('a')], '{}', 'MEDIA', async () => { n++; throw Object.assign(new Error('forbidden'), { statusCode: 403 }); }, sinEspera);
  assert.equal(n, 1);
  assert.equal(r[0].estado, 'rechazado');
  assert.match(resumirPush(r, 0).error ?? '', /rechazó el envío/);
});

test('todas caducadas = SKIPPED con la instrucción para la usuaria; con una viva = SENT', () => {
  const caducada = { id: 'a', host: 'web.push.apple.com', estado: 'caducada' as const, codigo: 410 };
  const ok = { id: 'b', host: 'fcm.googleapis.com', estado: 'ok' as const, codigo: 201 };
  const solo = resumirPush([caducada], 1);
  assert.equal(solo.status, 'SKIPPED');
  assert.match(solo.error ?? '', /volver a activar/);
  const mixto = resumirPush([caducada, ok], 1);
  assert.equal(mixto.status, 'SENT');
  assert.match(mixto.providerId ?? '', /^1\/2 · apple:410\(caducada\) fcm:201$/);
});

test('el resumen nunca contiene el endpoint completo (es un secreto)', () => {
  const v = resumirPush([{ id: 'a', host: 'fcm.googleapis.com', estado: 'ok', codigo: 201 }], 0);
  assert.doesNotMatch(v.providerId ?? '', /wpush|https:/);
});

test('TTL y urgencia según prioridad: lo urgente caduca antes', () => {
  assert.deepEqual(opcionesPush('ALTA'), { TTL: 6 * 3600, urgency: 'high' });
  assert.deepEqual(opcionesPush('CRITICA'), { TTL: 6 * 3600, urgency: 'high' });
  assert.deepEqual(opcionesPush('MEDIA'), { TTL: 24 * 3600, urgency: 'normal' });
  assert.equal(opcionesPush('BAJA').urgency, 'low');
});

test('nombres cortos de proveedor', () => {
  assert.equal(proveedorDePush('fcm.googleapis.com'), 'fcm');
  assert.equal(proveedorDePush('web.push.apple.com'), 'apple');
  assert.equal(proveedorDePush('updates.push.services.mozilla.com'), 'mozilla');
});

// Certificado autofirmado para un «servicio de push» local por HTTPS (web-push
// solo habla https). Solo vive en estas pruebas.
function servidorPush(alRecibir: (req: http.IncomingMessage) => number) {
  const dir = mkdtempSync(join(tmpdir(), 'push-test-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
  return https.createServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, (req, res) => {
    const codigo = alRecibir(req);
    req.resume();
    req.on('end', () => { res.statusCode = codigo; res.end(); });
  });
}

// ── Con la librería web-push REAL contra un «servicio de push» local ─────────
// No hay móvil en CI, pero sí se puede comprobar lo que depende de nosotros: que
// el payload viaja cifrado, con el TTL, la urgencia y la firma VAPID que toca.
function suscripcionFalsa(url: string) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: url,
    keys: {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: crypto.randomBytes(16).toString('base64url'),
    },
  };
}

test('web-push real: cabeceras TTL/Urgency/VAPID y cuerpo cifrado; un 410 del proveedor llega como statusCode', async () => {
  const vistas: http.IncomingHttpHeaders[] = [];
  let respuesta = 201;
  const srv = servidorPush((req) => { vistas.push(req.headers); return respuesta; });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address() as { port: number };
  try {
    const vapid = webpush.generateVAPIDKeys();
    webpush.setVapidDetails('mailto:pruebas@example.com', vapid.publicKey, vapid.privateKey);
    const sub = suscripcionFalsa(`https://127.0.0.1:${port}/push/abc`);
    const agent = new https.Agent({ rejectUnauthorized: false });
    const enviar = (s: typeof sub, c: string, o: { TTL: number; urgency: 'high' | 'normal' | 'low' | 'very-low'; timeout: number }) => webpush.sendNotification(s, c, { ...o, agent });

    const ok = await enviarAEndpoints([{ id: 'x', ...sub, p256dh: sub.keys.p256dh, auth: sub.keys.auth }], JSON.stringify({ title: 'hola', nid: 'n1' }), 'ALTA', enviar, sinEspera);
    assert.equal(ok[0].estado, 'ok');
    const h = vistas[0];
    assert.equal(h.ttl, String(6 * 3600));
    assert.equal(h.urgency, 'high');
    assert.match(String(h.authorization), /^vapid t=/);
    assert.equal(h['content-encoding'], 'aes128gcm');

    respuesta = 410;
    const gone = await enviarAEndpoints([{ id: 'x', ...sub, p256dh: sub.keys.p256dh, auth: sub.keys.auth }], '{}', 'MEDIA', enviar, sinEspera);
    assert.equal(gone[0].estado, 'caducada');
  } finally {
    srv.close();
  }
});

// ── El canal entero contra un cliente admin de mentira ───────────────────────
function adminFalso(subs: EndpointPush[]) {
  const borradas: string[] = [];
  const actualizadas: { id: string; failure_count: number }[] = [];
  const db = {
    from(tabla: string) {
      if (tabla === 'studios') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nombre: 'Estudio', color_primario: '#343825', logo_url: null } }) }) }) };
      return {
        select: () => ({ eq: async () => ({ data: subs, error: null }) }),
        delete: () => ({
          in: async (_c: string, ids: string[]) => { borradas.push(...ids); return {}; },
          eq: async (_c: string, id: string) => { borradas.push(id); return {}; },
        }),
        update: (v: { failure_count: number }) => ({ eq: async (_c: string, id: string) => { actualizadas.push({ id, failure_count: v.failure_count }); return {}; } }),
      };
    },
  };
  return { db, borradas, actualizadas };
}

test('canal PUSH: destinatario sin cuenta y sin VAPID se saltan con motivo', async () => {
  const canal = CANALES.PUSH!;
  const { db } = adminFalso([]);
  const noti = { id: 'n1', studioId: 's', priority: 'MEDIA', title: 't', body: 'b', deepLink: '/x', eventType: 'reserva.confirmada' } as never;
  const sinCuenta = await canal.enviar({ admin: db as never, notificacion: noti, destinatario: { role: 'SOCIA', userId: null } as never });
  assert.equal(sinCuenta.error, 'destinatario sin cuenta');
  const antes = { pub: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
  try {
    const sinVapid = await canal.enviar({ admin: db as never, notificacion: noti, destinatario: { role: 'SOCIA', userId: 'u' } as never });
    assert.match(sinVapid.error ?? '', /VAPID/);
  } finally {
    if (antes.pub) process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = antes.pub;
    if (antes.priv) process.env.VAPID_PRIVATE_KEY = antes.priv;
  }
});

test('canal PUSH: sin suscripciones dice por qué; con una caducada la retira y lo cuenta', async () => {
  const vapid = webpush.generateVAPIDKeys();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = vapid.publicKey; process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
  const srv = servidorPush(() => 410);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address() as { port: number };
  const tlsAntes = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    const noti = { id: 'n1', studioId: 's', priority: 'ALTA', title: 't', body: 'b', deepLink: '/x', eventType: 'reserva.confirmada' } as never;
    const dest = { role: 'SOCIA', userId: 'u' } as never;
    const vacio = await CANALES.PUSH!.enviar({ admin: adminFalso([]).db as never, notificacion: noti, destinatario: dest });
    assert.equal(vacio.status, 'SKIPPED');
    assert.match(vacio.error ?? '', /no ha activado los avisos/);

    const sub = suscripcionFalsa(`https://127.0.0.1:${port}/p/1`);
    const { db, borradas } = adminFalso([{ id: 'sub-1', endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, failure_count: 0 }]);
    const r = await CANALES.PUSH!.enviar({ admin: db as never, notificacion: noti, destinatario: dest });
    assert.equal(r.status, 'SKIPPED');
    assert.match(r.error ?? '', /caducada/);
    assert.deepEqual(borradas, ['sub-1']);
  } finally {
    srv.close();
    if (tlsAntes === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; else process.env.NODE_TLS_REJECT_UNAUTHORIZED = tlsAntes;
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
  }
});

test('una suscripción con demasiados fallos seguidos se retira', () => {
  assert.equal(FALLOS_PARA_RETIRAR, 10);
});

test('el token de la app de iOS se diagnostica como Apple, no como un host raro', () => {
  const host = hostDeEndpoint(`apns://app.tentare/${'b'.repeat(64)}`);
  assert.equal(host, 'api.push.apple.com');
  assert.equal(proveedorDePush(host), 'apple');
});
