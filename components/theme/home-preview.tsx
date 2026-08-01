'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchHomePreviewToken } from '@/lib/api-client';
import type { BloqueHome } from '@/lib/portal-home-bloques';

const PANTALLAS = [
  { id: '', etiqueta: 'Inicio' },
  { id: 'clases', etiqueta: 'Clases' },
  { id: 'bonos', etiqueta: 'Bonos' },
] as const;

// Preview en vivo REAL de la app de socias (Fase 4 del editor de temas, y su
// ampliación de Fase 5): un solo marco de móvil con un iframe apuntando a
// /portal-preview/[slug][/pantalla] (sin sesión, token firmado) que sincroniza
// el borrador de BLOQUES por postMessage (lo recibe PortalPreviewHomeClient;
// las demás pantallas lo ignoran, no lo necesitan). El color/tipografía en
// borrador llega solo YA aplicado en el HTML servido por
// ThemePreviewListener (montado en app/portal-preview/[slug]/layout.tsx), así
// que cambiar de pantalla aquí no pierde el tema que se está probando en la
// pestaña "Marca y colores" si el editor sigue abierto en la misma sesión de
// navegador (ambos leen/mandan al mismo studio_theme en borrador).
export function HomePreview({ bloques, slug }: { bloques: BloqueHome[]; slug?: string | null }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pantalla, setPantalla] = useState<(typeof PANTALLAS)[number]['id']>('');

  useEffect(() => {
    let vivo = true;
    fetchHomePreviewToken().then((t) => { if (vivo) setToken(t); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  function enviar() {
    ref.current?.contentWindow?.postMessage(
      { type: 'tentare-home-preview', bloques },
      window.location.origin,
    );
  }

  // Reenvía el borrador en cada cambio (el componente se re-renderiza al editar).
  useEffect(() => {
    enviar();
  });

  if (!slug || !token) {
    return (
      <div className="mx-auto w-full max-w-[320px] aspect-[9/19] rounded-[2rem] border-[6px] border-black/85 bg-muted flex items-center justify-center text-center px-6">
        <p className="text-[12px] text-muted-foreground">La vista previa aparecerá en un momento.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[320px]">
      <div className="flex justify-center gap-1 mb-3" role="tablist" aria-label="Pantalla a previsualizar">
        {PANTALLAS.map(p => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pantalla === p.id}
            onClick={() => setPantalla(p.id)}
            className={`px-3 py-1 rounded-full text-xs border ${pantalla === p.id ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground'}`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      <div className="aspect-[9/19] rounded-[2rem] border-[6px] border-black/85 shadow-xl overflow-hidden bg-white">
        <iframe
          ref={ref}
          src={`/portal-preview/${slug}${pantalla ? `/${pantalla}` : ''}?t=${token}`}
          title="Vista previa de la app de socias"
          onLoad={enviar}
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
}
