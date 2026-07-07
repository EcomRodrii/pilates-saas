import type {
  Studio, Socio, PlanTarifa, Suscripcion, Sala, Spot,
  TipoClase, Instructor, Sesion, Reserva, Recibo, Factura,
  AutomationRule, AutomationLog, NotaProgreso,
} from './types';

export const studio: Studio = {
  id: 'studio-1',
  nombre: 'Tentare',
  nif: 'B12345678',
  razonSocial: 'Tentare SL',
  direccion: 'Calle Larios 12, 2º',
  ciudad: 'Málaga',
  codigoPostal: '29005',
  email: 'hola@tentare.es',
  telefono: '+34 951 000 000',
  colorPrimario: '#6366f1',
  plan: 'ESTUDIO',
  avatarAdmin: null,
  ownerAuthUserId: null,
  slug: 'tentare',
  creadoEn: '2024-01-15T10:00:00Z',
  stripeAccountId: null,
};

export const socios: Socio[] = [
  { id: 'soc-1', studioId: 'studio-1', nombre: 'Laura', apellidos: 'Martínez García', email: 'laura@email.com', telefono: '+34 600 111 222', nif: '12345678A', fechaAlta: '2026-01-10T00:00:00Z', activo: true, aceptacionContrato: { fecha: '2026-01-10T11:32:00Z', firma: 'Laura Martínez García', versionTexto: 'v1.0' } },
  { id: 'soc-2', studioId: 'studio-1', nombre: 'Carmen', apellidos: 'López Ruiz', email: 'carmen@email.com', telefono: '+34 600 333 444', nif: '23456789B', fechaAlta: '2026-02-03T00:00:00Z', activo: true, aceptacionContrato: { fecha: '2026-02-03T10:15:00Z', firma: 'Carmen López Ruiz', versionTexto: 'v1.0' } },
  { id: 'soc-3', studioId: 'studio-1', nombre: 'Ana', apellidos: 'Fernández Torres', email: 'ana@email.com', telefono: null, nif: null, fechaAlta: '2026-02-20T00:00:00Z', activo: true, aceptacionContrato: { fecha: '2026-02-20T09:50:00Z', firma: 'Ana Fernández Torres', versionTexto: 'v1.0' } },
  { id: 'soc-4', studioId: 'studio-1', nombre: 'Isabel', apellidos: 'González Díaz', email: 'isabel@email.com', telefono: '+34 600 555 666', nif: '45678901D', fechaAlta: '2026-03-12T00:00:00Z', activo: true, aceptacionContrato: { fecha: '2026-03-12T18:02:00Z', firma: 'Isabel González Díaz', versionTexto: 'v1.1' } },
  { id: 'soc-5', studioId: 'studio-1', nombre: 'Marta', apellidos: 'Sánchez Moreno', email: 'marta@email.com', telefono: '+34 600 777 888', nif: null, fechaAlta: '2026-03-28T00:00:00Z', activo: true, aceptacionContrato: { fecha: '2026-03-28T17:45:00Z', firma: 'Marta Sánchez Moreno', versionTexto: 'v1.1' } },
  { id: 'soc-6', studioId: 'studio-1', nombre: 'Sofía', apellidos: 'Ramírez Castro', email: 'sofia@email.com', telefono: null, nif: '67890123F', fechaAlta: '2026-04-14T00:00:00Z', activo: false, aceptacionContrato: { fecha: '2026-04-14T10:30:00Z', firma: 'Sofía Ramírez Castro', versionTexto: 'v1.1' } },
  { id: 'soc-7', studioId: 'studio-1', nombre: 'Elena', apellidos: 'Jiménez Navarro', email: 'elena@email.com', telefono: '+34 600 999 000', nif: null, fechaAlta: '2026-04-28T00:00:00Z', activo: true },
  { id: 'soc-8', studioId: 'studio-1', nombre: 'Patricia', apellidos: 'Romero Vega', email: 'patricia@email.com', telefono: '+34 600 111 333', nif: '89012345H', fechaAlta: '2026-05-19T00:00:00Z', activo: true },
];

export const planesTarifa: PlanTarifa[] = [
  { id: 'plan-1', studioId: 'studio-1', nombre: 'Mensual Ilimitado', descripcion: 'Clases ilimitadas al mes', precio: 85, tipo: 'MENSUAL', sesiones: null, activo: true },
  { id: 'plan-2', studioId: 'studio-1', nombre: 'Bono 8 clases', descripcion: 'Válido 3 meses', precio: 64, tipo: 'BONO', sesiones: 8, activo: true },
  { id: 'plan-3', studioId: 'studio-1', nombre: 'Bono 4 clases', descripcion: 'Válido 2 meses', precio: 36, tipo: 'BONO', sesiones: 4, activo: true },
  { id: 'plan-4', studioId: 'studio-1', nombre: 'Clase suelta', descripcion: null, precio: 12, tipo: 'PUNTUAL', sesiones: 1, activo: true },
];

export const suscripciones: Suscripcion[] = [
  { id: 'sus-1', studioId: 'studio-1', socioId: 'soc-1', planId: 'plan-1', estado: 'ACTIVA', fechaInicio: '2026-06-01T00:00:00Z', fechaFin: '2026-07-01T00:00:00Z', sesionesRestantes: null, stripeSubscriptionId: null },
  { id: 'sus-2', studioId: 'studio-1', socioId: 'soc-2', planId: 'plan-2', estado: 'ACTIVA', fechaInicio: '2026-06-01T00:00:00Z', fechaFin: '2026-09-01T00:00:00Z', sesionesRestantes: 5, stripeSubscriptionId: null },
  { id: 'sus-3', studioId: 'studio-1', socioId: 'soc-3', planId: 'plan-1', estado: 'ACTIVA', fechaInicio: '2026-05-01T00:00:00Z', fechaFin: '2026-07-08T00:00:00Z', sesionesRestantes: null, stripeSubscriptionId: null },
  { id: 'sus-4', studioId: 'studio-1', socioId: 'soc-4', planId: 'plan-2', estado: 'ACTIVA', fechaInicio: '2026-06-15T00:00:00Z', fechaFin: '2026-09-15T00:00:00Z', sesionesRestantes: 3, stripeSubscriptionId: null },
  { id: 'sus-5', studioId: 'studio-1', socioId: 'soc-5', planId: 'plan-1', estado: 'ACTIVA', fechaInicio: '2026-06-01T00:00:00Z', fechaFin: '2026-07-15T00:00:00Z', sesionesRestantes: null, stripeSubscriptionId: null },
  { id: 'sus-7', studioId: 'studio-1', socioId: 'soc-7', planId: 'plan-3', estado: 'ACTIVA', fechaInicio: '2026-07-01T00:00:00Z', fechaFin: '2026-09-01T00:00:00Z', sesionesRestantes: 2, stripeSubscriptionId: null },
  { id: 'sus-8', studioId: 'studio-1', socioId: 'soc-8', planId: 'plan-1', estado: 'ACTIVA', fechaInicio: '2026-06-10T00:00:00Z', fechaFin: '2026-07-10T00:00:00Z', sesionesRestantes: null, stripeSubscriptionId: null },
];

export const salas: Sala[] = [
  { id: 'sala-1', studioId: 'studio-1', nombre: 'Sala Reformer', capacidad: 8, color: '#6366f1' },
  { id: 'sala-2', studioId: 'studio-1', nombre: 'Sala Mat', capacidad: 12, color: '#10b981' },
];

// 8 reformers en 2 filas x 4 columnas
export const spots: Spot[] = [
  { id: 'spot-1', salaId: 'sala-1', studioId: 'studio-1', numero: 1, nombre: 'R1', fila: 0, columna: 0, tipo: 'REFORMER', activo: true },
  { id: 'spot-2', salaId: 'sala-1', studioId: 'studio-1', numero: 2, nombre: 'R2', fila: 0, columna: 1, tipo: 'REFORMER', activo: true },
  { id: 'spot-3', salaId: 'sala-1', studioId: 'studio-1', numero: 3, nombre: 'R3', fila: 0, columna: 2, tipo: 'REFORMER', activo: true },
  { id: 'spot-4', salaId: 'sala-1', studioId: 'studio-1', numero: 4, nombre: 'R4', fila: 0, columna: 3, tipo: 'REFORMER', activo: true },
  { id: 'spot-5', salaId: 'sala-1', studioId: 'studio-1', numero: 5, nombre: 'R5', fila: 1, columna: 0, tipo: 'REFORMER', activo: true },
  { id: 'spot-6', salaId: 'sala-1', studioId: 'studio-1', numero: 6, nombre: 'R6', fila: 1, columna: 1, tipo: 'REFORMER', activo: true },
  { id: 'spot-7', salaId: 'sala-1', studioId: 'studio-1', numero: 7, nombre: 'R7', fila: 1, columna: 2, tipo: 'REFORMER', activo: true },
  { id: 'spot-8', salaId: 'sala-1', studioId: 'studio-1', numero: 8, nombre: 'R8', fila: 1, columna: 3, tipo: 'REFORMER', activo: true },
];

export const tiposClase: TipoClase[] = [
  { id: 'tc-1', studioId: 'studio-1', nombre: 'Reformer Fundamental', color: '#1C1C28', duracionMinutos: 55, descripcion: 'Clase base en reformer', nivel: 'PRINCIPIANTE', fotoUrl: null },
  { id: 'tc-2', studioId: 'studio-1', nombre: 'Reformer Avanzado', color: '#C3D9B0', duracionMinutos: 55, descripcion: 'Para alumnas con experiencia', nivel: 'AVANZADO', fotoUrl: null },
  { id: 'tc-3', studioId: 'studio-1', nombre: 'Pilates Mat', color: '#C8C2E8', duracionMinutos: 60, descripcion: 'Trabajo en colchoneta', nivel: 'TODOS', fotoUrl: null },
  { id: 'tc-4', studioId: 'studio-1', nombre: 'Mat + Circuito', color: '#E8D5C2', duracionMinutos: 50, descripcion: 'Combinación mat y accesorios', nivel: 'MEDIO', fotoUrl: null },
];

export const instructores: Instructor[] = [
  { id: 'ins-1', studioId: 'studio-1', nombre: 'María Soler', email: 'maria@tentare.es', telefono: '+34 611 000 001', color: '#f59e0b', activo: true, rol: 'INSTRUCTOR', authUserId: null },
  { id: 'ins-2', studioId: 'studio-1', nombre: 'Julia Ramos', email: 'julia@tentare.es', telefono: '+34 611 000 002', color: '#ec4899', activo: true, rol: 'INSTRUCTOR', authUserId: null },
];

// Genera sesiones para esta semana
function weekDates() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function iso(date: Date, h: number, m = 0) {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const days = weekDates();

export const sesiones: Sesion[] = [
  // Lunes
  { id: 'ses-1', studioId: 'studio-1', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1', inicio: iso(days[0], 9), fin: iso(days[0], 9, 55), aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-2', studioId: 'studio-1', tipoClaseId: 'tc-3', salaId: 'sala-2', instructorId: 'ins-2', inicio: iso(days[0], 11), fin: iso(days[0], 12), aforoMaximo: 12, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-3', studioId: 'studio-1', tipoClaseId: 'tc-2', salaId: 'sala-1', instructorId: 'ins-1', inicio: iso(days[0], 18), fin: iso(days[0], 18, 55), aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  // Martes
  { id: 'ses-4', studioId: 'studio-1', tipoClaseId: 'tc-3', salaId: 'sala-2', instructorId: 'ins-2', inicio: iso(days[1], 10), fin: iso(days[1], 11), aforoMaximo: 12, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-5', studioId: 'studio-1', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1', inicio: iso(days[1], 17, 30), fin: iso(days[1], 18, 25), aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  // Miércoles
  { id: 'ses-6', studioId: 'studio-1', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-2', inicio: iso(days[2], 9), fin: iso(days[2], 9, 55), aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-7', studioId: 'studio-1', tipoClaseId: 'tc-4', salaId: 'sala-2', instructorId: 'ins-1', inicio: iso(days[2], 11), fin: iso(days[2], 11, 50), aforoMaximo: 12, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-8', studioId: 'studio-1', tipoClaseId: 'tc-2', salaId: 'sala-1', instructorId: 'ins-1', inicio: iso(days[2], 19), fin: iso(days[2], 19, 55), aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  // Jueves
  { id: 'ses-9', studioId: 'studio-1', tipoClaseId: 'tc-3', salaId: 'sala-2', instructorId: 'ins-2', inicio: iso(days[3], 10), fin: iso(days[3], 11), aforoMaximo: 12, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-10', studioId: 'studio-1', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1', inicio: iso(days[3], 18), fin: iso(days[3], 18, 55), aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  // Viernes
  { id: 'ses-11', studioId: 'studio-1', tipoClaseId: 'tc-2', salaId: 'sala-1', instructorId: 'ins-2', inicio: iso(days[4], 9), fin: iso(days[4], 9, 55), aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-12', studioId: 'studio-1', tipoClaseId: 'tc-3', salaId: 'sala-2', instructorId: 'ins-1', inicio: iso(days[4], 11), fin: iso(days[4], 12), aforoMaximo: 12, cancelada: false, notas: null, precioPuntual: null },
  // Sábado
  { id: 'ses-13', studioId: 'studio-1', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1', inicio: iso(days[5], 10), fin: iso(days[5], 10, 55), aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
];

export const reservas: Reserva[] = [
  // ses-1 (Lunes Reformer Fundamental): 6/8 plazas
  { id: 'res-1', studioId: 'studio-1', sesionId: 'ses-1', socioId: 'soc-1', estado: 'CONFIRMADA', spotId: 'spot-1', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-20T08:00:00Z' },
  { id: 'res-2', studioId: 'studio-1', sesionId: 'ses-1', socioId: 'soc-2', estado: 'CONFIRMADA', spotId: 'spot-2', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-20T08:05:00Z' },
  { id: 'res-3', studioId: 'studio-1', sesionId: 'ses-1', socioId: 'soc-3', estado: 'CONFIRMADA', spotId: 'spot-3', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-20T08:10:00Z' },
  { id: 'res-4', studioId: 'studio-1', sesionId: 'ses-1', socioId: 'soc-4', estado: 'CONFIRMADA', spotId: 'spot-5', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-20T08:15:00Z' },
  { id: 'res-5', studioId: 'studio-1', sesionId: 'ses-1', socioId: 'soc-5', estado: 'CONFIRMADA', spotId: 'spot-6', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-20T08:20:00Z' },
  { id: 'res-6', studioId: 'studio-1', sesionId: 'ses-1', socioId: 'soc-7', estado: 'CONFIRMADA', spotId: 'spot-7', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-20T08:25:00Z' },
  // ses-3 (Lunes Reformer Avanzado): lleno + 1 en espera
  { id: 'res-7', studioId: 'studio-1', sesionId: 'ses-3', socioId: 'soc-1', estado: 'CONFIRMADA', spotId: 'spot-1', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-20T10:00:00Z' },
  { id: 'res-8', studioId: 'studio-1', sesionId: 'ses-3', socioId: 'soc-2', estado: 'CONFIRMADA', spotId: 'spot-2', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-20T10:05:00Z' },
  { id: 'res-9', studioId: 'studio-1', sesionId: 'ses-3', socioId: 'soc-3', estado: 'CONFIRMADA', spotId: 'spot-3', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-20T10:10:00Z' },
  { id: 'res-10', studioId: 'studio-1', sesionId: 'ses-3', socioId: 'soc-4', estado: 'CONFIRMADA', spotId: 'spot-4', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-20T10:15:00Z' },
  { id: 'res-11', studioId: 'studio-1', sesionId: 'ses-3', socioId: 'soc-5', estado: 'CONFIRMADA', spotId: 'spot-5', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-20T10:20:00Z' },
  { id: 'res-12', studioId: 'studio-1', sesionId: 'ses-3', socioId: 'soc-7', estado: 'CONFIRMADA', spotId: 'spot-6', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-20T10:25:00Z' },
  { id: 'res-13', studioId: 'studio-1', sesionId: 'ses-3', socioId: 'soc-8', estado: 'CONFIRMADA', spotId: 'spot-7', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-20T10:30:00Z' },
  { id: 'res-14', studioId: 'studio-1', sesionId: 'ses-3', socioId: 'soc-1', estado: 'LISTA_ESPERA', spotId: null, posicionEspera: 1, checkInEn: null, creadoEn: '2026-06-20T10:35:00Z' },
  // ses-5 (Martes Reformer): 4/8
  { id: 'res-15', studioId: 'studio-1', sesionId: 'ses-5', socioId: 'soc-1', estado: 'CONFIRMADA', spotId: 'spot-2', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-21T09:00:00Z' },
  { id: 'res-16', studioId: 'studio-1', sesionId: 'ses-5', socioId: 'soc-3', estado: 'CONFIRMADA', spotId: 'spot-4', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-21T09:05:00Z' },
  { id: 'res-17', studioId: 'studio-1', sesionId: 'ses-5', socioId: 'soc-5', estado: 'CONFIRMADA', spotId: 'spot-6', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-21T09:10:00Z' },
  { id: 'res-18', studioId: 'studio-1', sesionId: 'ses-5', socioId: 'soc-8', estado: 'CONFIRMADA', spotId: 'spot-8', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-21T09:15:00Z' },
  // ses-2 (Lunes Pilates Mat): 7/12
  { id: 'res-19', studioId: 'studio-1', sesionId: 'ses-2', socioId: 'soc-1', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T10:00:00Z' },
  { id: 'res-20', studioId: 'studio-1', sesionId: 'ses-2', socioId: 'soc-2', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T10:05:00Z' },
  { id: 'res-21', studioId: 'studio-1', sesionId: 'ses-2', socioId: 'soc-3', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T10:10:00Z' },
  { id: 'res-22', studioId: 'studio-1', sesionId: 'ses-2', socioId: 'soc-4', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T10:15:00Z' },
  { id: 'res-23', studioId: 'studio-1', sesionId: 'ses-2', socioId: 'soc-5', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T10:20:00Z' },
  { id: 'res-24', studioId: 'studio-1', sesionId: 'ses-2', socioId: 'soc-7', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T10:25:00Z' },
  { id: 'res-25', studioId: 'studio-1', sesionId: 'ses-2', socioId: 'soc-8', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T10:30:00Z' },
  // ses-4 (Martes Pilates Mat): 5/12
  { id: 'res-26', studioId: 'studio-1', sesionId: 'ses-4', socioId: 'soc-2', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-27T10:00:00Z' },
  { id: 'res-27', studioId: 'studio-1', sesionId: 'ses-4', socioId: 'soc-3', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-27T10:05:00Z' },
  { id: 'res-28', studioId: 'studio-1', sesionId: 'ses-4', socioId: 'soc-5', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-27T10:10:00Z' },
  { id: 'res-29', studioId: 'studio-1', sesionId: 'ses-4', socioId: 'soc-7', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-27T10:15:00Z' },
  { id: 'res-30', studioId: 'studio-1', sesionId: 'ses-4', socioId: 'soc-8', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-27T10:20:00Z' },
  // ses-7 (Miércoles Mat+Circuito): 4/12
  { id: 'res-31', studioId: 'studio-1', sesionId: 'ses-7', socioId: 'soc-1', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T11:00:00Z' },
  { id: 'res-32', studioId: 'studio-1', sesionId: 'ses-7', socioId: 'soc-3', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T11:05:00Z' },
  { id: 'res-33', studioId: 'studio-1', sesionId: 'ses-7', socioId: 'soc-4', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T11:10:00Z' },
  { id: 'res-34', studioId: 'studio-1', sesionId: 'ses-7', socioId: 'soc-8', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T11:15:00Z' },
  // ses-9 (Jueves Pilates Mat): 6/12
  { id: 'res-35', studioId: 'studio-1', sesionId: 'ses-9', socioId: 'soc-1', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-28T10:00:00Z' },
  { id: 'res-36', studioId: 'studio-1', sesionId: 'ses-9', socioId: 'soc-2', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-28T10:05:00Z' },
  { id: 'res-37', studioId: 'studio-1', sesionId: 'ses-9', socioId: 'soc-3', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-28T10:10:00Z' },
  { id: 'res-38', studioId: 'studio-1', sesionId: 'ses-9', socioId: 'soc-5', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-28T10:15:00Z' },
  { id: 'res-39', studioId: 'studio-1', sesionId: 'ses-9', socioId: 'soc-7', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-28T10:20:00Z' },
  { id: 'res-40', studioId: 'studio-1', sesionId: 'ses-9', socioId: 'soc-8', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-28T10:25:00Z' },
  // ses-12 (Viernes Pilates Mat): 4/12
  { id: 'res-41', studioId: 'studio-1', sesionId: 'ses-12', socioId: 'soc-2', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-28T11:00:00Z' },
  { id: 'res-42', studioId: 'studio-1', sesionId: 'ses-12', socioId: 'soc-4', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-28T11:05:00Z' },
  { id: 'res-43', studioId: 'studio-1', sesionId: 'ses-12', socioId: 'soc-5', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-28T11:10:00Z' },
  { id: 'res-44', studioId: 'studio-1', sesionId: 'ses-12', socioId: 'soc-8', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-06-28T11:15:00Z' },
  // ses-6 (Miércoles Reformer Fundamental): 5/8
  { id: 'res-45', studioId: 'studio-1', sesionId: 'ses-6', socioId: 'soc-2', estado: 'CONFIRMADA', spotId: 'spot-2', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T09:00:00Z' },
  { id: 'res-46', studioId: 'studio-1', sesionId: 'ses-6', socioId: 'soc-3', estado: 'CONFIRMADA', spotId: 'spot-3', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T09:05:00Z' },
  { id: 'res-47', studioId: 'studio-1', sesionId: 'ses-6', socioId: 'soc-4', estado: 'CONFIRMADA', spotId: 'spot-4', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T09:10:00Z' },
  { id: 'res-48', studioId: 'studio-1', sesionId: 'ses-6', socioId: 'soc-5', estado: 'CONFIRMADA', spotId: 'spot-5', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T09:15:00Z' },
  { id: 'res-49', studioId: 'studio-1', sesionId: 'ses-6', socioId: 'soc-8', estado: 'CONFIRMADA', spotId: 'spot-6', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-26T09:20:00Z' },
  // ses-10 (Jueves Reformer Fundamental): 4/8
  { id: 'res-50', studioId: 'studio-1', sesionId: 'ses-10', socioId: 'soc-1', estado: 'CONFIRMADA', spotId: 'spot-1', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-27T09:00:00Z' },
  { id: 'res-51', studioId: 'studio-1', sesionId: 'ses-10', socioId: 'soc-3', estado: 'CONFIRMADA', spotId: 'spot-3', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-27T09:05:00Z' },
  { id: 'res-52', studioId: 'studio-1', sesionId: 'ses-10', socioId: 'soc-5', estado: 'CONFIRMADA', spotId: 'spot-5', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-27T09:10:00Z' },
  { id: 'res-53', studioId: 'studio-1', sesionId: 'ses-10', socioId: 'soc-7', estado: 'CONFIRMADA', spotId: 'spot-7', posicionEspera: null, checkInEn: null, creadoEn: '2026-06-27T09:15:00Z' },
];

const now = new Date();
const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

export const recibos: Recibo[] = [
  { id: 'rec-1', studioId: 'studio-1', socioId: 'soc-1', suscripcionId: 'sus-1', concepto: 'Mensual Ilimitado — Jun 2026', importe: 85, estado: 'COBRADO', fechaVencimiento: `${mes}-01`, fechaCobro: `${mes}-01`, fechaDevolucion: null, intentosReintento: 0 },
  { id: 'rec-2', studioId: 'studio-1', socioId: 'soc-2', suscripcionId: 'sus-2', concepto: 'Bono 8 clases — Jun 2026', importe: 64, estado: 'COBRADO', fechaVencimiento: `${mes}-01`, fechaCobro: `${mes}-01`, fechaDevolucion: null, intentosReintento: 0 },
  { id: 'rec-3', studioId: 'studio-1', socioId: 'soc-3', suscripcionId: 'sus-3', concepto: 'Mensual Ilimitado — Jun 2026', importe: 85, estado: 'COBRADO', fechaVencimiento: `${mes}-01`, fechaCobro: `${mes}-03`, fechaDevolucion: null, intentosReintento: 0 },
  { id: 'rec-4', studioId: 'studio-1', socioId: 'soc-4', suscripcionId: 'sus-4', concepto: 'Bono 8 clases — Jun 2026', importe: 64, estado: 'PENDIENTE', fechaVencimiento: `${mes}-15`, fechaCobro: null, fechaDevolucion: null, intentosReintento: 0 },
  { id: 'rec-5', studioId: 'studio-1', socioId: 'soc-5', suscripcionId: 'sus-5', concepto: 'Mensual Ilimitado — Jun 2026', importe: 85, estado: 'COBRADO', fechaVencimiento: `${mes}-01`, fechaCobro: `${mes}-01`, fechaDevolucion: null, intentosReintento: 0 },
  { id: 'rec-6', studioId: 'studio-1', socioId: 'soc-7', suscripcionId: 'sus-7', concepto: 'Bono 4 clases — Jun 2026', importe: 36, estado: 'DEVUELTO', fechaVencimiento: `${mes}-10`, fechaCobro: `${mes}-10`, fechaDevolucion: `${mes}-12`, intentosReintento: 0 },
  { id: 'rec-7', studioId: 'studio-1', socioId: 'soc-8', suscripcionId: 'sus-8', concepto: 'Mensual Ilimitado — Jun 2026', importe: 85, estado: 'PENDIENTE', fechaVencimiento: `${mes}-10`, fechaCobro: null, fechaDevolucion: null, intentosReintento: 0 },
];

export const facturas: Factura[] = [
  { id: 'fac-1', studioId: 'studio-1', reciboId: 'rec-1', numeroCompleto: 'A-2026-0021', fechaEmision: `${mes}-01T10:00:00Z`, receptorNombre: 'Laura Martínez García', receptorNIF: '12345678A', baseImponible: 70.25, tipoIVA: 21, cuotaIVA: 14.75, total: 85, verifactuHash: null },
  { id: 'fac-2', studioId: 'studio-1', reciboId: 'rec-2', numeroCompleto: 'A-2026-0022', fechaEmision: `${mes}-01T10:05:00Z`, receptorNombre: 'Carmen López Ruiz', receptorNIF: '23456789B', baseImponible: 52.89, tipoIVA: 21, cuotaIVA: 11.11, total: 64, verifactuHash: null },
  { id: 'fac-3', studioId: 'studio-1', reciboId: 'rec-3', numeroCompleto: 'A-2026-0023', fechaEmision: `${mes}-03T10:00:00Z`, receptorNombre: 'Ana Fernández Torres', receptorNIF: null, baseImponible: 70.25, tipoIVA: 21, cuotaIVA: 14.75, total: 85, verifactuHash: null },
  { id: 'fac-4', studioId: 'studio-1', reciboId: 'rec-5', numeroCompleto: 'A-2026-0024', fechaEmision: `${mes}-01T10:10:00Z`, receptorNombre: 'Marta Sánchez Moreno', receptorNIF: null, baseImponible: 70.25, tipoIVA: 21, cuotaIVA: 14.75, total: 85, verifactuHash: null },
];

// ── Sesiones y reservas históricas (11 semanas pasadas, métricas de asistencia) ─
// Cada entrada corresponde a una semana distinta dentro de la ventana de 12 semanas.
// Se usan miércoles para caer siempre en el centro del rango dom-sáb.
export const sesionesHistoricas: Sesion[] = [
  { id: 'ses-h01', studioId: 'studio-1', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-06-25T09:00:00Z', fin: '2026-06-25T09:55:00Z', aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-h02', studioId: 'studio-1', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-2', inicio: '2026-06-17T09:00:00Z', fin: '2026-06-17T09:55:00Z', aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-h03', studioId: 'studio-1', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-06-10T09:00:00Z', fin: '2026-06-10T09:55:00Z', aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-h04', studioId: 'studio-1', tipoClaseId: 'tc-2', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-06-03T18:00:00Z', fin: '2026-06-03T18:55:00Z', aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-h05', studioId: 'studio-1', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-2', inicio: '2026-05-27T09:00:00Z', fin: '2026-05-27T09:55:00Z', aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-h06', studioId: 'studio-1', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-05-20T09:00:00Z', fin: '2026-05-20T09:55:00Z', aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-h07', studioId: 'studio-1', tipoClaseId: 'tc-3', salaId: 'sala-2', instructorId: 'ins-2', inicio: '2026-05-13T10:00:00Z', fin: '2026-05-13T11:00:00Z', aforoMaximo: 12, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-h08', studioId: 'studio-1', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-05-06T09:00:00Z', fin: '2026-05-06T09:55:00Z', aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-h09', studioId: 'studio-1', tipoClaseId: 'tc-2', salaId: 'sala-1', instructorId: 'ins-2', inicio: '2026-04-29T09:00:00Z', fin: '2026-04-29T09:55:00Z', aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-h10', studioId: 'studio-1', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-04-22T09:00:00Z', fin: '2026-04-22T09:55:00Z', aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
  { id: 'ses-h11', studioId: 'studio-1', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-2', inicio: '2026-04-15T09:00:00Z', fin: '2026-04-15T09:55:00Z', aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null },
];

// soc-1 (Laura) asiste 10/11 semanas — muy constante
// soc-2 (Carmen) asiste 8/11
// soc-3 (Ana) asiste 7/11
// soc-5 (Marta) asiste 9/11
// soc-8 (Patricia) asiste 6/11
export const reservasHistoricas: Reserva[] = [
  // ses-h01 (Jun 25)
  { id: 'res-h01', studioId: 'studio-1', sesionId: 'ses-h01', socioId: 'soc-1', estado: 'ASISTIDA', spotId: 'spot-1', posicionEspera: null, checkInEn: '2026-06-25T08:58:00Z', creadoEn: '2026-06-22T10:00:00Z' },
  { id: 'res-h02', studioId: 'studio-1', sesionId: 'ses-h01', socioId: 'soc-2', estado: 'ASISTIDA', spotId: 'spot-2', posicionEspera: null, checkInEn: '2026-06-25T08:59:00Z', creadoEn: '2026-06-22T10:05:00Z' },
  { id: 'res-h03', studioId: 'studio-1', sesionId: 'ses-h01', socioId: 'soc-5', estado: 'ASISTIDA', spotId: 'spot-3', posicionEspera: null, checkInEn: '2026-06-25T09:02:00Z', creadoEn: '2026-06-22T10:10:00Z' },
  { id: 'res-h04', studioId: 'studio-1', sesionId: 'ses-h01', socioId: 'soc-8', estado: 'ASISTIDA', spotId: 'spot-4', posicionEspera: null, checkInEn: '2026-06-25T09:01:00Z', creadoEn: '2026-06-22T10:15:00Z' },
  // ses-h02 (Jun 17)
  { id: 'res-h05', studioId: 'studio-1', sesionId: 'ses-h02', socioId: 'soc-1', estado: 'ASISTIDA', spotId: 'spot-1', posicionEspera: null, checkInEn: '2026-06-17T08:57:00Z', creadoEn: '2026-06-14T09:00:00Z' },
  { id: 'res-h06', studioId: 'studio-1', sesionId: 'ses-h02', socioId: 'soc-3', estado: 'ASISTIDA', spotId: 'spot-2', posicionEspera: null, checkInEn: '2026-06-17T09:00:00Z', creadoEn: '2026-06-14T09:05:00Z' },
  { id: 'res-h07', studioId: 'studio-1', sesionId: 'ses-h02', socioId: 'soc-5', estado: 'ASISTIDA', spotId: 'spot-3', posicionEspera: null, checkInEn: '2026-06-17T09:03:00Z', creadoEn: '2026-06-14T09:10:00Z' },
  { id: 'res-h08', studioId: 'studio-1', sesionId: 'ses-h02', socioId: 'soc-2', estado: 'ASISTIDA', spotId: 'spot-4', posicionEspera: null, checkInEn: '2026-06-17T08:55:00Z', creadoEn: '2026-06-14T09:15:00Z' },
  // ses-h03 (Jun 10)
  { id: 'res-h09', studioId: 'studio-1', sesionId: 'ses-h03', socioId: 'soc-1', estado: 'ASISTIDA', spotId: 'spot-1', posicionEspera: null, checkInEn: '2026-06-10T08:59:00Z', creadoEn: '2026-06-07T09:00:00Z' },
  { id: 'res-h10', studioId: 'studio-1', sesionId: 'ses-h03', socioId: 'soc-2', estado: 'ASISTIDA', spotId: 'spot-2', posicionEspera: null, checkInEn: '2026-06-10T09:01:00Z', creadoEn: '2026-06-07T09:05:00Z' },
  { id: 'res-h11', studioId: 'studio-1', sesionId: 'ses-h03', socioId: 'soc-5', estado: 'ASISTIDA', spotId: 'spot-3', posicionEspera: null, checkInEn: '2026-06-10T09:00:00Z', creadoEn: '2026-06-07T09:10:00Z' },
  { id: 'res-h12', studioId: 'studio-1', sesionId: 'ses-h03', socioId: 'soc-8', estado: 'ASISTIDA', spotId: 'spot-4', posicionEspera: null, checkInEn: '2026-06-10T09:04:00Z', creadoEn: '2026-06-07T09:15:00Z' },
  // ses-h04 (Jun 3) — Laura no asistió
  { id: 'res-h13', studioId: 'studio-1', sesionId: 'ses-h04', socioId: 'soc-3', estado: 'ASISTIDA', spotId: 'spot-1', posicionEspera: null, checkInEn: '2026-06-03T17:59:00Z', creadoEn: '2026-05-31T09:00:00Z' },
  { id: 'res-h14', studioId: 'studio-1', sesionId: 'ses-h04', socioId: 'soc-5', estado: 'ASISTIDA', spotId: 'spot-2', posicionEspera: null, checkInEn: '2026-06-03T18:01:00Z', creadoEn: '2026-05-31T09:05:00Z' },
  { id: 'res-h15', studioId: 'studio-1', sesionId: 'ses-h04', socioId: 'soc-2', estado: 'ASISTIDA', spotId: 'spot-3', posicionEspera: null, checkInEn: '2026-06-03T18:00:00Z', creadoEn: '2026-05-31T09:10:00Z' },
  { id: 'res-h15b', studioId: 'studio-1', sesionId: 'ses-h04', socioId: 'soc-1', estado: 'NO_ASISTIO', spotId: 'spot-4', posicionEspera: null, checkInEn: null, creadoEn: '2026-05-31T09:15:00Z' },
  // ses-h05 (May 27)
  { id: 'res-h16', studioId: 'studio-1', sesionId: 'ses-h05', socioId: 'soc-1', estado: 'ASISTIDA', spotId: 'spot-1', posicionEspera: null, checkInEn: '2026-05-27T08:58:00Z', creadoEn: '2026-05-24T09:00:00Z' },
  { id: 'res-h17', studioId: 'studio-1', sesionId: 'ses-h05', socioId: 'soc-3', estado: 'ASISTIDA', spotId: 'spot-2', posicionEspera: null, checkInEn: '2026-05-27T09:00:00Z', creadoEn: '2026-05-24T09:05:00Z' },
  { id: 'res-h18', studioId: 'studio-1', sesionId: 'ses-h05', socioId: 'soc-8', estado: 'ASISTIDA', spotId: 'spot-3', posicionEspera: null, checkInEn: '2026-05-27T09:02:00Z', creadoEn: '2026-05-24T09:10:00Z' },
  // ses-h06 (May 20)
  { id: 'res-h19', studioId: 'studio-1', sesionId: 'ses-h06', socioId: 'soc-1', estado: 'ASISTIDA', spotId: 'spot-1', posicionEspera: null, checkInEn: '2026-05-20T08:55:00Z', creadoEn: '2026-05-17T09:00:00Z' },
  { id: 'res-h20', studioId: 'studio-1', sesionId: 'ses-h06', socioId: 'soc-2', estado: 'ASISTIDA', spotId: 'spot-2', posicionEspera: null, checkInEn: '2026-05-20T09:00:00Z', creadoEn: '2026-05-17T09:05:00Z' },
  { id: 'res-h21', studioId: 'studio-1', sesionId: 'ses-h06', socioId: 'soc-5', estado: 'ASISTIDA', spotId: 'spot-3', posicionEspera: null, checkInEn: '2026-05-20T09:01:00Z', creadoEn: '2026-05-17T09:10:00Z' },
  // ses-h07 (May 13)
  { id: 'res-h22', studioId: 'studio-1', sesionId: 'ses-h07', socioId: 'soc-1', estado: 'ASISTIDA', spotId: 'spot-1', posicionEspera: null, checkInEn: '2026-05-13T09:58:00Z', creadoEn: '2026-05-10T09:00:00Z' },
  { id: 'res-h23', studioId: 'studio-1', sesionId: 'ses-h07', socioId: 'soc-3', estado: 'ASISTIDA', spotId: 'spot-2', posicionEspera: null, checkInEn: '2026-05-13T10:00:00Z', creadoEn: '2026-05-10T09:05:00Z' },
  { id: 'res-h24', studioId: 'studio-1', sesionId: 'ses-h07', socioId: 'soc-8', estado: 'ASISTIDA', spotId: 'spot-3', posicionEspera: null, checkInEn: '2026-05-13T10:02:00Z', creadoEn: '2026-05-10T09:10:00Z' },
  // ses-h08 (May 6)
  { id: 'res-h25', studioId: 'studio-1', sesionId: 'ses-h08', socioId: 'soc-1', estado: 'ASISTIDA', spotId: 'spot-1', posicionEspera: null, checkInEn: '2026-05-06T08:59:00Z', creadoEn: '2026-05-03T09:00:00Z' },
  { id: 'res-h26', studioId: 'studio-1', sesionId: 'ses-h08', socioId: 'soc-2', estado: 'ASISTIDA', spotId: 'spot-2', posicionEspera: null, checkInEn: '2026-05-06T09:01:00Z', creadoEn: '2026-05-03T09:05:00Z' },
  { id: 'res-h27', studioId: 'studio-1', sesionId: 'ses-h08', socioId: 'soc-5', estado: 'ASISTIDA', spotId: 'spot-3', posicionEspera: null, checkInEn: '2026-05-06T09:00:00Z', creadoEn: '2026-05-03T09:10:00Z' },
  // ses-h09 (Apr 29)
  { id: 'res-h28', studioId: 'studio-1', sesionId: 'ses-h09', socioId: 'soc-1', estado: 'ASISTIDA', spotId: 'spot-1', posicionEspera: null, checkInEn: '2026-04-29T08:57:00Z', creadoEn: '2026-04-26T09:00:00Z' },
  { id: 'res-h29', studioId: 'studio-1', sesionId: 'ses-h09', socioId: 'soc-3', estado: 'ASISTIDA', spotId: 'spot-2', posicionEspera: null, checkInEn: '2026-04-29T09:00:00Z', creadoEn: '2026-04-26T09:05:00Z' },
  { id: 'res-h30', studioId: 'studio-1', sesionId: 'ses-h09', socioId: 'soc-2', estado: 'ASISTIDA', spotId: 'spot-3', posicionEspera: null, checkInEn: '2026-04-29T08:58:00Z', creadoEn: '2026-04-26T09:10:00Z' },
  // ses-h10 (Apr 22)
  { id: 'res-h31', studioId: 'studio-1', sesionId: 'ses-h10', socioId: 'soc-1', estado: 'ASISTIDA', spotId: 'spot-1', posicionEspera: null, checkInEn: '2026-04-22T08:55:00Z', creadoEn: '2026-04-19T09:00:00Z' },
  { id: 'res-h32', studioId: 'studio-1', sesionId: 'ses-h10', socioId: 'soc-5', estado: 'ASISTIDA', spotId: 'spot-2', posicionEspera: null, checkInEn: '2026-04-22T09:01:00Z', creadoEn: '2026-04-19T09:05:00Z' },
  { id: 'res-h33', studioId: 'studio-1', sesionId: 'ses-h10', socioId: 'soc-8', estado: 'ASISTIDA', spotId: 'spot-3', posicionEspera: null, checkInEn: '2026-04-22T09:03:00Z', creadoEn: '2026-04-19T09:10:00Z' },
  // ses-h11 (Apr 15) — Laura asiste
  { id: 'res-h34', studioId: 'studio-1', sesionId: 'ses-h11', socioId: 'soc-1', estado: 'ASISTIDA', spotId: 'spot-1', posicionEspera: null, checkInEn: '2026-04-15T08:59:00Z', creadoEn: '2026-04-12T09:00:00Z' },
  { id: 'res-h35', studioId: 'studio-1', sesionId: 'ses-h11', socioId: 'soc-2', estado: 'ASISTIDA', spotId: 'spot-2', posicionEspera: null, checkInEn: '2026-04-15T09:00:00Z', creadoEn: '2026-04-12T09:05:00Z' },
  { id: 'res-h36', studioId: 'studio-1', sesionId: 'ses-h11', socioId: 'soc-3', estado: 'ASISTIDA', spotId: 'spot-3', posicionEspera: null, checkInEn: '2026-04-15T09:02:00Z', creadoEn: '2026-04-12T09:10:00Z' },
  { id: 'res-h37', studioId: 'studio-1', sesionId: 'ses-h11', socioId: 'soc-5', estado: 'ASISTIDA', spotId: 'spot-4', posicionEspera: null, checkInEn: '2026-04-15T08:58:00Z', creadoEn: '2026-04-12T09:15:00Z' },
  // Isabel (soc-4) — usó 5 de 8 sesiones del bono, distribuidas en semanas pasadas
  { id: 'res-h38', studioId: 'studio-1', sesionId: 'ses-h01', socioId: 'soc-4', estado: 'ASISTIDA', spotId: 'spot-5', posicionEspera: null, checkInEn: '2026-06-25T09:05:00Z', creadoEn: '2026-06-22T10:20:00Z' },
  { id: 'res-h39', studioId: 'studio-1', sesionId: 'ses-h03', socioId: 'soc-4', estado: 'ASISTIDA', spotId: 'spot-5', posicionEspera: null, checkInEn: '2026-06-10T09:10:00Z', creadoEn: '2026-06-07T09:20:00Z' },
  { id: 'res-h40', studioId: 'studio-1', sesionId: 'ses-h05', socioId: 'soc-4', estado: 'ASISTIDA', spotId: 'spot-5', posicionEspera: null, checkInEn: '2026-05-27T09:05:00Z', creadoEn: '2026-05-24T09:20:00Z' },
  { id: 'res-h41', studioId: 'studio-1', sesionId: 'ses-h07', socioId: 'soc-4', estado: 'ASISTIDA', spotId: 'spot-5', posicionEspera: null, checkInEn: '2026-05-13T10:05:00Z', creadoEn: '2026-05-10T09:20:00Z' },
  { id: 'res-h42', studioId: 'studio-1', sesionId: 'ses-h09', socioId: 'soc-4', estado: 'ASISTIDA', spotId: 'spot-5', posicionEspera: null, checkInEn: '2026-04-29T09:05:00Z', creadoEn: '2026-04-26T09:20:00Z' },
  // Elena (soc-7) — usó 2 de 4 sesiones del bono
  { id: 'res-h43', studioId: 'studio-1', sesionId: 'ses-h02', socioId: 'soc-7', estado: 'ASISTIDA', spotId: 'spot-6', posicionEspera: null, checkInEn: '2026-06-17T09:10:00Z', creadoEn: '2026-06-14T09:25:00Z' },
  { id: 'res-h44', studioId: 'studio-1', sesionId: 'ses-h06', socioId: 'soc-7', estado: 'ASISTIDA', spotId: 'spot-6', posicionEspera: null, checkInEn: '2026-05-20T09:08:00Z', creadoEn: '2026-05-17T09:25:00Z' },
];

// ─── Automation Rules ─────────────────────────────────────────────────────────

export const automationRules: AutomationRule[] = [
  {
    id: 'rule-1',
    studioId: 'studio-1',
    nombre: 'Socia ausente',
    descripcion: 'Detecta socias que llevan días sin venir y actúa automáticamente',
    icono: '👤',
    trigger: 'AUSENCIA_DIAS',
    condicion: { dias: 7 },
    pasos: [
      { accion: 'ENVIAR_WHATSAPP', parametros: { mensaje: 'Hola {nombre}, te echamos de menos en Tentare 💙 ¿Cómo estás? ¿Te apetece volver esta semana?' }, esperarHoras: 48, condicion: 'SIN_RESPUESTA' },
      { accion: 'OFRECER_CLASE_GRATIS', parametros: { mensaje: 'Hola {nombre}, llevamos tiempo sin verte. Te regalamos una clase de vuelta 🎁 ¿La agendamos?' }, esperarHoras: 72, condicion: 'SIN_RESPUESTA' },
      { accion: 'NOTIFICAR_ADMIN', parametros: { mensaje: '{nombre} lleva {dias} días sin venir y no ha respondido. ¿Quieres hacer seguimiento manual?' } },
    ],
    activa: true,
    ejecutadaVeces: 14,
    ultimaEjecucion: '2026-07-01T07:15:00Z',
    creadaEn: '2026-01-01T00:00:00Z',
  },
  {
    id: 'rule-2',
    studioId: 'studio-1',
    nombre: 'Pago pendiente',
    descripcion: 'Persigue pagos vencidos sin que tengas que hacer nada',
    icono: '💳',
    trigger: 'PAGO_PENDIENTE_DIAS',
    condicion: { dias: 3 },
    pasos: [
      { accion: 'ENVIAR_EMAIL', parametros: { asunto: 'Recordatorio de pago', mensaje: 'Hola {nombre}, tienes un pago de {importe}€ pendiente. Puedes pagarlo aquí: {link}' } },
      { accion: 'ENVIAR_WHATSAPP', parametros: { mensaje: 'Hola {nombre} 👋 ¿has podido revisar el pago de {importe}€? Te mando el enlace directo: {link}' }, esperarHoras: 72, condicion: 'SIN_RESPUESTA' },
      { accion: 'NOTIFICAR_ADMIN', parametros: { mensaje: '{nombre} tiene {importe}€ pendiente desde hace {dias} días. Requiere atención manual.' } },
    ],
    activa: true,
    ejecutadaVeces: 9,
    ultimaEjecucion: '2026-07-01T07:30:00Z',
    creadaEn: '2026-01-01T00:00:00Z',
  },
  {
    id: 'rule-3',
    studioId: 'studio-1',
    nombre: 'Renovación automática',
    descripcion: 'Avisa y cobra la renovación sin intervención humana',
    icono: '🔄',
    trigger: 'SUSCRIPCION_EXPIRA_DIAS',
    condicion: { dias: 7 },
    pasos: [
      { accion: 'ENVIAR_EMAIL', parametros: { asunto: 'Tu suscripción vence pronto', mensaje: 'Hola {nombre}, tu plan {plan} vence el {fecha}. ¿Lo renovamos? {link_pago}' } },
      { accion: 'COBRAR_RECIBO', parametros: { concepto: 'Renovación automática {plan}' }, condicion: 'SIEMPRE' },
      { accion: 'ENVIAR_WHATSAPP', parametros: { mensaje: '¡Tu plan {plan} se ha renovado! ✅ Todo listo para seguir.' } },
    ],
    activa: true,
    ejecutadaVeces: 22,
    ultimaEjecucion: '2026-06-30T06:00:00Z',
    creadaEn: '2026-01-01T00:00:00Z',
  },
  {
    id: 'rule-4',
    studioId: 'studio-1',
    nombre: 'Bono casi agotado',
    descripcion: 'Sugiere renovar cuando quedan pocas sesiones en el bono',
    icono: '🎟️',
    trigger: 'BONO_SESIONES_BAJAS',
    condicion: { sesiones: 2 },
    pasos: [
      { accion: 'ENVIAR_WHATSAPP', parametros: { mensaje: 'Hola {nombre} 👋 Solo te quedan {sesiones} clases en tu bono. ¿Renovamos antes de que se acaben? Te dejo el enlace: {link}' } },
      { accion: 'PROPONER_PLAN', parametros: { planSugerido: 'plan-2', descuento: 0 } },
    ],
    activa: true,
    ejecutadaVeces: 7,
    ultimaEjecucion: '2026-06-28T09:00:00Z',
    creadaEn: '2026-01-01T00:00:00Z',
  },
  {
    id: 'rule-5',
    studioId: 'studio-1',
    nombre: 'Bienvenida nueva socia',
    descripcion: 'Onboarding completo automático al darse de alta',
    icono: '🌟',
    trigger: 'NUEVA_SOCIA',
    condicion: { horasDesdeAlta: 1 },
    pasos: [
      { accion: 'ENVIAR_EMAIL', parametros: { asunto: '¡Bienvenida a Tentare!', mensaje: 'Hola {nombre}, estamos encantadas de tenerte con nosotras. Aquí tienes toda la info que necesitas...' } },
      { accion: 'ENVIAR_WHATSAPP', parametros: { mensaje: 'Hola {nombre} 🌸 Bienvenida a Tentare. Soy María, tu instructora. Cualquier duda, aquí estoy.' } },
    ],
    activa: true,
    ejecutadaVeces: 8,
    ultimaEjecucion: '2026-05-19T11:00:00Z',
    creadaEn: '2026-01-01T00:00:00Z',
  },
  {
    id: 'rule-6',
    studioId: 'studio-1',
    nombre: 'Recordatorio de clase',
    descripcion: 'Recuerda a cada socia su clase del día siguiente',
    icono: '📅',
    trigger: 'CLASE_MANANA',
    condicion: { horasAntes: 20 },
    pasos: [
      { accion: 'ENVIAR_WHATSAPP', parametros: { mensaje: '¡Hola {nombre}! Mañana tienes {clase} a las {hora} con {instructora} 🧘‍♀️ ¡Te esperamos!' } },
    ],
    activa: true,
    ejecutadaVeces: 98,
    ultimaEjecucion: '2026-07-01T09:00:00Z',
    creadaEn: '2026-01-01T00:00:00Z',
  },
];

// ─── Automation Logs (actividad del sistema hoy) ──────────────────────────────

export const automationLogs: AutomationLog[] = [
  // Hoy 09:00 — Recordatorios de clase de mañana
  { id: 'log-1', studioId: 'studio-1', ruleId: 'rule-6', ruleName: 'Recordatorio de clase', socioId: 'soc-1', socioNombre: 'Laura Martínez', pasoIndex: 0, accion: 'ENVIAR_WHATSAPP', resultado: 'EJECUTADO', detalle: 'Recordatorio Reformer Fundamental mañana 09:00 → enviado', ejecutadoEn: '2026-07-01T09:00:00Z', proximaAccionEn: null },
  { id: 'log-2', studioId: 'studio-1', ruleId: 'rule-6', ruleName: 'Recordatorio de clase', socioId: 'soc-3', socioNombre: 'Ana Fernández', pasoIndex: 0, accion: 'ENVIAR_WHATSAPP', resultado: 'EJECUTADO', detalle: 'Recordatorio Reformer Fundamental mañana 09:00 → enviado', ejecutadoEn: '2026-07-01T09:00:00Z', proximaAccionEn: null },
  { id: 'log-3', studioId: 'studio-1', ruleId: 'rule-6', ruleName: 'Recordatorio de clase', socioId: 'soc-5', socioNombre: 'Marta Sánchez', pasoIndex: 0, accion: 'ENVIAR_WHATSAPP', resultado: 'EJECUTADO', detalle: 'Recordatorio Reformer Fundamental mañana 09:00 → enviado', ejecutadoEn: '2026-07-01T09:00:00Z', proximaAccionEn: null },
  // Hoy 07:30 — Pago pendiente Carmen (3 días)
  { id: 'log-4', studioId: 'studio-1', ruleId: 'rule-2', ruleName: 'Pago pendiente', socioId: 'soc-2', socioNombre: 'Carmen López', pasoIndex: 0, accion: 'ENVIAR_EMAIL', resultado: 'EJECUTADO', detalle: 'Recordatorio pago 64€ (Bono 8 clases) → email enviado', ejecutadoEn: '2026-07-01T07:30:00Z', proximaAccionEn: '2026-07-04T07:30:00Z' },
  // Hoy 07:15 — Elena ausente 14 días
  { id: 'log-5', studioId: 'studio-1', ruleId: 'rule-1', ruleName: 'Socia ausente', socioId: 'soc-7', socioNombre: 'Elena Jiménez', pasoIndex: 0, accion: 'ENVIAR_WHATSAPP', resultado: 'ESPERANDO', detalle: 'Sin venir 14 días → WhatsApp enviado. Esperando respuesta (48h)', ejecutadoEn: '2026-07-01T07:15:00Z', proximaAccionEn: '2026-07-03T07:15:00Z' },
  // Ayer 06:00 — Renovación automática Marta
  { id: 'log-6', studioId: 'studio-1', ruleId: 'rule-3', ruleName: 'Renovación automática', socioId: 'soc-5', socioNombre: 'Marta Sánchez', pasoIndex: 1, accion: 'COBRAR_RECIBO', resultado: 'EJECUTADO', detalle: 'Mensual Ilimitado Jul 2026 — 85€ cobrados automáticamente ✓', ejecutadoEn: '2026-06-30T06:00:00Z', proximaAccionEn: null },
  { id: 'log-7', studioId: 'studio-1', ruleId: 'rule-3', ruleName: 'Renovación automática', socioId: 'soc-5', socioNombre: 'Marta Sánchez', pasoIndex: 2, accion: 'ENVIAR_WHATSAPP', resultado: 'EJECUTADO', detalle: 'WhatsApp confirmación renovación → enviado', ejecutadoEn: '2026-06-30T06:01:00Z', proximaAccionEn: null },
  // Hace 3 días — Isabel bono bajo
  { id: 'log-8', studioId: 'studio-1', ruleId: 'rule-4', ruleName: 'Bono casi agotado', socioId: 'soc-4', socioNombre: 'Isabel González', pasoIndex: 0, accion: 'ENVIAR_WHATSAPP', resultado: 'EJECUTADO', detalle: 'Bono 8 clases — quedan 3 sesiones. Propuesta renovación enviada', ejecutadoEn: '2026-06-28T09:00:00Z', proximaAccionEn: null },
  // Pendiente admin — Patricia no responde
  { id: 'log-9', studioId: 'studio-1', ruleId: 'rule-1', ruleName: 'Socia ausente', socioId: 'soc-8', socioNombre: 'Patricia Romero', pasoIndex: 2, accion: 'NOTIFICAR_ADMIN', resultado: 'PENDIENTE_ADMIN', detalle: 'Patricia lleva 12 días sin venir. No respondió WhatsApp ni a la clase gratis. ¿Actuamos?', ejecutadoEn: '2026-06-29T07:15:00Z', proximaAccionEn: null },
];

// ─── Notas de progreso ────────────────────────────────────────────────────────

export const notasProgreso: NotaProgreso[] = [
  {
    id: 'nota-prog-1',
    studioId: 'studio-1',
    socioId: 'soc-1',
    instructorId: 'ins-1',
    sesionId: 'ses-h01',
    textoLibre: 'Laura ha mejorado mucho la estabilidad en plancha. Sigue con molestias leves cervicales al hacer roll-up. La semana que viene enfocar movilidad torácica.',
    progreso: 'Mejora notable en estabilidad de cadera y control de powerhouse. Patrón respiratorio más consciente.',
    alertas: 'Molestias cervicales en flexión. Evitar roll-up completo por ahora.',
    planProximaSesion: 'Movilidad torácica, cadena posterior. Reducir intensidad en flexión cervical.',
    ejerciciosCasa: '1. Cat-cow 10 rep × 3\n2. Chest opener sentada 30s × 4\n3. Rotación torácica con foam roller 8 rep cada lado',
    creadaEn: '2026-06-25T10:15:00Z',
  },
];
