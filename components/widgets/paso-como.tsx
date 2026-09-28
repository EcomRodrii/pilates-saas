'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SelectorFuente } from '@/components/ui/selector-fuente';
import { MODO_TOKENS } from '@/lib/portal-modo';
import type { MetodoIntegracion, WidgetDisponible } from '@/lib/widgets/catalogo';
import { anchoPorDefecto, type ConfigConstructor } from '@/lib/widgets/config';
import { botonDeSuWeb, usaBotonPropio, type PlataformaWeb } from '@/lib/widgets/recetas';
import { Ajuste, AjusteInterruptor, Etiqueta, FOCO, MuestraColor, Plegable, Segmentado, TACTIL, Tarjeta } from './piezas';

// Paso 2 · Cómo se ve. Por defecto, el estilo de su página de reservas: su
// color de marca (el de Apariencia) llega solo a lo que ya está pegado, sin
// tocar el código. Solo si quiere algo distinto para ESTE widget, plegado al
// final, los controles de siempre —en palabras suyas y sin un código de color a
// la vista—, que sí van congelados en el código.
//
// ⚠️ Solo el COLOR viene de Apariencia: /reservar fija su propia letra
// (`fuenteReservarCssText`, lib/reservar-publico-tokens.ts) y su paleta de
// fondos. Cuando la página de reservas tome también la letra y los fondos del
// tema (F1 del rediseño de /reservar), estos textos se amplían; antes, no.

const COLOR_DE_FONDO = '#F6F3EC';

export function PasoComo({ w, c, metodo, plataforma, cambiar, colorEstudio }: {
  w: WidgetDisponible;
  c: ConfigConstructor;
  metodo: MetodoIntegracion;
  plataforma: PlataformaWeb | null;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  colorEstudio: string;
}) {
  const propia = c.identidad === 'propia';
  const nativa = metodo === 'nativa';
  const soloBoton = metodo === 'boton';
  const botonPropio = soloBoton && usaBotonPropio(plataforma);

  const subtitulo = metodo === 'enlace'
    ? 'El enlace abre tu página de reservas, que se ve con su estilo.'
    : soloBoton
      ? 'El botón lleva a tu página de reservas, que se ve con su estilo.'
      : metodo === 'popup'
        ? 'Por defecto, la ventana se ve como tu página de reservas y lleva tu color de marca: si lo cambias en Apariencia, cambia sola. El color del botón, en cambio, va en el código.'
        : 'Por defecto se ve como tu página de reservas y lleva tu color de marca: si lo cambias en Apariencia, cambia solo, sin volver a pegar nada.';

  return (
    <div className="space-y-4">
      <Tarjeta titulo="¿Cómo quieres que se vea?" subtitulo={subtitulo}>
        <EstiloDeTuPagina colorEstudio={colorEstudio} nativa={nativa} enUso={!propia || botonPropio || metodo === 'enlace'} />

        {botonPropio && (
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            El botón lo pones con {botonDeSuWeb(plataforma)}: su color y su forma son los de tu web.
          </p>
        )}

        {metodo !== 'enlace' && !botonPropio && (
          <Plegable
            abierto={propia}
            className="border-t border-border pt-2"
            titulo={<span className="flex flex-wrap items-center gap-2">Un diseño distinto solo para {soloBoton ? 'este botón' : 'este widget'} <Etiqueta tipo="codigo" /></span>}
          >
            <div className="space-y-5">
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                No recibirá los cambios de estilo de tu página de reservas y, si lo tocas después de pegarlo, tendrás que copiar el código otra vez. Pensado para quien te hace la web.
              </p>
              <AjusteInterruptor
                etiqueta={`Usar un diseño propio en «${w.respuesta}»`}
                on={propia}
                onChange={v => cambiar({ identidad: v ? 'propia' : 'estudio' })}
              />
              {propia && <DisenoPropio c={c} nativa={nativa} soloBoton={soloBoton} cambiar={cambiar} colorEstudio={colorEstudio} />}
            </div>
          </Plegable>
        )}
      </Tarjeta>

      {(metodo === 'iframe' || metodo === 'popup') && (
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
          <AjusteInterruptor
            etiqueta="Dirección y aviso legal al pie"
            descripcion="Quítalo si tu web ya los tiene abajo. La privacidad y las condiciones se siguen enseñando al reservar."
            on={c.mostrarPie}
            onChange={v => cambiar({ mostrarPie: v })}
          />
        </Tarjeta>
      )}
    </div>
  );
}

// La tarjeta de solo lectura: lo que se ve si no se toca nada.
function EstiloDeTuPagina({ colorEstudio, nativa, enUso }: { colorEstudio: string; nativa: boolean; enUso: boolean }) {
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border p-3.5', enUso ? 'border-brand/60 bg-brand/5' : 'border-border')}>
      <span aria-hidden className="flex h-11 w-14 shrink-0 flex-col justify-center gap-1.5 rounded-lg border border-border bg-card px-2">
        <span className="h-1 w-8 rounded-full bg-foreground/60" />
        <span className="h-2.5 w-full rounded-full" style={{ background: colorEstudio }} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-semibold text-foreground">El estilo de tu página de reservas</p>
          <Etiqueta tipo="vivo" />
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {nativa
            ? 'Tu color de marca, el de Apariencia, con la letra de tu propia web.'
            : 'Tu color de marca, el de Apariencia. La letra y los fondos son los de tu página de reservas.'}{' '}
          {enUso ? 'Si cambias tu color, tu web cambia con él.' : 'Ahora no lo usa: lleva un diseño propio (abajo).'}
        </p>
        <Link href="/configuracion/apariencia" className={cn(TACTIL, 'mt-1 gap-0.5 text-[12.5px] font-medium text-foreground underline underline-offset-2 hover:no-underline', FOCO)}>
          Cambiar tu color en Apariencia<ArrowUpRight size={12} aria-hidden />
        </Link>
      </div>
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
