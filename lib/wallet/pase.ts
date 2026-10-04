// ─────────────────────────────────────────────────────────────────────────────
// El pase de Apple Wallet con el QR de acceso de la alumna. Puro (pase.test.ts):
// leer la configuración del entorno y construir el `pass.json`. Quien firma es
// `lib/wallet/firmar-pase.ts` (servidor), y la puerta, `/api/public/wallet-pase`.
//
// ⚠️ INERTE hasta que existan las variables: hace falta un certificado «Pass Type
// ID» de la cuenta de Apple Developer, que hoy NO existe (docs/APP-IOS.md, «Apple
// Wallet»). Sin ellas `configWallet` devuelve `null`, la ruta contesta
// `disponible: false` y el botón no se pinta.
//
// ⚠️ El código del pase es el MISMO token que el QR de la app (permanente,
// `qrDeLaAlumna`). Si la alumna genera un QR nuevo, el pase guardado deja de
// valer y tiene que volver a añadirlo: no hay servicio web de actualización de
// pases (`webServiceURL`) — sería una pieza aparte, con su registro de
// dispositivos y avisos push de Wallet.
// ─────────────────────────────────────────────────────────────────────────────

export interface ConfigWallet {
  passTypeIdentifier: string;
  teamIdentifier: string;
  /** PEM del certificado intermedio de Apple (WWDR G4). */
  wwdr: string;
  /** PEM del certificado del Pass Type ID. */
  signerCert: string;
  /** PEM de la clave privada del certificado. */
  signerKey: string;
  signerKeyPassphrase?: string;
}

/** Las variables, en base64 para que un PEM de varias líneas viaje bien en Vercel. */
export const VARIABLES_WALLET = [
  'APPLE_WALLET_PASS_TYPE_ID',
  'APPLE_WALLET_TEAM_ID',
  'APPLE_WALLET_WWDR_PEM_B64',
  'APPLE_WALLET_CERT_PEM_B64',
  'APPLE_WALLET_KEY_PEM_B64',
] as const;

function deBase64(v: string): string | null {
  try {
    const texto = Buffer.from(v, 'base64').toString('utf8');
    return texto.includes('-----BEGIN') ? texto : null;
  } catch {
    return null;
  }
}

/** La configuración, o `null` si falta cualquier pieza (o un PEM no es un PEM). */
export function configWallet(env: Record<string, string | undefined>): ConfigWallet | null {
  if (VARIABLES_WALLET.some((k) => !env[k]?.trim())) return null;
  const wwdr = deBase64(env.APPLE_WALLET_WWDR_PEM_B64!);
  const signerCert = deBase64(env.APPLE_WALLET_CERT_PEM_B64!);
  const signerKey = deBase64(env.APPLE_WALLET_KEY_PEM_B64!);
  if (!wwdr || !signerCert || !signerKey) return null;
  return {
    passTypeIdentifier: env.APPLE_WALLET_PASS_TYPE_ID!.trim(),
    teamIdentifier: env.APPLE_WALLET_TEAM_ID!.trim(),
    wwdr, signerCert, signerKey,
    signerKeyPassphrase: env.APPLE_WALLET_KEY_PASSPHRASE?.trim() || undefined,
  };
}

/** `#RRGGBB` → `rgb(r, g, b)`, que es lo que entiende Wallet. Un color roto, el carbón del kit. */
export function rgbDeHex(hex: string | null | undefined, porDefecto = 'rgb(26, 26, 26)'): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return porDefecto;
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

export interface DatosPase {
  config: Pick<ConfigWallet, 'passTypeIdentifier' | 'teamIdentifier'>;
  /** Único por alumna y estudio: un pase nuevo del mismo par sustituye al viejo en Wallet. */
  serial: string;
  estudio: { nombre: string; colorPrimario: string | null; direccion: string | null };
  alumna: { nombre: string };
  /** El token del QR de acceso, tal cual lo pinta la app. */
  qr: string;
}

/** El `pass.json` (tipo «generic»). Sin datos de la alumna salvo su nombre. */
export function paseJson(d: DatosPase): Record<string, unknown> {
  return {
    formatVersion: 1,
    passTypeIdentifier: d.config.passTypeIdentifier,
    teamIdentifier: d.config.teamIdentifier,
    serialNumber: d.serial,
    organizationName: d.estudio.nombre,
    description: `Acceso a ${d.estudio.nombre}`,
    logoText: d.estudio.nombre,
    backgroundColor: rgbDeHex(d.estudio.colorPrimario),
    foregroundColor: 'rgb(250, 249, 245)',
    labelColor: 'rgb(234, 240, 231)',
    sharingProhibited: true,
    generic: {
      primaryFields: [{ key: 'alumna', label: 'Alumna', value: d.alumna.nombre || 'Tu acceso' }],
      secondaryFields: [{ key: 'estudio', label: 'Estudio', value: d.estudio.nombre }],
      backFields: [
        { key: 'uso', label: 'Cómo se usa', value: 'Enséñalo al llegar al estudio. Es el mismo QR que el de tu app: si generas uno nuevo allí, este deja de valer y tendrás que volver a añadirlo.' },
        ...(d.estudio.direccion ? [{ key: 'direccion', label: 'Dirección', value: d.estudio.direccion }] : []),
      ],
    },
    barcodes: [{ format: 'PKBarcodeFormatQR', message: d.qr, messageEncoding: 'iso-8859-1' }],
  };
}
