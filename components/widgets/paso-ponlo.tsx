'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, BookOpen, Check, Code2, Copy, Loader2, Mail, Send } from 'lucide-react';
import { cn, copiarAlPortapapeles } from '@/lib/utils';
import { btnPrimary, btnSecondary, inputCls } from '@/components/configuracion/estilos';
import { METODOS, type MetodoIntegracion } from '@/lib/widgets/catalogo';
import { ETIQUETA_VALIDA, esCopiaCompleta, type ConfigConstructor, type Copiado } from '@/lib/widgets/config';
import { botonDeCodigoAnterior } from '@/lib/widgets/en-tu-web';
import {
  codigoPorId, faltaParaGenerar, firmaCodigo, generarCodigo, plataformasDe, tieneDisenoEnCodigo, urlPagina, type EntradaIntegracion,
} from '@/lib/widgets/integracion';
import {
  guiaDe, mensajeParaTuWeb, nombrePlataforma, pasosEnTuWeb, usaBotonPropio, type PlataformaWeb, type Receta,
} from '@/lib/widgets/recetas';
import { AjusteInterruptor, Ajuste, FOCO, Plegable, Tarjeta, fechaCorta } from './piezas';
import { SelectorClase, type DatosPanel } from './paso-que';

// Paso 3 · Ponlo en tu web. Un botón grande para copiar, los pasos de SU web y
// el código plegado —el <pre> sigue en el DOM: es lo que se copia y lo que leen
// los tests—. Lo técnico (sin marco, React, el nombre para las estadísticas)
// va aparte, para quien le hace la web.
//
// ⚠️ «Copiado» solo se dice si el portapapeles lo aceptó (#994: Safari puede
// decir que sí sin copiar nada). Y solo entonces se guarda la huella de lo
// copiado, que es lo que luego avisa de un código antiguo.
//
// Copiarlo A MANO (seleccionarlo en «Ver el código» y Ctrl+C) también cuenta
// (Fase D): el `copy` del navegador sube hasta el pliegue, y se guarda solo si
// lo seleccionado es el código ENTERO (`esCopiaCompleta`: un trozo no funciona
// pegado). Nunca se dice «Copiado» por esa vía: es la copia del navegador, no
// la nuestra, y no sabemos qué hizo con ella. Lo único que cambia es la línea
// «Lo copiaste aquí el…», que sale de lo guardado.

export function PasoPonlo({
  entrada, metodo, plataforma, receta, estudio, origen, copiado, desfase, estiloSinAplicar, estiloAplicado, onCopiado, onMetodo, cambiar,
  proximasClases, dominiosAutorizados, dominios, verDominios, showToast, preparando = false,
}: {
  entrada: EntradaIntegracion;
  metodo: MetodoIntegracion;
  plataforma: PlataformaWeb | null;
  receta: Receta;
  estudio: string;
  origen: string;
  copiado: Copiado | null;
  desfase: boolean;
  /**
   * Cambió el estilo de sus widgets en «Cómo se ve» y no lo ha aplicado. Se
   * dice aquí porque es donde se copia: podría creer que copiar se lo lleva.
   */
  estiloSinAplicar: boolean;
  /**
   * Hay un estilo de sus widgets aplicado en su web que le llega sin marco
   * (`nadaParaSinMarco`: quitar solo el pie no cuenta). `null` mientras carga
   * o si no se ha podido leer: no se dice nada que dependa de él.
   */
  estiloAplicado: boolean | null;
  onCopiado: (firma: string) => void;
  /**
   * Se está creando lo publicado de este widget (su id, la primera vez que se
   * abre este paso): hasta que llegue, el código de aquí no es el que se va a
   * pegar, y no se deja copiar.
   */
  preparando?: boolean;
  onMetodo: (m: MetodoIntegracion) => void;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  proximasClases: DatosPanel['proximasClases'];
  dominiosAutorizados: readonly string[];
  /** El gestor de webs autorizadas (integración sin marco). */
  dominios: ReactNode;
  /**
   * Viene de «Ir a las webs autorizadas» (la portada): abre «Para quien te hace
   * la web», donde está la lista. Quien lo pide lleva allí el foco.
   */
  verDominios?: boolean;
  showToast: (m: string) => void;
}) {
  const w = entrada.widget;
  const c = entrada.config;
  // El código va por id (lib/widgets/pieza.ts): lo que enseña llega al aplicar, sin volver a pegarlo.
  const porId = codigoPorId(entrada);
  const falta = faltaParaGenerar(entrada, metodo, { dominiosAutorizados });
  const botonPropio = metodo === 'boton' && usaBotonPropio(plataforma);
  const esEnlace = metodo === 'enlace' || botonPropio;
  const generado = generarCodigo(entrada, metodo, 'html');
  // Con el botón de su propia web se pega solo el enlace: el botón ya lo pone ella.
  const copiable = botonPropio ? urlPagina(entrada) : generado.codigo;
  const firma = firmaCodigo(entrada, metodo);
  const agencia = plataforma === 'agencia';
  const pasos = pasosEnTuWeb(plataforma === 'agencia' ? 'otra' : plataforma, metodo);
  const forma = METODOS[metodo].nombre;
  const guia = `${origen}${guiaDe(plataforma, metodo)}`;

  const detalles = useRef<HTMLDetailsElement>(null);
  const [recienCopiado, setRecienCopiado] = useState<'codigo' | 'react' | 'mensaje' | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);
  function marcar(que: 'codigo' | 'react' | 'mensaje') {
    setRecienCopiado(que);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setRecienCopiado(null), 2200);
  }

  async function copiar() {
    if (!(await copiarAlPortapapeles(copiable))) {
      // Decir «copiado» y que no lo esté es peor que decir que no: se iría a
      // su web a pegar nada y daría por roto el widget.
      if (detalles.current) detalles.current.open = true;
      showToast(`No se ha podido copiar. Abre «Ver ${esEnlace ? 'el enlace' : 'el código'}», selecciónalo y cópialo a mano.`);
      return;
    }
    onCopiado(firma);
    marcar('codigo');
  }

  // La copia a mano. `navigator.clipboard.writeText` (el botón) no dispara
  // `copy`, así que una misma acción nunca cuenta dos veces; y copiar lo mismo
  // otra vez al rato tampoco se guarda de nuevo (`esLaMismaCopia`, en el constructor).
  function alCopiarAMano() {
    if (esCopiaCompleta(window.getSelection()?.toString() ?? '', copiable)) onCopiado(firma);
  }

  async function copiarReact() {
    if (!(await copiarAlPortapapeles(generarCodigo(entrada, metodo, 'react').codigo))) {
      showToast('No se ha podido copiar el componente.');
      return;
    }
    onCopiado(firma);
    marcar('react');
  }

  const mensaje = mensajeParaTuWeb({ estudio, queEs: w.respuesta, forma, codigo: copiable, esEnlace, pasos, guia });

  async function copiarMensaje() {
    if (!(await copiarAlPortapapeles(mensaje.cuerpo))) { showToast('No se ha podido copiar el mensaje.'); return; }
    onCopiado(firma);
    marcar('mensaje');
    showToast('Mensaje copiado: pégalo en un correo o en WhatsApp.');
  }

  async function compartir() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: mensaje.asunto, text: mensaje.cuerpo });
        onCopiado(firma);
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    await copiarMensaje();
  }

  // Lo pegado es este mismo popup, pero de antes de la Fase D (o copiado desde
  // un panel sin actualizar): su botón lleva el color literal y no sigue el
  // estilo. Con diseño propio no se dice: ese botón no cambia nunca, a propósito.
  // Lo COPIADO también tiene que ser un popup: un iframe pegado no tiene botón.
  // Una copia antigua sin la forma guardada se toma por la de ahora: sin
  // desfase, su huella (que lleva la forma) coincide con la de ahora.
  const botonDeAntes = !!copiado && !desfase && botonDeCodigoAnterior({
    copiado: copiado.metodo ?? metodo, ahora: metodo, disenoPropio: tieneDisenoEnCodigo(c), botonVivo: copiado.botonVivo,
  });

  const etiquetaCopiar = recienCopiado === 'codigo'
    ? 'Copiado'
    : esEnlace
      ? (desfase ? 'Copiar el enlace nuevo' : 'Copiar enlace')
      : (desfase ? 'Copiar el código nuevo' : 'Copiar código');

  const envio = (
    <div className="space-y-2">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        Le llega {esEnlace ? 'el enlace' : 'el código'}, los pasos y la guía, listo para pegar.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void compartir()} className={btnPrimary}><Send size={14} aria-hidden />Enviar</button>
        <a href={`mailto:?subject=${encodeURIComponent(mensaje.asunto)}&body=${encodeURIComponent(mensaje.cuerpo)}`} className={cn(btnSecondary, 'inline-flex items-center gap-1.5')}>
          <Mail size={14} aria-hidden />Enviar por correo
        </a>
        <button type="button" onClick={() => void copiarMensaje()} className={cn(btnSecondary, 'inline-flex items-center gap-1.5')}>
          {recienCopiado === 'mensaje' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}Copiar el mensaje
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Tarjeta
        titulo={falta ? 'Te falta un dato' : plataforma === 'sinweb' ? 'Ya está. Ahora compártelo' : 'Ya está. Ahora ponlo en tu web'}
        subtitulo={`${w.respuesta} · ${forma.toLowerCase()}${plataforma ? ` · ${nombrePlataforma(plataforma)}` : ''}`}
      >
        {estiloSinAplicar && (
          <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3 text-[12.5px] leading-relaxed text-foreground">
            <AlertCircle size={15} aria-hidden className="mt-0.5 shrink-0 text-warning" />
            <span className="min-w-0">Tienes cambios de estilo sin aplicar. No van en el código: aplícalos en «Cómo se ve».</span>
          </p>
        )}
        {falta ? (
          <div className="space-y-3 rounded-xl bg-muted/60 px-3.5 py-3">
            <p role="status" className="text-[13px] font-medium text-foreground">{falta}</p>
            {w.contenido.includes('sesion') && !c.sesion && <SelectorClase c={c} cambiar={cambiar} proximas={proximasClases} />}
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void copiar()}
              disabled={preparando}
              className={cn(btnPrimary, 'min-h-12 w-full justify-center text-[14.5px] font-semibold [@media(pointer:fine)]:min-h-12')}
            >
              {preparando ? <Loader2 size={17} className="animate-spin" aria-hidden /> : recienCopiado === 'codigo' ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />}
              {preparando ? 'Preparando tu código…' : etiquetaCopiar}
            </button>
            <p className="text-center text-[12px] text-muted-foreground">
              {copiado && !desfase ? `Lo copiaste aquí el ${fechaCorta(copiado.en)}.` : !copiado ? 'Aún no lo has copiado desde aquí.' : 'Lo que copiaste antes ya no es lo de ahora.'}
            </p>
            {botonDeAntes && (
              <p className="text-center text-[12px] leading-relaxed text-muted-foreground">
                El botón que ya tienes pegado es de un código anterior y no cambia con el estilo de tus widgets. Si copias este y lo pegas en lugar del de antes, cambiará solo.
              </p>
            )}
            <span className="sr-only" role="status" aria-live="polite">{recienCopiado === 'codigo' ? 'Copiado al portapapeles' : ''}</span>
          </div>
        )}

        {!falta && (agencia ? (
          <div className="rounded-xl border border-border p-3.5">
            <h4 className="mb-2 text-[13.5px] font-semibold text-foreground">Mándaselo a quien te lleva la web</h4>
            {envio}
          </div>
        ) : (
          <ol className="space-y-2 text-[13px] leading-relaxed text-foreground">
            {pasos.map((p, i) => (
              <li key={p} className="flex gap-2.5">
                <span aria-hidden className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11.5px] font-semibold text-muted-foreground">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        ))}

        {!falta && (
          <details ref={detalles} onCopy={alCopiarAMano} className="group rounded-xl border border-border">
            <summary className={cn('flex min-h-11 cursor-pointer list-none items-center gap-2 px-3.5 text-[13px] font-medium text-foreground [&::-webkit-details-marker]:hidden', FOCO)}>
              <Code2 size={15} aria-hidden className="text-muted-foreground" />
              Ver {esEnlace ? 'el enlace' : 'el código'}
            </summary>
            <div className="overflow-hidden rounded-b-xl border-t border-border bg-[#1B1D19] text-[#E9E6DD]">
              <CodigoResaltado codigo={copiable} lenguaje={esEnlace ? 'url' : generado.lenguaje} />
            </div>
          </details>
        )}

        {!falta && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {!agencia && plataforma !== 'sinweb' ? (
              <Plegable titulo="¿Te lleva la web otra persona? Mándaselo" className="min-w-0 flex-1">{envio}</Plegable>
            ) : <span />}
            <a href={guiaDe(plataforma, metodo)} target="_blank" rel="noopener" className={cn('inline-flex min-h-11 items-center gap-1.5 text-[12.5px] font-medium text-foreground underline underline-offset-2 hover:no-underline', FOCO)}>
              <BookOpen size={14} aria-hidden />Guía paso a paso
            </a>
          </div>
        )}

        <div className="grid gap-2 @xl/config:grid-cols-2">
          <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-[12.5px] leading-relaxed text-foreground">
            <p className="mb-0.5 flex items-center gap-1 font-semibold"><Check size={13} aria-hidden />Se actualiza solo</p>
            {estiloVivo(metodo, !tieneDisenoEnCodigo(c, metodo), { identidadEstudio: c.identidad === 'estudio', aplicado: estiloAplicado })}
            {porId && metodo !== 'enlace' && metodo !== 'boton' && ' Y lo que enseña (y su diseño propio, si lo tiene), al pulsar «Aplicar en mi web».'}
          </div>
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-[12.5px] leading-relaxed text-foreground">
            <p className="mb-0.5 font-semibold">Si lo cambias, cópialo otra vez</p>
            {porId
              ? `Solo lo que va en el propio código: la forma de ponerlo${metodo === 'iframe' ? ', el ancho y cómo carga' : ''}${metodo === 'popup' || metodo === 'boton' ? ', el texto y el tipo de botón' : ''}${metodo === 'popup' ? ' y, con un diseño propio, el color del botón' : ''}.`
              : 'Lo que lleva la etiqueta «Va en el código»: qué enseña, la forma de ponerlo, el texto y el tipo de botón, y un diseño propio.'}
          </div>
        </div>
      </Tarjeta>

      <ParaQuienHaceLaWeb
        entrada={entrada}
        metodo={metodo}
        receta={receta}
        falta={falta}
        cambiar={cambiar}
        onMetodo={onMetodo}
        dominios={dominios}
        verDominios={!!verDominios}
        botonPropio={botonPropio}
        onCopiarReact={() => void copiarReact()}
        reactCopiado={recienCopiado === 'react'}
      />
    </div>
  );
}

// Qué parte del aspecto llega sola a lo ya pegado: el estilo de sus widgets (el
// que se aplica en «Cómo se ve», Fase B), salvo que su código lleve un diseño
// propio —entonces no se lo pasa nadie (`tieneDisenoEnCodigo`, con la regla de
// su método)—. Con el popup, desde la Fase D también el botón que abre la
// ventana: el código que se copia AHORA lo pinta con variables que
// /widget-popup.js rellena con ese estilo (color y esquinas). Habla de este
// código, el de aquí: un botón pegado antes no las lleva, y eso se dice aparte
// («El botón que ya tienes pegado…»).
// Sin marco (Fase E), el estilo le llega con sus datos. Mientras no hay ninguno
// aplicado se ve como siempre —con la identidad del estudio, su color y la letra
// de su web; si no, su diseño de siempre— y se dice que tomará el que aplique.
// Mientras carga lo aplicado (`aplicado: null`) no se afirma ninguna de las dos.
function estiloVivo(metodo: MetodoIntegracion, sigueElEstilo: boolean, x: { identidadEstudio: boolean; aplicado: boolean | null }): string {
  if (metodo === 'boton' || metodo === 'enlace') return 'Tus clases, precios y plazas, y tu página de reservas entera.';
  if (!sigueElEstilo) return 'Tus clases, precios y plazas.';
  if (metodo === 'popup') return 'Tus clases, precios y plazas, y el estilo de tus widgets: dentro de la ventana y en el botón que la abre (su color y sus esquinas).';
  if (metodo === 'nativa') {
    if (x.aplicado === null) return 'Tus clases, precios y plazas.';
    if (x.aplicado) return 'Tus clases, precios y plazas, y el estilo de tus widgets.';
    return x.identidadEstudio
      ? 'Tus clases, precios y plazas, y tu color (con la letra de tu web). Si aplicas un estilo a tus widgets, lo toma también.'
      : 'Tus clases, precios y plazas. Si aplicas un estilo a tus widgets, lo toma también.';
  }
  return 'Tus clases, precios y plazas, y el estilo de tus widgets.';
}

function ParaQuienHaceLaWeb({ entrada, metodo, receta, falta, cambiar, onMetodo, dominios, verDominios, botonPropio, onCopiarReact, reactCopiado }: {
  entrada: EntradaIntegracion;
  metodo: MetodoIntegracion;
  receta: Receta;
  falta: string | null;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  onMetodo: (m: MetodoIntegracion) => void;
  dominios: ReactNode;
  verDominios: boolean;
  botonPropio: boolean;
  onCopiarReact: () => void;
  reactCopiado: boolean;
}) {
  const w = entrada.widget;
  const c = entrada.config;
  const porDefecto = `web-${w.id}`;
  const etiqueta = c.etiqueta ?? porDefecto;
  const invalida = c.etiqueta !== null && c.etiqueta !== '' && !ETIQUETA_VALIDA.test(c.etiqueta);
  const nativaNo = receta.desactivados.nativa;
  const conReact = plataformasDe(metodo).length > 0 && !botonPropio;

  return (
    <section className="rounded-2xl border border-border bg-card px-4 shadow-xs @md/config:px-5">
      <Plegable titulo="Para quien te hace la web" abierto={metodo === 'nativa' && (!!falta || verDominios)} className="py-1.5">
        <div className="space-y-6 pb-3">
          {w.metodos.includes('nativa') && (
            <div className="space-y-3">
              <AjusteInterruptor
                etiqueta="Ponerlo sin marco"
                descripcion={nativaNo ?? `Integración nativa. ${METODOS.nativa.descripcion}`}
                on={metodo === 'nativa'}
                onChange={v => onMetodo(v ? 'nativa' : 'iframe')}
                disabled={!!nativaNo && metodo !== 'nativa'}
              />
              {metodo === 'nativa' && dominios}
            </div>
          )}

          {conReact && (
            <Ajuste etiqueta="Componente para React" descripcion="Para una web hecha con React: el mismo widget como componente. Se crea un archivo con él y se pone donde se quiera.">
              <button type="button" onClick={onCopiarReact} className={cn(btnSecondary, 'inline-flex items-center gap-1.5')}>
                {reactCopiado ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                {reactCopiado ? 'Copiado' : 'Copiar el componente de React'}
              </button>
            </Ajuste>
          )}

          <Ajuste etiqueta="Nombre para tus estadísticas" descripcion="Si pones este mismo widget en dos sitios (tu web e Instagram), dale un nombre distinto a cada uno para saber de dónde viene cada reserva. Letras, números y guiones; vacío, sin nombre.">
            <input
              aria-label="Nombre para tus estadísticas"
              aria-invalid={invalida || undefined}
              value={etiqueta}
              maxLength={40}
              onChange={e => cambiar({ etiqueta: e.target.value === porDefecto ? null : e.target.value })}
              className={cn(inputCls, 'max-w-xs font-mono', invalida && 'border-destructive')}
            />
            {invalida && <p role="alert" className="mt-1.5 text-[12px] text-destructive">Solo letras, números, «-» y «_». Mientras tanto no se usa.</p>}
          </Ajuste>

          {metodo === 'iframe' && (
            <AjusteInterruptor
              etiqueta="Carga diferida"
              descripcion="No carga hasta que la visitante baja hasta él: la web abre más rápido. Déjala encendida salvo que el widget esté arriba del todo."
              on={c.cargaDiferida}
              onChange={v => cambiar({ cargaDiferida: v })}
            />
          )}
        </div>
      </Plegable>
    </section>
  );
}

// Tokenizador manual (no hay shiki/prism en el repo y no merece una
// dependencia): etiquetas, atributos, cadenas y el resto. Solo decide cómo se
// PINTA — lo que se copia es `codigo` tal cual.
const PATRON = /(<!--[\s\S]*?-->|\/\/[^\n]*)|(<\/?[a-zA-Z][\w.-]*)|([a-zA-Z-]+(?=\s*=))|("[^"]*"|'[^']*'|`[^`]*`)|([<>=/{}()])|(\s+)|([^<>="'`\s{}()/]+)/g;

function CodigoResaltado({ codigo, lenguaje }: { codigo: string; lenguaje: 'html' | 'jsx' | 'url' }) {
  const tokens = useMemo(() => {
    if (lenguaje === 'url') return [{ texto: codigo, clase: 'text-[#E9E6DD]' }];
    const out: { texto: string; clase: string }[] = [];
    for (const m of codigo.matchAll(PATRON)) {
      const [, comentario, etiqueta, atributo, cadena, puntuacion, espacio, resto] = m;
      if (comentario) out.push({ texto: comentario, clase: 'text-white/40' });
      else if (etiqueta) out.push({ texto: etiqueta, clase: 'text-[#C9B98A]' });
      else if (atributo) out.push({ texto: atributo, clase: 'text-[#9FB7A5]' });
      else if (cadena) out.push({ texto: cadena, clase: 'text-[#E3C9A8]' });
      else if (puntuacion) out.push({ texto: puntuacion, clase: 'text-white/45' });
      else out.push({ texto: espacio ?? resto ?? '', clase: 'text-[#E9E6DD]' });
    }
    return out;
  }, [codigo, lenguaje]);
  return (
    <pre
      tabIndex={0}
      aria-label={lenguaje === 'url' ? 'Enlace para copiar' : 'Código para copiar'}
      className="max-h-72 overflow-auto whitespace-pre-wrap break-all px-4 py-3.5 font-mono text-[12px] leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
    >
      {tokens.map((t, i) => <span key={i} className={t.clase}>{t.texto}</span>)}
    </pre>
  );
}
