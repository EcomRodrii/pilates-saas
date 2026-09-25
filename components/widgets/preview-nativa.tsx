'use client';

import { useEffect, useMemo, type CSSProperties } from 'react';
import { ReservaCalendario } from '@/components/reserva/reserva-calendario';
import { useDatosWidget } from '@/lib/widget/usar-datos-widget';
import { MODO_TOKENS } from '@/lib/portal-modo';
import { COLOR_VALIDO, fuenteValida, familiaCssDe, urlFuenteGoogle } from '@/lib/reservar/config-widget';
import { luminancia } from '@/lib/reservar/apariencia-widget';
import type { FiltrosSlots } from '@/lib/reservar/construir-slots';
import type { ConfigConstructor } from '@/lib/widgets/config';

const COLOR_WIDGET_POR_DEFECTO = '#343825';
const FUENTE_UI_BASE = "'Instrument Sans', system-ui, sans-serif";
const FUENTE_DISPLAY_BASE = "'Instrument Serif', Georgia, serif";

const color = (v: string | null) => (v && COLOR_VALIDO.test(v) ? v : null);
const familia = (v: string | null) => (v && fuenteValida(v) ? v.trim() : null);

// Vista previa de la integración NATIVA del horario — el mismo componente y el
// mismo hook de datos que monta app/widget-bundle/main.tsx, así que lo que se
// ve aquí es lo que verá la visitante, no una maqueta aparte. Componente
// propio para que `useDatosWidget` solo pida datos cuando se enseña.
//
// ⚠️ Mismas CSS vars y mismo tema derivado que fija `montarUno` en la web
// real. Si cambia allí, cambia aquí (bug real 2026-08-26: la previa mentía
// sobre el contraste del botón porque solo una de las dos lo calculaba).
export function PreviewNativa({ slug, config, colorEstudio, fuenteDelPanel }: {
  slug: string;
  config: ConfigConstructor;
  /** El color de marca del estudio: con su identidad, es el primario. */
  colorEstudio: string | null;
  /**
   * Con la identidad del estudio el bundle toma la letra de la web donde vive;
   * aquí no hay web del estudio, así que se enseña con la del panel y se dice.
   */
  fuenteDelPanel?: string;
}) {
  const filtros = useMemo<FiltrosSlots>(
    () => ({ tipos: config.tipos, instructoras: config.instructoras, salas: config.salas }),
    [config.tipos, config.instructoras, config.salas],
  );
  const { slots, cargando, error, recargar } = useDatosWidget(slug, '', filtros);
  const propia = config.identidad === 'propia';
  const tinta = propia ? color(config.tinta) : null;
  const fondo = propia ? color(config.fondo) : null;
  const t = useMemo(() => ({
    ...MODO_TOKENS.dia,
    ...(tinta ? { ink: tinta } : {}),
    ...(fondo ? { bg: fondo } : {}),
  }), [tinta, fondo]);

  const fuente = propia ? familia(config.fuente) : null;
  const fuenteDisplay = propia ? familia(config.fuenteDisplay) : null;
  useEffect(() => {
    for (const nombre of [fuente, fuenteDisplay]) {
      const url = urlFuenteGoogle(nombre);
      if (!url || document.head.querySelector(`link[href="${url}"]`)) continue;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      document.head.appendChild(link);
    }
  }, [fuente, fuenteDisplay]);
  const fuenteUi = fuente ? familiaCssDe(fuente) : (!propia && fuenteDelPanel) ? fuenteDelPanel : FUENTE_UI_BASE;
  const display = fuenteDisplay ? familiaCssDe(fuenteDisplay)
    : fuente ? familiaCssDe(fuente) : (!propia && fuenteDelPanel) ? fuenteDelPanel : FUENTE_DISPLAY_BASE;

  const marca = (propia ? color(config.marca) : null) ?? color(colorEstudio) ?? COLOR_WIDGET_POR_DEFECTO;
  const l = luminancia(marca);
  return (
    <div
      style={{
        '--portal-brand': marca,
        '--portal-brand-foreground': l != null && l < 0.45 ? '#FFFFFF' : '#22261F',
        '--success': '#2F6B4F',
        '--warning': '#8F6215',
        '--destructive': '#A8442A',
        '--font-ui': fuenteUi,
        '--font-display': display,
        '--portal-heading-font': display,
        fontFamily: fuenteUi,
        ...(fondo ? { background: fondo } : {}),
      } as CSSProperties}
      className="p-4"
    >
      <ReservaCalendario
        t={t}
        slots={slots}
        onReservar={() => {}}
        onCancelar={() => {}}
        vacio={{ titulo: 'No hay clases disponibles', cuerpo: 'Vuelve a mirar más tarde.' }}
        estiloDias={config.diseno === 'completo' ? 'dias' : 'grid'}
        vistaInicial={config.vista}
        ocultarPrecio={!config.mostrarPrecio}
        ocultarNivel={!config.mostrarNivel}
        ocultarSustituta={!config.mostrarSustituta}
        loading={cargando}
        error={error ? { onReintentar: recargar, titulo: 'No hemos podido cargar el horario' } : undefined}
        estiloFicha="inline"
      />
    </div>
  );
}
