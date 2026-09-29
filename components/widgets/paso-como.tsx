'use client';

import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { SelectorFuente } from '@/components/ui/selector-fuente';
import { MODO_TOKENS } from '@/lib/portal-modo';
import type { MetodoIntegracion, WidgetDisponible } from '@/lib/widgets/catalogo';
import { anchoPorDefecto, type ConfigConstructor } from '@/lib/widgets/config';
import { tieneDisenoEnCodigo } from '@/lib/widgets/integracion';
import { columnasSinPaleta, sinMarcoSoloLetra, type PiezasAfectadas } from '@/lib/widgets/estilo-afectados';
import { nadaParaSinMarco } from '@/lib/widget/estilo-nativa';
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
// el botón a su página abren la página suelta (se ve como su app), y un diseño
// propio en el código no lo recibe. La integración sin marco sí lo sigue desde
// la Fase E, con sus datos y sin volver a pegar nada: mientras no hay nada
// elegido se ve como siempre, y se dice. Y lo que lo sigue a medias, en cuanto
// pasa: «Siete días en columnas» con un estilo de noche (sin marco, como mucho
// la letra, y con «Como tu app» nada).

const COLOR_DE_FONDO = '#F6F3EC';
/** El primario de siempre de la nativa sin `data-marca` ni identidad del estudio (`montarUno`, app/widget-bundle/main.tsx). */
const COLOR_WIDGET_NATIVA = '#343825';

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
  // El pie ya es del estilo de su web («Ajustes finos»). Aquí sigue el
  // interruptor de cada widget en dos casos, y su `pie=0` va en el código:
  //   · con un diseño propio en su código, porque a ese widget el estilo de su
  //     web no le llega —tampoco su pie— (`urlTraeDisenoPropio`), y esta es la
  //     única forma de quitárselo;
  //   · si ya lo apagó en ESTE widget, para que pueda volver a encenderlo. Eso
  //     se mira también al abrirlo y, una vez tocado, se queda: si no, al
  //     quitar el diseño propio y volver a encenderlo desaparecería bajo el dedo.
  const [pieApagadoAlAbrir] = useState(() => c.mostrarPie === false);
  const [pieTocado, setPieTocado] = useState(false);
  const disenoEnCodigo = tieneDisenoEnCodigo(c);
  const pieDelWidget = disenoEnCodigo || pieApagadoAlAbrir || pieTocado || c.mostrarPie === false;

  // La misma cuenta que la confirmación de «Aplicar en mi web», con el borrador
  // que se está probando: lo que haría /reservar con el código de este widget.
  const sinPaleta = !!estilo.base && columnasSinPaleta(w, c, metodo, estilo.borrador, estilo.base);
  // Sin marco, con la regla de SUS `data-*` (la nativa solo entiende marca,
  // fondo, tinta y letra): «propia» con solo una superficie sigue el estilo.
  const disenoEnSuCodigo = tieneDisenoEnCodigo(c, metodo);
  // «Nada» es lo que no le llega sin marco, la misma pregunta que el bundle: quitar
  // solo el pie no cuenta, porque la nativa no lleva.
  const sinMarcoSinNada = nativa && estilo.fase === 'listo' && nadaParaSinMarco(estilo.borrador);
  const sinMarcoLetra = nativa && !!estilo.base && sinMarcoSoloLetra(w, c, estilo.borrador, estilo.base);

  const aviso: ReactNode = metodo === 'enlace' || soloBoton
    ? <>Con {metodo === 'enlace' ? 'un enlace' : 'un botón que lleva a tu página'}, tu página de reservas se ve <strong className="font-semibold">como tu app</strong>. Este estilo es para lo que pongas dentro de tu web o en una ventana encima.</>
    : disenoEnSuCodigo
      ? 'Este widget lleva un diseño propio en su código (abajo): este estilo no le llega.'
      : sinMarcoSinNada
        // Con la identidad del estudio, su color (el del tema) y la letra de su
        // web; «propia» sin nada que la nativa entienda, su diseño de siempre.
        ? propia
          ? 'Sin marco, mientras no cambies nada de este estilo, el widget se ve con su diseño de siempre. En cuanto apliques un cambio, le llega solo, sin volver a pegar nada.'
          : 'Sin marco, mientras no cambies nada de este estilo, el widget se ve con tu color y la letra de tu web. En cuanto apliques un cambio, le llega solo, sin volver a pegar nada.'
        : sinMarcoLetra
          // De noche en columnas solo le llegaría la letra; con «Como tu app», ni esa.
          ? estilo.borrador.letra === null
            ? 'Sin marco y con «Siete días en columnas», este widget no se pinta en oscuro: de este estilo no le llega nada, y se ve como si no hubieras elegido ninguno.'
            : 'Sin marco y con «Siete días en columnas», este widget no se pinta en oscuro: de este estilo solo le llega la letra.'
          : sinPaleta
            ? 'Con «Siete días en columnas», este widget no se pinta en oscuro: de este estilo solo le llegan la letra, las esquinas, la separación y el pie.'
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
          letraSinMarco={nativa && !disenoEnSuCodigo ? (propia ? 'siempre' : 'web') : null}
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
              // cosa: se explica cuál es este para que no parezca que se
              // contradicen. Con un diseño propio, el de «Ajustes finos» no le
              // llega, y remitir allí sería mandarla a un interruptor que no hace nada.
              descripcion={disenoEnCodigo
                ? 'Solo para este widget, y va en su código: con un diseño propio, el de «Ajustes finos» no le llega.'
                : 'Solo para este widget, y va en su código. Para todos tus widgets a la vez, está en «Ajustes finos».'}
              on={c.mostrarPie}
              onChange={v => { setPieTocado(true); cambiar({ mostrarPie: v }); }}
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
      {/*
        Sin marco y con un diseño propio, el bundle no toma el color del estudio
        (`data-identidad` no va): sin `data-marca`, el de siempre del widget
        (`montarUno`, app/widget-bundle/main.tsx, y la vista previa).
      */}
      <MuestraColor
        etiqueta="Color principal"
        descripcion="Botones y acentos."
        valor={c.marca}
        muestra={nativa ? COLOR_WIDGET_NATIVA : colorEstudio}
        onChange={v => cambiar({ marca: v })}
        porDefecto={nativa ? 'el de siempre del widget' : undefined}
      />
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
                <MuestraColor etiqueta="Color del fondo" valor={c.fondo} muestra={COLOR_DE_FONDO} onChange={v => cambiar({ fondo: v })} porDefecto={nativa ? 'el de tu web' : 'el de tu página de reservas'} />
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
          <MuestraColor etiqueta="Texto" descripcion="El color de la letra." valor={c.tinta} muestra={MODO_TOKENS.dia.ink} onChange={v => cambiar({ tinta: v })} porDefecto={nativa ? 'el de siempre del widget' : undefined} />
          {!nativa && (
            <>
              <MuestraColor etiqueta="Tarjetas" descripcion="El fondo de cada clase y de los campos." valor={c.superficie} muestra="#FFFFFF" onChange={v => cambiar({ superficie: v })} />
              <MuestraColor etiqueta="Bordes" descripcion="Líneas y separadores." valor={c.linea} muestra="#E4E1D8" onChange={v => cambiar({ linea: v })} />
            </>
          )}
          <SelectorFuente
            etiqueta="Letra"
            // Sin marco, la letra de su web solo llega con la identidad del
            // estudio: con un diseño propio, la de siempre del widget (`montarUno`).
            ayuda={nativa ? 'Sin tocar, la de siempre del widget: con un diseño propio ya no toma la de tu web.' : 'Sin tocar, la de tu página de reservas.'}
            valor={c.fuente}
            onChange={v => cambiar({ fuente: v })}
            etiquetaPorDefecto={nativa ? 'La de siempre' : 'La de tu página de reservas'}
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
