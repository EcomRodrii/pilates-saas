'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Check, Code2, Copy, Mail, Send } from 'lucide-react';
import { cn, copiarAlPortapapeles } from '@/lib/utils';
import { btnPrimary, btnSecondary, inputCls } from '@/components/configuracion/estilos';
import { METODOS, type MetodoIntegracion } from '@/lib/widgets/catalogo';
import { ETIQUETA_VALIDA, type ConfigConstructor, type Copiado } from '@/lib/widgets/config';
import { faltaParaGenerar, firmaCodigo, generarCodigo, plataformasDe, urlPagina, type EntradaIntegracion } from '@/lib/widgets/integracion';
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

export function PasoPonlo({
  entrada, metodo, plataforma, receta, estudio, origen, copiado, desfase, onCopiado, onMetodo, cambiar,
  proximasClases, dominiosAutorizados, dominios, showToast,
}: {
  entrada: EntradaIntegracion;
  metodo: MetodoIntegracion;
  plataforma: PlataformaWeb | null;
  receta: Receta;
  estudio: string;
  origen: string;
  copiado: Copiado | null;
  desfase: boolean;
  onCopiado: (firma: string) => void;
  onMetodo: (m: MetodoIntegracion) => void;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  proximasClases: DatosPanel['proximasClases'];
  dominiosAutorizados: readonly string[];
  /** El gestor de webs autorizadas (integración sin marco). */
  dominios: ReactNode;
  showToast: (m: string) => void;
}) {
  const w = entrada.widget;
  const c = entrada.config;
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
              className={cn(btnPrimary, 'min-h-12 w-full justify-center text-[14.5px] font-semibold [@media(pointer:fine)]:min-h-12')}
            >
              {recienCopiado === 'codigo' ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />}
              {etiquetaCopiar}
            </button>
            <p className="text-center text-[12px] text-muted-foreground">
              {copiado && !desfase ? `Lo copiaste aquí el ${fechaCorta(copiado.en)}.` : !copiado ? 'Aún no lo has copiado desde aquí.' : 'Lo que copiaste antes ya no es lo de ahora.'}
            </p>
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
          <details ref={detalles} className="group rounded-xl border border-border">
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
            Tus clases, precios y plazas{estiloVivo(metodo, c.identidad === 'estudio')}.
          </div>
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-[12.5px] leading-relaxed text-foreground">
            <p className="mb-0.5 font-semibold">Si lo cambias, cópialo otra vez</p>
            Lo que lleva la etiqueta «Va en el código»: qué enseña, la forma de ponerlo, el botón y un diseño propio.
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
        botonPropio={botonPropio}
        onCopiarReact={() => void copiarReact()}
        reactCopiado={recienCopiado === 'react'}
      />
    </div>
  );
}

// Qué parte del aspecto llega sola a lo ya pegado: el estilo de la app (F1 del
// rediseño de /reservar); en la integración nativa, solo el color de marca. El
// color del botón del popup va en su `style`, dentro del código: ese no.
function estiloVivo(metodo: MetodoIntegracion, delEstudio: boolean): string {
  if (metodo === 'boton' || metodo === 'enlace') return ', y tu página de reservas entera';
  if (!delEstudio) return '';
  if (metodo === 'popup') return ', y el estilo de tu app dentro de la ventana (el color del botón va en el código)';
  if (metodo === 'nativa') return ', y tu color de marca, el de Apariencia';
  return ', y el estilo de tu app, el de Apariencia';
}

function ParaQuienHaceLaWeb({ entrada, metodo, receta, falta, cambiar, onMetodo, dominios, botonPropio, onCopiarReact, reactCopiado }: {
  entrada: EntradaIntegracion;
  metodo: MetodoIntegracion;
  receta: Receta;
  falta: string | null;
  cambiar: (parcial: Partial<ConfigConstructor>) => void;
  onMetodo: (m: MetodoIntegracion) => void;
  dominios: ReactNode;
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
      <Plegable titulo="Para quien te hace la web" abierto={metodo === 'nativa' && !!falta} className="py-1.5">
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
