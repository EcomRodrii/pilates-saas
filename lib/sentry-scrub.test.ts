import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limpiarTexto, limpiarUrl, limpiarValor, sanearEventoSentry, sanearMigaSentry } from './sentry-scrub.ts';

// Datos inventados con la forma de los reales.
const NIF = '12345678Z';
const NIE = 'X1234567L';
const EMAIL = 'maria.lopez@example.com';
const MOVIL = '+34 612 345 678';
const IBAN = 'ES91 2100 0418 4502 0005 1332';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJhLWZhbHNhLWRlLXRlc3Q';

test('limpiarTexto enmascara email, NIF, NIE, IBAN, móvil, JWT y claves de Stripe', () => {
  const salida = limpiarTexto(`${EMAIL} ${NIF} ${NIE} ${IBAN} ${MOVIL} ${JWT} sk_live_abcdefghijklmnop`);
  for (const dato of [EMAIL, NIF, NIE, IBAN, '612 345 678', JWT, 'sk_live_abcdefghijklmnop']) {
    assert.ok(!salida.includes(dato), `sigue apareciendo ${dato}: ${salida}`);
  }
});

test('limpiarTexto no toca ids opacos ni importes', () => {
  const texto = 'socio soc-mf3k2-1-ab12c recibo rec-123 importe 4500 estado 23505';
  assert.equal(limpiarTexto(texto), texto);
});

test('limpiarUrl quita fragmento y valores de la querystring, conserva ruta y nombres', () => {
  const salida = limpiarUrl(`https://www.tentare.app/login?token=abc123&email=${encodeURIComponent(EMAIL)}#access_token=xyz&refresh_token=qwe`);
  assert.equal(salida, 'https://www.tentare.app/login?token=[Filtrado]&email=[Filtrado]');
  assert.equal(limpiarUrl('/rest/v1/socios?select=id&email=eq.a@b.co'), '/rest/v1/socios?select=[Filtrado]&email=[Filtrado]');
  assert.equal(limpiarUrl('/api/health'), '/api/health');
});

test('limpiarValor filtra por nombre de clave (camelCase y snake_case) y recorre anidados', () => {
  const salida = limpiarValor({
    socioId: 'soc-1',
    nif: NIF,
    receptor_nif: NIF,
    detalle: { socioEmail: EMAIL, nota: 'dolor lumbar', pasos: [`aviso a ${EMAIL}`] },
    metadata: { fechaNacimiento: '1990-01-01' },
  }) as Record<string, unknown>;
  const json = JSON.stringify(salida);
  assert.equal(salida.socioId, 'soc-1');
  for (const dato of [NIF, EMAIL, 'dolor lumbar', '1990-01-01']) assert.ok(!json.includes(dato), `sigue ${dato}`);
});

test('limpiarValor no revienta con objetos circulares ni muy profundos', () => {
  const a: Record<string, unknown> = { id: 1 };
  a.yo = a;
  let hondo: Record<string, unknown> = {};
  const raiz = hondo;
  for (let i = 0; i < 20; i++) { hondo.hijo = {}; hondo = hondo.hijo as Record<string, unknown>; }
  assert.doesNotThrow(() => limpiarValor(a));
  assert.doesNotThrow(() => limpiarValor(raiz));
});

test('sanearEventoSentry: el caso real (extra.nif) ya no sale', () => {
  const evento = sanearEventoSentry({
    message: 'Veri*Factu: NIF de receptor con formato dudoso al sellar',
    tags: { area: 'verifactu', studio: 'studio-1' },
    extra: { socioId: 'soc-1', nif: NIF },
  });
  assert.equal(evento.extra?.socioId, 'soc-1');
  assert.equal(evento.extra?.nif, '[Filtrado]');
  assert.equal(evento.tags?.studio, 'studio-1');
});

test('sanearEventoSentry: petición, excepción, usuario, migas y spans', () => {
  const evento = sanearEventoSentry({
    message: `fallo enviando a ${EMAIL}`,
    exception: { values: [{ value: `Key (email)=(${EMAIL}) already exists` }] },
    user: { id: 'uuid-1', email: EMAIL, ip_address: '1.2.3.4' },
    request: {
      url: `https://www.tentare.app/portal/x/acceso?email=${EMAIL}#access_token=abc`,
      query_string: `email=${EMAIL}`,
      data: { email: EMAIL },
      cookies: { sb: 'x' },
      headers: { authorization: `Bearer ${JWT}`, referer: `https://www.tentare.app/invitacion?token=zzz`, 'user-agent': 'Mozilla' },
    },
    breadcrumbs: [{ message: `GET /rest/v1/socios?email=eq.${EMAIL}`, data: { url: `/rest/v1/socios?email=eq.${EMAIL}`, 'http.query': `email=eq.${EMAIL}` } }],
    transaction: '/api/public/estado-pago?pi=pi_123&email=x',
    spans: [{ description: `GET https://x.supabase.co/rest/v1/socios?email=eq.${EMAIL}`, data: { 'http.query': `email=eq.${EMAIL}` } }],
  });
  const json = JSON.stringify(evento);
  for (const dato of [EMAIL, JWT, 'abc', 'zzz', '1.2.3.4']) assert.ok(!json.includes(dato), `sigue ${dato}`);
  assert.deepEqual(evento.user, { id: 'uuid-1' });
  assert.equal(evento.request?.headers?.authorization, undefined);
  assert.equal(evento.request?.headers?.['user-agent'], 'Mozilla');
});

test('sanearEventoSentry conserva lo que sirve para depurar y no es de nadie', () => {
  const evento = sanearEventoSentry({
    contexts: { os: { name: 'iOS', version: '18.2' }, browser: { name: 'Safari' } },
    extra: { code: '23505', op: 'dbInsertSocio', studioId: 'studio-1', reciboId: 'rec-9', status: 409 },
  });
  assert.deepEqual(evento.contexts, { os: { name: 'iOS', version: '18.2' }, browser: { name: 'Safari' } });
  assert.deepEqual(evento.extra, { code: '23505', op: 'dbInsertSocio', studioId: 'studio-1', reciboId: 'rec-9', status: 409 });
});

test('sanearMigaSentry filtra http.query y sanea URLs de fetch', () => {
  const miga = sanearMigaSentry({ data: { url: `https://api.example.com/x?email=${EMAIL}`, method: 'GET', 'http.query': 'a=1' } });
  assert.equal(miga.data?.['http.query'], '[Filtrado]');
  assert.equal(miga.data?.method, 'GET');
  assert.ok(!JSON.stringify(miga).includes(EMAIL));
});
