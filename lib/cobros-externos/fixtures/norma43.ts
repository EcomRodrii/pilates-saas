// Generador de extractos Norma 43 INVENTADOS para los tests. Ningún dato real:
// entidad, cuenta, nombres y conceptos son ficticios. Se generan registro a
// registro para que cada línea mida exactamente 80 caracteres.

const izq = (s: string, n: number) => s.slice(0, n).padEnd(n, ' ');
const num = (v: number | string, n: number) => String(v).padStart(n, '0').slice(-n);

export interface Mov43 {
  fechaOp: string; // AAMMDD
  fechaValor?: string;
  comun?: string;
  propio?: string;
  /** true = abono (entra dinero) */
  abono: boolean;
  centimos: number;
  documento?: string;
  ref1?: string;
  ref2?: string;
  conceptos?: string[];
}

export function cabecera(p: { cuenta?: string; desde: string; hasta: string; divisa?: string }): string {
  return '11' + '9999' + '0001' + num(p.cuenta ?? '0000001234', 10) + p.desde + p.hasta + '2'
    + num(100000, 14) + (p.divisa ?? '978') + '3' + izq('ESTUDIO INVENTADO', 26) + '   ';
}

export function movimiento(m: Mov43): string {
  return '22' + '    ' + '0001' + m.fechaOp + (m.fechaValor ?? m.fechaOp) + (m.comun ?? '04') + (m.propio ?? '000')
    + (m.abono ? '2' : '1') + num(m.centimos, 14) + num(m.documento ?? '0', 10) + izq(m.ref1 ?? '', 12) + izq(m.ref2 ?? '', 16);
}

export function complementos(conceptos: string[]): string[] {
  const lineas: string[] = [];
  for (let i = 0; i < conceptos.length; i += 2) {
    lineas.push('23' + num(i / 2 + 1, 2) + izq(conceptos[i], 38) + izq(conceptos[i + 1] ?? '', 38));
  }
  return lineas;
}

export function cierre(p: { cuenta?: string; movs: Mov43[]; trucarHaber?: number }): string {
  const abonos = p.movs.filter(m => m.abono);
  const cargos = p.movs.filter(m => !m.abono);
  const totHaber = abonos.reduce((s, m) => s + m.centimos, 0) + (p.trucarHaber ?? 0);
  const totDebe = cargos.reduce((s, m) => s + m.centimos, 0);
  return '33' + '9999' + '0001' + num(p.cuenta ?? '0000001234', 10)
    + num(cargos.length, 5) + num(totDebe, 14) + num(abonos.length, 5) + num(totHaber, 14)
    + '2' + num(100000, 14) + '978' + '    ';
}

export const FIN = '88' + '9'.repeat(18) + num(0, 6) + ' '.repeat(54);

/** Un extracto entero de una cuenta. */
export function extracto(p: { desde: string; hasta: string; movs: Mov43[]; trucarHaber?: number; sinFin?: boolean; separador?: string }): string {
  const lineas = [cabecera({ desde: p.desde, hasta: p.hasta })];
  for (const m of p.movs) {
    lineas.push(movimiento(m));
    if (m.conceptos?.length) lineas.push(...complementos(m.conceptos));
  }
  lineas.push(cierre({ movs: p.movs, trucarHaber: p.trucarHaber }));
  if (!p.sinFin) lineas.push(FIN);
  return lineas.join(p.separador ?? '\r\n');
}
