// Veri*Factu — la identidad del sistema informático de facturación (SIF) y su
// declaración responsable.
//
// Lógica pura, sin base de datos ni `process.env` salvo por parámetro: se usa
// igual en el servidor, en los tests y en la página de la declaración.
//
// ⚠️ UN SIF SE IDENTIFICA POR «NIF del obligado + IdSistemaInformatico +
// NumeroInstalacion» (FAQ de desarrolladores de la AEAT, §4), y ese trío es el
// ámbito de la cadena de huellas. Cambiar el id o el número de instalación de
// un estudio que ya ha remitido registros INICIA OTRA CADENA a ojos de la AEAT.
// Por eso el número de instalación se deriva del id del estudio (estable, único
// y nunca reutilizado) y, desde la PR 3, se guarda la primera vez en
// `verifactu_estudios.numero_instalacion` y ya no se recalcula.
//
// ⚠️ LA VERSIÓN VA CON SU DECLARACIÓN. La declaración responsable es por
// versión (RD 1007/2023, art. 13.2: «en cada una de sus versiones»). Si un
// cambio del código afecta a cómo se generan, encadenan, remiten o conservan
// los registros, se sube `VERSION_SIF` y el productor suscribe una declaración
// nueva desde /interno/verifactu. Sin declaración suscrita para la versión
// vigente, no se transmite (transmitir.ts).

import type { SistemaInformatico } from './xml.ts';

/** a) + b) + c) + e) + f) de la declaración: lo que es del software. */
export const SIF = {
  nombre: 'Tentare',
  /** 2 caracteres alfanuméricos (Orden HAC/1177/2024, anexo 2.6). */
  id: 'TE',
  version: '1.0.0',
  /** Solo puede funcionar como VERI*FACTU: no hay modo «no verificable» (sin firma XAdES). */
  soloVerifactu: true,
  /** Un mismo Tentare da soporte a la facturación de muchos obligados (estudios). */
  multiOT: true,
} as const;

/**
 * Número de instalación de la facturación de un estudio.
 *
 * Tentare es un SaaS: cada estudio es una «facturación» independiente, un SIF
 * «virtual» con su número propio (FAQ §4, art. 7.a del RRSIF). El id del estudio
 * es estable, único en toda la plataforma y no se reutiliza, así que dos sedes
 * con el mismo NIF tienen instalaciones distintas.
 */
export function numeroInstalacionDeEstudio(studioId: string): string {
  const id = studioId.trim();
  if (!id || id.length > 100 || !/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error(`Id de estudio no apto como NumeroInstalacion: ${JSON.stringify(studioId)}`);
  }
  return id;
}

/**
 * `IndicadorMultiplesOT`: «deberá calcularse de forma independiente por cada
 * usuario del SIF SaaS (no a nivel global) y se informará con "S" en todos los
 * registros … de aquellos usuarios que tengan creadas más de una facturación en
 * el SIF SaaS, independientemente del estado de dichas facturaciones (alta,
 * baja…) y de si son de igual o de distinto OEF» (FAQ de desarrolladores, §4).
 *
 * En Tentare el usuario es la propietaria (`studios.owner_auth_user_id`) y una
 * facturación es un estudio suyo que factura con Tentare (ver `contarFacturaciones`
 * en transmitir.ts).
 */
export function indicadorMultiplesOT(facturacionesDelUsuario: number): boolean {
  return facturacionesDelUsuario > 1;
}

// ── El productor ─────────────────────────────────────────────────────────────

export interface Productor {
  /** Nombre y apellidos (persona física) o razón social. */
  nombre: string;
  nif: string;
  /** Dirección postal completa de contacto. */
  direccion: string;
}

type Env = Record<string, string | undefined>;

/**
 * El productor sale de la configuración del servidor, nunca de un literal: su
 * nombre, NIF y dirección son datos personales de una persona física y el repo
 * es público. Lo que falte se devuelve en `falta` — nada se rellena con un
 * valor inventado.
 */
export function productorDeEntorno(env: Env): { productor: Productor | null; falta: string[] } {
  const nombre = (env.VERIFACTU_PRODUCTOR_NOMBRE ?? '').trim();
  const nif = (env.VERIFACTU_PRODUCTOR_NIF ?? '').trim().toUpperCase();
  const direccion = (env.VERIFACTU_PRODUCTOR_DIRECCION ?? '').trim();
  const falta: string[] = [];
  if (!nombre) falta.push('nombre y apellidos del productor (VERIFACTU_PRODUCTOR_NOMBRE)');
  if (nif.length !== 9) falta.push('NIF del productor, 9 caracteres (VERIFACTU_PRODUCTOR_NIF)');
  if (!direccion) falta.push('dirección postal de contacto del productor (VERIFACTU_PRODUCTOR_DIRECCION)');
  return { productor: falta.length === 0 ? { nombre, nif, direccion } : null, falta };
}

/** El bloque `SistemaInformatico` de los registros de UN estudio. */
export function sistemaInformaticoParaEstudio(
  productor: Pick<Productor, 'nombre' | 'nif'>,
  numeroInstalacion: string,
  facturacionesDelUsuario: number,
): SistemaInformatico {
  return {
    nombreRazon: productor.nombre,
    nif: productor.nif,
    nombreSistemaInformatico: SIF.nombre,
    idSistemaInformatico: SIF.id,
    version: SIF.version,
    numeroInstalacion,
    soloVerifactu: SIF.soloVerifactu,
    multiOT: SIF.multiOT,
    indicadorMultiplesOT: indicadorMultiplesOT(facturacionesDelUsuario),
  };
}

// ── La declaración responsable (Orden HAC/1177/2024, art. 15) ────────────────

export const TITULO_DECLARACION = 'DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN';

export interface ApartadoDeclaracion {
  /** '1.a' … '1.l' */
  letra: string;
  /** El texto que describe el dato (art. 15.1: «Cada dato aportado deberá precederse del texto que lo describe»). */
  etiqueta: string;
  /** El dato. null = falta y NO se inventa. '' = el apartado no lleva dato aparte (1.k). */
  valor: string | null;
}

/**
 * 1.d: qué es Tentare y qué hace. Descripción de lo que existe en el código.
 * La frase de la remisión es la redacción que propuso el asesor fiscal
 * (30-sep-2026). Que las subsanaciones y anulaciones las lance Tentare y no un
 * botón del estudio no impide declararlas: la AEAT pide que el SIF las genere,
 * preferentemente de forma transparente para el usuario.
 */
export const COMPONENTES_Y_FUNCIONALIDADES =
  'Software ofrecido como servicio (SaaS) al que cada usuario accede por navegador web o por su aplicación; ' +
  'no requiere instalar hardware ni software propio del usuario. Se ejecuta en servidores en la nube del ' +
  'productor, con una base de datos donde se generan y conservan las facturas y sus registros de facturación. ' +
  'Funcionalidades principales: gestión de un estudio (clientes, reservas, planes y bonos), cobro de recibos, ' +
  'expedición de facturas completas y simplificadas y de facturas rectificativas a partir de esos cobros, ' +
  'generación simultánea de su registro de facturación encadenado mediante huella SHA-256, código QR ' +
  'tributario en la factura, y generación y remisión automática a la sede electrónica de la AEAT de ' +
  'registros de facturación de alta, incluidos, cuando proceda, registros de alta de subsanación y ' +
  'registros de anulación. Permite gestionar de forma independiente la facturación de varios ' +
  'obligados tributarios, cumpliendo separadamente la normativa para cada uno de ellos, como si se tratara ' +
  'de sistemas informáticos de facturación distintos.';

/** 1.g, para un SIF que solo funciona como VERI*FACTU (redacción del ejemplo oficial de la AEAT). */
export const TIPOS_DE_FIRMA =
  'Dado que se trata de un sistema que solo puede ser utilizado exclusivamente en la modalidad «VERI*FACTU», ' +
  'no se realiza una firma electrónica expresa de los registros de facturación generados, ya que la normativa ' +
  'considera que quedan firmados al ser remitidos correctamente a los servicios electrónicos de la Agencia ' +
  'Tributaria con la debida autenticación mediante el adecuado certificado electrónico cualificado.';

export const CUMPLIMIENTO =
  'La persona productora del sistema informático a que se refiere esta declaración responsable hace constar ' +
  'que dicho sistema informático, en la versión indicada en ella, cumple con lo dispuesto en el artículo 29.2.j) ' +
  'de la Ley 58/2003, de 17 de diciembre, General Tributaria, en el Reglamento que establece los requisitos que ' +
  'deben adoptar los sistemas y programas informáticos o electrónicos que soporten los procesos de facturación ' +
  'de empresarios y profesionales, y la estandarización de formatos de los registros de facturación, aprobado ' +
  'por el Real Decreto 1007/2023, de 5 de diciembre, en la Orden HAC/1177/2024, de 17 de octubre, y en la sede ' +
  'electrónica de la Agencia Estatal de Administración Tributaria para todo aquello que complete las ' +
  'especificaciones de dicha orden.';

export interface Suscripcion {
  /** dd-mm-aaaa (el art. 15.1.l pide día, mes y año, en ese orden). */
  fecha: string;
  /** Localidad y país, en ese orden. */
  lugar: string;
}

/**
 * Los apartados de la declaración, en el orden EXACTO del art. 15.1 de la Orden
 * HAC/1177/2024, cada uno precedido de su texto. El productor es una persona
 * física, así que las letras h)-l) usan la redacción de «persona productora».
 */
export function apartadosDeclaracion(productor: Productor | null, suscripcion: Suscripcion | null): ApartadoDeclaracion[] {
  const esta = 'a que se refiere esta declaración responsable';
  return [
    { letra: '1.a', etiqueta: `Nombre del sistema informático ${esta}`, valor: SIF.nombre },
    { letra: '1.b', etiqueta: 'Código identificador del sistema informático a que se refiere el apartado a) de esta declaración responsable', valor: SIF.id },
    { letra: '1.c', etiqueta: `Identificador completo de la versión concreta del sistema informático ${esta}`, valor: SIF.version },
    { letra: '1.d', etiqueta: `Componentes, hardware y software, de que consta el sistema informático ${esta}, junto con una breve descripción de lo que hace dicho sistema informático y de sus principales funcionalidades`, valor: COMPONENTES_Y_FUNCIONALIDADES },
    { letra: '1.e', etiqueta: `Indicación de si el sistema informático ${esta} se ha producido de tal manera que, a los efectos de cumplir con el Reglamento, solo pueda funcionar exclusivamente como «VERI*FACTU»`, valor: SIF.soloVerifactu ? 'S - Sí' : 'N - No' },
    { letra: '1.f', etiqueta: `Indicación de si el sistema informático ${esta} permite ser usado por varios obligados tributarios o por un mismo usuario para dar soporte a la facturación de varios obligados tributarios`, valor: SIF.multiOT ? 'S - Sí' : 'N - No' },
    { letra: '1.g', etiqueta: `Tipos de firma utilizados para firmar los registros de facturación y de evento en el caso de que el sistema informático ${esta} no sea utilizado como «VERI*FACTU»`, valor: TIPOS_DE_FIRMA },
    { letra: '1.h', etiqueta: `Nombre y apellidos de la persona productora del sistema informático ${esta}`, valor: productor?.nombre ?? null },
    { letra: '1.i', etiqueta: `Número de identificación fiscal (NIF) español de la persona productora del sistema informático ${esta}`, valor: productor?.nif ?? null },
    { letra: '1.j', etiqueta: `Dirección postal completa de contacto de la persona productora del sistema informático ${esta}`, valor: productor?.direccion ?? null },
    // La letra k) no tiene un dato aparte: su texto ES la constancia (así la
    // redacta el ejemplo oficial de la AEAT).
    { letra: '1.k', etiqueta: CUMPLIMIENTO, valor: '' },
    { letra: '1.l', etiqueta: 'Fecha en que la persona productora de este sistema informático suscribe esta declaración responsable del mismo', valor: suscripcion?.fecha ?? null },
    { letra: '1.l', etiqueta: 'Lugar en que la persona productora de este sistema informático suscribe esta declaración responsable del mismo', valor: suscripcion?.lugar ?? null },
  ];
}

/** El texto completo, tal y como se guarda y se muestra. Solo si no falta nada. */
export function textoDeclaracion(productor: Productor, suscripcion: Suscripcion): string {
  const cuerpo = apartadosDeclaracion(productor, suscripcion)
    .map(a => (a.valor === '' ? `${a.letra}) ${a.etiqueta}` : `${a.letra}) ${a.etiqueta}:\n${a.valor}`))
    .join('\n\n');
  return `${TITULO_DECLARACION}\n\n${cuerpo}\n`;
}

/** dd-mm-aaaa válida (el 31-02 no existe). */
export function fechaSuscripcionValida(f: string): boolean {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(f);
  if (!m) return false;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const fecha = new Date(Date.UTC(y, mo - 1, d));
  return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === mo - 1 && fecha.getUTCDate() === d;
}
