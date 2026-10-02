// ─────────────────────────────────────────────────────────────────────────────
// Lector genérico de tablas (CSV o Excel): la exportación de cobros del portal de
// cualquier banco o datáfono.
//
// El estudio dice UNA vez qué columna es cada dato (como al importar clientas) y
// Tentare lo recuerda como plantilla. El Excel llega aquí ya convertido a filas
// en el NAVEGADOR (`parseXlsx`): la librería `xlsx` no se ejecuta en el servidor.
//
// Puro: recibe cabeceras y filas de texto.
// ─────────────────────────────────────────────────────────────────────────────

import { inferirOrdenFecha, parsearFecha } from '../csv.ts';
import type { MovimientoNormalizado, ResultadoLectura } from './tipos.ts';
import { clasificarAbono, pagadorDe } from './clasificar.ts';
import { conceptoGuardable, datoGuardable, normalizar, pagadorGuardable, referenciaGuardable } from './texto.ts';
import { apariciones, claveTabla } from './idempotencia.ts';

export interface ColumnasTabla {
  fecha: number;
  /** Importe con signo (negativo = cargo)… */
  importe?: number | null;
  /** …o una columna solo de abonos (lo que entra). Una de las dos. */
  abono?: number | null;
  hora?: number | null;
  concepto?: number[] | null;
  pagador?: number | null;
  tarjeta?: number | null;
  referencia?: number | null;
  idOperacion?: number | null;
}

export type ValidacionColumnas = { ok: true } | { ok: false; error: string };

export function validarColumnas(c: ColumnasTabla, numColumnas: number): ValidacionColumnas {
  const dentro = (i: number | null | undefined) => i == null || (Number.isInteger(i) && i >= 0 && i < numColumnas);
  const todas = [c.fecha, c.importe, c.abono, c.hora, c.pagador, c.tarjeta, c.referencia, c.idOperacion, ...(c.concepto ?? [])];
  if (!todas.every(dentro)) return { ok: false, error: 'Hay una columna elegida que no existe en el fichero.' };
  if (c.importe == null && c.abono == null) return { ok: false, error: 'Elige la columna del importe (o la de abonos).' };
  return { ok: true };
}

const SINONIMOS: Record<Exclude<keyof ColumnasTabla, 'concepto'> | 'concepto', string[]> = {
  fecha: ['fecha', 'fecha operacion', 'f operacion', 'fecha de operacion', 'fecha transaccion', 'date'],
  hora: ['hora', 'hora operacion', 'time'],
  importe: ['importe', 'cantidad', 'importe eur', 'importe euros', 'amount', 'total'],
  abono: ['abono', 'abonos', 'haber', 'ingreso', 'ingresos'],
  concepto: ['concepto', 'descripcion', 'detalle', 'movimiento', 'observaciones', 'concepto movimiento'],
  pagador: ['ordenante', 'pagador', 'remitente', 'nombre ordenante'],
  tarjeta: ['tarjeta', 'n tarjeta', 'numero tarjeta', 'pan', 'tarjeta enmascarada'],
  referencia: ['referencia', 'pedido', 'n pedido', 'autorizacion', 'codigo autorizacion'],
  idOperacion: ['id operacion', 'n operacion', 'numero operacion', 'num operacion', 'id transaccion', 'transaction id'],
};

/** Una primera propuesta de columnas a partir de las cabeceras. El estudio la corrige. */
export function sugerirColumnas(cabeceras: readonly string[]): Partial<ColumnasTabla> {
  const norm = cabeceras.map(h => normalizar(h));
  const buscar = (claves: string[]) => {
    const i = norm.findIndex(h => claves.includes(h));
    return i >= 0 ? i : null;
  };
  const concepto = buscar(SINONIMOS.concepto);
  return {
    ...(buscar(SINONIMOS.fecha) != null ? { fecha: buscar(SINONIMOS.fecha) as number } : {}),
    hora: buscar(SINONIMOS.hora), importe: buscar(SINONIMOS.importe), abono: buscar(SINONIMOS.abono),
    concepto: concepto != null ? [concepto] : null, pagador: buscar(SINONIMOS.pagador),
    tarjeta: buscar(SINONIMOS.tarjeta), referencia: buscar(SINONIMOS.referencia), idOperacion: buscar(SINONIMOS.idOperacion),
  };
}

/**
 * Un importe escrito a la española o a la inglesa, a céntimos con signo.
 * «1.234,56», «59,00 €», «-59.00», «(59,00)». `null` si no es un importe.
 */
export function importeACentimos(celda: string | null | undefined): number | null {
  let s = (celda ?? '').trim().replace(/€|eur/gi, '').replace(/\s+/g, '');
  if (!s) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { negativo = true; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('-')) { negativo = true; s = s.slice(0, -1); }
  if (!/^[\d.,]+$/.test(s)) return null;
  const ultimoSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  let entero = s;
  let decimales = '';
  // El último separador es el decimal si le siguen 1 o 2 cifras; si le siguen 3, es de miles.
  if (ultimoSep >= 0 && s.length - ultimoSep - 1 <= 2) {
    entero = s.slice(0, ultimoSep);
    decimales = s.slice(ultimoSep + 1);
  }
  entero = entero.replace(/[.,]/g, '');
  if (!/^\d+$/.test(entero || '0') || !/^\d{0,2}$/.test(decimales)) return null;
  const cent = Number(entero || '0') * 100 + Number(decimales.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cent)) return null;
  return negativo ? -cent : cent;
}

/** `HH:MM` de una celda de hora, o de una celda de fecha que la lleve. */
export function horaDe(celda: string | null | undefined): string | null {
  const m = (celda ?? '').match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)(?::[0-5]\d)?\b/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

/** Los 4 últimos dígitos de una tarjeta enmascarada («**** 1234», «4548XXXXXXXX1234»). */
export function ultimos4De(celda: string | null | undefined): string | null {
  const digitos = (celda ?? '').replace(/[^\d]/g, '');
  return digitos.length >= 4 ? digitos.slice(-4) : null;
}

export function marcaDe(texto: string | null | undefined): string | null {
  const t = normalizar(texto ?? '');
  if (/\bvisa\b/.test(t)) return 'visa';
  if (/\b(mastercard|master card|maestro)\b/.test(t)) return 'mastercard';
  if (/\b(amex|american express)\b/.test(t)) return 'amex';
  return null;
}

export function leerTabla(p: {
  fuente: 'csv' | 'excel';
  /** Identifica la plantilla de columnas (va en la clave de idempotencia). */
  plantilla: string;
  filas: readonly (readonly string[])[];
  columnas: ColumnasTabla;
}): ResultadoLectura {
  const { columnas: c } = p;
  const errores: { linea: number; codigo: string }[] = [];
  const orden = inferirOrdenFecha(p.filas.map(f => f[c.fecha]));
  let cargos = 0;
  let periodoDesde: string | null = null;
  let periodoHasta: string | null = null;

  type Fila = { linea: number; mov: Omit<MovimientoNormalizado, 'claveIdempotencia'>; idOperacion: string | null };
  const leidas: Fila[] = [];

  p.filas.forEach((f, i) => {
    const linea = i + 2; // la 1 es la cabecera
    if (f.every(celda => !celda || !celda.trim())) return;
    const fecha = parsearFecha(f[c.fecha], orden);
    if (!fecha) { errores.push({ linea, codigo: 'FECHA_ILEGIBLE' }); return; }
    const conSigno = c.importe != null ? importeACentimos(f[c.importe]) : null;
    const abono = c.abono != null ? importeACentimos(f[c.abono]) : null;
    const importe = c.importe != null ? conSigno : abono;
    if (importe === null) {
      // Una columna solo de abonos vacía es un cargo, no un error.
      if (c.importe == null && !(f[c.abono as number] ?? '').trim()) { cargos++; return; }
      errores.push({ linea, codigo: 'IMPORTE_ILEGIBLE' });
      return;
    }
    if (importe <= 0) { cargos++; return; }

    const concepto = (c.concepto ?? []).map(j => f[j] ?? '').join(' ').trim();
    const pagadorCelda = c.pagador != null ? (f[c.pagador] ?? '').trim() : '';
    const tarjeta = c.tarjeta != null ? ultimos4De(f[c.tarjeta]) : null;
    const textoTodo = [concepto, pagadorCelda].filter(Boolean).join(' ');
    const clasif = tarjeta
      ? { tipo: 'COBRO' as const, metodo: 'TARJETA' as const }
      : clasificarAbono({ texto: textoTodo });
    const hora = c.hora != null ? horaDe(f[c.hora]) : horaDe(f[c.fecha]);
    if (!periodoDesde || fecha < periodoDesde) periodoDesde = fecha;
    if (!periodoHasta || fecha > periodoHasta) periodoHasta = fecha;
    leidas.push({
      linea,
      idOperacion: c.idOperacion != null ? ((f[c.idOperacion] ?? '').trim() || null) : null,
      mov: {
        fuente: p.fuente,
        // El id crudo solo entra en la clave (con hash); lo guardado, saneado.
        idExterno: c.idOperacion != null ? datoGuardable(f[c.idOperacion], 120) : null,
        tipo: clasif.tipo, metodo: clasif.metodo,
        importeCentimos: importe,
        fechaOperacion: fecha, horaOperacion: hora, fechaValor: null,
        referencia: c.referencia != null ? referenciaGuardable(f[c.referencia]) : null,
        tarjetaUltimos4: tarjeta,
        tarjetaMarca: tarjeta ? marcaDe(`${c.tarjeta != null ? f[c.tarjeta] : ''} ${concepto}`) : null,
        terminalRef: null,
        pagadorNombre: clasif.tipo === 'COBRO' ? (pagadorGuardable(pagadorCelda) ?? pagadorGuardable(pagadorDe(textoTodo))) : null,
        concepto: conceptoGuardable(concepto),
      },
    });
  });

  const firma = (x: Fila) => [x.mov.fechaOperacion, x.mov.horaOperacion, x.mov.importeCentimos, x.mov.referencia, x.mov.tarjetaUltimos4, x.mov.concepto, x.mov.pagadorNombre].join('|');
  const ns = apariciones(leidas, firma);
  const movimientos: MovimientoNormalizado[] = leidas.map((x, i) => ({
    ...x.mov,
    claveIdempotencia: claveTabla({
      plantilla: p.plantilla, idOperacion: x.idOperacion,
      campos: [x.mov.fechaOperacion, x.mov.horaOperacion, x.mov.importeCentimos, x.mov.referencia, x.mov.tarjetaUltimos4, x.mov.concepto, x.mov.pagadorNombre],
    }, ns[i]),
  }));
  return { movimientos, cargos, errores, cuentaFinal: null, periodoDesde, periodoHasta };
}
