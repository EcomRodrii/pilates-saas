'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { TentiIcono } from '@/components/tenti/tenti-icono';
import { useAsistente, usePuertaAsistente } from '@/lib/asistente-context';

// El botón flotante de «Pregúntale a Tentare», como el de WhatsApp pero encima
// de él: la puerta que el asistente no tenía FUERA del Centro de Control.
//
// Hasta ahora se llegaba por la barra del Centro de Control, la fila de ⌘K y el
// atajo ⌘J. Un estudio cuyo plan o prueba no incluye el Centro de Control (el
// asistente sí va en todos los planes) se quedaba solo con dos puertas que
// nadie descubre. Ésta está en todas las pantallas del panel.
//
// ⚠️ Pesa lo mínimo: el botón y poco más. El chat entero (`PanelFlotante` →
// `VistaChat`, el lector del stream, Tenti grande) es un chunk aparte que no se
// descarga hasta el primer clic (lo vigila e2e/asistente.spec.ts).
// ⚠️ Solo en escritorio abre el panel flotante. Por debajo de 1024 px sigue
// siendo la pantalla /asistente (teclado, barra de navegación y área segura
// ya resueltos allí): el botón lleva a ella con `abrir()`.
// ⚠️ Cerrar el panel desmonta el chat y corta la respuesta en vuelo, igual que
// salir de /asistente. Solo se pregunta al servidor si está encendido
// (`usePuertaAsistente`) una vez por sesión, como las otras puertas.

// Tenti no va junto a un cobro (lib/tenti/donde-vive-tenti.test.ts): en las
// pantallas del dinero el botón existe igual —el asistente es de todas las
// pantallas— pero con un icono de chat neutro, sin la mascota.
const PANTALLAS_DE_DINERO = /^\/(cobros|caja|cierre|facturas|transacciones|suscripcion|pos)(\/|$)/;

const PanelFlotante = dynamic(() => import('./panel-flotante').then(m => m.PanelFlotante), { ssr: false });

export function AsistenteFlotante() {
  const puerta = usePuertaAsistente();
  const { abrir } = useAsistente();
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [abierto]);

  // En /asistente el chat ya ocupa la pantalla (y el botón taparía «Enviar»).
  if (!puerta || pathname === '/asistente') return null;

  const alPulsar = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) setAbierto(a => !a);
    else abrir();
  };

  return (
    <>
      {abierto && <PanelFlotante onCerrar={() => setAbierto(false)} />}
      {/* `panel-wa-fab`: se aparta con las barras de guardar y de selección, igual que el botón de WhatsApp (globals.css). */}
      <div className="panel-wa-fab fixed bottom-[calc(8.75rem+env(safe-area-inset-bottom,0px))] right-4 z-40 lg:bottom-[5.5rem] lg:right-6">
        <button
          type="button"
          onClick={alPulsar}
          aria-label={abierto ? 'Cerrar el chat con Tentare' : 'Pregúntale a Tentare'}
          aria-expanded={abierto}
          data-testid="asistente-flotante"
          className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/10 transition-transform hover:scale-105 active:scale-95"
        >
          {PANTALLAS_DE_DINERO.test(pathname ?? '')
            ? <MessageCircle size={26} aria-hidden="true" />
            : <TentiIcono ancho={28} sobre="invertida" />}
        </button>
      </div>
    </>
  );
}
