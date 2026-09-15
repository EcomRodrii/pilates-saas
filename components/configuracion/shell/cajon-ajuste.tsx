'use client';

import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { tarjetaPorId, type TarjetaId } from '@/lib/configuracion/secciones';

// ─────────────────────────────────────────────────────────────────────────────
// El cajón donde se cambia una fila de Configuración (§4.3 de la reorganización).
//
// Una sección enseña filas con su valor de hoy; tocar una abre esto: a pantalla
// completa en el móvil y como cajón a la derecha desde 768 px, con la sección
// detrás. Dentro: volver y el título, UNA línea (la frase de su tarjeta), los
// campos y su `BarraGuardar`, que solo aparece con cambios. Un solo modelo de
// guardado: todo lo que se abre se guarda con «Guardar».
//
// Lo que no se puede perder:
//  · el foco va al título al abrir, para que un lector de pantalla diga dónde
//    está, y vuelve a la fila al cerrar (useDialogA11y);
//  · cerrar con cambios —volver, Escape, tocar el fondo— pregunta. La barra de
//    guardar se apunta aquí sola (`useCajonAjuste`) y, además, en el shell, que
//    pregunta si se sale a otra sección;
//  · si guardar falla, el cajón NO se cierra: la barra lo dice y lo escrito se
//    queda. Cerrarlo tras guardar es cosa de quien lo abre (`onGuardado`).
//
// ⚠️ Va en un portal (`DashboardDrawer`), fuera de la sección: por eso lleva él
// mismo `config-tactil` (campos de 16 px y 44 px con el dedo) y el contenedor
// `@container/config` del que tiran los formularios y la barra.
// ─────────────────────────────────────────────────────────────────────────────

interface Cajon {
  /** Hay cambios sin guardar dentro: cerrar pregunta. Devuelve con qué quitar la marca. */
  marcarCambios: () => () => void;
}

const ContextoCajon = createContext<Cajon | null>(null);

/** El cajón en el que está quien lo pide, o `null` si va suelto en una sección. */
export function useCajonAjuste(): Cajon | null {
  return useContext(ContextoCajon);
}

/** Lo que recibe el formulario de un cajón. */
export interface PropsFormularioCajon {
  showToast: (m: string) => void;
  /** Guardado de verdad: quien abrió el cajón lo cierra y lo cuenta. */
  onGuardado: (texto: string) => void;
}

const BOTON = 'size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

export function CajonAjuste({
  id,
  abierto,
  onCerrar,
  children,
}: {
  id: TarjetaId;
  abierto: boolean;
  onCerrar: () => void;
  children: ReactNode;
}) {
  const tarjeta = tarjetaPorId(id);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const conCambios = useRef(new Set<number>());
  const ultimaMarca = useRef(0);
  const [preguntando, setPreguntando] = useState(false);

  const cajon = useMemo<Cajon>(() => ({
    marcarCambios: () => {
      const marca = ++ultimaMarca.current;
      conCambios.current.add(marca);
      return () => { conCambios.current.delete(marca); };
    },
  }), []);

  // En layout y no en un efecto: antes que useDialogA11y, que si nada dentro
  // tiene el foco se lo da al primer botón (volver).
  useLayoutEffect(() => {
    if (abierto) tituloRef.current?.focus();
  }, [abierto]);

  function pedirCerrar() {
    // Encima hay una confirmación (salir sin guardar, o la de «Guardar» de un
    // cierre del centro): el Escape y el toque son suyos, no del cajón.
    if (preguntando || document.querySelector('[data-slot="dialog-content"]')) return;
    if (conCambios.current.size > 0) {
      setPreguntando(true);
      return;
    }
    onCerrar();
  }

  return (
    <ContextoCajon.Provider value={cajon}>
      <DashboardDrawer
        open={abierto}
        onClose={pedirCerrar}
        label={tarjeta.titulo}
        sheetClassName="@container/config config-tactil relative flex h-full w-full flex-col bg-card shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.3)] md:w-[28rem]"
      >
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2 md:pl-6 md:pr-3">
          <button type="button" onClick={pedirCerrar} aria-label="Volver" className={`flex md:hidden ${BOTON}`}>
            <ArrowLeft size={20} aria-hidden />
          </button>
          <h2
            id={`${id}-titulo`}
            ref={tituloRef}
            tabIndex={-1}
            className="min-w-0 flex-1 truncate text-base font-semibold text-foreground outline-none md:text-lg"
          >
            {tarjeta.titulo}
          </h2>
          <button type="button" onClick={pedirCerrar} aria-label="Cerrar" className={`hidden md:flex ${BOTON}`}>
            <X size={18} aria-hidden />
          </button>
        </div>

        {/* scroll-mb: un campo enfocado sube por encima de la barra de guardar. */}
        <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-4 md:px-6 [&_:is(input,select,textarea)]:scroll-mb-32">
          <p className="text-sm text-muted-foreground text-pretty">{tarjeta.frase}</p>
          <div className="mt-5 flex flex-1 flex-col">{children}</div>
        </div>
      </DashboardDrawer>

      <ConfirmDialog
        open={preguntando}
        onOpenChange={v => { if (!v) setPreguntando(false); }}
        titulo="¿Salir sin guardar?"
        descripcion={`Los cambios de «${tarjeta.titulo}» se perderán.`}
        textoConfirmar="Salir sin guardar"
        textoCancelar="Seguir editando"
        destructivo
        onConfirm={onCerrar}
      />
    </ContextoCajon.Provider>
  );
}
