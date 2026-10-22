'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Tu primera clase» para quien ya entró al panel sin crearla (saltó la
// bienvenida con «Prefiero ir a mi panel»): el mismo formulario del paso 6,
// sobre el Calendario, y al publicar el mismo «¡Listo!» del paso 7.
//
// Del «¡Listo!» se sale a la lista «Pon en marcha tu estudio» del Resumen (PR-5,
// fundador 21-oct: al terminar, «le debe de llevar automáticamente a primeros
// pasos»), donde ya se ofrece la siguiente tarea: compartir el enlace.
//
// Se abre con `/calendario?primera=1` (el correo «Tu cuenta está activa») y con
// «Crear mi primera clase» del calendario vacío. Solo para la propietaria y tras
// `ALTA_NUEVA` (o en el estudio que nació de ella): para el resto, el Calendario
// sigue con su «Nueva clase» de siempre.
//
// A pantalla completa y por portal al anfitrión del panel, por lo mismo que
// `ListoParaReservar`: la animación de entrada del panel pone un `transform` y un
// `fixed` a secas se quedaría dentro del hueco del calendario. z-50, y no más: los
// «?» (InfoTip, z-[60]) y la vista previa del móvil (DashboardSheet, que se monta
// después) tienen que verse encima.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { ListoParaReservar } from '@/components/onboarding/listo-para-reservar';
import { useStudio } from '@/lib/studio-context';
import { anfitrionPortal } from '@/lib/panel-portal';
import { recargarEstadoAlta } from '@/lib/alta/estado-cliente';
import { PrimeraClase, type PrimeraClasePublicada } from './primera-clase';
import { WhatsAppPersona } from './piezas';

export function PrimeraClaseEnCalendario({ onCerrar, onCreada }: {
  onCerrar: () => void;
  /** Tras publicar: el Calendario vuelve a leer sus clases. */
  onCreada: () => void;
}) {
  const { studio } = useStudio();
  const router = useRouter();
  const [publicada, setPublicada] = useState<PrimeraClasePublicada | null>(null);

  // Escape cierra el formulario (el «¡Listo!» lo hace por su cuenta).
  useEffect(() => {
    if (publicada) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [publicada, onCerrar]);

  if (!studio) return null;

  if (publicada && studio.slug) {
    return (
      <ListoParaReservar
        slug={studio.slug}
        nombreEstudio={studio.nombre ?? 'tu estudio'}
        clasesCreadas={0}
        nombreClase={publicada.clase.nombre}
        veredicto={publicada.veredicto}
        correoEnviado={publicada.correo}
        conQr
        textoSeguir="Ir a mi panel"
        onSeguir={() => { onCerrar(); router.push('/dashboard'); }}
      />
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-label="Tu primera clase" data-testid="primera-clase-en-calendario">
      <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-3 px-5 pb-1 pt-4 sm:px-8 sm:pt-5">
        <LogoTentare alto={22} tinta="auto" decorativo />
        <div className="flex items-center gap-1.5 sm:gap-3">
          <WhatsAppPersona nombreEstudio={studio.nombre} />
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar sin crear la clase"
            className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1180px] px-5 pb-12 pt-3 sm:px-8">
        <PrimeraClase
          studio={studio}
          enCalendario
          onAtras={onCerrar}
          onPublicada={r => { setPublicada(r); onCreada(); recargarEstadoAlta(); }}
        />
      </main>
    </div>,
    anfitrionPortal(),
  );
}
