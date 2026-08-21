'use client';

// De dónde vienen los clientes y qué piden.
//
// Junta tres señales que ya se estaban escribiendo y **no las leía nadie**: los
// leads del formulario de migración de la landing (que hasta la migración 0136
// ni se guardaban), el "¿cómo nos conociste?" del alta, y las dudas y
// peticiones de mejora que mandan los estudios desde el widget de ayuda.
//
// Lo primero de la pantalla no es la lista de leads: es **a quién hay que
// escribir hoy**. Un CRM que empieza por la lista completa se convierte en una
// hoja de cálculo que nadie abre.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Flame, Loader2, Plus, X } from 'lucide-react';
import {
  fetchCrecimiento, fetchReviewBoost, guardarLead, type Crecimiento,
} from '@/lib/interno/client';
import {
  ESTADOS, ESTADO_ETIQUETA, ORIGENES, ORIGEN_ETIQUETA,
  agruparPeticiones, deDondeVienen, loQueQuemaHoy, resumirEmbudo,
  type EstadoLead, type Lead, type OrigenLead,
} from '@/lib/interno/crecimiento';
import type { ResumenReviewBoost } from '@/lib/interno/review-boost';

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const TONO: Record<EstadoLead, string> = {
  NUEVO: 'bg-sky-500/12 text-sky-700 dark:text-sky-400',
  CONTACTADO: 'bg-muted text-muted-foreground',
  DEMO: 'bg-muted text-muted-foreground',
  PRUEBA: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
  CLIENTE: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  PERDIDO: 'bg-muted text-muted-foreground line-through',
};

function Tarjeta({ titulo, valor, pie }: { titulo: string; valor: string; pie?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3.5 py-3 sm:px-4 sm:py-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-[22px] sm:text-[26px] font-bold tabular-nums leading-none text-foreground">{valor}</p>
      {pie && <p className="mt-1.5 text-[11.5px] text-muted-foreground leading-snug">{pie}</p>}
    </div>
  );
}

const campo = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground';

function Ficha({ lead, onGuardado, onCerrar }: {
  lead: Partial<Lead>; onGuardado: () => void; onCerrar: () => void;
}) {
  const [f, setF] = useState<Record<string, string>>({
    email: lead.email ?? '', nombre: lead.nombre ?? '', estudio: lead.estudio ?? '',
    telefono: lead.telefono ?? '', ciudad: lead.ciudad ?? '',
    software_actual: lead.softwareActual ?? '', estado: lead.estado ?? 'NUEVO',
    origen: lead.origen ?? 'MANUAL', proximo_paso: lead.proximoPaso ?? '',
    proxima_fecha: lead.proximaFecha ?? '', motivo_perdida: lead.motivoPerdida ?? '',
    notas: lead.notas ?? '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (e: { target: { value: string } }) => setF(v => ({ ...v, [k]: e.target.value }));

  const enviar = async () => {
    setGuardando(true); setError(null);
    try {
      await guardarLead({ ...f, id: lead.id });
      onGuardado(); onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido guardar.');
    } finally { setGuardando(false); }
  };

  return (
    <div data-testid="ficha-lead" className="rounded-2xl border border-brand-medio/40 bg-card px-4 py-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-bold text-foreground">{lead.id ? 'Editar lead' : 'Nuevo lead'}</p>
        <button type="button" onClick={onCerrar} aria-label="Cerrar">
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <input className={campo} placeholder="Email" value={f.email} onChange={set('email')} />
        <input className={campo} placeholder="Nombre" value={f.nombre} onChange={set('nombre')} />
        <input className={campo} placeholder="Estudio" value={f.estudio} onChange={set('estudio')} />
        <input className={campo} placeholder="Teléfono" value={f.telefono} onChange={set('telefono')} />
        <input className={campo} placeholder="Ciudad" value={f.ciudad} onChange={set('ciudad')} />
        <input className={campo} placeholder="Software actual" value={f.software_actual} onChange={set('software_actual')} />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-[11.5px] font-semibold text-muted-foreground">
          Estado
          <select className={`${campo} mt-1`} value={f.estado} onChange={set('estado')}>
            {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_ETIQUETA[e]}</option>)}
          </select>
        </label>
        <label className="text-[11.5px] font-semibold text-muted-foreground">
          De dónde salió
          <select className={`${campo} mt-1`} value={f.origen} onChange={set('origen')}>
            {ORIGENES.map(o => <option key={o} value={o}>{ORIGEN_ETIQUETA[o]}</option>)}
          </select>
        </label>
      </div>

      {/* Obligatorio, y la API lo vuelve a exigir: un embudo que dice cuántos se
          caen pero no por qué no sirve para cambiar nada. */}
      {f.estado === 'PERDIDO' && (
        <input
          className={`${campo} mt-2 border-amber-500/50`} value={f.motivo_perdida}
          onChange={set('motivo_perdida')}
          placeholder="¿Por qué se ha perdido? (obligatorio)"
        />
      )}

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input className={campo} placeholder="Siguiente paso" value={f.proximo_paso} onChange={set('proximo_paso')} />
        <input className={campo} type="date" value={f.proxima_fecha} onChange={set('proxima_fecha')} />
      </div>
      <textarea className={`${campo} mt-2 min-h-[70px]`} placeholder="Notas" value={f.notas} onChange={set('notas')} />

      {error && <p className="mt-2 text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="button" disabled={guardando || !f.email} onClick={() => void enviar()}
        className="mt-3 flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-bold text-brand-foreground disabled:opacity-40"
      >
        {guardando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        Guardar
      </button>
    </div>
  );
}

export default function CrecimientoInterno() {
  const [d, setD] = useState<Crecimiento | null>(null);
  // El "ahora" con el que se decide qué lead quema se congela al cargar, no se
  // lee en el render: `Date.now()` durante el render es impuro (lo caza el
  // lint) y en SSR daría un valor distinto al del cliente.
  const [ahora, setAhora] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Partial<Lead> | null>(null);
  const [reviewBoost, setReviewBoost] = useState<ResumenReviewBoost | null>(null);

  const cargar = useCallback(async () => {
    try { setD(await fetchCrecimiento()); setAhora(Date.now()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);
  // Sección aparte, permiso aparte (growth.read): si alguien tiene crm.update
  // pero no growth.read, no debe romper el resto de la pantalla — falla en
  // silencio, sin sección, en vez de tumbar toda la página con un 403.
  useEffect(() => { void fetchReviewBoost().then(setReviewBoost).catch(() => {}); }, []);

  const vista = useMemo(() => {
    if (!d) return null;
    return {
      quema: loQueQuemaHoy(d.leads, ahora),
      embudo: resumirEmbudo(d.leads),
      origen: deDondeVienen(d.estudios),
      piden: agruparPeticiones(d.peticiones),
    };
  }, [d, ahora]);

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;
  if (!d || !vista) return <p className="text-[13.5px] text-muted-foreground">Cargando…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-bold text-foreground">Crecimiento</h1>
          <p className="text-[12.5px] text-muted-foreground">
            De dónde vienen los clientes y qué piden.
          </p>
        </div>
        <button
          type="button" onClick={() => setEditando({})}
          className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-bold text-brand-foreground"
        >
          <Plus className="size-4" /> Nuevo lead
        </button>
      </div>

      {editando && (
        <Ficha lead={editando} onCerrar={() => setEditando(null)} onGuardado={() => void cargar()} />
      )}

      {/* Lo primero es a quién escribir HOY, no la lista completa. */}
      {vista.quema.length > 0 && (
        <div data-testid="para-hoy" className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3.5">
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-foreground">
            <Flame className="size-3.5" aria-hidden />
            {vista.quema.length} lead(s) para hoy
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {vista.quema.map(({ lead, motivo }) => (
              <button
                key={lead.id} type="button" onClick={() => setEditando(lead)}
                className="text-left text-[12.5px] text-muted-foreground hover:underline"
              >
                <strong className="text-foreground">{lead.nombre ?? lead.email}</strong>
                {lead.estudio && ` · ${lead.estudio}`} — {motivo}
                {lead.proximoPaso && <span className="italic"> · {lead.proximoPaso}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <section>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Tarjeta titulo="En curso" valor={String(vista.embudo.enCurso)}
            pie="Ni ganados ni perdidos. Son los que se pueden mover." />
          <Tarjeta titulo="Clientes" valor={String(vista.embudo.clientes)} />
          <Tarjeta
            titulo="Conversión"
            valor={vista.embudo.conversion === null ? '—' : `${vista.embudo.conversion} %`}
            pie={vista.embudo.conversion === null
              ? 'Todavía no se ha cerrado ninguno, ni a favor ni en contra.'
              : `De los ${vista.embudo.clientes + vista.embudo.perdidos} cerrados. Los en curso no cuentan.`} />
          <Tarjeta titulo="Peticiones sin leer" valor={String(d.peticiones.length)}
            pie="Dudas y mejoras que han mandado los estudios." />
        </div>
      </section>

      {reviewBoost && (
        <section>
          <h2 className="mb-2 text-[13px] font-bold text-foreground">Review Boost</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <Tarjeta titulo="Elegibles" valor={String(reviewBoost.elegibles)} />
            <Tarjeta titulo="Mostrados" valor={String(reviewBoost.mostrados)} />
            <Tarjeta titulo="Feedbacks 1-3★" valor={String(reviewBoost.ratingsBajos)} />
            <Tarjeta titulo="Feedbacks 4-5★" valor={String(reviewBoost.ratingsAltos)} />
            <Tarjeta titulo="Recompensas concedidas" valor={String(reviewBoost.recompensasConcedidas)} />
            <Tarjeta titulo="Recompensas canjeadas" valor={String(reviewBoost.recompensasCanjeadas)}
              pie="Descuento aplicado en un Checkout real." />
          </div>
        </section>
      )}

      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">
          Embudo
        </h2>
        {/* Igual que en Facturación: en móvil cada lead es una ficha. Una
            tabla de cinco columnas en 340px partía los nombres en tres líneas
            y dejaba «Entró» fuera de la pantalla. */}
        {d.leads.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-3.5 text-[12.5px] text-muted-foreground">
            Todavía no hay ningún lead. Los del formulario de migración de la landing
            entran aquí solos; el resto se apuntan con «Nuevo lead».
          </p>
        ) : (
          <div className="rounded-2xl border border-border bg-card">
            <div className="hidden sm:grid grid-cols-[2fr_auto_auto_1fr_auto] gap-x-4 px-4 py-2 border-b border-border text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <span>Lead</span><span>Estado</span><span>De dónde</span><span>Siguiente paso</span><span>Entró</span>
            </div>
            {d.leads.map(l => (
              <div
                key={l.id} data-testid={`lead-${l.id}`}
                className="grid sm:grid-cols-[2fr_auto_auto_1fr_auto] gap-x-4 gap-y-1 px-4 py-3 border-b border-border/60 last:border-0"
              >
                <div className="flex items-start justify-between gap-2 sm:block">
                  <span className="min-w-0">
                    <button type="button" onClick={() => setEditando(l)}
                      className="text-left font-semibold text-foreground hover:underline">
                      {l.nombre ?? l.email}
                    </button>
                    {l.estudio && <span className="ml-1.5 text-[11.5px] text-muted-foreground">{l.estudio}</span>}
                    {l.softwareActual && (
                      <span className="ml-1.5 text-[11.5px] text-muted-foreground">· viene de {l.softwareActual}</span>
                    )}
                  </span>
                  <span className={`sm:hidden shrink-0 rounded-lg px-2 py-0.5 text-[11.5px] font-bold ${TONO[l.estado as EstadoLead]}`}>
                    {ESTADO_ETIQUETA[l.estado as EstadoLead] ?? l.estado}
                  </span>
                </div>
                <span className="hidden sm:block">
                  <span className={`inline-block rounded-lg px-2 py-0.5 text-[11.5px] font-bold ${TONO[l.estado as EstadoLead]}`}>
                    {ESTADO_ETIQUETA[l.estado as EstadoLead] ?? l.estado}
                  </span>
                </span>
                <span className="hidden sm:block text-[13px] text-muted-foreground">
                  {ORIGEN_ETIQUETA[l.origen as OrigenLead] ?? l.origen}
                </span>
                {/* En móvil se juntan origen, siguiente paso y motivo de pérdida
                    en una línea: por separado eran cuatro filas de una palabra. */}
                {/* En escritorio esto es la columna "siguiente paso"; en móvil
                    absorbe origen y fecha de entrada, que por separado eran tres
                    filas de una palabra. El guión de "sin siguiente paso" solo
                    se pinta en la rejilla: en la frase de móvil sería ruido. */}
                <span className="text-[12px] sm:text-[13px] text-muted-foreground">
                  {(() => {
                    const paso = l.proximoPaso
                      ?? (l.estado === 'PERDIDO' && l.motivoPerdida ? l.motivoPerdida : null);
                    return (
                      <>
                        <span className="sm:hidden">
                          {[ORIGEN_ETIQUETA[l.origen as OrigenLead] ?? l.origen, paso].filter(Boolean).join(' · ')}
                        </span>
                        <span className="hidden sm:inline">{paso ?? '—'}</span>
                        {l.proximaFecha && <span className="ml-1 text-[11.5px]">({fecha(l.proximaFecha)})</span>}
                        <span className="sm:hidden"> · entró el {fecha(l.creadoEn)}</span>
                      </>
                    );
                  })()}
                </span>
                <span className="hidden sm:block text-[13px] text-muted-foreground">{fecha(l.creadoEn)}</span>
              </div>
            ))}
          </div>
        )}

        {vista.embudo.motivosDePerdida.length > 0 && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            <strong className="text-foreground">Por qué se pierden:</strong>{' '}
            {vista.embudo.motivosDePerdida.map(m => `${m.motivo} (${m.n})`).join(' · ')}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">
          Lo que piden los estudios
        </h2>
        {vista.piden.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-3.5 text-[12.5px] text-muted-foreground">
            Nadie ha mandado ninguna duda ni petición todavía.
          </p>
        ) : (
          <div className="flex flex-col gap-2" data-testid="peticiones">
            {vista.piden.map(p => (
              <div key={p.mensaje} className="rounded-2xl border border-border bg-card px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[13px] text-foreground flex-1 min-w-[220px]">{p.mensaje}</p>
                  <span className="text-[11.5px] text-muted-foreground">{fecha(p.ultima)}</span>
                </div>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {p.estudios.length > 1
                    ? <strong className="text-foreground">{p.estudios.length} estudios lo piden</strong>
                    : (p.estudios[0] ?? 'Estudio desconocido')}
                  {p.estudios.length > 1 && `: ${p.estudios.join(', ')}`}
                  {p.n > p.estudios.length && ` · ${p.n} mensajes`}
                </p>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11.5px] text-muted-foreground leading-snug">
          Agrupadas por lo que piden, no por quién lo pide: «3 estudios quieren ClassPass»
          se puede priorizar, «un estudio escribió 4 veces» no.
        </p>
      </section>

      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">
          Cómo nos conocieron los estudios que ya están dentro
        </h2>
        <div className="rounded-2xl border border-border bg-card px-3.5 py-3 sm:px-4 sm:py-3.5">
          {vista.origen.canales.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              Ningún estudio ha respondido de dónde nos conoció.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {vista.origen.canales.map(c => (
                <div key={c.canal} className="flex items-center gap-2 text-[12.5px]">
                  <span className="w-32 shrink-0 text-foreground">{c.canal}</span>
                  <span
                    className="h-2.5 rounded-full bg-brand-medio"
                    style={{ width: `${Math.max(6, (c.n / vista.origen.respondieron) * 100)}%` }}
                  />
                  <span className="tabular-nums text-muted-foreground">{c.n}</span>
                </div>
              ))}
            </div>
          )}
          {/* Sin esto, "Instagram: 1" se lee como "el canal principal es
              Instagram" cuando en realidad han contestado 1 de 11. */}
          {vista.origen.sinResponder > 0 && (
            <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] text-muted-foreground leading-snug">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-600" aria-hidden />
              <span>
                Solo {vista.origen.respondieron} de {vista.origen.respondieron + vista.origen.sinResponder} estudios
                lo han contestado — la pregunta es opcional en el alta. Con tan pocas respuestas
                esto no es un reparto de canales, es una anécdota.
              </span>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
