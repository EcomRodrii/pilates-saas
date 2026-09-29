'use client';

import { useMemo, type CSSProperties } from 'react';
import { ReservaCalendario } from '@/components/reserva/reserva-calendario';
import { useDatosWidget } from '@/lib/widget/usar-datos-widget';
import { MODO_TOKENS } from '@/lib/portal-modo';
import { COLOR_VALIDO, fuenteValida } from '@/lib/reservar/config-widget';
import type { FiltrosSlots } from '@/lib/reservar/construir-slots';
import type { BaseEstiloWeb } from '@/lib/reservar/estilo-web';
import type { WidgetWeb } from '@/lib/reservar/estilo-web-tipos';
import { datosEstiloNativaDeBase, estiloDeLaNativa, marcaDeLaNativa } from '@/lib/widget/estilo-nativa';
import { letraNativa } from '@/lib/widget/fuentes-nativa';
import type { ConfigConstructor } from '@/lib/widgets/config';
import { tieneDisenoEnCodigo } from '@/lib/widgets/integracion';

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
//
// Fase E: el estilo de sus widgets también le llega sin marco. Aquí se pinta
// con lo que está PROBANDO (el borrador, o lo publicado si no hay), con las
// mismas funciones que el bundle (`estiloDeLaNativa`, lib/widget/estilo-nativa.ts)
// y con la misma `base` que ya usa «Cómo se ve»: el color del TEMA, no la
// columna del estudio. Dos capas, como en su web: la de fuera con lo de siempre
// (lo que pone `montarUno`) y la de dentro con el estilo (el envoltorio del
// bundle). Sin las familias de las fuentes (`VARS_FAMILIAS_NATIVA`): el panel
// ya las tiene por `next/font`, y aquí no se inyecta ninguna hoja.
//
// Lo mismo con la letra de un diseño propio: la misma `letraNativa` que el
// bundle, con las familias de `next/font` en vez de las «Tentare …». Una que
// Tentare no sirve se nombra y no se pide (tampoco a Google), como en su web.
export function PreviewNativa({ slug, config, estilo, base, colorEstudio, fuenteDelPanel }: {
  slug: string;
  config: ConfigConstructor;
  /** El estilo de sus widgets que se ve: el borrador que prueba o lo publicado. `null` = nada elegido. */
  estilo: WidgetWeb | null;
  /** Con qué se resuelve (su app y el color del tema). `null` mientras carga: se pinta como siempre. */
  base: BaseEstiloWeb | null;
  /** El color de marca del estudio, de respaldo mientras no llega `base`. */
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
  const tema = useMemo(() => ({
    ...MODO_TOKENS.dia,
    ...(tinta ? { ink: tinta } : {}),
    ...(fondo ? { bg: fondo } : {}),
  }), [tinta, fondo]);

  const fuente = propia ? familia(config.fuente) : null;
  const fuenteDisplay = propia ? familia(config.fuenteDisplay) : null;
  const cuerpo = fuente ? letraNativa(fuente, 'panel') : null;
  const titular = fuenteDisplay ? letraNativa(fuenteDisplay, 'panel') : cuerpo;
  const delPanel = !propia && fuenteDelPanel ? fuenteDelPanel : null;
  const fuenteUi = cuerpo?.pila ?? delPanel ?? FUENTE_UI_BASE;
  const display = titular?.pila ?? delPanel ?? FUENTE_DISPLAY_BASE;

  // El primario, como en su web: con un diseño propio, su marca (o la de
  // siempre, sin `data-identidad`); con la identidad del estudio, su color, del
  // TEMA (`base`) y de la columna solo mientras carga.
  const identidad = propia ? null : color(base?.colorPrimario ?? null) ?? color(colorEstudio);
  const marca = (propia ? color(config.marca) : identidad) ?? COLOR_WIDGET_POR_DEFECTO;

  // Lo que hará el bundle con este estilo. Con un diseño propio en sus `data-*`
  // no le llega nada (`nativaTraeDisenoPropio`), igual que allí.
  const conEstilo = base && !tieneDisenoEnCodigo(config, 'nativa')
    ? estiloDeLaNativa(datosEstiloNativaDeBase(estilo, base), { columnas: config.diseno !== 'completo' })
    : null;
  const t = conEstilo?.tokens ?? tema;
  // Sin estilo (o con solo la letra), la marca de identidad de siempre; con él,
  // la del estilo, que ya va en su `raiz`.
  const marcaIdentidad = identidad ? marcaDeLaNativa(identidad) : null;
  const envoltorio = conEstilo
    ? { ...(conEstilo.soloLetra ? marcaIdentidad : null), ...conEstilo.raiz }
    : marcaIdentidad ?? undefined;

  return (
    <div
      style={{
        ...marcaDeLaNativa(marca),
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
      <div style={envoltorio as CSSProperties | undefined}>
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
          radiosEsc={conEstilo?.radiosEsc ?? undefined}
          densidadEsc={conEstilo?.densidadEsc ?? undefined}
          loading={cargando}
          error={error ? { onReintentar: recargar, titulo: 'No hemos podido cargar el horario' } : undefined}
          estiloFicha="inline"
        />
      </div>
    </div>
  );
}
