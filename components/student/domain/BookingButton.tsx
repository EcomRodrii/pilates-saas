'use client';
import { Button } from '@/components/student/ui/Button';
import { Icono } from '@/components/student/ui/Icono';
import type { Disponibilidad } from '@/lib/student/tipos';
/** CTA persistente de la ficha de clase. El texto refleja la disponibilidad; offline se bloquea. */
export function BookingButton({ estado, online, onReservar, onEspera, onCancelar }: { estado: Disponibilidad; online: boolean; onReservar: () => void; onEspera: () => void; onCancelar: () => void }) {
  if (!online) return <Button full disabled>Sin conexión — no se puede reservar</Button>;
  if (estado === 'reservada') return <Button full variant="secondary" style={{ height: 52 }} onClick={onCancelar}>Reservada ✓ · Gestionar</Button>;
  if (estado === 'lista-espera') return <Button full variant="secondary" style={{ height: 52 }} onClick={onCancelar}>En lista de espera · Salir</Button>;
  if (estado === 'completa') return <Button full onClick={onEspera}>Unirme a la lista de espera</Button>;
  if (estado === 'no-disponible') return <Button full disabled>Clase completa</Button>;
  // «Reservar clase», ancho y con la flecha (maqueta de oct-2026, copia exacta). Que quedan pocas ya lo dice el chip de
  // plazas de arriba.
  return (
    <Button full className="boton-cta" onClick={onReservar}>
      Reservar clase
      <span aria-hidden className="boton-cta__flecha"><Icono nombre="flecha-derecha" tamano={20} /></span>
    </Button>
  );
}
