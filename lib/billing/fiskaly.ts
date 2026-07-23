// ─────────────────────────────────────────────────────────────────────────────
// Fiskaly SIGN ES — cliente Veri*Factu (server-only).
//
// Rellena el ÚNICO hueco que la huella propia de lib/verifactu.ts no cubre: la
// FIRMA con certificado + la TRANSMISIÓN a la AEAT y el QR/CSV oficiales. Fiskaly
// gestiona el certificado (MANAGED), encadena por emisor y envía a Hacienda.
//
// Contrato fijado desde su OpenAPI SIGN ES v1.25.0 (no hay SDK oficial de Node
// para SIGN ES → REST directo):
//   · Auth      POST /auth                              body { content:{ api_key, api_secret } }
//   · Emisor    PUT  /taxpayer                          (idempotente, uno por organización)
//   · Firmante  PUT  /signers/{signer_id}               (idempotente; cert MANAGED lo asigna Fiskaly)
//   · Cliente   PUT  /clients/{client_id}               (idempotente)
//   · Factura   PUT  /clients/{client_id}/invoices/{id} (idempotente por id)
//
// Credenciales SIEMPRE desde entorno (mismo patrón que Stripe): FISKALY_API_KEY,
// FISKALY_API_SECRET, FISKALY_ENV=test|live. Nunca se reciben por parámetro ni se
// registran. En TEST, Fiskaly NO transmite a la AEAT (seguro para probar).
//
// Falla-suave: si algo va mal, el llamador conserva la huella propia; una factura
// nunca se pierde por un fallo de Fiskaly.
// ─────────────────────────────────────────────────────────────────────────────

const ENV = (process.env.FISKALY_ENV ?? 'test').toLowerCase() === 'live' ? 'live' : 'test';
const BASE = ENV === 'live'
  ? 'https://live.es.sign.fiskaly.com/api/v1'
  : 'https://test.es.sign.fiskaly.com/api/v1';

export function fiskalyConfigurado(): boolean {
  return Boolean(process.env.FISKALY_API_KEY && process.env.FISKALY_API_SECRET);
}

export function fiskalyEntorno(): 'test' | 'live' {
  return ENV;
}

// ── Token de acceso: caché en módulo + reautenticación en 401 o al expirar ──────
let tokenCache: { access: string; expiraEn: number } | null = null;

function expDeJwt(jwt: string): number {
  // exp (segundos epoch) del payload; si no se puede leer, caduca en 5 min.
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now() + 5 * 60_000;
  } catch {
    return Date.now() + 5 * 60_000;
  }
}

async function autenticar(): Promise<string> {
  const res = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: { api_key: process.env.FISKALY_API_KEY, api_secret: process.env.FISKALY_API_SECRET },
    }),
  });
  if (!res.ok) throw new Error(`Fiskaly auth ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const access: string = json?.content?.access_token;
  if (!access) throw new Error('Fiskaly auth: sin access_token en la respuesta');
  // Margen de 60 s para no usar un token a punto de caducar.
  tokenCache = { access, expiraEn: expDeJwt(access) - 60_000 };
  return access;
}

async function token(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiraEn) return tokenCache.access;
  return autenticar();
}

async function api(path: string, init: RequestInit, reintentar = true): Promise<Response> {
  const bearer = await token();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${bearer}`,
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401 && reintentar) {
    tokenCache = null;
    return api(path, init, false);
  }
  return res;
}

async function put(path: string, body: unknown): Promise<unknown> {
  const res = await api(path, { method: 'PUT', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Fiskaly PUT ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Alta del emisor: taxpayer → signer → client ─────────────────────────────────
export interface DatosEmisor {
  legalName: string;   // razón social o nombre del estudio
  nif: string;         // NIF/CIF del emisor
  direccion?: string;
  ciudad?: string;
  codigoPostal?: string;
  email?: string;
}

// Crea (idempotente) el emisor en Fiskaly y devuelve los ids de firmante y cliente
// que el estudio debe persistir. `signerId` y `clientId` los define el llamador
// (UUIDv4) para que la operación sea idempotente y reproducible.
export async function asegurarEmisor(
  datos: DatosEmisor,
  signerId: string,
  clientId: string,
): Promise<{ signerId: string; clientId: string }> {
  // 1) Taxpayer (uno por organización asociada al JWT). Territorio SPAIN_OTHER =
  //    territorio común → aplica Veri*Factu.
  const taxpayerContent: Record<string, unknown> = {
    issuer: { legal_name: datos.legalName.slice(0, 120), tax_number: datos.nif },
    territory: 'SPAIN_OTHER',
  };
  if (datos.email) taxpayerContent.email = datos.email;
  if (datos.direccion && datos.ciudad && datos.codigoPostal) {
    taxpayerContent.address = {
      country_code: 'ES',
      municipality: datos.ciudad.slice(0, 120),
      city: datos.ciudad.slice(0, 120),
      street: datos.direccion.slice(0, 120),
      number: '0',
      postal_code: datos.codigoPostal,
    };
  }
  await put('/taxpayer', { content: taxpayerContent });

  // 2) Signer. En Veri*Factu el certificado es MANAGED (lo asigna Fiskaly), por
  //    eso el content va vacío: no subimos certificado.
  await put(`/signers/${signerId}`, { content: {} });

  // 3) Client, vinculado al signer.
  await put(`/clients/${clientId}`, { content: { signer_id: signerId } });

  return { signerId, clientId };
}

// ── Firma + transmisión de una factura ──────────────────────────────────────────
export interface LineaFactura {
  texto: string;
  base: number;   // importe unitario SIN IVA
  total: number;  // importe CON IVA
  tipoIva: number;
}

export interface FacturaFiskaly {
  clientId: string;
  invoiceId: string;          // UUIDv4 que define el llamador (idempotente)
  numero: string;             // número correlativo, p.ej. A-2026-0001
  simplificada: boolean;      // true → SIMPLIFIED (F2, sin NIF receptor)
  concepto: string;
  totalConIva: number;
  lineas: LineaFactura[];
  receptor?: { nombre: string; nif: string; direccion: string; codigoPostal: string };
}

export interface ResultadoFiskaly {
  id: string;
  estado: string;             // ISSUED / CANCELLED
  transmision: string;        // PENDING / REGISTERED / STORED / ...
  qrUrl: string | null;       // URL de validación en la AEAT
  qrImagen: string | null;    // data URI del QR (PNG base64)
  csv: string | null;         // CSV de la AEAT (solo tras transmisión real; null en TEST)
  texto: string | null;       // leyenda "verificable en la sede de la AEAT"
}

function money2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export async function firmarFactura(f: FacturaFiskaly): Promise<ResultadoFiskaly> {
  const items = f.lineas.map((l) => ({
    text: l.texto.slice(0, 500),
    quantity: '1.00',
    unit_amount: money2(l.base),
    full_amount: money2(l.total),
    vat_type: 'IVA',
    system: { type: 'REGULAR', category: { type: 'VAT', rate: String(l.tipoIva) } },
  }));

  // SIMPLIFIED (sin NIF receptor, típico ticket de clase) o COMPLETE (con NIF).
  // issued_at se omite adrede: online, Fiskaly estampa la hora local de Madrid.
  const simplified = {
    type: 'SIMPLIFIED',
    number: f.numero,
    text: f.concepto.slice(0, 500),
    full_amount: money2(f.totalConIva),
    items,
  };

  const content = f.simplificada || !f.receptor
    ? simplified
    : {
        type: 'COMPLETE',
        data: simplified,
        recipients: [{
          id: { legal_name: f.receptor.nombre.slice(0, 120), tax_number: f.receptor.nif },
          address_line: f.receptor.direccion.slice(0, 120),
          postal_code: f.receptor.codigoPostal,
        }],
      };

  const json = await put(`/clients/${f.clientId}/invoices/${f.invoiceId}`, { content }) as {
    content?: {
      id?: string;
      state?: string;
      compliance?: { url?: string; text?: string; code?: { image?: { data?: string; format?: string } } };
      transmission?: { registration?: { state?: string }; registration_csv?: string };
    };
  };

  const c = json.content ?? {};
  const img = c.compliance?.code?.image;
  const qrImagen = img?.data
    ? `data:image/${(img.format ?? 'png').toLowerCase()};base64,${img.data}`
    : null;

  return {
    id: c.id ?? f.invoiceId,
    estado: c.state ?? 'ISSUED',
    transmision: c.transmission?.registration?.state ?? 'PENDING',
    qrUrl: c.compliance?.url ?? null,
    qrImagen,
    csv: c.transmission?.registration_csv ?? null,
    texto: c.compliance?.text ?? null,
  };
}
