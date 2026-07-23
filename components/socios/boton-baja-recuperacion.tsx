'use client';

// F2 (B2.4) dueña-first: "No puede venir" en una reserva próxima → da de baja +
// concede recuperación + ofrece avisar por WhatsApp (wa.me). El aviso es un enlace
// real (gesto del usuario) para que no lo bloquee el navegador como popup.

import { useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CalendarX, MessageCircle } from 'lucide-react';
import type { Reserva, Socio } from '@/lib/types';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';

// Mensaje-plantilla del aviso de recuperación (dueña-first).
function mensajeRecuperacion(nombre: string, caducaEl: string | null): string {
  const hasta = caducaEl
    ? ` La puedes recuperar hasta el ${new Date(caducaEl.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}.`
    : '';
  return `¡Hola ${nombre}! Te he guardado una recuperación por la clase que no vas a poder usar.${hasta} ¡Un abrazo!`;
}

export function BotonBajaRecuperacion({ reserva, socio }: { reserva: Reserva; socio: Socio }) {
  const { bajaConRecuperacion } = useStudio();
  const [open, setOpen] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [estado, setEstado] = useState<'idle' | 'hecho' | 'sin-tel' | 'tope' | 'error'>('idle');

  async function confirmar() {
    setProcesando(true);
    const res = await bajaConRecuperacion(reserva.id, null);
    setProcesando(false);
    setOpen(false);
    if (res.recuperacion === 'TOPE') { setEstado('tope'); return; }
    if (res.recuperacion === 'ERROR') { setEstado('error'); return; }
    const url = enlaceWhatsApp(socio.telefono, mensajeRecuperacion(socio.nombre, res.caduca));
    if (url) { setWaUrl(url); setEstado('hecho'); } else { setEstado('sin-tel'); }
  }

  if (estado === 'hecho' && waUrl) {
    return (
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 inline-flex items-center gap-1 transition-opacity hover:opacity-80"
        style={{ backgroundColor: '#25D366', color: '#fff' }}
      >
        <MessageCircle size={12} /> Avisar por WhatsApp
      </a>
    );
  }
  if (estado === 'tope') return <span className="text-[11px] font-medium text-amber-600 shrink-0">Ya tiene 4 recuperaciones</span>;
  if (estado === 'sin-tel') return <span className="text-[11px] font-medium text-emerald-600 shrink-0">Recuperación guardada</span>;
  if (estado === 'error') return <span className="text-[11px] font-medium text-red-600 shrink-0">Error, reintenta</span>;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="No puede venir → dar recuperación y avisar por WhatsApp"
        className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-background transition-colors shrink-0 inline-flex items-center gap-1"
      >
        <CalendarX size={12} /> No puede
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={o => { if (!o) setOpen(false); }}
        titulo="¿No puede venir a esta clase?"
        descripcion="Se cancela su reserva (liberando la plaza) y se le guarda una recuperación para otro día. Después podrás avisarle por WhatsApp con un clic."
        textoConfirmar={procesando ? 'Procesando…' : 'Dar recuperación'}
        onConfirm={confirmar}
      />
    </>
  );
}
