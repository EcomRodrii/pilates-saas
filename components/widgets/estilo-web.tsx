'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowUpRight, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { btnPrimary, btnSecondary } from '@/components/configuracion/estilos';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DibujoEstilo } from '@/components/apariencia/muestra-estilo';
import { ESTILOS, TIPOGRAFIAS, estiloPorId, tipografiaPorId, type EstiloId, type Tipografia } from '@/lib/student/apariencia';
import { COLOR_OTRO_INICIAL, COLOR_WEB, colorDeLaWeb, type BotonWeb, type FormaWeb, type WebId, type WidgetWeb } from '@/lib/reservar/estilo-web-tipos';
import { nadaParaSinMarco } from '@/lib/widget/estilo-nativa';
import { botonPorDefecto, botonWeb, paletaWidget, type BaseEstiloWeb } from '@/lib/reservar/estilo-web';
import type { MetodoIntegracion } from '@/lib/widgets/catalogo';
import type { PiezasAfectadas } from '@/lib/widgets/estilo-afectados';
import { Ajuste, AjusteInterruptor, FOCO, GrupoOpciones, MuestraColor, Plegable, Segmentado, TACTIL, type Opcion } from './piezas';
import type { EstiloWebPanel } from './usar-estilo-web';

// «¿Cómo quieres que se vea?»: UN estilo para todos los widgets que pone dentro
// de su web (Fase B del constructor, 28-sep-2026). Lo que elige aquí no va en
// el código: se aplica con «Aplicar en mi web» y cambia solo en todo lo ya
// pegado. Hasta entonces es un borrador que solo ve ella, en la vista previa.
//
// En su vocabulario y sin un código de color a la vista: los ocho estilos de su
// app en miniatura (los mismos dibujos que en Apariencia), las parejas de letra
// con su «Aa», tres preguntas sobre su web y, plegado, lo fino. Cada muestra se
// pinta con las mismas funciones que /reservar (lib/reservar/estilo-web.ts), así
// que el botón que se ve aquí es el que verá su alumna.
//
// ⚠️ El veredicto de contraste es el MISMO que el del servidor
// (`validarEstiloWeb`): lo que aquí se deja aplicar, allí se acepta, y lo que
// aquí se bloquea, allí da 422.
//
// Sin marco (Fase E) también lo sigue, con dos diferencias que se dicen donde
// pasan: con «Como tu app» conserva la letra que ya tenía (la de su web, con la
// identidad del estudio), y no lleva pie.

/** «A», «A y B», «A, B y C». */
function enLista(xs: readonly string[]): string {
  return xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
}

/**
 * Lo que la confirmación dice de lo copiado sin marco (`piezas.sinMarco` y
 * `sinMarcoSoloLetra`, lib/widgets/estilo-afectados.ts). Hoy solo el horario
 * va sin marco; el plural queda por si otro lo admite.
 */
function frasesSinMarco(piezas: PiezasAfectadas, borrador: WidgetWeb): string[] {
  const out: string[] = [];
  const { sinMarco, sinMarcoSoloLetra: soloLetra } = piezas;
  if (sinMarco.length > 0) {
    const varios = sinMarco.length > 1;
    const quien = enLista(sinMarco);
    out.push(nadaParaSinMarco(borrador)
      // Nada que le llegue (quitar solo el pie tampoco: no lleva): vuelve a su
      // aspecto de siempre (solo se nombra si alguna vez le llegó otro).
      ? (varios
        ? `${quien} van sin marco: sin ningún cambio de estilo, vuelven a verse como antes de que aplicaras uno.`
        : `${quien} va sin marco: sin ningún cambio de estilo, vuelve a verse como antes de que aplicaras uno.`)
      : (varios
        ? `${quien} van sin marco y también cambian, aunque los pegaras hace tiempo: el estilo les llega con sus datos, no con su código.`
        : `${quien} va sin marco y también cambia, aunque lo pegaras hace tiempo: el estilo le llega con sus datos, no con su código.`));
  }
  if (soloLetra.length > 0) {
    const varios = soloLetra.length > 1;
    const quien = enLista(soloLetra);
    // «Siete días en columnas» de noche: de este estilo solo le llegaría la
    // letra, y con «Como tu app» ni esa (sin marco conserva la suya).
    out.push(borrador.letra === null
      ? (varios
        ? `${quien} van sin marco y en «Siete días en columnas»: no se pintan en oscuro, así que de este estilo no les llega nada y se ven como si no hubieras elegido ninguno.`
        : `${quien} va sin marco y en «Siete días en columnas»: no se pinta en oscuro, así que de este estilo no le llega nada y se ve como si no hubieras elegido ninguno.`)
      : (varios
        ? `${quien} van sin marco y en «Siete días en columnas»: no se pintan en oscuro, así que de este estilo solo les llega la letra.`
        : `${quien} va sin marco y en «Siete días en columnas»: no se pinta en oscuro, así que de este estilo solo le llega la letra.`));
  }
  return out;
}

export function EstiloWeb({ estado, metodo, letraSinMarco = null, soloLectura, verApariencia, piezas, disenoPropio }: {
  estado: EstiloWebPanel;
  metodo: MetodoIntegracion;
  /**
   * El widget abierto va sin marco y le llega este estilo: con «Como tu app»
   * conserva la letra que ya tiene —la de su web con la identidad del estudio
   * (`'web'`), la de siempre con un diseño propio que no toca nada de lo que
   * entiende la nativa (`'siempre'`)—. `null`: no va sin marco, o no le llega.
   */
  letraSinMarco?: 'web' | 'siempre' | null;
  /** Una manager: ve lo que hay, pero solo la propietaria lo cambia (como en el servidor). */
  soloLectura: boolean;
  /** «Apariencia de tu app» es una pantalla solo de la propietaria. */
  verApariencia: boolean;
  /** Lo copiado desde aquí a lo que llega (lib/widgets/estilo-afectados.ts), para la confirmación. */
  piezas: PiezasAfectadas;
  /** «Un diseño distinto solo para este widget», justo después de «Ajustes finos». */
  disenoPropio?: ReactNode;
}) {
  const [confirmando, setConfirmando] = useState(false);

  if (estado.fase === 'cargando') {
    return (
      <>
        <p role="status" className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <Loader2 size={13} className="animate-spin" aria-hidden />Cargando el estilo de tus widgets…
        </p>
        {disenoPropio}
      </>
    );
  }
  if (estado.fase === 'error-carga' || !estado.base) {
    return (
      <>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3">
          <p role="alert" className="flex min-w-0 flex-1 items-start gap-2 text-[13px] font-medium text-foreground">
            <AlertCircle size={15} aria-hidden className="mt-0.5 shrink-0 text-destructive" />No hemos podido leer el estilo de tus widgets.
          </p>
          <button type="button" onClick={estado.reintentarCarga} className={btnSecondary}>Reintentar</button>
        </div>
        {disenoPropio}
      </>
    );
  }

  const { borrador: b, base, cambiar } = estado;
  const estilo = b.estilo ?? base.app.estilo;
  const web = colorDeLaWeb(b);
  // Lo que se ve donde va ESTE widget: dentro de su web, si se funde y su estilo
  // no se lee sobre ella, los neutros son los del otro lado (claro ↔ Carbón); en
  // la ventana que se abre encima nunca se funde (`resolverEstiloWeb(…,
  // 'ventana')`). Los botones se miden ahí: medirlos fundidos en un popup
  // prometía «tu color como es» donde la ventana lo pinta aclarado, y al revés.
  const vista = paletaWidget(estilo, web, metodo === 'popup' ? false : b.fundido);
  const aplicando = estado.envio === 'aplicando';
  // Tras un 409 se vuelve a leer lo que hay en su web: mientras, lo que llegue pisa el borrador.
  const ocupado = aplicando || estado.relectura === 'releyendo';
  const errorDe = (campo: 'colorWeb' | 'boton') => estado.errores.find(e => e.campo === campo)?.mensaje ?? null;

  return (
    <>
      {/* Deshabilitado de golpe: en solo lectura, y mientras se aplica o se vuelve a leer (lo que llega del servidor pisa el borrador). */}
      <fieldset disabled={soloLectura || ocupado} className="m-0 min-w-0 space-y-6 border-0 p-0">
        <legend className="sr-only">El estilo de tus widgets</legend>

        <Ajuste etiqueta="Estilo">
          <RejillaEstilos b={b} base={base} cambiar={cambiar} verApariencia={verApariencia} />
        </Ajuste>

        <Ajuste etiqueta="Letra">
          <GrupoOpciones
            etiqueta="Letra de tus widgets"
            tamano="mini"
            className="grid-cols-3 @md/config:grid-cols-5"
            valor={b.letra ?? 'app'}
            onChange={v => cambiar({ letra: v === 'app' ? null : v })}
            opciones={[
              { valor: 'app' as const, titulo: 'Como tu app', detalle: tipografiaPorId(base.app.tipografia).nombre, dibujo: <Aa t={tipografiaPorId(base.app.tipografia)} /> },
              // La de su app ya es «Como tu app»; solo se repite si la eligió aparte.
              ...TIPOGRAFIAS
                .filter(t => t.id !== base.app.tipografia || b.letra === t.id)
                .map(t => ({ valor: t.id, titulo: t.nombre, dibujo: <Aa t={t} /> })),
            ]}
          />
          {letraSinMarco && (
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              {letraSinMarco === 'web'
                ? 'Sin marco, «Como tu app» deja la letra de tu web; si eliges otra, la usa.'
                : 'Sin marco, «Como tu app» le deja su letra de siempre; si eliges otra, la usa.'}
            </p>
          )}
        </Ajuste>

        <Ajuste etiqueta="¿Cómo es tu web?">
          <GrupoOpciones
            etiqueta="Cómo es tu web"
            tamano="mini"
            className="grid-cols-4"
            // Sin contestar ≡ blanca: se guarda `null` para no tener dos formas de decir lo mismo.
            valor={b.web ?? 'blanca'}
            onChange={v => cambiar({ web: v === 'blanca' ? null : v })}
            opciones={([
              ['blanca', 'Blanca', COLOR_WEB.blanca],
              ['crema', 'Crema', COLOR_WEB.crema],
              ['oscura', 'Oscura', COLOR_WEB.oscura],
              ['otro', 'Otro color', b.web === 'otro' ? web : COLOR_OTRO_INICIAL],
            ] as const).map(([valor, titulo, color]): Opcion<WebId> => ({
              valor, titulo, dibujo: <span className="block h-6 rounded-md border border-black/10" style={{ background: color }} />,
            }))}
          />
          {b.web === 'otro' ? (
            <div className="mt-3">
              <MuestraColor
                etiqueta="Color de tu web"
                descripcion="El color del fondo de la página donde lo vas a poner."
                valor={b.colorWeb && b.colorWeb.toLowerCase() !== COLOR_OTRO_INICIAL.toLowerCase() ? b.colorWeb : null}
                muestra={COLOR_OTRO_INICIAL}
                porDefecto="el de ejemplo"
                onChange={v => cambiar({ colorWeb: v ?? COLOR_OTRO_INICIAL })}
              />
            </div>
          ) : (
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">Mira el fondo de la página donde lo vas a poner.</p>
          )}
        </Ajuste>

        <Ajuste etiqueta="¿Que se funda con tu web o que vaya en su recuadro?">
          <GrupoOpciones
            etiqueta="Fondo"
            className="grid-cols-2"
            valor={b.fundido ? 'fundido' : 'recuadro'}
            onChange={v => cambiar({ fundido: v === 'fundido' })}
            opciones={[
              { valor: 'recuadro' as const, titulo: 'En su propio recuadro', dibujo: <DibujoFondo web={web} estilo={estilo} fundido={false} /> },
              { valor: 'fundido' as const, titulo: 'Que se funda con tu web', dibujo: <DibujoFondo web={web} estilo={paletaWidget(estilo, web, true).neutros} fundido /> },
            ]}
          />
          {metodo === 'popup' && b.fundido && (
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">En la ventana que se abre encima no se funde: va en su recuadro.</p>
          )}
          <AvisoContraste mensaje={errorDe('colorWeb')} />
        </Ajuste>

        <Ajuste etiqueta="Color de los botones">
          <ColorBotones b={b} base={base} neutros={vista.neutros} fondo={vista.tokens.bg} cambiar={cambiar} />
          <AvisoContraste mensaje={errorDe('boton')} />
        </Ajuste>

        <Plegable
          titulo="Ajustes finos"
          // Si ya tiene algo elegido aquí, se enseña: lo aplicado no se esconde.
          abierto={b.forma !== null || b.densidad !== null || b.ocultarPie}
          className="border-t border-border pt-2"
        >
          <div className="space-y-5">
            <Ajuste etiqueta="Esquinas">
              <GrupoOpciones
                etiqueta="Esquinas de tus widgets"
                tamano="mini"
                className="grid-cols-2 @md/config:grid-cols-4"
                valor={b.forma ?? 'siempre'}
                onChange={v => cambiar({ forma: v === 'siempre' ? null : v })}
                opciones={([
                  ['siempre', 'Las de siempre'],
                  ['pill', 'Redondas'],
                  ['redondeado', 'Suaves'],
                  ['recto', 'Rectas'],
                ] as const).map(([valor, titulo]): Opcion<FormaWeb | 'siempre'> => ({
                  valor, titulo, dibujo: <DibujoEsquinas radios={RADIOS_DIBUJO[valor]} />,
                }))}
              />
            </Ajuste>
            <Ajuste etiqueta="Separación">
              <Segmentado
                etiqueta="Separación de tus widgets"
                valor={b.densidad ?? 'comoda'}
                onChange={v => cambiar({ densidad: v === 'compacta' ? 'compacta' : null })}
                opciones={[{ valor: 'comoda', nombre: 'Cómoda' }, { valor: 'compacta', nombre: 'Compacta: caben más clases' }] as const}
              />
            </Ajuste>
            <AjusteInterruptor
              etiqueta="Dirección y aviso legal al pie"
              descripcion={metodo === 'nativa'
                ? 'Quítalo si tu web ya los tiene abajo. La privacidad y las condiciones se siguen enseñando al reservar. Sin marco, el widget no lleva pie.'
                : 'Quítalo si tu web ya los tiene abajo. La privacidad y las condiciones se siguen enseñando al reservar.'}
              on={!b.ocultarPie}
              onChange={v => cambiar({ ocultarPie: !v })}
            />
          </div>
        </Plegable>
      </fieldset>

      {disenoPropio}

      {soloLectura ? (
        <p className="rounded-xl bg-muted px-3.5 py-3 text-[12.5px] text-foreground">Solo la propietaria puede cambiar el estilo de tus widgets.</p>
      ) : (
        <BarraAplicar estado={estado} onAplicar={() => setConfirmando(true)} />
      )}

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent className="max-w-[min(calc(100%-2rem),28rem)]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Aplicar este estilo en tu web?</DialogTitle>
            <DialogDescription>
              Cambiará a la vez en todos los widgets de tu web que no lleven un diseño propio, en cuanto tus alumnas vuelvan a abrir la página.{' '}
              <strong className="font-semibold text-foreground">No tienes que volver a pegar ningún código.</strong>
            </DialogDescription>
          </DialogHeader>
          {/* Solo lo que sabemos: lo copiado desde aquí, nunca «tus N widgets» (no vemos qué hay pegado). */}
          <div className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
            {piezas.cambian.length > 0 && <p>Entre ellos, los que copiaste desde aquí: {enLista(piezas.cambian)}.</p>}
            {piezas.columnasSinPaleta.length > 0 && (
              // /reservar no pinta de noche la semana en columnas (`columnasSinPaleta`).
              <p>{enLista(piezas.columnasSinPaleta)}: con «Siete días en columnas» no se {piezas.columnasSinPaleta.length > 1 ? 'pintan' : 'pinta'} en oscuro, así que de este estilo solo {piezas.columnasSinPaleta.length > 1 ? 'les' : 'le'} llegan la letra, las esquinas, la separación y el pie.</p>
            )}
            {/*
              Sin marco (Fase E): el estilo le llega con sus datos, así que también
              cambia lo pegado hace tiempo, sin volver a pegar nada; salvo las
              columnas de noche, donde como mucho le llega la letra.
            */}
            {frasesSinMarco(piezas, b).map(f => <p key={f}>{f}</p>)}
            <p>Los widgets con un diseño propio dentro de su código no cambian.</p>
            {/*
              El botón que abre la ventana (Fase D), y solo si este estilo cambia cómo
              se ve (`cambiaElBotonDeLaVentana`): lo copiado leyendo sus variables
              (`copiado.botonVivo`) lo sigue, aunque /api/public/widget-boton lo cachea
              unos minutos; lo copiado antes lleva su color literal y se queda como está.
              Volver a pegarlo es opcional y solo por el botón: no contradice «No tienes
              que volver a pegar ningún código». Y nada de «lo de dentro de la ventana,
              sí»: con las columnas de noche no le llega todo (la línea de arriba).
            */}
            {piezas.botonesVivos.length > 0 && (
              <p>
                {piezas.botonesVivos.length > 1
                  ? `Los botones que abren la ventana de ${enLista(piezas.botonesVivos)} también cambian, aunque pueden tardar unos minutos más.`
                  : `El botón que abre la ventana de ${piezas.botonesVivos[0]} también cambia, aunque puede tardar unos minutos más.`}
              </p>
            )}
            {piezas.botonesCongelados.length > 0 && (
              <p>
                {piezas.botonesCongelados.length > 1
                  ? `Los botones que abren la ventana de ${enLista(piezas.botonesCongelados)} son de un código anterior y se quedan como están. Si quieres que también cambien solos, copia su código otra vez y pégalo en lugar del de antes.`
                  : `El botón que abre la ventana de ${piezas.botonesCongelados[0]} es de un código anterior y se queda como está. Si quieres que también cambie solo, copia su código otra vez y pégalo en lugar del de antes.`}
              </p>
            )}
            {piezas.hayPagina && <p>Los enlaces y botones que llevan a tu página no cambian: tu página se ve como tu app.</p>}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={() => { setConfirmando(false); void estado.aplicar(); }}>Aplicar en mi web</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Estilo ────────────────────────────────────────────────────────────────────

type ValorEstilo = EstiloId | 'app';

/**
 * UN `radiogroup` con los nueve: «Igual que tu app» a todo el ancho y los ocho
 * estilos en miniatura. No es `GrupoOpciones` porque entre el primero y los
 * demás van el enlace a Apariencia y una frase, y cada miniatura lleva la
 * descripción del estilo en `title`. El teclado es el mismo: una parada de
 * tabulación, y las flechas mueven y eligen.
 */
function RejillaEstilos({ b, base, cambiar, verApariencia }: {
  b: WidgetWeb;
  base: BaseEstiloWeb;
  cambiar: (parcial: Partial<WidgetWeb>) => void;
  verApariencia: boolean;
}) {
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const valores: ValorEstilo[] = ['app', ...ESTILOS.map(e => e.id)];
  const marcado: ValorEstilo = b.estilo ?? 'app';
  const elegir = (v: ValorEstilo) => cambiar({ estilo: v === 'app' ? null : v });

  function teclas(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const paso = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const j = (i + paso + valores.length) % valores.length;
    elegir(valores[j]);
    botones.current[j]?.focus();
  }
  // Cada miniatura con el botón que llevaría: el mismo que pintará /reservar.
  const dibujo = (id: EstiloId) => {
    const boton = botonWeb(b.boton, id, base);
    return <DibujoEstilo estilo={id} acento={boton.fondo} boton={boton} tamano="mini" />;
  };
  const radio = (v: ValorEstilo, i: number, className: string, contenido: ReactNode, title?: string) => (
    <button
      key={v}
      ref={el => { botones.current[i] = el; }}
      type="button"
      role="radio"
      aria-checked={marcado === v}
      tabIndex={marcado === v ? 0 : -1}
      title={title}
      onClick={() => elegir(v)}
      onKeyDown={e => teclas(e, i)}
      className={cn(
        'relative flex min-h-11 min-w-0 rounded-xl border text-left transition-colors',
        marcado === v ? 'border-brand/60 bg-brand/5 ring-1 ring-brand/30' : 'border-border bg-card hover:bg-muted/40',
        FOCO,
        className,
      )}
    >
      {contenido}
    </button>
  );
  const app = estiloPorId(base.app.estilo);

  return (
    <div role="radiogroup" aria-label="Estilo de tus widgets" className="grid grid-cols-4 gap-2">
      {radio('app', 0, 'col-span-4 items-center gap-3 p-2.5', (
        <>
          <span className="block w-20 shrink-0 overflow-hidden rounded-lg border border-border">{dibujo(app.id)}</span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-foreground">Igual que tu app · {app.nombre}</span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">Si cambias el estilo de tu app, tu web cambia con ella.</span>
          </span>
        </>
      ))}
      <div className="col-span-4 space-y-2">
        {verApariencia && (
          <Link href="/configuracion/apariencia" className={cn(TACTIL, 'gap-0.5 text-[12.5px] font-medium text-foreground underline underline-offset-2 hover:no-underline', FOCO)}>
            Cambiar el estilo de tu app<ArrowUpRight size={12} aria-hidden />
          </Link>
        )}
        <p className="pt-1 text-[12px] text-muted-foreground">O un estilo solo para tu web:</p>
      </div>
      {ESTILOS.map((e, n) => radio(e.id, n + 1, 'flex-col items-stretch gap-1.5 p-1.5', (
        <>
          <span className="block overflow-hidden rounded-lg border border-border">{dibujo(e.id)}</span>
          <span className="block truncate px-0.5 text-[12px] font-semibold text-foreground">{e.nombre}</span>
        </>
      ), e.descripcion))}
    </div>
  );
}

/** «Aa» en la letra de los titulares de la pareja, como se ve en su web. */
function Aa({ t }: { t: Tipografia }) {
  return (
    <span className="block text-center leading-none text-foreground" style={{ fontFamily: t.titulos, fontWeight: t.pesoTitulo, fontSize: 22 * t.escalaTitulo }}>
      Aa
    </span>
  );
}

/**
 * Los radios de tarjeta y botón de cada preset, los de `forma=`
 * (lib/reservar/apariencia-widget.ts). «Las de siempre» son las de /reservar
 * sin tocar (20 y píldora): F1 no aplica las esquinas del estilo de la app, así
 * que dibujar aquí las de su estilo sería prometer algo que no se ve.
 */
const RADIOS_DIBUJO: Record<FormaWeb | 'siempre', { tarjeta: number; boton: number }> = {
  siempre: { tarjeta: 20, boton: 999 },
  pill: { tarjeta: 20, boton: 999 },
  redondeado: { tarjeta: 16, boton: 13 },
  recto: { tarjeta: 10, boton: 6 },
};

/** Una tarjeta con su botón, con las esquinas a escala. */
function DibujoEsquinas({ radios }: { radios: { tarjeta: number; boton: number } }) {
  return (
    <svg viewBox="0 0 60 34" className="mx-auto block h-8 w-auto" aria-hidden>
      <rect x="6" y="4" width="48" height="26" rx={radios.tarjeta * 0.26} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="33" y="19" width="16" height="7" rx={radios.boton > 100 ? 3.5 : radios.boton * 0.19} fill="currentColor" />
    </svg>
  );
}

/** Su web alrededor y el widget: en su recuadro, o fundido (sin fondo propio). */
function DibujoFondo({ web, estilo, fundido }: { web: string; estilo: EstiloId; fundido: boolean }) {
  const e = estiloPorId(estilo);
  return (
    <svg viewBox="0 0 90 44" className="block h-auto w-full rounded-md" aria-hidden>
      <rect width="90" height="44" fill={web} />
      {!fundido && <rect x="14" y="6" width="62" height="32" rx="6" fill={e.background} stroke={e.border} />}
      <rect x="20" y={fundido ? 10 : 12} width="50" height="8" rx="2" fill={e.card} stroke={e.border} />
      <rect x="20" y="24" width="50" height="8" rx="2" fill={e.card} stroke={e.border} />
    </svg>
  );
}

// ── Color de los botones ─────────────────────────────────────────────────────

/**
 * Tres opciones con su muestra de verdad (sobre lo que la rodea en su web). La
 * que se ve igual que la de por defecto lleva la insignia, y elegirla guarda
 * «por defecto» (`null`): así, si mañana cambia su app, sigue a la regla y no
 * a un color que ya no es el suyo. Si ninguna coincide, «Por defecto» es una
 * cuarta opción.
 */
function ColorBotones({ b, base, neutros, fondo, cambiar }: {
  b: WidgetWeb;
  base: BaseEstiloWeb;
  neutros: EstiloId;
  /** Lo que hay detrás del botón: el fondo del widget, o su web si se funde. */
  fondo: string;
  cambiar: (parcial: Partial<WidgetWeb>) => void;
}) {
  const oscuro = estiloPorId(neutros).oscuro === true;
  const def = botonPorDefecto(neutros, base);
  const pill = estiloPorId(neutros).radios.pill;
  const muestra = (boton: BotonWeb | null) => {
    const s = botonWeb(boton, neutros, base);
    return (
      <span className="block rounded-md p-2" style={{ background: fondo }}>
        <span
          className="flex h-8 items-center justify-center px-3 text-[12px] font-semibold"
          style={{ background: s.fondo, color: s.texto, borderRadius: pill > 100 ? 999 : pill }}
        >
          Reservar
        </span>
      </span>
    );
  };
  const opciones: Opcion<BotonWeb | 'defecto'>[] = [
    {
      valor: 'tinta', titulo: oscuro ? 'Claros' : 'Oscuros',
      detalle: `Sin tu color: botones y detalles en ${oscuro ? 'claro' : 'oscuro'}.`, dibujo: muestra('tinta'),
    },
    { valor: 'suave', titulo: 'Tu color, suave', dibujo: muestra('suave') },
    {
      valor: 'fiel', titulo: 'Tu color tal cual',
      // De día, el crudo si se lee y si no, oscurecido lo justo (`acentoFiel`).
      // De noche nunca es el crudo: siempre una versión clara (`acentoDe`, que
      // lo sube al menos a luminosidad 62), aunque el crudo ya se leyera.
      detalle: oscuro ? 'Sobre fondo oscuro, una versión clara de tu color, para que se lea.' : 'Tu color como es. Si no se lee bien, lo oscurecemos lo justo.',
      dibujo: muestra('fiel'),
    },
  ];
  if (def === null) opciones.push({ valor: 'defecto', titulo: 'Por defecto', dibujo: muestra(null) });
  return (
    <GrupoOpciones
      etiqueta="Color de los botones"
      className={cn('grid-cols-2', def !== null && '@md/config:grid-cols-3')}
      valor={b.boton ?? def ?? 'defecto'}
      onChange={v => cambiar({ boton: v === 'defecto' || v === def ? null : v })}
      opciones={opciones.map(o => (o.valor === def ? { ...o, insignia: 'Por defecto' } : o))}
    />
  );
}

function AvisoContraste({ mensaje }: { mensaje: string | null }) {
  return (
    <div aria-live="polite">
      {mensaje && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground">
          <AlertCircle size={15} aria-hidden className="mt-0.5 shrink-0 text-warning" />{mensaje}
        </p>
      )}
    </div>
  );
}

// ── Aplicar ───────────────────────────────────────────────────────────────────

function BarraAplicar({ estado, onAplicar }: { estado: EstiloWebPanel; onAplicar: () => void }) {
  const { pendiente, envio, errores, anterior, ultimo, mensajeFallo, relectura } = estado;
  const aplicando = envio === 'aplicando';
  // Tras un 409, lo que teníamos por publicado ya no lo es: hasta volver a
  // leerlo no se afirma qué hay en su web, ni se aplica o deshace contra eso.
  const sinSaber = relectura !== null;
  const texto: ReactNode = aplicando
    ? <span className="inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" aria-hidden />Aplicando…</span>
    : relectura === 'releyendo'
      ? <span className="inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" aria-hidden />Leyendo lo que hay ahora en tu web…</span>
      : relectura === 'fallo'
        ? 'No hemos podido leer lo que hay ahora en tu web.'
        : pendiente
          ? <>Cambios sin aplicar: <strong className="font-semibold">solo los ves tú</strong></>
          : envio === 'aplicado' ? 'Aplicado en tu web · hace un momento' : 'Es lo que hay ahora en tu web';
  const aviso = pendiente || aplicando || sinSaber ? null
    : envio === 'aplicado' ? 'Aplicado en tu web. Tus widgets lo toman al volver a abrirse.'
      : ultimo === 'deshacer' ? 'Hemos vuelto a poner el estilo de antes en tu web.' : null;
  const puedeDeshacer = anterior !== undefined && !pendiente && !aplicando && !sinSaber;

  return (
    <div role="group" aria-label="Aplicar el estilo en tu web" className="space-y-2.5 rounded-xl border border-border bg-muted/40 p-3.5">
      <p role="status" aria-live="polite" className="flex items-start gap-2 text-[12.5px] leading-relaxed text-foreground">
        <span aria-hidden className={cn('mt-[7px] size-2 shrink-0 rounded-full', pendiente || aplicando || sinSaber ? 'bg-warning' : 'bg-success')} />
        <span className="min-w-0">{texto}</span>
      </p>
      {aviso && (
        <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
          <Check size={13} aria-hidden className="mt-0.5 shrink-0 text-success" />{aviso}
        </p>
      )}
      {mensajeFallo && (
        // El borrador se queda: se puede volver a intentar sin elegir nada otra vez.
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] leading-relaxed text-foreground">
          <AlertCircle size={15} aria-hidden className="mt-0.5 shrink-0 text-destructive" />{mensajeFallo}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        {relectura === 'fallo' && (
          <button type="button" onClick={estado.releer} className={cn(TACTIL, 'text-[12.5px] font-medium text-foreground underline underline-offset-2 hover:no-underline', FOCO)}>
            Volver a leer
          </button>
        )}
        {pendiente && !aplicando && !sinSaber && (
          <button type="button" onClick={estado.descartar} className={cn(TACTIL, 'text-[12.5px] font-medium text-foreground underline underline-offset-2 hover:no-underline', FOCO)}>
            Descartar
          </button>
        )}
        {puedeDeshacer && (
          <button type="button" onClick={() => void estado.deshacer()} className={cn(TACTIL, 'text-[12.5px] font-medium text-foreground underline underline-offset-2 hover:no-underline', FOCO)}>
            Deshacer
          </button>
        )}
        <button type="button" onClick={onAplicar} disabled={!pendiente || errores.length > 0 || aplicando || sinSaber} className={btnPrimary}>
          Aplicar en mi web
        </button>
      </div>
    </div>
  );
}
