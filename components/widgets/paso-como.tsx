'use client';

import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { SelectorFuente } from '@/components/ui/selector-fuente';
import { MODO_TOKENS } from '@/lib/portal-modo';
import type { MetodoIntegracion, WidgetDisponible } from '@/lib/widgets/catalogo';
import { anchoPorDefecto, type ConfigConstructor } from '@/lib/widgets/config';
import { tieneDisenoEnCodigo } from '@/lib/widgets/integracion';
import type { PiezasAfectadas } from '@/lib/widgets/estilo-afectados';
import { botonDeSuWeb, usaBotonPropio, type PlataformaWeb } from '@/lib/widgets/recetas';
import { Ajuste, AjusteInterruptor, Etiqueta, MuestraColor, Plegable, Segmentado, Tarjeta } from './piezas';
import { EstiloWeb } from './estilo-web';
import type { EstiloWebPanel } from './usar-estilo-web';

// Paso 2 · Cómo se ve. Desde la Fase B del constructor (28-sep-2026), UN estilo
// para todos los widgets de su web —«Igual que tu app» o uno solo para su web—,
// que se aplica con un botón y cambia solo en todo lo ya pegado, sin tocar el
// código (./estilo-web.tsx). Vive en el tema publicado, no en este widget.
//
// Solo si quiere algo distinto para ESTE widget, en un pliegue aparte, los
// controles de siempre —en palabras suyas y sin un código de color a la vista—,
// que sí van congelados en el código. Un código con diseño propio ya no recibe
// el estilo de su web (lib/reservar/estilo-web.ts), y así se le dice.
//
// Lo que no sigue el estilo se dice arriba, antes de que elija nada: el enlace y
// el botón a su página abren la página suelta (se ve como su app), y la
// integración sin marco lleva su propio diseño.

const COLOR_DE_FONDO = '#F6F3EC';

export function PasoComo({ w, c, metodo, plataforma, cambiar, colorEstudio, estilo, soloLectura, verApariencia, piezas }: {
  w: WidgetDisponible;
  c: ConfigConstructor;
  metodo: MetodoIntegracion;
  plataforma: PlataformaWeb | null;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  colorEstudio: string;
  /** El estilo de los widgets del estudio (./usar-estilo-web.ts). */
  estilo: EstiloWebPanel;
  soloLectura: boolean;
  verApariencia: boolean;
  piezas: PiezasAfectadas;
}) {
  const propia = c.identidad === 'propia';
  const nativa = metodo === 'nativa';
  const soloBoton = metodo === 'boton';
  const botonPropio = soloBoton && usaBotonPropio(plataforma);
  // El pie ya es del estilo de su web («Ajustes finos»). Aquí solo sigue el
  // interruptor de antes para quien lo apagó en ESTE widget: su `pie=0` va en
  // el código, y tiene que poder volver a encenderlo. Se decide al abrir el
  // widget, para que no desaparezca bajo el dedo al encenderlo.
  const [pieDelWidget] = useState(() => c.mostrarPie === false);

  const aviso: ReactNode = metodo === 'enlace' || soloBoton
    ? <>Con {metodo === 'enlace' ? 'un enlace' : 'un botón que lleva a tu página'}, tu página de reservas se ve <strong className="font-semibold">como tu app</strong>. Este estilo es para lo que pongas dentro de tu web o en una ventana encima.</>
    : nativa
      ? 'Sin marco, el widget no sigue este estilo: lleva su propio diseño, con la letra de tu web. Si quieres que cambie solo, ponlo dentro de tu página.'
      : tieneDisenoEnCodigo(c)
        ? 'Este widget lleva un diseño propio en su código (abajo): este estilo no le llega.'
        : null;

  const disenoDistinto = metodo !== 'enlace' && !botonPropio ? (
    <Plegable
      abierto={propia}
      className="border-t border-border pt-2"
      titulo={<span className="flex flex-wrap items-center gap-2">Un diseño distinto solo para {soloBoton ? 'este botón' : 'este widget'} <Etiqueta tipo="codigo" /></span>}
    >
      <div className="space-y-5">
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          Lo que cambies aquí va dentro de su código y, desde ese momento, este widget deja de seguir el estilo de tus widgets. Si lo tocas después de pegarlo, tendrás que copiar el código otra vez. Pensado para quien te hace la web.
        </p>
        <AjusteInterruptor
          etiqueta={`Usar un diseño propio en «${w.respuesta}»`}
          on={propia}
          onChange={v => cambiar({ identidad: v ? 'propia' : 'estudio' })}
        />
        {propia && <DisenoPropio c={c} nativa={nativa} soloBoton={soloBoton} cambiar={cambiar} colorEstudio={colorEstudio} />}
      </div>
    </Plegable>
  ) : null;

  return (
    <div className="space-y-4">
      <Tarjeta
        titulo="¿Cómo quieres que se vea?"
        etiqueta="vivo"
        subtitulo="Es el mismo estilo para todos tus widgets. Cuando lo cambies, cambia solo en tu web: no hace falta volver a pegar nada."
      >
        {aviso && (
          <p className="flex items-start gap-2 rounded-xl bg-muted/60 px-3.5 py-3 text-[12.5px] leading-relaxed text-foreground">
            <Info size={15} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" /><span className="min-w-0">{aviso}</span>
          </p>
        )}

        {botonPropio && (
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            El botón lo pones con {botonDeSuWeb(plataforma)}: su color y su forma son los de tu web.
          </p>
        )}

        <EstiloWeb
          estado={estilo}
          metodo={metodo}
          soloLectura={soloLectura}
          verApariencia={verApariencia}
          piezas={piezas}
          disenoPropio={disenoDistinto}
        />
      </Tarjeta>

      {(metodo === 'iframe' || (metodo === 'popup' && pieDelWidget)) && (
        <Tarjeta titulo="Cómo encaja en tu página" etiqueta="codigo">
          {metodo === 'iframe' && (
            <Ajuste etiqueta="Ancho" descripcion="En una columna queda a lo ancho de un móvil; a todo el ancho ocupa el hueco de tu página.">
              <Segmentado
                etiqueta="Ancho del widget"
                valor={c.ancho ?? anchoPorDefecto(w, c)}
                onChange={v => cambiar({ ancho: v === anchoPorDefecto(w, c) ? null : v })}
                opciones={[{ valor: 'compacto', nombre: 'En una columna' }, { valor: 'completo', nombre: 'Todo el ancho' }] as const}
              />
            </Ajuste>
          )}
          {pieDelWidget && (
            <AjusteInterruptor
              etiqueta="Dirección y aviso legal al pie"
              // El mismo nombre que el de «Ajustes finos», que puede decir otra
              // cosa: se explica cuál es este para que no parezca que se contradicen.
              descripcion="Solo para este widget, y va en su código. Para todos tus widgets a la vez, está en «Ajustes finos»."
              on={c.mostrarPie}
              onChange={v => cambiar({ mostrarPie: v })}
            />
          )}
        </Tarjeta>
      )}
    </div>
  );
}

function DisenoPropio({ c, nativa, soloBoton, cambiar, colorEstudio }: {
  c: ConfigConstructor;
  nativa: boolean;
  soloBoton: boolean;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  colorEstudio: string;
}) {
  const fondo = c.fondo === null ? 'defecto' : c.fondo === 'transparente' ? 'transparente' : 'color';
  // `auto` deduce la letra del fondo (lib/reservar/apariencia-widget.ts,
  // `modoTextoDe`), y solo puede con un color que conozca: con el de su página
  // o fundido con su web se queda en letra oscura, que es «Clara». Así se dice,
  // y «Según el fondo» solo se ofrece cuando de verdad hay un fondo que mirar.
  const segunFondo = fondo === 'color';
  const tema = c.tema === 'auto' && !segunFondo ? 'claro' : c.tema;
  return (
    <div className="space-y-5 rounded-xl border border-border p-3.5">
      <MuestraColor etiqueta="Color principal" descripcion="Botones y acentos." valor={c.marca} muestra={colorEstudio} onChange={v => cambiar({ marca: v })} />
      {!soloBoton && (
        <>
          <Ajuste etiqueta="Fondo">
            <Segmentado
              etiqueta="Fondo del widget"
              valor={fondo}
              onChange={v => cambiar({ fondo: v === 'defecto' ? null : v === 'transparente' ? 'transparente' : (c.fondo && c.fondo !== 'transparente' ? c.fondo : COLOR_DE_FONDO) })}
              opciones={(nativa
                ? [{ valor: 'defecto', nombre: 'El de tu web' }, { valor: 'color', nombre: 'Un color' }]
                : [{ valor: 'defecto', nombre: 'El de tu página de reservas' }, { valor: 'transparente', nombre: 'Se funde con tu web' }, { valor: 'color', nombre: 'Un color' }]) as { valor: typeof fondo; nombre: string }[]}
            />
            {fondo === 'color' && (
              <div className="mt-3">
                <MuestraColor etiqueta="Color del fondo" valor={c.fondo} muestra={COLOR_DE_FONDO} onChange={v => cambiar({ fondo: v })} porDefecto="el de tu página de reservas" />
              </div>
            )}
          </Ajuste>
          {!nativa && (
            <Ajuste etiqueta="¿Tu web es clara u oscura?" descripcion="Para que la letra se lea bien sobre ella.">
              <Segmentado
                etiqueta="Tu web es clara u oscura"
                valor={tema}
                // Pulsar lo que ya está marcado no cambia el código.
                onChange={v => { if (v !== tema) cambiar({ tema: v }); }}
                opciones={[
                  ...(segunFondo ? [{ valor: 'auto' as const, nombre: 'Según el fondo' }] : []),
                  { valor: 'claro' as const, nombre: 'Clara' },
                  { valor: 'oscuro' as const, nombre: 'Oscura' },
                ]}
              />
            </Ajuste>
          )}
          <MuestraColor etiqueta="Texto" descripcion="El color de la letra." valor={c.tinta} muestra={MODO_TOKENS.dia.ink} onChange={v => cambiar({ tinta: v })} />
          {!nativa && (
            <>
              <MuestraColor etiqueta="Tarjetas" descripcion="El fondo de cada clase y de los campos." valor={c.superficie} muestra="#FFFFFF" onChange={v => cambiar({ superficie: v })} />
              <MuestraColor etiqueta="Bordes" descripcion="Líneas y separadores." valor={c.linea} muestra="#E4E1D8" onChange={v => cambiar({ linea: v })} />
            </>
          )}
          <SelectorFuente
            etiqueta="Letra"
            ayuda={nativa ? 'Sin tocar, la de tu web.' : 'Sin tocar, la de tu página de reservas.'}
            valor={c.fuente}
            onChange={v => cambiar({ fuente: v })}
            etiquetaPorDefecto={nativa ? 'La de tu web' : 'La de tu página de reservas'}
          />
          <SelectorFuente
            etiqueta="Letra de los titulares"
            ayuda="Nombres de clase, horas y precios."
            valor={c.fuenteDisplay}
            onChange={v => cambiar({ fuenteDisplay: v })}
            etiquetaPorDefecto="Igual que la de arriba"
          />
        </>
      )}
      {!nativa && (
        <Ajuste etiqueta="Esquinas" descripcion={soloBoton ? 'Las del botón.' : 'Tarjetas, botones y campos a la vez.'}>
          <Segmentado
            etiqueta="Esquinas"
            valor={c.forma ?? 'pill'}
            onChange={v => cambiar({ forma: v })}
            opciones={[{ valor: 'pill', nombre: 'Redondas' }, { valor: 'redondeado', nombre: 'Suaves' }, { valor: 'recto', nombre: 'Rectas' }] as const}
          />
        </Ajuste>
      )}
      {!nativa && !soloBoton && (
        <Ajuste etiqueta="Separación" descripcion="Más junta, caben más clases a la vista.">
          <Segmentado
            etiqueta="Separación"
            valor={c.densidad ?? 'comoda'}
            onChange={v => cambiar({ densidad: v === 'comoda' ? null : v })}
            opciones={[{ valor: 'comoda', nombre: 'Cómoda' }, { valor: 'compacta', nombre: 'Más junta' }] as const}
          />
        </Ajuste>
      )}
    </div>
  );
}
