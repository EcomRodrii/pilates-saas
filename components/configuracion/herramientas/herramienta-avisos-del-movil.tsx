'use client';

import { useEffect, useState } from 'react';
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
  return (
    <TarjetaAjuste id="avisos-del-movil" marco={false}>
      <div className="flex flex-col gap-6">
        {panelNuevo ? <Recordatorios showToast={showToast} propios={textos.propios} /> : <Antelacion showToast={showToast} />}
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
 * Panel nuevo: los dos recordatorios de clase, cada uno en su tarjeta como los de
 * Bonsai (b-60): cuándo se envía, por dónde y cómo le llega. Guarda igual que
 * `Antelacion` (al elegir, y si el servidor dice que no, vuelve atrás).
 */
function Recordatorios({ showToast, propios }: { showToast: MostrarToast; propios: Record<string, TextoAviso> | null }) {
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

  const tarjetas = [
    {
      evento: EVENTOS.RECORDATORIO_24H, titulo: 'Recordatorio 1', cuando: `${largo} h antes`, sub: 'El aviso principal antes de la clase.',
      canales: ['En su móvil', 'Correo', 'WhatsApp, si lo tienes conectado'],
      control: (
        <select className={inputCls} value={largo} disabled={guardando} onChange={e => void guardar({ recordatorioLargoHoras: Number(e.target.value) })} aria-label="Cuándo se envía el recordatorio 1">
          {ANTELACIONES_LARGO_HORAS.map(h => <option key={h} value={h}>{h} horas antes</option>)}
        </select>
      ),
    },
    {
      evento: EVENTOS.RECORDATORIO_1H, titulo: 'Recordatorio 2', cuando: `${minutos(corto)} antes`, sub: 'Justo antes de la clase, para que no se le pase.',
      canales: ['En su móvil'],
      control: (
        <select className={inputCls} value={corto} disabled={guardando} onChange={e => void guardar({ recordatorioCortoMinutos: Number(e.target.value) })} aria-label="Cuándo se envía el recordatorio 2">
          {ANTELACIONES_CORTO_MINUTOS.map(m => <option key={m} value={m}>{minutos(m)} antes</option>)}
        </select>
      ),
    },
  ];

  return (
    <section aria-labelledby="recordatorios-clase" className="flex flex-col gap-3">
      <div>
        <h3 id="recordatorios-clase" className="text-[16px] font-semibold text-foreground">Recordatorios de clase</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Se guardan al elegir y valen para las clases que aún no lo han recibido. Cada alumna puede apagarlos desde su app.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {tarjetas.map(r => {
          const muestra = propios ? previsualizar(textoEnLista(r.evento, propios[r.evento]).texto, datosDe(r.evento), r.evento) : null;
          return (
            <div key={r.evento} className="flex flex-col gap-4 rounded-t-card border border-border bg-card p-5 shadow-t-card">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-foreground">
                  {r.titulo}
                  <span className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ color: 'var(--t-blue-500)', backgroundColor: 'color-mix(in srgb, var(--t-blue-500) 12%, var(--card))' }}>{r.cuando}</span>
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">{r.sub}</p>
              </div>
              <div>
                <p className="mb-1.5 text-[13px] font-semibold text-foreground">¿Cuándo se envía?</p>
                {r.control}
              </div>
              <div>
                <p className="mb-1.5 text-[13px] font-semibold text-foreground">¿Por dónde le llega?</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.canales.map(c => (
                    <span key={c} className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[12px] font-medium text-foreground">{c}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-foreground/55">Así lo recibirá</p>
                {muestra ? <NotificacionMovil title={muestra.title} body={muestra.body} /> : <p className="text-[12.5px] text-muted-foreground">Cargando el texto…</p>}
                <p className="mt-1.5 text-[12px] text-muted-foreground">Su texto se cambia abajo, en «Lo que dicen los avisos».</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
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

function Textos({ showToast, textos }: { showToast: MostrarToast; textos: TextosPropios }) {
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
      {TIPOS_CON_TEXTO_EDITABLE.map(grupo => (
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
