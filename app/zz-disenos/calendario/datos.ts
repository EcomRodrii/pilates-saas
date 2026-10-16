// TEMPORAL — datos de las maquetas del Calendario (1-oct-2026). No se commitea.
// La misma semana que las capturas del «antes», con «ahora» = jueves 1 a las 10:40.

export type TipoId = 'reformer' | 'mat' | 'barre' | 'prenatal';
export const TIPOS: Record<TipoId, { nombre: string; color: string }> = {
  reformer: { nombre: 'Reformer', color: '#F7A6C4' },
  mat: { nombre: 'Mat', color: '#7FB2E5' },
  barre: { nombre: 'Barre', color: '#8FC98A' },
  prenatal: { nombre: 'Prenatal', color: '#E8B45C' },
};

export type Marca =
  | { tipo: 'sin-cubrir'; texto: string }
  | { tipo: 'buscando'; texto: string }
  | { tipo: 'pasar-lista' }
  | { tipo: 'lista-pasada'; vinieron: number }
  | { tipo: 'en-curso' }
  | { tipo: 'siguiente'; texto: string }
  | { tipo: 'floja' }
  | { tipo: 'incidencia'; texto: string }
  | { tipo: 'cancelada' };

export interface Clase {
  id: string;
  hora: string;
  fin: string;
  tipo: TipoId;
  sala: 'Reformer' | 'Mat';
  instructora: string;
  apuntadas: number;
  aforo: number;
  fijas: number;
  espera: number;
  serie?: boolean;
  marca?: Marca;
  pasada?: boolean;
}

export interface Dia {
  corto: string;
  num: number;
  largo: string;
  hoy?: boolean;
  clases: Clase[];
}

const base = (id: string, hora: string, fin: string, tipo: TipoId, sala: Clase['sala'], instructora: string, apuntadas: number, fijas: number, extra: Partial<Clase> = {}): Clase => ({
  id, hora, fin, tipo, sala, instructora, apuntadas, aforo: sala === 'Reformer' ? 6 : 12, fijas, espera: 0, serie: true, ...extra,
});

function laborable(p: string, o: Partial<Record<string, Partial<Clase>>> = {}): Clase[] {
  return [
    base(`${p}-0800`, '08:00', '08:50', 'reformer', 'Reformer', 'Cloe', 5, 3, o['0800']),
    base(`${p}-0900`, '09:00', '09:50', 'mat', 'Mat', 'Irene Sanz', 8, 4, o['0900']),
    base(`${p}-0915`, '09:15', '10:05', 'reformer', 'Reformer', 'Marta Ruiz', 4, 2, o['0915']),
    base(`${p}-1030`, '10:30', '11:20', 'reformer', 'Reformer', 'Marta Ruiz', 6, 4, o['1030']),
    base(`${p}-1100`, '11:00', '11:50', 'prenatal', 'Mat', 'Irene Sanz', 7, 3, o['1100']),
    base(`${p}-1800`, '18:00', '18:50', 'reformer', 'Reformer', 'Lucía Gómez', 5, 3, o['1800']),
    base(`${p}-1830`, '18:30', '19:15', 'barre', 'Mat', 'Irene Sanz', 7, 2, o['1830']),
    base(`${p}-1915`, '19:15', '20:05', 'reformer', 'Reformer', 'Lucía Gómez', 6, 4, o['1915']),
    base(`${p}-1945`, '19:45', '20:35', 'mat', 'Mat', 'Marta Ruiz', 9, 5, o['1945']),
    base(`${p}-2030`, '20:30', '21:20', 'reformer', 'Reformer', 'Cloe', 4, 2, o['2030']),
  ];
}

export const SEMANA: Dia[] = [
  {
    corto: 'Jue', num: 1, largo: 'Jueves 1', hoy: true, clases: laborable('jue', {
      '0800': { pasada: true, marca: { tipo: 'lista-pasada', vinieron: 5 } },
      '0900': { pasada: true, apuntadas: 6, marca: { tipo: 'pasar-lista' } },
      '0915': { pasada: true, apuntadas: 3, marca: { tipo: 'pasar-lista' } },
      '1030': { marca: { tipo: 'en-curso' } },
      '1100': { apuntadas: 9, marca: { tipo: 'siguiente', texto: 'en 20 min' } },
      '1830': { apuntadas: 3, marca: { tipo: 'floja' } },
      '1915': { espera: 2 },
    }),
  },
  {
    corto: 'Vie', num: 2, largo: 'Viernes 2', clases: laborable('vie', {
      '0915': { apuntadas: 6, espera: 1 },
      '1800': { marca: { tipo: 'sin-cubrir', texto: 'vacaciones' } },
      '2030': { apuntadas: 2 },
    }),
  },
  {
    corto: 'Sáb', num: 3, largo: 'Sábado 3', clases: [
      base('sab-0900', '09:00', '09:50', 'mat', 'Mat', 'Irene Sanz', 11, 6),
      base('sab-0915', '09:15', '10:05', 'reformer', 'Reformer', 'Marta Ruiz', 6, 3, { marca: { tipo: 'incidencia', texto: 'Reformer 3 sin muelle' } }),
      base('sab-1030', '10:30', '11:20', 'reformer', 'Reformer', 'Marta Ruiz', 5, 2),
      base('sab-1100', '11:00', '11:50', 'prenatal', 'Mat', 'Irene Sanz', 6, 4),
    ],
  },
  { corto: 'Dom', num: 4, largo: 'Domingo 4', clases: [] },
  {
    corto: 'Lun', num: 5, largo: 'Lunes 5', clases: laborable('lun', {
      '2030': { apuntadas: 1, marca: { tipo: 'floja' } },
      '1915': { apuntadas: 5 },
    }),
  },
  {
    corto: 'Mar', num: 6, largo: 'Martes 6', clases: laborable('mar', {
      '1100': { apuntadas: 2, marca: { tipo: 'floja' } },
      '1915': { marca: { tipo: 'buscando', texto: 'Lucía avisó: enferma · 2 avisadas' } },
    }),
  },
  {
    corto: 'Mié', num: 7, largo: 'Miércoles 7', clases: laborable('mie', {
      '2030': { marca: { tipo: 'cancelada' }, apuntadas: 0 },
      '0800': { apuntadas: 6, espera: 1 },
    }),
  },
];

// Alumnas de la clase en curso (jueves 10:30 Reformer, 6/6).
export interface Alumna {
  ini: string;
  nombre: string;
  maquina?: string;
  etiquetas: { texto: string; tono?: 'info' | 'warning' | 'brand' | 'muted' }[];
  salud?: boolean;
  llego?: boolean;
  noVino?: boolean;
}

export const EN_CURSO: Alumna[] = [
  { ini: 'MG', nombre: 'María García', maquina: 'Reformer 1', etiquetas: [{ texto: 'Plaza fija', tono: 'brand' }], llego: true },
  { ini: 'LM', nombre: 'Laura Martín', maquina: 'Reformer 2', etiquetas: [{ texto: 'Plaza fija', tono: 'brand' }], llego: true, salud: true },
  { ini: 'CL', nombre: 'Carmen López', maquina: 'Reformer 3', etiquetas: [{ texto: 'De prueba', tono: 'info' }] },
  { ini: 'PR', nombre: 'Paula Romero', maquina: 'Reformer 4', etiquetas: [{ texto: 'Le queda 1 sesión', tono: 'warning' }], llego: true },
  { ini: 'EN', nombre: 'Elena Navarro', maquina: 'Reformer 5', etiquetas: [{ texto: 'Recupera', tono: 'muted' }] },
  { ini: 'ST', nombre: 'Sara Torres', maquina: 'Reformer 6', etiquetas: [{ texto: 'ClassPass', tono: 'muted' }], llego: true },
];

// Jueves 09:00 Mat, ya terminada y sin pasar lista.
export const PASADA: Alumna[] = [
  { ini: 'NR', nombre: 'Nuria Ruiz', etiquetas: [{ texto: 'Plaza fija', tono: 'brand' }] },
  { ini: 'JD', nombre: 'Julia Díaz', etiquetas: [{ texto: 'Plaza fija', tono: 'brand' }] },
  { ini: 'RM', nombre: 'Raquel Moreno', etiquetas: [], noVino: true },
  { ini: 'CG', nombre: 'Cristina Gil', etiquetas: [{ texto: 'Bono · 3 sesiones', tono: 'muted' }] },
  { ini: 'AO', nombre: 'Alba Ortega', etiquetas: [{ texto: 'Plaza fija', tono: 'brand' }] },
  { ini: 'IS', nombre: 'Irene Sánchez', etiquetas: [{ texto: 'De prueba', tono: 'info' }] },
];
