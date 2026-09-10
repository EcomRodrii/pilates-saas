'use client';

import { useState } from 'react';
import { usePermisos } from '@/lib/permisos';
import {
  useContenidoPortalEditor, ContenidoPortalList, ContenidoPortalPanel, MENSAJE_DESTACADO_ID,
} from '@/components/theme/contenido-portal-editor';
import { cardCls } from '@/app/(dashboard)/configuracion/page';
import { cn } from '@/lib/utils';

// «Descubre» y el tablón: lo que el estudio publica y leen sus alumnas.
//
// ⚠️ Esta pestaña existe porque la puerta que había está CERRADA. El editor de
// estas mismas entidades vive en el workspace de Apariencia
// (`theme-editor-fullscreen.tsx`), y su ruta —`/configuracion/apariencia/editor`—
// redirige desde el 2026-09-07 con un «EN MANTENIMIENTO» que documenta los tres
// pasos para reabrirla. O sea que hoy, sin esto, la tabla existe, la app de la
// alumna sabe pintarla y NADIE puede crear una tarjeta.
//
// No se reabre aquel editor: es una decisión de otra persona, con diez suites
// e2e saltadas colgando de ella. Y no se duplica nada: el propio
// `contenido-portal-editor.tsx` ya separó estado (`useContenidoPortalEditor`)
// de presentación (`ContenidoPortalList` / `ContenidoPortalPanel`)
// «para poder montarlo dentro del workspace único de Apariencia» — montarlo en
// un segundo sitio es exactamente para lo que se separó.
export function TabDescubre() {
  const { rol } = usePermisos();
  const hook = useContenidoPortalEditor();
  const [seleccion, setSeleccion] = useState<string | null>(MENSAJE_DESTACADO_ID);

  // Misma puerta que la RLS de la tabla (`admin_contenido_portal_banners`:
  // PROPIETARIO/MANAGER). La UI nunca es el límite de seguridad — la cerradura
  // real es aquella—, pero enseñar un editor que el servidor va a rechazar es
  // prometer algo que no se puede cumplir.
  if (rol !== 'PROPIETARIO' && rol !== 'MANAGER') {
    return (
      <p className="text-[13px] text-muted-foreground">
        Solo la propietaria y gerencia pueden publicar contenido en la app de las alumnas.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sin botones de «añadir» aquí: los trae la propia lista de la
          izquierda, y dos maneras de crear lo mismo en la misma pantalla es
          justo lo que hace dudar de si son lo mismo. */}
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">Descubre y tablón</h2>
        <p className="text-[12.5px] text-muted-foreground mt-0.5 max-w-[62ch]">
          Las tarjetas con foto que salen en «Descubre», en la pantalla de inicio de tus
          alumnas, más el mensaje destacado y los avisos del tablón. Si no publicas
          ninguna tarjeta, esa sección no aparece en su app. Cada tarjeta nace
          oculta: ponle su foto y publícala cuando esté.
        </p>
      </div>

      {hook.aviso && (
        <p className="text-[12.5px] text-muted-foreground" role="status">{hook.aviso}</p>
      )}

      {/* Maestro–detalle, como en Apariencia: la lista elige y el panel
          configura. En móvil se apilan — la rejilla de dos columnas solo entra
          a partir de `lg`, donde caben las dos sin apretar ninguna. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] items-start">
        <div className={cn(cardCls, 'p-3')}>
          <ContenidoPortalList hook={hook} seleccionId={seleccion} onSeleccionar={setSeleccion} />
        </div>
        <div className={cn(cardCls, 'p-4')}>
          <ContenidoPortalPanel hook={hook} seleccionId={seleccion} />
        </div>
      </div>
    </div>
  );
}
