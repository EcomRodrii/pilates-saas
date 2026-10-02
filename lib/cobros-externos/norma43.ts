// ─────────────────────────────────────────────────────────────────────────────
// Lector de Norma 43 (Cuaderno 43 de la AEB): el extracto que exportan todos los
// bancos españoles. Un solo lector para todos.
//
// Registros de 80 caracteres:
//   11  cabecera de cuenta    entidad, oficina, cuenta, periodo, saldo, divisa
//   22  movimiento            fecha operación y valor, conceptos común y propio,
//                             debe/haber, importe, documento, referencias 1 y 2
//   23  concepto complementario (hasta 5 por movimiento, 2 × 38 caracteres)
//   24  equivalencia de divisa (se ignora)
//   33  final de cuenta       nº y total de apuntes al debe y al haber, saldo
//   88  fin de fichero
//
// Lo que NO sale de aquí: saldos (el de la cuenta del estudio no es asunto de
// Tentare) ni el número de cuenta completo (solo los 4 últimos dígitos).
//
// Si los totales del registro 33 no cuadran con los movimientos leídos, el
// fichero está cortado o mal exportado y se rechaza ENTERO: importar la mitad
// dejaría huecos que nadie vería.
//
// Puro: recibe el texto ya decodificado (`decodificarExtracto`).
// ─────────────────────────────────────────────────────────────────────────────

export interface MovimientoN43 {
  /** Últimos 4 dígitos de la cuenta, para la clave y para enseñarla. */
  cuentaFinal: string;
  /** Cuenta completa SOLO para la clave de idempotencia; nunca se guarda tal cual. */
  cuentaClave: string;
  fechaOperacion: string;
  fechaValor: string;
  conceptoComun: string;
  conceptoPropio: string;
  /** true = abono (entra dinero). */
  abono: boolean;
  importeCentimos: number;
  documento: string;
  referencia1: string;
  referencia2: string;
  /** Los conceptos complementarios (registros 23), en orden, sin vacíos. */
  conceptos: string[];
  /** Número de línea del registro 22 (para errores, nunca su contenido). */
  linea: number;
}

export interface LecturaN43 {
  ok: boolean;
  movimientos: MovimientoN43[];
  errores: { linea: number; codigo: string }[];
  periodoDesde: string | null;
  periodoHasta: string | null;
}

/** ¿Parece un Norma 43? La primera línea útil empieza por «11» y mide 80. */
export function esNorma43(texto: string): boolean {
  const primera = lineasDe(texto).find(l => l.trim().length > 0);
  return !!primera && primera.startsWith('11') && primera.trimEnd().length >= 50 && primera.length <= 82;
}

/**
 * Decodifica los bytes del fichero: UTF-8 si lo es de verdad; si no, Latin-1,
 * que es como lo exportan muchos bancos (las «Ñ» y las tildes de los conceptos).
 */
export function decodificarExtracto(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function lineasDe(texto: string): string[] {
  const sinBom = texto.replace(/^﻿/, '');
  if (/\r?\n/.test(sinBom)) return sinBom.split(/\r?\n/);
  // Algunos bancos lo exportan sin saltos: bloques seguidos de 80.
  const lineas: string[] = [];
  for (let i = 0; i < sinBom.length; i += 80) lineas.push(sinBom.slice(i, i + 80));
  return lineas;
}

function fecha(aammdd: string): string | null {
  if (!/^\d{6}$/.test(aammdd)) return null;
  const a = 2000 + Number(aammdd.slice(0, 2));
  const m = Number(aammdd.slice(2, 4));
  const d = Number(aammdd.slice(4, 6));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // 31 de febrero y similares: el Date normaliza y deja de coincidir.
  const comprobada = new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10);
  return comprobada === iso ? iso : null;
}

function centimos(campo: string): number | null {
  return /^\d{14}$/.test(campo) ? Number(campo) : null;
}

export function leerNorma43(texto: string): LecturaN43 {
  const errores: { linea: number; codigo: string }[] = [];
  const movimientos: MovimientoN43[] = [];
  let periodoDesde: string | null = null;
  let periodoHasta: string | null = null;

  let cuenta: { final: string; clave: string; eur: boolean } | null = null;
  let actual: MovimientoN43 | null = null;
  // Lo leído de la cuenta abierta, para comprobarlo contra su registro 33.
  let cuentaMovs: MovimientoN43[] = [];
  let cuentaCargosCent = 0;
  let cuentaCargosN = 0;
  let vioFin = false;

  const lineas = lineasDe(texto);
  lineas.forEach((bruta, i) => {
    const n = i + 1;
    if (bruta.trim() === '') return;
    if (bruta.length > 80 && bruta.slice(80).trim() !== '') {
      errores.push({ linea: n, codigo: 'LINEA_DEMASIADO_LARGA' });
      return;
    }
    const l = bruta.slice(0, 80).padEnd(80, ' ');
    const tipo = l.slice(0, 2);

    if (tipo === '11') {
      const numero = `${l.slice(2, 6)}${l.slice(6, 10)}${l.slice(10, 20)}`;
      const desde = fecha(l.slice(20, 26));
      const hasta = fecha(l.slice(26, 32));
      if (!desde || !hasta) errores.push({ linea: n, codigo: 'CABECERA_FECHA' });
      if (desde && (!periodoDesde || desde < periodoDesde)) periodoDesde = desde;
      if (hasta && (!periodoHasta || hasta > periodoHasta)) periodoHasta = hasta;
      const eur = l.slice(47, 50) === '978';
      if (!eur) errores.push({ linea: n, codigo: 'DIVISA_NO_EUR' });
      cuenta = { final: l.slice(16, 20), clave: numero, eur };
      cuentaMovs = [];
      cuentaCargosCent = 0;
      cuentaCargosN = 0;
      actual = null;
      return;
    }

    // El fin de fichero va DESPUÉS del cierre de la última cuenta (sin cuenta abierta).
    if (tipo === '88') {
      vioFin = true;
      return;
    }

    if (!cuenta) {
      errores.push({ linea: n, codigo: 'SIN_CABECERA' });
      return;
    }

    if (tipo === '22') {
      const fo = fecha(l.slice(10, 16));
      const fv = fecha(l.slice(16, 22));
      const dh = l[27];
      const imp = centimos(l.slice(28, 42));
      if (!fo || !fv || (dh !== '1' && dh !== '2') || imp === null) {
        errores.push({ linea: n, codigo: 'MOVIMIENTO_ILEGIBLE' });
        actual = null;
        return;
      }
      actual = {
        cuentaFinal: cuenta.final, cuentaClave: cuenta.clave,
        fechaOperacion: fo, fechaValor: fv,
        conceptoComun: l.slice(22, 24), conceptoPropio: l.slice(24, 27),
        abono: dh === '2', importeCentimos: imp,
        documento: l.slice(42, 52).trim(), referencia1: l.slice(52, 64).trim(), referencia2: l.slice(64, 80).trim(),
        conceptos: [], linea: n,
      };
      if (actual.abono) cuentaMovs.push(actual);
      else { cuentaCargosCent += imp; cuentaCargosN++; }
      if (cuenta.eur && actual.abono) movimientos.push(actual);
      return;
    }

    if (tipo === '23') {
      if (!actual) {
        errores.push({ linea: n, codigo: 'COMPLEMENTO_SIN_MOVIMIENTO' });
        return;
      }
      for (const trozo of [l.slice(4, 42), l.slice(42, 80)]) {
        const t = trozo.trim();
        if (t) actual.conceptos.push(t);
      }
      return;
    }

    if (tipo === '24') return;

    if (tipo === '33') {
      const nDebe = Number(l.slice(20, 25));
      const totDebe = centimos(l.slice(25, 39));
      const nHaber = Number(l.slice(39, 44));
      const totHaber = centimos(l.slice(44, 58));
      const haberLeido = cuentaMovs.reduce((s, m) => s + m.importeCentimos, 0);
      if (
        !Number.isFinite(nDebe) || !Number.isFinite(nHaber) || totDebe === null || totHaber === null
        || nHaber !== cuentaMovs.length || totHaber !== haberLeido
        || nDebe !== cuentaCargosN || totDebe !== cuentaCargosCent
      ) {
        errores.push({ linea: n, codigo: 'TOTALES_NO_CUADRAN' });
      }
      cuenta = null;
      actual = null;
      return;
    }

    errores.push({ linea: n, codigo: 'REGISTRO_DESCONOCIDO' });
  });

  if (cuenta) errores.push({ linea: lineas.length, codigo: 'CUENTA_SIN_CIERRE' });
  if (!vioFin) errores.push({ linea: lineas.length, codigo: 'SIN_FIN_DE_FICHERO' });

  // Totales que no cuadran, una cuenta sin cerrar o sin fin: el fichero está
  // cortado o mal exportado. Se rechaza entero.
  const fatal = errores.some(e => ['TOTALES_NO_CUADRAN', 'CUENTA_SIN_CIERRE', 'SIN_FIN_DE_FICHERO', 'SIN_CABECERA'].includes(e.codigo));
  return { ok: !fatal, movimientos: fatal ? [] : movimientos, errores, periodoDesde, periodoHasta };
}

/** Cuántos cargos (dinero que sale) trae el fichero: se cuentan, no se guardan. */
export function contarCargosN43(texto: string): number {
  return lineasDe(texto).filter(l => l.startsWith('22') && l[27] === '1').length;
}
