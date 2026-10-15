'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { Field, btnPrimary, btnSecondary, cardCls, inputCls } from '@/components/configuracion/estilos';
import {
  ANTELACIONES_CORTO_MINUTOS, ANTELACIONES_LARGO_HORAS, textoAntelacion, textoFaltan,
} from '@/lib/notificaciones/antelacion-recordatorio';
import { EVENTOS } from '@/lib/notifications/catalog';
import {
  CUERPO_MAX, ETIQUETA_VARIABLE, TIPOS_CON_TEXTO_EDITABLE, TITULO_MAX, previsualizar, textoDeFabrica,
  textoEnLista, validarTexto, variablesPermitidas, type TextoAviso,
} from '@/lib/notifications/textos-estudio';
import { dbGuardarTextoAviso, dbListTextosAviso, dbRestaurarTextoAviso, enviarPruebaPush } from '@/lib/notifications/textos-estudio-db';
import type { MostrarToast } from '@/components/ui/toast';
import { usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { cn } from '@/lib/utils';

// Avisos en el móvil de las alumnas: CUÁNDO les llega el recordatorio de clase
// y QUÉ dicen los avisos, con las palabras del estudio. Solo la propietaria (la
// sección es suya y la RLS de `notification_template` y de las columnas de
// `studios` solo le deja escribir a ella).

// Cada recordatorio lleva SU antelación en la vista previa: con la muestra fija,
// «Justo antes de la clase» se leía «En 24 horas empezamos».
function useDatosDe() {
  const { studio } = useStudio();
  const a = { largoHoras: studio?.recordatorioLargoHoras ?? 24, cortoMinutos: studio?.recordatorioCortoMinutos ?? 60 };
  return (evento: string): Record<string, string> =>
    evento === EVENTOS.RECORDATORIO_24H ? { antelacion: textoAntelacion('24h', a), faltan: textoFaltan('24h', a) }
      : evento === EVENTOS.RECORDATORIO_1H ? { antelacion: textoAntelacion('1h', a), faltan: textoFaltan('1h', a) }
      : {};
}

const minutos = (m: number) => (m < 60 ? `${m} minutos` : m === 60 ? '1 hora' : `${m / 60} horas`);

// Los textos propios del estudio, una sola carga para los recordatorios y la lista.
function useTextosPropios() {
  const { studio } = useStudio();
  const studioId = studio?.id;
  const [propios, setPropios] = useState<Record<string, TextoAviso> | null>(null);
  const [fallo, setFallo] = useState(false);
  useEffect(() => {
    if (!studioId) return;
    let vivo = true;
    dbListTextosAviso(studioId)
      .then(t => { if (vivo) setPropios(t); })
      .catch(() => { if (vivo) setFallo(true); });
    return () => { vivo = false; };
  }, [studioId]);
  return { propios, setPropios, fallo };
}

type TextosPropios = ReturnType<typeof useTextosPropios>;

export function HerramientaAvisosDelMovil({ showToast }: { showToast: MostrarToast }) {
  const textos = useTextosPropios();
  const panelNuevo = usePanelNuevo();
  const [pestana, setPestana] = useState<'recordatorios' | 'otros'>('recordatorios');
  if (panelNuevo) {
    // Como «Recordatorios» de Bonsai (b-60): dos pestañas, los recordatorios de
    // clase con todo a la vista, y el resto de avisos aparte.
    return (
      <TarjetaAjuste id="avisos-del-movil" marco={false}>
        <div className="flex flex-col gap-4">
          <div role="tablist" aria-label="Qué avisos" className="flex w-fit gap-1 rounded-full bg-muted p-1">
            {([['recordatorios', 'Recordatorios de clase'], ['otros', 'Otros avisos']] as const).map(([id, texto]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={pestana === id}
                onClick={() => setPestana(id)}
                className={cn('min-h-9 rounded-full px-4 text-[13.5px] font-semibold transition-colors', pestana === id ? 'bg-card text-foreground shadow-t-card' : 'text-muted-foreground hover:text-foreground')}
              >
                {texto}
              </button>
            ))}
          </div>
          {pestana === 'recordatorios'
            ? <Recordatorios showToast={showToast} textos={textos} />
            : <Textos showToast={showToast} textos={textos} sinRecordatorios />}
        </div>
      </TarjetaAjuste>
    );
  }
  return (
    <TarjetaAjuste id="avisos-del-movil" marco={false}>
      <div className="flex flex-col gap-6">
        <Antelacion showToast={showToast} />
        <Textos showToast={showToast} textos={textos} />
      </div>
    </TarjetaAjuste>
  );
}

/**
 * Panel nuevo: el aviso como le llega a la alumna, con la forma de una
 * notificación del móvil (como el «Así lo recibirá» de los recordatorios de
 * Bonsai, b-60): la inicial y el nombre del estudio, «ahora», el título y el texto.
 */
function NotificacionMovil({ title, body }: { title: string; body: string }) {
  const { studio } = useStudio();
  const nombre = studio?.nombre ?? 'Tu estudio';
  return (
    <div className="flex max-w-md items-start gap-3 rounded-[18px] border border-border bg-card px-3.5 py-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)]">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-[15px] font-bold text-primary-foreground">
        {nombre.trim().charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{nombre}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">ahora</span>
        </div>
        <p className="mt-0.5 text-[13.5px] font-semibold leading-snug text-foreground">{title || '—'}</p>
        <p className="text-[13px] leading-snug text-foreground text-pretty">{body || '—'}</p>
      </div>
    </div>
  );
}

/**
 * Panel nuevo: los dos recordatorios de clase, calcados a «Recordatorios» de
 * Bonsai (b-60). Una tarjeta ancha por recordatorio: cuándo se envía, por dónde,
 * qué se le dice (el texto se edita AQUÍ y se guarda al salir del campo, como
 * en Bonsai), los caracteres libres y «Así lo recibirá» en vivo.
 * La antelación se guarda al elegirla; si el servidor dice que no, vuelve atrás.
 */
function Recordatorios({ showToast, textos }: { showToast: MostrarToast; textos: TextosPropios }) {
  const { studio, updateStudio } = useStudio();
  const [largo, setLargo] = useState(studio?.recordatorioLargoHoras ?? 24);
  const [corto, setCorto] = useState(studio?.recordatorioCortoMinutos ?? 60);
  const [guardando, setGuardando] = useState(false);
  const datosDe = useDatosDe();

  async function guardar(cambio: { recordatorioLargoHoras?: number; recordatorioCortoMinutos?: number }) {
    const antes = { largo, corto };
    if (cambio.recordatorioLargoHoras != null) setLargo(cambio.recordatorioLargoHoras);
    if (cambio.recordatorioCortoMinutos != null) setCorto(cambio.recordatorioCortoMinutos);
    setGuardando(true);
    const res = await updateStudio(cambio);
    setGuardando(false);
    if (!res.ok) {
      setLargo(antes.largo);
      setCorto(antes.corto);
      showToast(res.error, { variant: 'error' });
      return;
    }
    showToast('Recordatorio guardado');
  }

  const recordatorios: { evento: string; titulo: string; cuando: string; sub: string; canales: { nombre: string; nota?: string }[]; control: ReactNode }[] = [
    {
      evento: EVENTOS.RECORDATORIO_24H, titulo: 'Recordatorio 1', cuando: `${horasEnDias(largo)} antes`, sub: 'Aviso principal antes de la clase',
      canales: [{ nombre: 'En su móvil' }, { nombre: 'Correo' }, { nombre: 'WhatsApp', nota: 'si lo tienes conectado' }],
      control: (
        <select className={SELECT_CORTO} value={largo} disabled={guardando} onChange={e => void guardar({ recordatorioLargoHoras: Number(e.target.value) })} aria-label="Cuándo se envía el recordatorio 1">
          {ANTELACIONES_LARGO_HORAS.map(h => <option key={h} value={h}>{h} horas</option>)}
        </select>
      ),
    },
    {
      evento: EVENTOS.RECORDATORIO_1H, titulo: 'Recordatorio 2', cuando: `${minutos(corto)} antes`, sub: 'Justo antes de la clase, para que no se le pase',
      canales: [{ nombre: 'En su móvil' }],
      control: (
        <select className={SELECT_CORTO} value={corto} disabled={guardando} onChange={e => void guardar({ recordatorioCortoMinutos: Number(e.target.value) })} aria-label="Cuándo se envía el recordatorio 2">
          {ANTELACIONES_CORTO_MINUTOS.map(m => <option key={m} value={m}>{minutos(m)}</option>)}
        </select>
      ),
    },
  ];

  return (
    <section aria-label="Recordatorios de clase" className="flex flex-col gap-3">
      <p className="text-[13.5px] text-muted-foreground">Avisa a tus alumnas antes de su clase. Tienes dos recordatorios con antelaciones distintas.</p>
      <p className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-[13px] font-medium" style={{ color: 'color-mix(in srgb, var(--success) 85%, var(--foreground))', backgroundColor: 'color-mix(in srgb, var(--success) 12%, var(--card))' }}>
        <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--success)' }} />
        Los cambios se guardan solos. El texto se guarda al salir del campo.
      </p>
      {recordatorios.map(r => (
        <div key={r.evento} className="rounded-[14px] bg-card px-5 py-4 shadow-t-card">
          <div className="border-b border-border pb-3">
            <p className="flex flex-wrap items-center gap-2 text-[16px] font-semibold text-foreground">
              {r.titulo}
              <span className="rounded-md px-1.5 py-0.5 text-[12px] font-medium" style={{ color: 'var(--t-blue-500)', backgroundColor: 'color-mix(in srgb, var(--t-blue-500) 12%, var(--card))' }}>{r.cuando}</span>
            </p>
            <p className="text-[13px] text-muted-foreground">{r.sub}</p>
          </div>

          <p className="mt-4 text-[13.5px] font-semibold text-foreground">¿Cuándo se envía?</p>
          <div className="mt-1.5 flex items-center gap-2 text-[13.5px] text-muted-foreground">{r.control} antes de la clase</div>

          <p className="mt-4 text-[13.5px] font-semibold text-foreground">¿Por dónde se envía?</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {r.canales.map(c => (
              <span key={c.nombre} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium text-foreground" style={{ borderColor: 'color-mix(in srgb, var(--t-blue-500) 40%, var(--border))', backgroundColor: 'color-mix(in srgb, var(--t-blue-500) 8%, var(--card))' }}>
                <span aria-hidden className="flex size-3.5 items-center justify-center rounded-[3px] text-white" style={{ backgroundColor: 'var(--t-blue-500)' }}><Check size={10} strokeWidth={3.5} /></span>
                {c.nombre}
                {c.nota && <span className="text-[11.5px] font-normal text-muted-foreground">{c.nota}</span>}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted-foreground">Cada alumna puede apagar cualquiera de estos canales desde su app.</p>

          {textos.fallo
            ? <p className="mt-4 text-[13px] text-destructive">No hemos podido cargar el texto. Recarga la página.</p>
            : !textos.propios
              ? <p className="mt-4 text-[13px] text-muted-foreground">Cargando el texto…</p>
              : <TextoEnLinea evento={r.evento} textos={textos} datos={datosDe(r.evento)} />}
        </div>
      ))}
    </section>
  );
}

const horasEnDias = (h: number) => (h % 24 === 0 ? `${h / 24} ${h === 24 ? 'día' : 'días'}` : `${h} horas`);
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const SELECT_CORTO = 'h-10 rounded-[10px] border border-border bg-card px-3 text-[14px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60';

/**
 * «¿Qué se le dice a la alumna?», editable en la tarjeta como en Bonsai: los
 * campos vacíos enseñan el texto de Tentare y vacío = sale ese; las variables se
 * meten donde está el cursor; los caracteres libres y «Así lo recibirá» van en
 * vivo. Se guarda al salir del campo, solo si cambió y vale; si el servidor dice
 * que no, lo escrito se queda y se dice por qué.
 */
function TextoEnLinea({ evento, textos, datos }: { evento: string; textos: TextosPropios; datos: Record<string, string> }) {
  const { studio } = useStudio();
  const fabrica = textoDeFabrica(evento)!;
  const propio = textos.propios?.[evento] ?? null;
  const [title, setTitle] = useState(propio?.title ?? '');
  const [body, setBody] = useState(propio?.body ?? '');
  // Lo que sale ahora (el suyo guardado, o el de Tentare), para no guardar sin cambios.
  const [guardado, setGuardado] = useState<TextoAviso>(propio ?? fabrica);
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cuerpoRef = useRef<HTMLTextAreaElement>(null);
  const efectivo = { title: title.trim() || fabrica.title, body: body.trim() || fabrica.body };
  const muestra = previsualizar(efectivo, datos, evento);
  const variables = variablesPermitidas(evento);
  const esPropio = !!textos.propios?.[evento];
  const enLista = textoEnLista(evento, textos.propios?.[evento]);

  async function guardarSiCambio() {
    if (!studio?.id || ocupado) return;
    // Los dos vacíos: vuelve el de Tentare (si había uno suyo).
    if (!title.trim() && !body.trim()) { if (esPropio) await volverAlOriginal(); return; }
    if (efectivo.title === guardado.title.trim() && efectivo.body === guardado.body.trim()) return;
    const error = validarTexto(evento, efectivo);
    if (error) { setEstado({ tipo: 'error', texto: error }); return; }
    setOcupado(true);
    const res = await dbGuardarTextoAviso(studio.id, evento, efectivo);
    setOcupado(false);
    if (!res.ok) { setEstado({ tipo: 'error', texto: res.error }); return; }
    setGuardado(efectivo);
    textos.setPropios(p => ({ ...(p ?? {}), [evento]: efectivo }));
    setEstado({ tipo: 'ok', texto: 'Texto guardado' });
  }

  async function volverAlOriginal() {
    if (!studio?.id) return;
    setOcupado(true);
    const res = await dbRestaurarTextoAviso(studio.id, evento);
    setOcupado(false);
    if (!res.ok) { setEstado({ tipo: 'error', texto: res.error }); return; }
    setTitle('');
    setBody('');
    setGuardado(fabrica);
    textos.setPropios(p => { const n = { ...(p ?? {}) }; delete n[evento]; return n; });
    setEstado({ tipo: 'ok', texto: 'Vuelve el texto de Tentare' });
  }

  // Como en Bonsai: la variable entra donde estaba el cursor y el foco vuelve
  // al texto, así que salir de él la guarda.
  function meterVariable(v: string) {
    const el = cuerpoRef.current;
    const base = body || fabrica.body;
    const desde = el && body ? el.selectionStart : base.length;
    const hasta = el && body ? el.selectionEnd : base.length;
    const trozo = `{${v}}`;
    const nuevo = base.slice(0, desde) + trozo + base.slice(hasta);
    setBody(nuevo);
    setEstado(null);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(desde + trozo.length, desde + trozo.length);
    });
  }

  return (
    <>
      <p className="mt-4 text-[13.5px] font-semibold text-foreground">¿Qué se le dice a la alumna?</p>
      {variables.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {variables.map(v => (
            <button
              key={v}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => meterVariable(v)}
              className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[12px] text-foreground transition-colors hover:bg-muted"
            >
              + {mayuscula(ETIQUETA_VARIABLE[v] ?? v)}
            </button>
          ))}
        </div>
      )}
      <input
        aria-label="Título del aviso"
        className={cn(inputCls, 'mt-2 rounded-[10px]')}
        value={title}
        placeholder={fabrica.title}
        maxLength={TITULO_MAX + 20}
        onChange={e => { setTitle(e.target.value); setEstado(null); }}
        onBlur={() => void guardarSiCambio()}
      />
      <textarea
        ref={cuerpoRef}
        aria-label="Texto del aviso"
        className={cn(inputCls, 'mt-2 min-h-[72px] resize-y rounded-[10px]')}
        value={body}
        placeholder={fabrica.body}
        maxLength={CUERPO_MAX + 40}
        onChange={e => { setBody(e.target.value); setEstado(null); }}
        onBlur={() => void guardarSiCambio()}
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span>
          {estado
            ? <span role={estado.tipo === 'error' ? 'alert' : 'status'} className={estado.tipo === 'error' ? 'font-medium text-destructive' : 'font-medium text-success'}>{estado.texto}</span>
            : enLista.yaNoSeUsa ? 'Tu texto guardado ya no vale: sale el de Tentare hasta que lo corrijas.' : esPropio ? 'Sale tu texto.' : 'Se enviará el mensaje de Tentare.'}
          {esPropio && !ocupado && (
            <button type="button" onClick={() => void volverAlOriginal()} className="ml-2 font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--t-text-link)' }}>
              Volver al de Tentare
            </button>
          )}
        </span>
        <span className="tabular-nums">{Math.max(0, CUERPO_MAX - efectivo.body.length)} caracteres libres</span>
      </div>
      <p className="mt-3 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-foreground/55">Así lo recibirá</p>
      <div className="mt-1.5"><NotificacionMovil title={muestra.title} body={muestra.body} /></div>
    </>
  );
}

function Antelacion({ showToast }: { showToast: MostrarToast }) {
  const { studio, updateStudio } = useStudio();
  const [largo, setLargo] = useState(studio?.recordatorioLargoHoras ?? 24);
  const [corto, setCorto] = useState(studio?.recordatorioCortoMinutos ?? 60);
  const [guardando, setGuardando] = useState(false);

  async function guardar(cambio: { recordatorioLargoHoras?: number; recordatorioCortoMinutos?: number }) {
    const antes = { largo, corto };
    if (cambio.recordatorioLargoHoras != null) setLargo(cambio.recordatorioLargoHoras);
    if (cambio.recordatorioCortoMinutos != null) setCorto(cambio.recordatorioCortoMinutos);
    setGuardando(true);
    const res = await updateStudio(cambio);
    setGuardando(false);
    if (!res.ok) {
      // Dejarlo elegido sin haberse guardado sería prometer un recordatorio que no sale a esa hora.
      setLargo(antes.largo);
      setCorto(antes.corto);
      showToast(res.error, { variant: 'error' });
      return;
    }
    showToast('Recordatorio guardado');
  }

  return (
    <section className={`${cardCls} p-4 flex flex-col gap-4`}>
      <div>
        <h3 className="text-sm font-semibold">Cuándo llega el recordatorio de clase</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Se guarda al elegir. Vale para las clases que aún no han recibido ese recordatorio.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Primer recordatorio" description="En su móvil, por correo y por WhatsApp si lo tienes conectado.">
          <select
            className={inputCls} value={largo} disabled={guardando}
            onChange={e => void guardar({ recordatorioLargoHoras: Number(e.target.value) })}
          >
            {ANTELACIONES_LARGO_HORAS.map(h => <option key={h} value={h}>{h} horas antes</option>)}
          </select>
        </Field>
        <Field label="Segundo recordatorio" description="Solo en su móvil, justo antes de la clase.">
          <select
            className={inputCls} value={corto} disabled={guardando}
            onChange={e => void guardar({ recordatorioCortoMinutos: Number(e.target.value) })}
          >
            {ANTELACIONES_CORTO_MINUTOS.map(m => <option key={m} value={m}>{minutos(m)} antes</option>)}
          </select>
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Cada alumna puede apagar cualquiera de los dos desde su app.
      </p>
    </section>
  );
}

function Textos({ showToast, textos, sinRecordatorios = false }: { showToast: MostrarToast; textos: TextosPropios; sinRecordatorios?: boolean }) {
  const { studio } = useStudio();
  const studioId = studio?.id;
  const { propios, setPropios, fallo } = textos;
  const [abierto, setAbierto] = useState<string | null>(null);
  const datosDe = useDatosDe();
  const panelNuevo = usePanelNuevo();

  if (fallo) return <p className="text-sm text-destructive">No hemos podido cargar los textos. Recarga la página.</p>;
  if (!propios || !studioId) return <p className="text-sm text-muted-foreground">Cargando los textos…</p>;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold">Lo que dicen los avisos</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          El texto que ve cada alumna en su móvil y en los avisos de su app. Si no cambias nada, sale el de Tentare.
        </p>
      </div>
      {TIPOS_CON_TEXTO_EDITABLE.filter(g => !sinRecordatorios || !g.tipos.some(x => x.evento === EVENTOS.RECORDATORIO_24H || x.evento === EVENTOS.RECORDATORIO_1H)).map(grupo => (
        <div key={grupo.titulo} className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{grupo.titulo}</p>
          <ul className={cn(panelNuevo ? 'rounded-t-card border border-border bg-card shadow-t-card' : cardCls, 'divide-y divide-border overflow-hidden')}>
            {grupo.tipos.map(t => (
              <li key={t.evento}>
                {abierto === t.evento ? (
                  <Editor
                    evento={t.evento}
                    nombre={t.titulo}
                    propio={propios[t.evento] ?? null}
                    studioId={studioId}
                    datos={datosDe(t.evento)}
                    onCerrar={() => setAbierto(null)}
                    onGuardado={(texto, msg) => {
                      setPropios(p => {
                        const n = { ...(p ?? {}) };
                        if (texto) n[t.evento] = texto; else delete n[t.evento];
                        return n;
                      });
                      setAbierto(null);
                      showToast(msg);
                    }}
                  />
                ) : (
                  <Fila evento={t.evento} nombre={t.titulo} enLista={textoEnLista(t.evento, propios[t.evento])} datos={datosDe(t.evento)} onEditar={() => setAbierto(t.evento)} />
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Fila({ evento, nombre, enLista, datos, onEditar }: {
  evento: string; nombre: string; enLista: ReturnType<typeof textoEnLista>; datos: Record<string, string>; onEditar: () => void;
}) {
  // La muestra es la del texto que SALE, no la del guardado si ya no vale.
  const muestra = previsualizar(enLista.texto, datos, evento);
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium flex items-center gap-2">
          {nombre}
          {enLista.propio && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand-medio">Texto tuyo</span>}
          {enLista.yaNoSeUsa && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Tu texto ya no se usa</span>}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{muestra.title} · {muestra.body}</p>
        {enLista.yaNoSeUsa && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Llevaba algo que este aviso ya no incluye, así que sale el original. Ábrelo para escribir otro.
          </p>
        )}
      </div>
      <button type="button" className={btnSecondary} onClick={onEditar} aria-label={`Editar «${nombre}»`}>Editar</button>
    </div>
  );
}

function Editor({ evento, nombre, propio, studioId, datos, onCerrar, onGuardado }: {
  evento: string; nombre: string; propio: TextoAviso | null; studioId: string; datos: Record<string, string>;
  onCerrar: () => void; onGuardado: (t: TextoAviso | null, msg: string) => void;
}) {
  const inicial = propio ?? textoDeFabrica(evento)!;
  const [title, setTitle] = useState(inicial.title);
  const [body, setBody] = useState(inicial.body);
  const [ocupado, setOcupado] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  // Resultado de la última prueba: se dice cuántos dispositivos la ACEPTARON,
  // no que haya llegado — «aceptado» no es «entregado» (lo vimos el 21-sep).
  const [prueba, setPrueba] = useState<string | null>(null);
  const error = validarTexto(evento, { title, body });
  const muestra = previsualizar({ title, body }, datos, evento);
  const variables = variablesPermitidas(evento);
  const panelNuevo = usePanelNuevo();

  async function guardar() {
    if (error) return;
    setOcupado(true);
    setErrorServidor(null);
    const res = await dbGuardarTextoAviso(studioId, evento, { title, body });
    setOcupado(false);
    if (!res.ok) { setErrorServidor(res.error); return; }
    onGuardado({ title: title.trim(), body: body.trim() }, 'Texto guardado');
  }

  async function probar() {
    if (error) return;
    setOcupado(true);
    setErrorServidor(null);
    setPrueba(null);
    const res = await enviarPruebaPush(evento, { title, body });
    setOcupado(false);
    if (!res.ok) { setErrorServidor(res.error); return; }
    setPrueba(res.dispositivos === 1
      ? 'Enviada a tu dispositivo. Si en un minuto no te ha llegado, abre la app de tu estudio en el móvil y vuelve a probar.'
      : `Enviada a tus ${res.dispositivos} dispositivos. Si en un minuto no te ha llegado, abre la app de tu estudio en el móvil y vuelve a probar.`);
  }

  async function restaurar() {
    setOcupado(true);
    setErrorServidor(null);
    const res = await dbRestaurarTextoAviso(studioId, evento);
    setOcupado(false);
    if (!res.ok) { setErrorServidor(res.error); return; }
    onGuardado(null, 'Vuelve el texto original');
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4 bg-muted/40">
      <p className="text-[13px] font-semibold">{nombre}</p>
      <Field label={`Título (${title.trim().length}/${TITULO_MAX})`}>
        <input className={inputCls} value={title} maxLength={TITULO_MAX + 20} onChange={e => setTitle(e.target.value)} />
      </Field>
      <Field label={`Texto (${body.trim().length}/${CUERPO_MAX})`}>
        <textarea className={`${inputCls} min-h-20`} value={body} maxLength={CUERPO_MAX + 40} onChange={e => setBody(e.target.value)} />
      </Field>
      {variables.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Toca para añadir al texto lo que cambia en cada aviso:</p>
          <div className="flex flex-wrap gap-1.5">
            {variables.map(v => (
              <button
                key={v} type="button"
                className="rounded-full border border-border bg-card px-2.5 py-1 text-xs hover:bg-muted"
                onClick={() => setBody(b => `${b}${b.endsWith(' ') || !b ? '' : ' '}{${v}}`)}
              >
                {ETIQUETA_VARIABLE[v] ?? v}
              </button>
            ))}
          </div>
        </div>
      )}
      {panelNuevo ? (
        <div aria-label="Así lo verá la alumna">
          <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-foreground/55">Así lo recibirá (con datos de ejemplo)</p>
          <NotificacionMovil title={muestra.title} body={muestra.body} />
        </div>
      ) : (
      <div className="rounded-xl border border-border bg-card p-3" aria-label="Así lo verá la alumna">
        <p className="text-[11px] text-muted-foreground mb-1">Así lo verá (con datos de ejemplo)</p>
        <p className="text-[13px] font-semibold">{muestra.title || '—'}</p>
        <p className="text-[13px]">{muestra.body || '—'}</p>
      </div>
      )}
      {(error || errorServidor) && <p role="alert" className="text-xs text-destructive">{errorServidor ?? error}</p>}
      {prueba && !errorServidor && <p role="status" className="text-xs text-muted-foreground">{prueba}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} disabled={!!error || ocupado} onClick={() => void guardar()}>Guardar</button>
        <button type="button" className={btnSecondary} disabled={!!error || ocupado} onClick={() => void probar()}>Enviarme una prueba</button>
        <button type="button" className={btnSecondary} disabled={ocupado} onClick={onCerrar}>Cancelar</button>
        {propio && (
          <button type="button" className={btnSecondary} disabled={ocupado} onClick={() => void restaurar()}>Volver al original</button>
        )}
      </div>
    </div>
  );
}
