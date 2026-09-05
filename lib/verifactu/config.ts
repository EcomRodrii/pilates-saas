// Veri*Factu — de dónde salen el certificado y la identificación del software.
//
// SOLO SERVIDOR. Nada de esto llega nunca al navegador.
//
// ⚠️ EL CERTIFICADO NO SE GUARDA EN LA BASE DE DATOS. Va por variable de
// entorno, igual que las claves de Stripe: es una clave privada, y una clave
// privada en una tabla es una clave privada que acaba en un backup, en un
// export y en la pantalla de alguien. Si algún día hace falta uno por estudio
// (modelo «certificado del propio estudio»), esa decisión trae consigo un
// diseño de custodia que hoy no existe — ver §3 de
// docs/VERIFACTU-INVESTIGACION-TECNICA.md.
//
// Sin `VERIFACTU_CERT_PFX_BASE64` no se transmite nada y no se rompe nada: las
// facturas siguen numerándose, encadenándose y llevando su QR, que es lo que ya
// hacían. Quedan en cola hasta que haya certificado.

import type { DestinoAeat, TipoCertificadoVerifactu } from './endpoints.ts';
import type { CertificadoCliente } from './envio.ts';
import type { SistemaInformatico } from './xml.ts';

/**
 * Identificación del software ante la AEAT.
 *
 * ⚠️ `idSistemaInformatico` y `numeroInstalacion` NO se tocan a la ligera: el
 * ámbito de la cadena de huella es (obligado emisor + sistema informático), así
 * que cambiarlos inicia una cadena nueva para TODOS los estudios a ojos de
 * Hacienda. La AEAT tiene un error admisible para ese escenario (2007), pero no
 * es algo que se provoque por un refactor.
 */
export function sistemaInformatico(): SistemaInformatico {
  return {
    nombreRazon: process.env.VERIFACTU_PRODUCTOR_NOMBRE || 'Tentare',
    nif: process.env.VERIFACTU_PRODUCTOR_NIF || '',
    nombreSistemaInformatico: 'Tentare',
    idSistemaInformatico: process.env.VERIFACTU_ID_SISTEMA || 'TE',
    version: process.env.VERIFACTU_VERSION_SISTEMA || '1.0',
    numeroInstalacion: process.env.VERIFACTU_NUM_INSTALACION || '001',
    // Tentare solo emite en modalidad Veri*Factu, y un solo obligado tributario
    // por instalación lógica.
    soloVerifactu: true,
    multiOT: false,
    indicadorMultiplesOT: false,
  };
}

export function certificadoDeEntorno(): CertificadoCliente | null {
  const b64 = process.env.VERIFACTU_CERT_PFX_BASE64;
  if (!b64) return null;
  return {
    pfx: Buffer.from(b64, 'base64'),
    passphrase: process.env.VERIFACTU_CERT_PASSPHRASE || '',
  };
}

export function destinoDeEntorno(): DestinoAeat {
  // Mismo criterio que el resto del repo: producción es opt-in explícito, no el
  // valor por defecto. Una variable mal puesta manda a pruebas, no a Hacienda.
  const entorno = process.env.VERIFACTU_ENTORNO === 'produccion' ? 'produccion' : 'pruebas';
  const certificado: TipoCertificadoVerifactu =
    process.env.VERIFACTU_TIPO_CERTIFICADO === 'sello' ? 'sello' : 'representante';
  return { entorno, certificado };
}

/** ¿Hay con qué transmitir? Sin esto, las facturas se sellan igual y esperan. */
export function transmisionConfigurada(): boolean {
  return Boolean(process.env.VERIFACTU_CERT_PFX_BASE64 && process.env.VERIFACTU_PRODUCTOR_NIF);
}

/**
 * Qué falta por configurar, en cristiano.
 *
 * Existe porque el fallo típico de esto no es un error: es que no pasa nada y
 * nadie sabe por qué. Se enseña en el panel y se registra en el cron.
 */
export function queFaltaParaTransmitir(): string[] {
  const falta: string[] = [];
  if (!process.env.VERIFACTU_CERT_PFX_BASE64) falta.push('el certificado (VERIFACTU_CERT_PFX_BASE64)');
  if (!process.env.VERIFACTU_PRODUCTOR_NIF) falta.push('el NIF del productor del software (VERIFACTU_PRODUCTOR_NIF)');
  return falta;
}
