'use client';

import { useEffect, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { Field, btnPrimary, btnSecondary, cardCls, inputCls } from '@/components/configuracion/estilos';
import {
  ANTELACIONES_CORTO_MINUTOS, ANTELACIONES_LARGO_HORAS, textoAntelacion,
} from '@/lib/notificaciones/antelacion-recordatorio';
import { EVENTOS } from '@/lib/notifications/catalog';
import {
  CUERPO_MAX, ETIQUETA_VARIABLE, TIPOS_CON_TEXTO_EDITABLE, TITULO_MAX, previsualizar, textoDeFabrica,
  validarTexto, variablesPermitidas, type TextoAviso,
} from '@/lib/notifications/textos-estudio';
import { dbGuardarTextoAviso, dbListTextosAviso, dbRestaurarTextoAviso } from '@/lib/notifications/textos-estudio-db';

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
    evento === EVENTOS.RECORDATORIO_24H ? { antelacion: textoAntelacion('24h', a) }
      : evento === EVENTOS.RECORDATORIO_1H ? { antelacion: textoAntelacion('1h', a) }
      : {};
}

const minutos = (m: number) => (m < 60 ? `${m} minutos` : m === 60 ? '1 hora' : `${m / 60} horas`);

export function HerramientaAvisosDelMovil({ showToast }: { showToast: (m: string) => void }) {
  return (
    <TarjetaAjuste id="avisos-del-movil" marco={false}>
      <div className="flex flex-col gap-6">
        <Antelacion showToast={showToast} />
        <Textos showToast={showToast} />
      </div>
    </TarjetaAjuste>
  );
}

function Antelacion({ showToast }: { showToast: (m: string) => void }) {
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
      showToast(res.error);
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

function Textos({ showToast }: { showToast: (m: string) => void }) {
  const { studio } = useStudio();
  const studioId = studio?.id;
  const [propios, setPropios] = useState<Record<string, TextoAviso> | null>(null);
  const [fallo, setFallo] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const datosDe = useDatosDe();

  useEffect(() => {
    if (!studioId) return;
    let vivo = true;
    dbListTextosAviso(studioId)
      .then(t => { if (vivo) setPropios(t); })
      .catch(() => { if (vivo) setFallo(true); });
    return () => { vivo = false; };
  }, [studioId]);

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
          <ul className={`${cardCls} divide-y divide-border overflow-hidden`}>
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
                        const n = { ...p };
                        if (texto) n[t.evento] = texto; else delete n[t.evento];
                        return n;
                      });
                      setAbierto(null);
                      showToast(msg);
                    }}
                  />
                ) : (
                  <Fila evento={t.evento} nombre={t.titulo} texto={propios[t.evento] ?? textoDeFabrica(t.evento)!} datos={datosDe(t.evento)} propio={!!propios[t.evento]} onEditar={() => setAbierto(t.evento)} />
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Fila({ evento, nombre, texto, datos, propio, onEditar }: {
  evento: string; nombre: string; texto: TextoAviso; datos: Record<string, string>; propio: boolean; onEditar: () => void;
}) {
  const muestra = previsualizar(texto, datos, evento);
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium flex items-center gap-2">
          {nombre}
          {propio && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">Texto tuyo</span>}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{muestra.title} · {muestra.body}</p>
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
  const error = validarTexto(evento, { title, body });
  const muestra = previsualizar({ title, body }, datos, evento);
  const variables = variablesPermitidas(evento);

  async function guardar() {
    if (error) return;
    setOcupado(true);
    setErrorServidor(null);
    const res = await dbGuardarTextoAviso(studioId, evento, { title, body });
    setOcupado(false);
    if (!res.ok) { setErrorServidor(res.error); return; }
    onGuardado({ title: title.trim(), body: body.trim() }, 'Texto guardado');
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
      <div className="rounded-xl border border-border bg-card p-3" aria-label="Así lo verá la alumna">
        <p className="text-[11px] text-muted-foreground mb-1">Así lo verá (con datos de ejemplo)</p>
        <p className="text-[13px] font-semibold">{muestra.title || '—'}</p>
        <p className="text-[13px]">{muestra.body || '—'}</p>
      </div>
      {(error || errorServidor) && <p role="alert" className="text-xs text-destructive">{errorServidor ?? error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} disabled={!!error || ocupado} onClick={() => void guardar()}>Guardar</button>
        <button type="button" className={btnSecondary} disabled={ocupado} onClick={onCerrar}>Cancelar</button>
        {propio && (
          <button type="button" className={btnSecondary} disabled={ocupado} onClick={() => void restaurar()}>Volver al original</button>
        )}
      </div>
    </div>
  );
}
