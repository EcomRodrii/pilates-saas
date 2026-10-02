// ─────────────────────────────────────────────────────────────────────────────
// El fichero de «lo cobrado» para la gestoría: el MISMO en Informes, en Cobros
// («Lo que he cobrado» → «Descargar para la gestoría») y en el cierre del año.
//
// Antes Cobros descargaba con su botón «Exportar» lo que te DEBEN (la lista de
// «Quién me debe»), y el cierre mandaba ahí a quien no factura con Tentare: la
// gestoría recibía las deudas como si fueran ingresos.
//
// Bruto, devuelto y neto: la suma de «Neto» es la cifra «Ingresos período» de
// Informes (`importeIngresado`). Puro, sin `@/`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export interface FilaCobrada {
  fechaCobro: string;
  nombre: string;
  concepto: string;
  importe: number;
  importeDevuelto: number;
  neto: number;
  metodo: string | null;
  estado: string;
}

export const CABECERA_COBRADO = ['Fecha', 'Clienta', 'Concepto', 'Cobrado (€)', 'Devuelto (€)', 'Neto (€)', 'Método', 'Estado'] as const;

const celda = (c: string | number) => `"${String(c).replace(/"/g, '""')}"`;

/** El CSV, ordenado por fecha de cobro y con BOM (Excel en español lo abre con sus tildes). */
export function csvLoCobrado(filas: readonly FilaCobrada[]): string {
  const orden = [...filas].sort((a, b) => (a.fechaCobro < b.fechaCobro ? -1 : a.fechaCobro > b.fechaCobro ? 1 : 0));
  const lineas = [
    CABECERA_COBRADO.map(celda).join(','),
    ...orden.map(r => [
      r.fechaCobro, r.nombre, r.concepto, r.importe.toFixed(2), r.importeDevuelto.toFixed(2), r.neto.toFixed(2), r.metodo ?? '', r.estado,
    ].map(celda).join(',')),
  ];
  return '﻿' + lineas.join('\n');
}

/** Primer y último día de un mes 'YYYY-MM', sin `Date` (el 31 de un mes de 30 días no existe). */
export function rangoDelMes(ym: string): { desde: string; hasta: string } {
  const [a, m] = ym.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${ym}-01`, hasta: `${ym}-${String(ultimo).padStart(2, '0')}` };
}

/** Descarga el CSV en el navegador. */
export function descargarCsv(csv: string, nombre: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
