'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BookOpen, Check, Code2, Copy, Link2, MousePointerClick, PanelTop, SquareArrowOutUpRight, type LucideIcon } from 'lucide-react';
import { cn, copiarAlPortapapeles } from '@/lib/utils';
import { METODOS, type MetodoIntegracion } from '@/lib/widgets/catalogo';
import {
  conVistaPrevia, estiloBoton, faltaParaGenerar, generarCodigo, pasosInstalacion, plataformasDe, urlEmbebido, urlPagina,
  PLATAFORMAS, type EntradaIntegracion, type Plataforma,
} from '@/lib/widgets/integracion';
import { textoBotonEfectivo } from '@/lib/widgets/config';

// «Cómo integrarlo»: QUÉ widget ya está elegido arriba; aquí se decide CÓMO
// entra en la web y se copia el código REAL (lib/widgets/integracion.ts, con
// tests contra el parser del motor). Lo que se copia es el string exacto que
// se ve — nunca los tokens coloreados del resaltador.

const ICONO_METODO: Record<MetodoIntegracion, LucideIcon> = {
  iframe: Code2, nativa: PanelTop, popup: SquareArrowOutUpRight, boton: MousePointerClick, enlace: Link2,
};
const FOCO = 'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

export function BloqueIntegracion({ entrada, metodo, onMetodo, dominiosAutorizados, showToast }: {
  entrada: EntradaIntegracion;
  metodo: MetodoIntegracion;
  onMetodo: (m: MetodoIntegracion) => void;
  dominiosAutorizados: readonly string[];
  showToast: (m: string) => void;
}) {
  const w = entrada.widget;
  const [plataforma, setPlataforma] = useState<Plataforma>('html');
  const plataformas = plataformasDe(metodo);
  const plataformaEfectiva: Plataforma = plataformas.includes(plataforma) ? plataforma : 'html';
  const falta = faltaParaGenerar(entrada, metodo, { dominiosAutorizados });
  const { codigo, lenguaje } = useMemo(
    () => generarCodigo(entrada, metodo, plataformaEfectiva),
    [entrada, metodo, plataformaEfectiva],
  );
  const pasos = pasosInstalacion(metodo, plataformaEfectiva);

  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);
  async function copiar() {
    if (!(await copiarAlPortapapeles(codigo))) {
      // Decir «copiado» y que no lo esté es peor que decir que no: se iría a
      // su web a pegar nada y daría por roto el widget.
      showToast('No se pudo copiar. Selecciona el código y cópialo a mano.');
      return;
    }
    setCopiado(true);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setCopiado(false), 2200);
  }

  return (
    <section aria-labelledby="integracion-titulo" className="rounded-2xl border border-border bg-card shadow-xs">
      <div className="border-b border-border p-4 @md/config:px-5">
        <h3 id="integracion-titulo" className="text-[14px] font-semibold text-foreground">Cómo integrarlo en tu web</h3>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">El mismo widget, de la forma que mejor encaje en tu página.</p>
        <div role="radiogroup" aria-label="Método de integración" className="mt-3 grid grid-cols-2 gap-2 @xl/config:grid-cols-3 @4xl/config:grid-cols-5">
          {w.metodos.map((m, i) => {
            const Icono = ICONO_METODO[m];
            const on = metodo === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onMetodo(m)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-colors',
                  on ? 'border-brand/60 bg-brand/5' : 'border-border hover:bg-muted/50',
                  FOCO,
                )}
              >
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
                  <Icono size={14} aria-hidden />{METODOS[m].nombre}
                </span>
                {i === 0 && <span className="rounded-full bg-brand/10 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-foreground">Recomendado</span>}
                <span className="text-[11px] leading-snug text-muted-foreground">{METODOS[m].descripcion}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 p-4 @md/config:px-5">
        {(metodo === 'boton' || metodo === 'popup') && !falta && <MuestraBoton entrada={entrada} metodo={metodo} />}

        {falta ? (
          <p role="status" className="rounded-xl bg-muted/60 px-3.5 py-3 text-[12.5px] text-foreground">{falta}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-[#1B1D19] text-[#E9E6DD]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-2 py-1.5">
              {plataformas.length > 0 ? (
                <div role="tablist" aria-label="Plataforma" className="flex gap-0.5 overflow-x-auto [scrollbar-width:none]">
                  {plataformas.map(p => (
                    <button
                      key={p}
                      type="button"
                      role="tab"
                      aria-selected={plataformaEfectiva === p}
                      onClick={() => setPlataforma(p)}
                      className={cn(
                        'shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors min-h-8',
                        plataformaEfectiva === p ? 'bg-white/12 text-white' : 'text-white/60 hover:text-white',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                      )}
                    >
                      {PLATAFORMAS[p]}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="px-2 text-[12px] font-medium text-white/70">Tu enlace</span>
              )}
              <button
                type="button"
                onClick={copiar}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-white px-3 text-[12px] font-semibold text-[#1B1D19] transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                {copiado ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                {copiado ? 'Copiado' : lenguaje === 'url' ? 'Copiar enlace' : 'Copiar código'}
              </button>
            </div>
            <CodigoResaltado codigo={codigo} lenguaje={lenguaje} />
            <span className="sr-only" role="status" aria-live="polite">{copiado ? 'Copiado al portapapeles' : ''}</span>
          </div>
        )}

        {!falta && (
          <div className="grid gap-4 @2xl/config:grid-cols-[minmax(0,1fr)_auto] @2xl/config:items-start">
            <ol className="space-y-1.5 text-[12.5px] leading-relaxed text-foreground">
              {pasos.map((p, i) => (
                <li key={p} className="flex gap-2.5">
                  <span aria-hidden className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
                  <span>{p}</span>
                </li>
              ))}
              {lenguaje !== 'url' && (
                <li className="flex gap-2.5 text-muted-foreground">
                  <span aria-hidden className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">!</span>
                  <span>El código lleva lo que ves arriba. Si cambias algo, vuelve a copiarlo y reemplázalo en tu web.</span>
                </li>
              )}
            </ol>
            <a
              href={metodo === 'iframe' || metodo === 'nativa' ? '/ayuda/widget/instalar-con-html' : '/ayuda/widget/que-es-el-widget'}
              target="_blank"
              rel="noopener"
              className={cn('inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium text-foreground hover:bg-muted', FOCO)}
            >
              <BookOpen size={14} aria-hidden />Guía de instalación
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

// El botón tal cual saldrá en la web: mismos atributos y mismo estilo que el
// código (estiloBoton). En popup, pulsarlo abre la ventana REAL —el runtime
// público /widget-popup.js se carga en el panel igual que en la web—; en
// botón, lleva a la página de verdad.
function MuestraBoton({ entrada, metodo }: { entrada: EntradaIntegracion; metodo: 'boton' | 'popup' }) {
  const s = estiloBoton(entrada);
  const texto = textoBotonEfectivo(entrada.config, entrada.widget);
  useEffect(() => {
    if (metodo !== 'popup') return;
    const src = '/widget-popup.js';
    if (document.querySelector(`script[src="${src}"]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    document.body.appendChild(script);
  }, [metodo]);
  const estilo: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '10px 22px',
    fontWeight: 600, fontSize: 15, lineHeight: 1.2, textDecoration: 'none', cursor: 'pointer',
    background: s.background, color: s.color, border: s.border, borderRadius: s.borderRadius,
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3.5">
      <span className="text-[12px] text-muted-foreground">Así se ve en tu web:</span>
      {metodo === 'popup' ? (
        <button
          type="button"
          data-tentare-popup={conVistaPrevia(urlEmbebido(entrada, 'popup'))}
          data-tentare-titulo={entrada.widget.nombre}
          data-tentare-ancho={entrada.widget.anchoPopup}
          style={estilo}
        >
          {texto}
        </button>
      ) : (
        <a href={conVistaPrevia(urlPagina(entrada))} target="_blank" rel="noopener" style={estilo}>
          {texto}
        </a>
      )}
      <span className="text-[11.5px] text-muted-foreground">Púlsalo para probarlo.</span>
    </div>
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
      aria-label="Código para copiar"
      className="max-h-72 overflow-auto whitespace-pre-wrap break-all px-4 py-3.5 font-mono text-[12px] leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
    >
      {tokens.map((t, i) => <span key={i} className={t.clase}>{t.texto}</span>)}
    </pre>
  );
}
