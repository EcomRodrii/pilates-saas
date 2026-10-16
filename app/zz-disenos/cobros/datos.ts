// TEMPORAL — datos de las maquetas de Cobros e Informes. No se commitea.
// UN solo juego, y cuadra: lo que te deben = la suma de las filas; el
// desglose por método = lo cobrado; las ventas por tipo = el mes de Informes.

export type EstadoRecibo = 'sin-cobrar' | 'no-se-pudo' | 'devuelto-banco' | 'en-el-banco';

export const ESTADO_RECIBO: Record<EstadoRecibo, { texto: string; tono: 'peligro' | 'aviso' | 'neutro' | 'info' }> = {
  'devuelto-banco': { texto: 'Devuelto por el banco', tono: 'peligro' },
  'no-se-pudo': { texto: 'No se pudo cobrar', tono: 'peligro' },
  'sin-cobrar': { texto: 'Sin cobrar', tono: 'aviso' },
  'en-el-banco': { texto: 'En el banco', tono: 'info' },
};

export interface ReciboDeuda { concepto: string; importe: number; estado: EstadoRecibo; vence: string; nota?: string }
export interface Deudora {
  nombre: string; ini: string; tono: number;
  recibos: ReciboDeuda[];
  desde: string; dias: number;
  medio: { tipo: 'tarjeta' | 'mandato' | 'nada'; texto: string; aviso?: string };
  /** Lo que el sistema ya va a hacer solo, si algo. */
  solo?: string;
}

export const DEUDORAS: Deudora[] = [
  {
    nombre: 'Laura Martín Díaz', ini: 'LM', tono: 0, desde: '5 ago', dias: 58,
    recibos: [
      { concepto: 'Mensual ilimitado — agosto', importe: 89, estado: 'no-se-pudo', vence: '5 ago', nota: '3 intentos con la tarjeta' },
      { concepto: 'Mensual ilimitado — septiembre', importe: 89, estado: 'devuelto-banco', vence: '1 sep', nota: 'El banco lo devolvió el 6 sep' },
    ],
    medio: { tipo: 'tarjeta', texto: 'Tarjeta ··4242', aviso: 'Caducó en septiembre' },
  },
  {
    nombre: 'Julia Moreno García', ini: 'JM', tono: 1, desde: '28 ago', dias: 35,
    recibos: [{ concepto: 'Mensual 2 días/semana — septiembre', importe: 65, estado: 'no-se-pudo', vence: '28 ago', nota: '3 intentos con la tarjeta' }],
    medio: { tipo: 'tarjeta', texto: 'Tarjeta ··0077 · caduca 05/2027' },
  },
  {
    nombre: 'Raquel Gil Navarro', ini: 'RG', tono: 2, desde: '25 sep', dias: 7,
    recibos: [{ concepto: 'Bono 10 clases — octubre', importe: 130, estado: 'no-se-pudo', vence: '25 sep', nota: '1 intento con la tarjeta' }],
    medio: { tipo: 'tarjeta', texto: 'Tarjeta ··1881 · caduca 03/2028' },
    solo: 'Se reintenta sola el lunes 5 oct',
  },
  {
    nombre: 'Cristina Ortega Gil', ini: 'CO', tono: 3, desde: '24 sep', dias: 8,
    recibos: [{ concepto: 'Mensual ilimitado — octubre', importe: 89, estado: 'sin-cobrar', vence: '24 sep' }],
    medio: { tipo: 'nada', texto: 'Sin tarjeta ni domiciliación' },
  },
  {
    nombre: 'Nuria Díaz Ruiz', ini: 'ND', tono: 4, desde: '27 sep', dias: 5,
    recibos: [{ concepto: 'Mensual ilimitado — octubre', importe: 89, estado: 'sin-cobrar', vence: '27 sep' }],
    medio: { tipo: 'mandato', texto: 'Domiciliación (mandato firmado)' },
    solo: 'Entra en la próxima remesa',
  },
  {
    nombre: 'Marta Ruiz López', ini: 'MR', tono: 0, desde: '28 sep', dias: 4,
    recibos: [{ concepto: 'Bono 10 clases — octubre', importe: 130, estado: 'sin-cobrar', vence: '28 sep' }],
    medio: { tipo: 'nada', texto: 'Sin tarjeta ni domiciliación' },
  },
  {
    nombre: 'Lorena Díaz Ruiz', ini: 'LD', tono: 1, desde: '28 sep', dias: 4,
    recibos: [{ concepto: 'Clase suelta — Barre, lun 28 sep 18:00', importe: 15, estado: 'sin-cobrar', vence: '28 sep' }],
    medio: { tipo: 'nada', texto: 'Sin tarjeta ni domiciliación' },
  },
];

export const EN_EL_BANCO = { nombre: 'Sara Torres Moreno', ini: 'ST', concepto: 'Mensual 2 días/semana — octubre', importe: 65, enviado: 'Remesa del 29 sep', cargo: 'Se carga el 4 oct' };

export const totalDeuda = (d: Deudora) => d.recibos.reduce((a, r) => a + r.importe, 0);
export const TE_DEBEN = DEUDORAS.reduce((a, d) => a + totalDeuda(d), 0); // 696
export const N_RECIBOS = DEUDORAS.reduce((a, d) => a + d.recibos.length, 0); // 8

// ─── Lo que he cobrado: octubre hasta hoy (1-2 oct) ──────────────────────────
export const METODOS = [
  { metodo: 'Domiciliación', n: 6, total: 534 },
  { metodo: 'Tarjeta online', n: 4, total: 356 },
  { metodo: 'Tarjeta en el mostrador', n: 3, total: 219 },
  { metodo: 'Efectivo', n: 4, total: 110 },
  { metodo: 'Bizum', n: 2, total: 50 },
  { metodo: 'Transferencia', n: 1, total: 30 },
];
export const DEVUELTO_OCT = 15;
export const COBRADO_OCT = METODOS.reduce((a, m) => a + m.total, 0) - DEVUELTO_OCT; // 1.284
export const COBRADO_SEP_A_ESTAS_ALTURAS = 1190;

export const COBROS_HOY = [
  { hora: '12:40', nombre: 'Paula Romero', concepto: 'Clase suelta — Reformer, vie 2 oct 13:00', importe: 15, metodo: 'Efectivo' },
  { hora: '11:05', nombre: 'Alba García', concepto: 'Bono 5 clases', importe: 70, metodo: 'Tarjeta en el mostrador' },
  { hora: '10:32', nombre: 'Paula Romero', concepto: 'Devuelto: Clase suelta — Mat, jue 1 oct', importe: -15, metodo: 'Efectivo' },
  { hora: '09:58', nombre: 'Irene Martín', concepto: 'Calcetines antideslizantes', importe: 12, metodo: 'Bizum' },
  { hora: '09:10', nombre: 'Elena Navarro', concepto: 'Mensual ilimitado — octubre', importe: 89, metodo: 'Tarjeta online' },
];

// ─── Informes: septiembre, mes cerrado ───────────────────────────────────────
export const MES = { nombre: 'Septiembre', cobrado: 4420, anterior: 4110, activas: 64, activasAntes: 59, ocupacion: 72, ocupacionAntes: 68 };
export const VENTAS_TIPO = [
  { tipo: 'Cuotas', n: 30, total: 2670, antes: 2580 },
  { tipo: 'Bonos', n: 8, total: 1040, antes: 910 },
  { tipo: 'Clases sueltas', n: 15, total: 225, antes: 180 },
  { tipo: 'Sesiones privadas', n: 4, total: 260, antes: 260 },
  { tipo: 'Caja (productos)', n: 11, total: 135, antes: 120 },
  { tipo: 'Otros', n: 3, total: 90, antes: 60 },
]; // suma 4.420
export const CLASES = [
  { tipo: 'Reformer', color: '#F7A6C4', sesiones: 48, ocupacion: 84, ingreso: 2310, coste: 1180, equilibrio: 3 },
  { tipo: 'Mat', color: '#7FB2E5', sesiones: 36, ocupacion: 60, ingreso: 1240, coste: 720, equilibrio: 4 },
  { tipo: 'Prenatal', color: '#E8B45C', sesiones: 8, ocupacion: 70, ingreso: 280, coste: 200, equilibrio: 3 },
  { tipo: 'Barre', color: '#8FC98A', sesiones: 12, ocupacion: 55, ingreso: 360, coste: 300, equilibrio: 5, aviso: 'Martes 20:00 no llega al equilibrio' },
];
export const FRANJAS_BARRE = [
  { franja: 'Lunes 18:00', ocupacion: 75, margen: 46 },
  { franja: 'Martes 20:00', ocupacion: 30, margen: -18 },
  { franja: 'Jueves 18:00', ocupacion: 62, margen: 32 },
];
export const COHORTES = [
  { mes: 'Junio', empezaron: 11, segundo: 82, tercero: 64 },
  { mes: 'Julio', empezaron: 7, segundo: 71, tercero: 57 },
  { mes: 'Agosto', empezaron: 6, segundo: 67, tercero: null },
  { mes: 'Septiembre', empezaron: 9, segundo: null, tercero: null },
];
export const LAS_QUE_MAS_VIENEN = [
  { nombre: 'María García Sánchez', ini: 'MG', clases: 14 },
  { nombre: 'Laura Martín Díaz', ini: 'LM', clases: 12 },
  { nombre: 'Carmen López Martín', ini: 'CL', clases: 11 },
  { nombre: 'Alba García Sánchez', ini: 'AG', clases: 10 },
  { nombre: 'Irene Martín Díaz', ini: 'IM', clases: 9 },
];
// Cobrado por día en septiembre (las cuotas entran al principio del mes).
export const POR_DIA = [1180, 765, 320, 90, 60, 140, 75, 120, 95, 60, 130, 45, 0, 85, 110, 70, 95, 140, 60, 0, 75, 90, 120, 65, 85, 70, 0, 95, 120, 60];
export const POR_DIA_ANTES = [1130, 740, 240, 70, 90, 110, 60, 100, 85, 70, 110, 40, 0, 95, 90, 75, 80, 120, 50, 0, 60, 85, 110, 70, 75, 65, 0, 80, 100, 60, 50];

// `useGrouping: 'always'`: en es-ES el 1284 sale sin punto (agrupa desde 5 cifras), y arriba pone 1.284.
export const eur = (n: number, dec = false) => `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('es-ES', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0, useGrouping: 'always' } as Intl.NumberFormatOptions)} €`;
