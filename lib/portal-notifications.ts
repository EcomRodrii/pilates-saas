import { useMemo } from 'react';
import type { Reserva, Recibo, Sesion, TipoClase, Instructor } from '@/lib/types';

export type PortalNotifTipo = 'RESERVA' | 'PAGO';

export interface PortalNotifItem {
  id: string;
  tipo: PortalNotifTipo;
  titulo: string;
  texto: string;
  fecha: string; // ISO
}

const READ_KEY = (socioId: string) => `ps_portal_notif_read_until_${socioId}`;

export function buildPortalNotifications(params: {
  socioId: string;
  reservas: Reserva[];
  recibos: Recibo[];
  sesiones: Sesion[];
  tiposClase: TipoClase[];
  instructores: Instructor[];
}): PortalNotifItem[] {
  const { socioId, reservas, recibos, sesiones, tiposClase, instructores } = params;
  const items: PortalNotifItem[] = [];
  // P0-22: Maps por id en vez de .find() lineal dentro del bucle de reservas.
  const sesionById = new Map(sesiones.map(s => [s.id, s]));
  const tipoById = new Map(tiposClase.map(t => [t.id, t]));
  const instrById = new Map(instructores.map(i => [i.id, i]));

  for (const r of reservas) {
    if (r.socioId !== socioId || r.estado !== 'CONFIRMADA') continue;
    const ses = sesionById.get(r.sesionId);
    if (!ses) continue;
    const tipo = tipoById.get(ses.tipoClaseId);
    const instr = instrById.get(ses.instructorId);
    const hora = new Date(ses.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const dia = new Date(ses.inicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    items.push({
      id: `res-${r.id}`,
      tipo: 'RESERVA',
      titulo: 'Reserva confirmada',
      texto: `${tipo?.nombre ?? 'Clase'} el ${dia} a las ${hora}${instr ? ` con ${instr.nombre}` : ''}.`,
      fecha: r.creadoEn,
    });
  }

  for (const rec of recibos) {
    if (rec.socioId !== socioId || rec.estado !== 'COBRADO' || !rec.fechaCobro) continue;
    const importe = rec.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
    items.push({
      id: `pago-${rec.id}`,
      tipo: 'PAGO',
      titulo: 'Pago recibido',
      texto: `Se ha cobrado ${rec.concepto} · ${importe}. Factura disponible en Mi plan.`,
      fecha: rec.fechaCobro,
    });
  }

  return items.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 40);
}

export function usePortalNotifUnreadCount(socioId: string | undefined, items: PortalNotifItem[]): number {
  return useMemo(() => {
    if (!socioId || items.length === 0) return 0;
    const readUntil = typeof window !== 'undefined' ? localStorage.getItem(READ_KEY(socioId)) : null;
    if (!readUntil) return items.length;
    const cutoff = new Date(readUntil).getTime();
    return items.filter(i => new Date(i.fecha).getTime() > cutoff).length;
  }, [socioId, items]);
}

export function markPortalNotifsRead(socioId: string, items: PortalNotifItem[]) {
  if (typeof window === 'undefined' || items.length === 0) return;
  localStorage.setItem(READ_KEY(socioId), items[0].fecha);
}
