'use client';
import { Button } from '@/components/student/ui/Button';
import type { Disponibilidad } from '@/lib/student/tipos';
/** CTA persistente de la ficha de clase. El texto refleja la disponibilidad; offline se bloquea. */
export function BookingButton({ estado, online, onReservar, onEspera, onCancelar }: { estado: Disponibilidad; online: boolean; onReservar: () => void; onEspera: () => void; onCancelar: () => void }) {
  if (!online) return <Button full disabled>Sin conexión — no se puede reservar</Button>;
  if (estado === 'reservada') return <Button full variant="secondary" style={{ height: 52 }} onClick={onCancelar}>Reservada ✓ · Gestionar</Button>;
  if (estado === 'lista-espera') return <Button full variant="secondary" style={{ height: 52 }} onClick={onCancelar}>En lista de espera · Salir</Button>;
  if (estado === 'completa') return <Button full onClick={onEspera}>Unirme a la lista de espera</Button>;
  if (estado === 'no-disponible') return <Button full disabled>Clase completa</Button>;
  return <Button full onClick={onReservar}>{estado === 'pocas' ? 'Reservar · última oportunidad' : 'Reservar'}</Button>;
}
