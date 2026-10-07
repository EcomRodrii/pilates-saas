'use client';

import { useEffect } from 'react';
import { useEstudio } from '@/components/student/contexto';
import { useVolver } from '@/components/student/shell/volver';
import { estiloBarraDeEstado } from '@/lib/nativo/puente';
import { vigilarTintaSobreFoto } from '@/lib/nativo/barra-de-estado';
import { estiloPorId } from '@/lib/student/apariencia';
import type { Clase } from '@/lib/student/tipos';
import { Foto } from '@/components/student/ui/Foto';
import { Icono } from '@/components/student/ui/Icono';

/**
 * La cabecera con foto de la ficha de una clase (`/reservar/[claseId]`; `/clases-fijas/[sesionId]` ya solo redirige
 * aquí). P10 (5-oct-2026): SOLO la foto, entera, con volver y lo de la derecha (favorita y compartir) encima. El título,
 * el nivel y el logo van debajo, en la página: sobre la foto tapaban justo lo que la foto enseña, y su legibilidad
 * dependía de la foto que subiera cada estudio.
 *
 * Va con `StudentShell headerTransparente sinCabecera`: la foto sube hasta arriba y SIN la barra del estudio encima
 * (decisión del fundador, 6-oct-2026): una sola fila de controles sobre la foto, no dos. Por eso la tinta de la barra
 * de estado de iOS la pone esta pieza, que es la que ahora está debajo de la hora y la batería.
 */
export function FichaClaseHero({ clase, derecha }: { clase: Pick<Clase, 'fotoUrl'>; derecha?: React.ReactNode }) {
  const volver = useVolver();
  const { estudio } = useEstudio();
  const fondoOscuro = estiloPorId(estudio.apariencia.estilo).oscuro === true;
  // Letras claras mientras la foto (con su velo) está bajo la barra de estado; al bajar, las del fondo. Mismo criterio
  // que `StudioHeader` sobre la portada de Inicio. Solo hace algo dentro de la app.
  useEffect(() => vigilarTintaSobreFoto({
    fondoOscuro,
    sobreFoto: () => window.scrollY < 240,
    aplicar: (tinta) => { void estiloBarraDeEstado(tinta); },
    ventana: window,
  }), [fondoOscuro]);
  return (
    // ⚠️ `background`: `clase.fotoUrl` puede no cargar, y sin tinta detrás el hueco quedaba crema. `#0F0F0C` es la misma
    // tinta que el kit pone bajo la foto del layout de acceso (`.st-auth-hero`).
    <section
      data-testid="ficha-heroe"
      style={{ position: 'relative', height: 'calc(290px + var(--safe-top))', overflow: 'hidden', background: '#0F0F0C' }}
    >
      <Foto
        src={clase.fotoUrl}
        ancho={640}
        alto={290}
        sizes="(min-width:1024px) 1040px, (min-width:768px) 640px, 100vw"
        prioritaria
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', animation: 'apKen 18s ease-in-out infinite' }}
      />
      {/* Solo el velo de ARRIBA: el que necesitan la barra de estado y los círculos. Abajo ya no hay texto que leer. */}
      <div
        aria-hidden
        style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,15,15,.36), rgba(15,15,15,0) 40%)' }}
      />
      <button
        type="button"
        onClick={volver}
        aria-label="Volver"
        className="tap tap--icono"
        style={{ position: 'absolute', top: 'calc(12px + var(--safe-top))', left: 14, width: 34, height: 34, border: 'none', borderRadius: 999, background: 'rgba(250,249,245,.92)', color: 'var(--on-dark-tinta)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Icono nombre="flecha-izquierda" tamano={18} />
      </button>
      {derecha && <div style={{ position: 'absolute', top: 'calc(12px + var(--safe-top))', right: 14 }}>{derecha}</div>}
    </section>
  );
}
