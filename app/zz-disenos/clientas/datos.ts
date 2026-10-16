// TEMPORAL — datos inventados para las maquetas. No se commitea.
import type { Estado } from './comun';

export interface FilaClienta {
  id: string; nombre: string; ini: string; tel: string; estado: Estado; desde: string;
  plan: string; saldo?: string; ultima: string; proxima?: string; senal?: string; dinero?: boolean;
}

export const CLIENTAS: FilaClienta[] = [
  { id: 'c1', nombre: 'Carmen Del Río', ini: 'CR', tel: '600 111 201', estado: 'activa', desde: 'desde mar 2025', plan: 'Mensual 2×/semana', saldo: 'Renueva el 12 oct', ultima: 'hace 3 semanas', senal: 'Viene menos' },
  { id: 'c2', nombre: 'María García', ini: 'MG', tel: '600 111 202', estado: 'prueba', desde: 'vino el 26 sep', plan: 'Clase de prueba', saldo: 'Usada', ultima: 'hace 5 días', senal: 'Prueba sin comprar' },
  { id: 'c3', nombre: 'Laura Martín', ini: 'LM', tel: '600 111 203', estado: 'activa', desde: 'desde ene 2024', plan: 'Mensual ilimitado', saldo: 'Renueva el 21 oct', ultima: 'ayer', proxima: 'jue 18:00' },
  { id: 'c4', nombre: 'Elena Ruiz', ini: 'ER', tel: '600 111 204', estado: 'activa', desde: 'nueva · hace 9 días', plan: 'Bono 10 clases', saldo: 'Quedan 9', ultima: 'hace 8 días', senal: 'Arranque flojo' },
  { id: 'c5', nombre: 'Ana Torres', ini: 'AT', tel: '600 111 205', estado: 'activa', desde: 'desde jun 2025', plan: 'Mensual 2×/semana', saldo: 'Octubre sin cobrar', ultima: 'hoy', proxima: 'vie 9:30', senal: 'Recibo sin cobrar', dinero: true },
  { id: 'c6', nombre: 'Lucía Fernández', ini: 'LF', tel: '600 111 206', estado: 'sin-renovar', desde: 'hace 12 días', plan: 'Bono 10 clases', saldo: 'Agotado el 19 sep', ultima: 'hace 12 días' },
  { id: 'c7', nombre: 'Irene Castro', ini: 'IC', tel: '600 111 207', estado: 'activa', desde: 'desde abr 2025', plan: 'Bono 10 clases', saldo: 'Quedan 2 · caduca el 30 oct', ultima: 'hace 2 días', proxima: 'mañana 19:00' },
  { id: 'c8', nombre: 'Sofía Navarro', ini: 'SN', tel: '600 111 208', estado: 'pausada', desde: 'hasta el 15 oct', plan: 'Mensual 2×/semana', saldo: 'Pausada por lesión', ultima: 'hace 3 semanas' },
  { id: 'c9', nombre: 'Paula Gil', ini: 'PG', tel: '600 111 209', estado: 'inactiva', desde: 'hace 4 meses', plan: '—', ultima: 'hace 4 meses' },
  { id: 'c10', nombre: 'Bea Ortega', ini: 'BO', tel: '600 111 210', estado: 'baja', desde: 'se mudó · 2 sep', plan: '—', ultima: 'hace 1 mes' },
];

export const CONTEOS: [Estado | 'todas', number][] = [
  ['todas', 246], ['activa', 142], ['prueba', 4], ['sin-renovar', 11], ['pausada', 3], ['inactiva', 65], ['baja', 21],
];
