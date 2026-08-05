'use client';

import { MarcoDispositivo } from './marco-dispositivo';
import type { DispositivoId } from '@/lib/theme/dispositivos';
import { useEffect, useRef } from 'react';
import { themeToCssVars } from '@/lib/theme-runtime';
import { MENSAJE_TEMA_PREVIEW, resolveTemaJs } from '@/lib/theme-preview-puente';
import type { ThemeConfig } from '@/lib/theme-schema';

// Preview en vivo REAL: iframe de la página pública de reservas del estudio, con
// el tema BORRADOR aplicándose en vivo por postMessage (lo recibe
// ThemePreviewListener, montado en la página de reservas). Fiel al 100% porque
// es la página de verdad, no una maqueta.
export function ThemePreview({ config, slug, dispositivo = 'movil', zoom = 1 }: { config: ThemeConfig; slug?: string | null; dispositivo?: DispositivoId; zoom?: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const vars = themeToCssVars(config) as Record<string, string>;
  // Los dos emisores de este mensaje mandan la MISMA forma a propósito (ver
  // lib/theme-preview-puente.ts). Hoy /reservar no pinta ningún eje de
  // `temaJs` — no monta PortalShell ni PortalHomeView —, así que aquí no
  // cambia nada visible; se manda igual para que el protocolo no dependa de
  // qué emisor lo llenó, que es justo cómo se coló el hueco de `variantes`.
  const temaJs = resolveTemaJs(config);

  function enviar() {
    ref.current?.contentWindow?.postMessage(
      { type: MENSAJE_TEMA_PREVIEW, vars, temaJs },
      window.location.origin,
    );
  }

  // Reenvía el tema en cada cambio (el componente se re-renderiza al editar).
  useEffect(() => {
    enviar();
  });

  if (!slug) {
    return <MarcoDispositivo dispositivo={dispositivo} zoom={zoom} vacio="La vista previa aparecerá cuando el estudio tenga su enlace de reservas listo." />;
  }

  return (
    <MarcoDispositivo dispositivo={dispositivo} zoom={zoom}>
      <iframe
        ref={ref}
        src={`/reservar/${slug}`}
        title="Vista previa del portal"
        onLoad={enviar}
        className="w-full h-full border-0"
      />
    </MarcoDispositivo>
  );
}
