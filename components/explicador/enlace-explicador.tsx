'use client';

// La puerta a un explicador: un enlace «¿Qué es…?» junto a la cifra y, mientras
// la persona no lo haya visto, una tarjeta en la página (sin modal) que lo
// ofrece. NUNCA se abre solo (decisión conservadora de la pieza E). «Visto» se
// guarda por persona en este navegador; sin almacenamiento, la tarjeta vuelve
// en la próxima visita y no pasa nada más.
//
// Al cerrar el explicador, el foco vuelve SIEMPRE al enlace: también cuando se
// abrió desde la tarjeta, que desaparece al terminar y no tendría adónde volver.

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { EXPLICADORES, claveExplicadores, type IdExplicador } from '@/lib/ayuda/explicadores';
import { anotar, guardarProgreso, leerProgreso, yaVisto, type ComoTermino } from '@/lib/ayuda/tutorial-progreso';

// Solo se descarga al abrirlo por primera vez; si el trozo no llega, el enlace no hace nada (la pantalla sigue).
const ExplicadorIlustrado = dynamic(
  () => import('./explicador-ilustrado').then(m => m.ExplicadorIlustrado).catch(() => function SinExplicador() { return null; }),
  { ssr: false },
);

function almacen(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function useExplicador(id: IdExplicador) {
  const { user } = useAuth();
  const clave = user?.id ? claveExplicadores(user.id) : null;
  const version = EXPLICADORES[id].version;
  const enlaceRef = useRef<HTMLButtonElement>(null);
  // `null` mientras no se sabe (SSR / sin usuario): la tarjeta no parpadea.
  const [visto, setVisto] = useState<boolean | null>(null);
  const [abierto, setAbierto] = useState(false);
  // Montado desde que se abre la primera vez (para que cierre con su animación), no antes.
  const [usado, setUsado] = useState(false);
  useEffect(() => {
    if (!clave) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Lee localStorage: solo existe en el navegador.
    setVisto(yaVisto(leerProgreso(almacen(), clave), id, version));
  }, [clave, id, version]);

  function terminar(como: ComoTermino) {
    setAbierto(false);
    setVisto(true);
    if (!clave) return;
    const a = almacen();
    guardarProgreso(a, clave, anotar(leerProgreso(a, clave), id, version, como));
  }

  const modal = usado ? <ExplicadorIlustrado id={id} abierto={abierto} onTerminar={terminar} focoAlCerrar={enlaceRef} /> : null;
  return { visto, abrir: () => { setUsado(true); setAbierto(true); }, terminar, modal, enlaceRef, titulo: EXPLICADORES[id].titulo };
}

export function EnlaceExplicador({ ref, texto, onAbrir }: { ref?: React.Ref<HTMLButtonElement>; texto: string; onAbrir: () => void }) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onAbrir}
      className="-ml-2 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring print:hidden"
    >
      <HelpCircle size={15} aria-hidden />{texto}
    </button>
  );
}

export function TarjetaPrimeraVez({ texto, onVer, onYaLoSe }: { texto: string; onVer: () => void; onYaLoSe: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 print:hidden" data-testid="explicador-primera-vez">
      <p className="min-w-0 text-[13px] text-foreground text-pretty">{texto}</p>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="ghost" onClick={onYaLoSe} className="text-muted-foreground">Ya lo sé</Button>
        <Button variant="outline" onClick={onVer}>Ver cómo</Button>
      </div>
    </div>
  );
}
