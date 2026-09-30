// Veri*Factu — de dónde salen el entorno, el certificado y la identificación del software.
//
// SOLO SERVIDOR. Nada de esto llega nunca al navegador.
//
// ⚠️ EL CERTIFICADO NO SE GUARDA EN LA BASE DE DATOS. Va por variable de
// entorno (Vercel, marcada como «Sensitive» y solo en Production), igual que las
// claves de Stripe: es una clave privada, y una clave privada en una tabla es
// una clave privada que acaba en un backup, en un export y en la pantalla de
// alguien. Nunca se registra, nunca se manda a Sentry y nunca sale del servidor.
//
// Vía elegida (30-sep-2026): cada estudio otorga en la sede de la AEAT un poder
// IZ860 al NIF de una persona física, que remite con SU certificado cualificado
// de persona física → endpoint `www1` (el `www10` es para certificado de sello,
// que es de personas jurídicas). Por eso aquí no hay forma de elegir «sello».
//
// Variables:
//   VERIFACTU_ENVIRONMENT = 'preproduction' | 'production'. Sin ella, NO se
//                           transmite nada. Producción es opt-in explícito.
//   CERTIFICATE_PFX        = el .p12/.pfx en base64.
//   CERTIFICATE_PASSWORD   = su contraseña.
//   VERIFACTU_PRODUCTOR_NIF / VERIFACTU_PRODUCTOR_NOMBRE = productor del SIF.
//
// ⚠️ VERIFACTU_ENTORNO (la variable antigua) sigue decidiendo el entorno del QR
// en el sellado (`lib/billing/sellar-factura-server.ts`, que esta fase no toca).
// Si las dos no dicen lo mismo, no se transmite: un QR contra pruebas en una
// factura registrada en producción (o al revés) no coteja. TODO: unificarlas en
// una sola cuando esté mergeado el modo de facturación (PR #2370).

import type { DestinoAeat } from './endpoints.ts';
import type { CertificadoCliente } from './envio.ts';
import type { SistemaInformatico } from './xml.ts';

export type EntornoVerifactu = 'preproduccion' | 'produccion';

type Env = Record<string, string | undefined>;

/** El entorno de transmisión, o null si no está configurado (= no se transmite). */
export function entornoTransmision(env: Env = process.env): EntornoVerifactu | null {
  const v = env.VERIFACTU_ENVIRONMENT;
  if (v === 'production') return 'produccion';
  if (v === 'preproduction') return 'preproduccion';
  return null;
}

/** Lo que dice la variable antigua del QR del sellado. */
function entornoDelQr(env: Env): EntornoVerifactu {
  return env.VERIFACTU_ENTORNO === 'produccion' ? 'produccion' : 'preproduccion';
}

/**
 * ¿El QR de las facturas apunta a producción? Es lo que decide el sello de la
 * factura del portal (`selloParaCliente`). Misma variable que el sellado, para
 * que la factura impresa y la del portal digan lo mismo.
 */
export function qrEnProduccion(env: Env = process.env): boolean {
  return entornoDelQr(env) === 'produccion';
}

/**
 * Identificación del software ante la AEAT.
 *
 * ⚠️ `idSistemaInformatico` y `numeroInstalacion` NO se tocan a la ligera: el
 * ámbito de la cadena de huella es (obligado emisor + sistema informático), así
 * que cambiarlos inicia una cadena nueva a ojos de Hacienda. La AEAT tiene un
 * error admisible para ese escenario (2007), pero no es algo que se provoque
 * por un refactor.
 */
export function sistemaInformatico(env: Env = process.env): SistemaInformatico {
  return {
    nombreRazon: env.VERIFACTU_PRODUCTOR_NOMBRE || 'Tentare',
    nif: env.VERIFACTU_PRODUCTOR_NIF || '',
    nombreSistemaInformatico: 'Tentare',
    idSistemaInformatico: env.VERIFACTU_ID_SISTEMA || 'TE',
    version: env.VERIFACTU_VERSION_SISTEMA || '1.0',
    numeroInstalacion: env.VERIFACTU_NUM_INSTALACION || '001',
    // Tentare solo emite en modalidad Veri*Factu, y un solo obligado tributario
    // por instalación lógica.
    soloVerifactu: true,
    multiOT: false,
    indicadorMultiplesOT: false,
  };
}

export function certificadoDeEntorno(env: Env = process.env): CertificadoCliente | null {
  const b64 = env.CERTIFICATE_PFX;
  if (!b64 || env.CERTIFICATE_PASSWORD === undefined) return null;
  return { pfx: Buffer.from(b64, 'base64'), passphrase: env.CERTIFICATE_PASSWORD };
}

/** Persona física (o representante): siempre `www1` / `prewww1`. */
export function destinoDeEntorno(env: Env = process.env): DestinoAeat | null {
  const entorno = entornoTransmision(env);
  return entorno ? { entorno, certificado: 'representante' } : null;
}

/**
 * Qué falta por configurar, en cristiano.
 *
 * Existe porque el fallo típico de esto no es un error: es que no pasa nada y
 * nadie sabe por qué. Se registra en el cron.
 */
export function queFaltaParaTransmitir(env: Env = process.env): string[] {
  const falta: string[] = [];
  const entorno = entornoTransmision(env);
  if (!entorno) falta.push('el entorno (VERIFACTU_ENVIRONMENT = preproduction | production)');
  if (!env.CERTIFICATE_PFX) falta.push('el certificado (CERTIFICATE_PFX, en base64)');
  if (env.CERTIFICATE_PASSWORD === undefined) falta.push('la contraseña del certificado (CERTIFICATE_PASSWORD)');
  if (!env.VERIFACTU_PRODUCTOR_NIF) falta.push('el NIF del productor del software (VERIFACTU_PRODUCTOR_NIF)');
  if (entorno && entorno !== entornoDelQr(env)) {
    falta.push(`que VERIFACTU_ENTORNO (QR del sellado) coincida con VERIFACTU_ENVIRONMENT (${entorno})`);
  }
  return falta;
}

/** ¿Hay con qué transmitir? Sin esto, las facturas se sellan igual y esperan. */
export function transmisionConfigurada(env: Env = process.env): boolean {
  return queFaltaParaTransmitir(env).length === 0;
}
