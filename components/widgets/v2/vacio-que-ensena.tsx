'use client';

import { useState } from 'react';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { BotonVivo } from '@/components/dashboard/vivo';
import { widgetsVisibles, type WidgetDisponible } from '@/lib/widgets/catalogo';
import { CONFIG_POR_DEFECTO } from '@/lib/widgets/config';
import { conVistaPrevia, urlEmbebido } from '@/lib/widgets/integracion';
import { GrupoOpciones } from '../piezas';
import { ICONOS } from '../paso-que';
import { IphoneConWeb, useAnchoDe, useEscalaIphoneEn } from '../iphone-con-web';

// La portada sin nada puesto («Tu web» v2, decisión 5; Bonsai b-20, el vacío
// que enseña): qué consigue, por cuál de las cuatro empezar, el camino en
// cuatro pasos y UN botón. Al lado, su horario de verdad (la misma página que
// verá su alumna, no un dibujo), quieto: es un escaparate, no la vista previa
// con la que se trabaja. Antes, lo primero que veía una dueña nueva era «¿Con
// qué está hecha tu web?» sin haber visto qué iba a conseguir.

/** El botón, con lo que ha elegido. */
const PONER: Record<string, string> = {
  horario: 'Poner mi horario en mi web',
  planes: 'Poner mis precios en mi web',
  prueba: 'Poner mi clase de prueba en mi web',
  contacto: 'Poner mi formulario de contacto en mi web',
};

const CAMINO = ['Eliges qué pones', 'Dónde va en tu web', 'Cómo se ve', 'Lo pegas, o se lo mandas a quien te hace la web'];

export function VacioQueEnsena({ slug, origen, colorEstudio, onEmpezar }: {
  slug: string;
  origen: string;
  colorEstudio: string | null;
  onEmpezar: (id: string) => void;
}) {
  const principales = widgetsVisibles().filter((x): x is WidgetDisponible => x.estado === 'disponible' && !!x.principal);
  const [elegido, setElegido] = useState(principales[0]?.id ?? 'horario');
  const horario = principales.find(x => x.id === 'horario');
  // Su horario con lo de siempre, como lo verá su alumna (y con la marca de vista
  // previa, como la de los pasos).
  // El iPhone del panel, a lo que quepa en la columna y en el alto de la ventana.
  const [figura, anchoFigura] = useAnchoDe<HTMLElement>();
  const escala = useEscalaIphoneEn(Math.max(0, anchoFigura - 40), { max: 0.85, reservado: 300 });
  const src = horario ? conVistaPrevia(urlEmbebido({ widget: horario, config: CONFIG_POR_DEFECTO, origen, slug, colorEstudio, pieza: null }, 'iframe')) : null;

  return (
    <section aria-labelledby="vacio-tu-web" className="grid items-start gap-8 @4xl/config:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="min-w-0 space-y-6">
        <div>
          <h3 id="vacio-tu-web" className="text-[26px] font-bold leading-tight text-foreground text-balance">Pon tu horario en tu web</h3>
          <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-muted-foreground text-pretty">
            Tus alumnas ven tus clases y reservan sin salir de tu web. Lo preparas aquí, lo pegas una vez y después se pone al día solo con tus clases, tus precios y tus plazas.
          </p>
        </div>
        <div>
          <p className="mb-2.5 text-[13.5px] font-semibold text-foreground">¿Qué quieres poner primero?</p>
          <GrupoOpciones
            etiqueta="Qué quieres poner primero"
            valor={elegido}
            onChange={setElegido}
            className="@md/config:grid-cols-2"
            opciones={principales.map(x => {
              const Icono = ICONOS[x.icono] ?? CalendarDays;
              return {
                valor: x.id, titulo: x.respuesta, detalle: x.descripcion, icono: <Icono size={17} strokeWidth={1.8} />,
                insignia: x.id === 'horario' ? 'Lo que más se usa' : undefined,
              };
            })}
          />
          <p className="mt-2 text-[12.5px] text-muted-foreground">Hay más cosas que puedes poner: las verás en el primer paso.</p>
        </div>
        <ol aria-label="El camino" className="grid gap-3 @md/config:grid-cols-4">
          {CAMINO.map((t, i) => (
            <li key={t} className="flex items-start gap-2.5 @md/config:flex-col">
              <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-border bg-card text-[12.5px] font-semibold text-foreground">{i + 1}</span>
              <span className="text-[13px] leading-snug text-foreground">{t}</span>
            </li>
          ))}
        </ol>
        <BotonVivo grande onClick={() => onEmpezar(elegido)} label={<>{PONER[elegido] ?? 'Empezar'}<ArrowRight size={15} aria-hidden /></>} />
      </div>

      {src && (
        <figure ref={figura} className="m-0 min-w-0 rounded-[28px] bg-[linear-gradient(140deg,color-mix(in_srgb,var(--t-blue-500)_88%,white),color-mix(in_srgb,var(--t-magenta-500)_72%,white))] p-5 dark:bg-[linear-gradient(140deg,color-mix(in_srgb,var(--t-blue-500)_55%,var(--background)),color-mix(in_srgb,var(--t-magenta-500)_45%,var(--background)))]">
          {/* Su página de verdad en el iPhone del panel, sin poder tocarla (`inert`): es un escaparate. */}
          <IphoneConWeb escala={escala} direccion={null} fondo="white" desplazable={false}>
            <iframe
              src={src}
              title="Tu horario, como lo verá tu alumna"
              inert
              tabIndex={-1}
              loading="lazy"
              className="pointer-events-none block h-full w-full border-0"
            />
          </IphoneConWeb>
          <figcaption className="mt-4 text-center text-[12.5px] font-medium text-foreground/85 text-pretty">Así quedará en tu web: con tus clases de verdad, tus plazas libres y tu estilo.</figcaption>
        </figure>
      )}
    </section>
  );
}
