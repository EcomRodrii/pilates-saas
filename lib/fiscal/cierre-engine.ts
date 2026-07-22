import type { Factura, IngresoManual } from '@/lib/types';
import type { RowIngresosManuales, RowFacturas } from '@/lib/db-types';

// ─────────────────────────────────────────────────────────────────────────────
// Motor del Cierre de año. PURO y determinista: dadas las facturas selladas del
// estudio + los ingresos añadidos a mano + un año, produce el resumen fiscal
// que se entrega a la gestoría (totales, trimestres para cuadrar el 303/390,
// desglose por tipo de IVA, mes a mes, candidatos al 347 y estado del sellado).
// Sin acceso a red ni fecha del sistema → testeable al 100%.
// ─────────────────────────────────────────────────────────────────────────────

const N = (x: number | string | null | undefined): number => {
  const n = typeof x === 'string' ? parseFloat(x) : (x ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// Umbral del modelo 347 (operaciones con terceros): 3.005,06 € en el año.
export const UMBRAL_347 = 3005.06;

export type OrigenLinea = 'FACTURA' | 'MANUAL';

export interface CierreLinea {
  fecha: string;              // YYYY-MM-DD
  numero: string | null;      // nº de factura (solo FACTURA)
  nombre: string;
  nif: string | null;
  base: number;
  tipoIva: number;
  cuota: number;
  total: number;
  origen: OrigenLinea;
  sellada: boolean;           // tiene huella Verifactu (solo facturas)
}

export interface CierreTotales { base: number; cuota: number; total: number; numFacturas: number; numManuales: number; }
export interface CierreTrimestre { trimestre: 1 | 2 | 3 | 4; base: number; cuota: number; total: number; num: number; }
export interface CierrePorIva { tipoIva: number; base: number; cuota: number; num: number; }
export interface CierreMes { mes: number; total: number; }         // mes 1–12
export interface Cierre347 { nombre: string; nif: string | null; total: number; }
export interface CierreSellado { totalFacturas: number; selladas: number; }

export interface CierreAnual {
  anio: number;
  totales: CierreTotales;
  trimestres: CierreTrimestre[];  // siempre 4 (T1..T4)
  porIva: CierrePorIva[];         // ordenado por tipo desc
  meses: CierreMes[];             // siempre 12 (ene..dic)
  candidatos347: Cierre347[];
  sellado: CierreSellado;
  lineas: CierreLinea[];          // todas las líneas del año (facturas + manuales), por fecha
}

function facturaALinea(f: Factura): CierreLinea {
  return {
    fecha: (f.fechaEmision ?? '').slice(0, 10),
    numero: f.numeroCompleto ?? null,
    nombre: f.receptorNombre ?? 'Sin nombre',
    nif: f.receptorNIF ?? null,
    base: N(f.baseImponible),
    tipoIva: N(f.tipoIVA),
    cuota: N(f.cuotaIVA),
    total: N(f.total),
    origen: 'FACTURA',
    sellada: Boolean(f.verifactuHash),
  };
}

function manualALinea(m: IngresoManual): CierreLinea {
  return {
    fecha: (m.fecha ?? '').slice(0, 10),
    numero: null,
    nombre: m.cliente ?? m.concepto ?? 'Ingreso manual',
    nif: m.nif ?? null,
    base: N(m.baseImponible),
    tipoIva: N(m.tipoIVA),
    cuota: N(m.cuotaIVA),
    total: N(m.total),
    origen: 'MANUAL',
    sellada: false,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeCierreAnual(input: {
  facturas: Factura[];
  ingresosManuales: IngresoManual[];
  anio: number;
}): CierreAnual {
  const { facturas, ingresosManuales, anio } = input;
  const yr = String(anio);

  const lineas = [
    ...facturas.map(facturaALinea),
    ...ingresosManuales.map(manualALinea),
  ]
    .filter((l) => l.fecha.slice(0, 4) === yr)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

  const totales: CierreTotales = { base: 0, cuota: 0, total: 0, numFacturas: 0, numManuales: 0 };
  const trim = new Map<number, CierreTrimestre>([1, 2, 3, 4].map((t) => [t, { trimestre: t as 1, base: 0, cuota: 0, total: 0, num: 0 }]));
  const iva = new Map<number, CierrePorIva>();
  const meses: CierreMes[] = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, total: 0 }));
  const porCliente = new Map<string, Cierre347>();
  const sellado: CierreSellado = { totalFacturas: 0, selladas: 0 };

  for (const l of lineas) {
    totales.base += l.base; totales.cuota += l.cuota; totales.total += l.total;
    if (l.origen === 'FACTURA') { totales.numFacturas++; sellado.totalFacturas++; if (l.sellada) sellado.selladas++; }
    else totales.numManuales++;

    const mes = Number(l.fecha.slice(5, 7));          // 1–12
    if (mes >= 1 && mes <= 12) meses[mes - 1].total += l.total;

    const t = Math.min(4, Math.max(1, Math.ceil(mes / 3))) as 1 | 2 | 3 | 4;
    const tr = trim.get(t)!;
    tr.base += l.base; tr.cuota += l.cuota; tr.total += l.total; tr.num++;

    const key = String(N(l.tipoIva));
    const cur = iva.get(l.tipoIva) ?? { tipoIva: l.tipoIva, base: 0, cuota: 0, num: 0 };
    cur.base += l.base; cur.cuota += l.cuota; cur.num++;
    iva.set(l.tipoIva, cur);
    void key;

    // Agregado por cliente para el 347 (por NIF si lo hay, si no por nombre).
    const ckey = (l.nif && l.nif.trim()) || l.nombre;
    const c = porCliente.get(ckey) ?? { nombre: l.nombre, nif: l.nif, total: 0 };
    c.total += l.total;
    if (!c.nif && l.nif) c.nif = l.nif;
    porCliente.set(ckey, c);
  }

  // redondeo final a 2 decimales
  totales.base = round2(totales.base); totales.cuota = round2(totales.cuota); totales.total = round2(totales.total);
  const trimestres = [...trim.values()].map((t) => ({ ...t, base: round2(t.base), cuota: round2(t.cuota), total: round2(t.total) }));
  const porIva = [...iva.values()]
    .map((v) => ({ ...v, base: round2(v.base), cuota: round2(v.cuota) }))
    .sort((a, b) => b.tipoIva - a.tipoIva);
  meses.forEach((m) => (m.total = round2(m.total)));
  const candidatos347 = [...porCliente.values()]
    .filter((c) => c.total > UMBRAL_347)
    .map((c) => ({ ...c, total: round2(c.total) }))
    .sort((a, b) => b.total - a.total);

  return { anio, totales, trimestres, porIva, meses, candidatos347, sellado, lineas };
}

// Mapea una fila de `facturas` a Factura. Existe aquí (además del mapper interno
// del god-file) para que el servidor pueda computar el cierre sin importar
// lib/supabase-data. Puro.
export function mapFacturaRow(r: RowFacturas): Factura {
  return {
    id: r.id,
    studioId: r.studio_id,
    reciboId: r.recibo_id ?? '',
    numeroCompleto: r.numero_completo,
    fechaEmision: r.fecha_emision,
    receptorNombre: r.receptor_nombre ?? '',
    receptorNIF: r.receptor_nif,
    baseImponible: N(r.base_imponible),
    tipoIVA: N(r.tipo_iva),
    cuotaIVA: N(r.cuota_iva),
    total: N(r.total),
    verifactuHash: r.verifactu_hash,
    verifactuPrevHash: r.verifactu_prev_hash,
    verifactuTs: r.verifactu_ts,
    verifactuSeq: r.verifactu_seq,
  };
}

// ── Mappers de la tabla ingresos_manuales ────────────────────────────────────
export function mapIngresoManual(r: RowIngresosManuales): IngresoManual {
  return {
    id: r.id,
    studioId: r.studio_id,
    fecha: (r.fecha ?? '').slice(0, 10),
    concepto: r.concepto,
    cliente: r.cliente,
    nif: r.nif,
    baseImponible: N(r.base_imponible),
    tipoIVA: N(r.tipo_iva),
    cuotaIVA: N(r.cuota_iva),
    total: N(r.total),
    nota: r.nota,
    creadoEn: r.creado_en,
  };
}

// Datos del "libro de facturas emitidas" para exportar a CSV. Formato único que
// comparten la descarga del panel y el adjunto del email a la gestoría.
export function cierreLibroCsvData(cierre: CierreAnual): { headers: string[]; rows: string[][] } {
  const headers = ['Fecha', 'Nº factura', 'Origen', 'Cliente', 'NIF', 'Base imponible', 'Tipo IVA', 'Cuota IVA', 'Total'];
  const rows = cierre.lineas.map((l) => [
    l.fecha, l.numero ?? '', l.origen === 'FACTURA' ? 'Factura Tentare' : 'Manual', l.nombre, l.nif ?? '',
    l.base.toFixed(2), String(l.tipoIva), l.cuota.toFixed(2), l.total.toFixed(2),
  ]);
  return { headers, rows };
}

// Calcula base + cuota a partir de un total (IVA incluido) y un tipo de IVA.
// Es como se cobra en Tentare (el precio del recibo es IVA incluido).
export function desglosarIvaDesdeTotal(total: number, tipoIva: number): { base: number; cuota: number } {
  const t = N(total);
  const tipo = N(tipoIva);
  const base = round2(t / (1 + tipo / 100));
  const cuota = round2(t - base);
  return { base, cuota };
}
