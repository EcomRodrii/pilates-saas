'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Prospección en frío — la cola de revisión.
//
// La pantalla existe para una sola cosa: que nadie envíe un correo que no ha
// leído. Todo lo demás (importar, generar) es preparación.
//
// Por eso cada tarjeta pone el dato REAL del estudio pegado al texto que la IA
// escribió sobre él: comprobar que "veo que usáis Bsport" es verdad tiene que
// costar una mirada, no abrir otra pestaña. Los avisos de `revisarBorrador` van
// justo debajo del cuerpo, donde se está mirando, y no en una columna aparte.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, Loader2, Send, Sparkles, Upload, X,
} from 'lucide-react';
import {
  fetchProspeccion, importarProspectos, generarBorradorProspeccion,
  cambiarBorradorProspeccion, enviarLoteProspeccion,
  type Prospeccion, type Prospecto, type ResultadoImportacion,
} from '@/lib/interno/client';
import {
  revisarBorrador, resumirProspeccion, TAMANO_LOTE,
  type BorradorProspeccion,
} from '@/lib/interno/prospeccion';

function Tarjeta({ titulo, valor, pie }: { titulo: string; valor: string; pie?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3.5 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-[22px] font-bold tabular-nums leading-none text-foreground">{valor}</p>
      {pie && <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{pie}</p>}
    </div>
  );
}

const campo = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground';

function FichaProspecto({ p }: { p: Prospecto }) {
  return (
    <div className="min-w-0">
      <h3 className="truncate text-[14px] font-bold text-foreground">{p.estudio ?? p.email}</h3>
      <p className="truncate text-[12px] text-muted-foreground">{p.web ?? 'sin web'}</p>
      {p.softwareActual ? (
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-bold text-warning">
          usa {p.softwareActual}
        </span>
      ) : (
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
          software sin averiguar
        </span>
      )}
      <dl className="mt-2.5 text-[12px]">
        <dt className="font-semibold text-muted-foreground">Instagram</dt>
        <dd className="truncate font-semibold text-foreground">{p.instagram ?? '—'}</dd>
        <dt className="mt-1.5 font-semibold text-muted-foreground">Contacto</dt>
        <dd className="truncate font-semibold text-foreground">{p.email}</dd>
        {p.ciudad && (<>
          <dt className="mt-1.5 font-semibold text-muted-foreground">Ciudad</dt>
          <dd className="truncate font-semibold text-foreground">{p.ciudad}</dd>
        </>)}
      </dl>
    </div>
  );
}

function TarjetaBorrador({ borrador, prospecto, onCambiado, onError }: {
  borrador: BorradorProspeccion;
  prospecto: Prospecto;
  onCambiado: (b: BorradorProspeccion) => void;
  onError: (m: string) => void;
}) {
  const [asunto, setAsunto] = useState(borrador.asunto);
  const [cuerpo, setCuerpo] = useState(borrador.cuerpo);
  const [ocupado, setOcupado] = useState(false);

  const sucio = asunto !== borrador.asunto || cuerpo !== borrador.cuerpo;
  // Se revisa el texto que se está VIENDO, no el guardado: si alguien corrige a
  // mano el software equivocado, el aviso tiene que desaparecer al momento.
  const avisos = useMemo(
    () => revisarBorrador({ asunto, cuerpo }, prospecto),
    [asunto, cuerpo, prospecto],
  );

  const actuar = useCallback(async (accion: 'aprobar' | 'descartar' | 'guardar') => {
    setOcupado(true);
    try {
      const r = await cambiarBorradorProspeccion({ id: borrador.id, asunto, cuerpo, accion });
      if (r.borrador) onCambiado(r.borrador);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se ha podido guardar.');
    } finally {
      setOcupado(false);
    }
  }, [borrador.id, asunto, cuerpo, onCambiado, onError]);

  const aprobado = borrador.estado === 'APROBADO';

  return (
    <div className="grid gap-5 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[200px_1fr]">
      <FichaProspecto p={prospecto} />

      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
            aprobado ? 'bg-success/12 text-success' : 'bg-info/10 text-info'
          }`}>
            {aprobado ? 'Aprobado' : 'Sin revisar'}
          </span>
          <span className="text-[11.5px] text-muted-foreground">para {prospecto.email}</span>
        </div>

        <input
          className={`${campo} font-bold`}
          value={asunto}
          onChange={e => setAsunto(e.target.value)}
          aria-label={`Asunto del correo a ${prospecto.estudio ?? prospecto.email}`}
        />
        <textarea
          className={`${campo} mt-2 min-h-[150px] resize-y leading-relaxed`}
          value={cuerpo}
          onChange={e => setCuerpo(e.target.value)}
          aria-label={`Cuerpo del correo a ${prospecto.estudio ?? prospecto.email}`}
        />

        {avisos.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {avisos.map((a, i) => (
              <li
                key={i}
                className={`flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold ${
                  a.gravedad === 'alta'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                {a.texto}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
          {sucio && <span className="mr-auto text-[11.5px] text-muted-foreground">Sin guardar</span>}
          <button
            type="button" disabled={ocupado} onClick={() => void actuar('descartar')}
            className="rounded-lg bg-muted px-3 py-1.5 text-[12px] font-bold text-foreground disabled:opacity-40"
          >
            Descartar
          </button>
          {sucio && (
            <button
              type="button" disabled={ocupado} onClick={() => void actuar('guardar')}
              className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-bold text-foreground disabled:opacity-40"
            >
              Guardar cambios
            </button>
          )}
          {!aprobado || sucio ? (
            <button
              type="button" disabled={ocupado} onClick={() => void actuar('aprobar')}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-[12px] font-bold text-brand-foreground disabled:opacity-40"
            >
              {ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Aprobar
            </button>
          ) : (
            <span className="flex items-center gap-1.5 px-1 text-[12px] font-bold text-success">
              <Check className="size-3.5" /> Listo para enviar
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function Prospeccion() {
  const [d, setD] = useState<Prospeccion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [importacion, setImportacion] = useState<ResultadoImportacion | null>(null);
  const [generando, setGenerando] = useState<{ hechos: number; total: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    try { setD(await fetchProspeccion()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  const porLead = useMemo(() => {
    const m = new Map<string, BorradorProspeccion>();
    // Los borradores llegan ordenados por fecha desc, así que el primero de
    // cada lead es el vigente. Un DESCARTADO no cuenta: su lead vuelve a estar
    // disponible para generar otro.
    for (const b of d?.borradores ?? []) {
      if (b.estado === 'DESCARTADO') continue;
      if (!m.has(b.leadId)) m.set(b.leadId, b);
    }
    return m;
  }, [d?.borradores]);

  const prospectoPorId = useMemo(
    () => new Map((d?.prospectos ?? []).map(p => [p.id, p])),
    [d?.prospectos],
  );

  const resumen = useMemo(
    () => resumirProspeccion(d?.prospectos.length ?? 0, [...porLead.values()]),
    [d?.prospectos.length, porLead],
  );

  const sinBorrador = useMemo(
    () => (d?.prospectos ?? []).filter(p => !porLead.has(p.id)),
    [d?.prospectos, porLead],
  );

  const cola = useMemo(
    () => [...porLead.values()]
      .filter(b => b.estado === 'BORRADOR' || b.estado === 'APROBADO')
      .sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'BORRADOR' ? -1 : 1)),
    [porLead],
  );

  const fallidos = useMemo(
    () => [...porLead.values()].filter(b => b.estado === 'FALLIDO'),
    [porLead],
  );

  async function alSubirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setImportacion(null);
    try {
      const r = await importarProspectos(await f.text());
      setImportacion(r);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido importar.');
    } finally {
      // Sin esto, volver a elegir el MISMO archivo no dispara el change y
      // parece que el botón no hace nada.
      if (archivo.current) archivo.current.value = '';
    }
  }

  // Uno por uno y a propósito: así la barra avanza de verdad y un estudio que
  // haga fallar al modelo no se lleva por delante a los demás.
  async function generarTodos() {
    const pendientes = sinBorrador;
    if (pendientes.length === 0) return;
    setError(null);
    setGenerando({ hechos: 0, total: pendientes.length });
    let fallos = 0;
    for (let i = 0; i < pendientes.length; i++) {
      try { await generarBorradorProspeccion(pendientes[i].id); }
      catch { fallos++; }
      setGenerando({ hechos: i + 1, total: pendientes.length });
    }
    setGenerando(null);
    if (fallos > 0) setAviso(`${fallos} de ${pendientes.length} no se han podido generar. Vuelve a intentarlo con esos.`);
    await cargar();
  }

  async function enviarLote() {
    setEnviando(true);
    setError(null);
    try {
      const r = await enviarLoteProspeccion();
      setAviso(
        r.quedan > 0
          ? `${r.encolados} correos saliendo. Quedan ${r.quedan} aprobados para el siguiente lote.`
          : `${r.encolados} correos saliendo. No queda ninguno aprobado en la cola.`,
      );
      // El envío es asíncrono (Inngest): se recarga tras un momento para que se
      // vean los primeros ENVIADO sin tener que refrescar a mano.
      setTimeout(() => { void cargar(); }, 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido enviar.');
    } finally {
      setEnviando(false);
    }
  }

  if (error && !d) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;
  if (!d) return <p className="text-[13.5px] text-muted-foreground">Cargando…</p>;

  return (
    <div className="flex flex-col gap-5">
      {!d.buzonConfigurado && (
        <p className="rounded-xl border border-warning/30 bg-warning/[0.06] px-3.5 py-2.5 text-[12.5px] font-semibold text-foreground">
          El buzón de envío no está configurado. Puedes importar, generar y revisar, pero
          «Enviar» no funcionará hasta que estén puestas <code>SPACEMAIL_USER</code> y{' '}
          <code>SPACEMAIL_PASSWORD</code>.
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-destructive">{error}</p>
      )}
      {aviso && (
        <p className="flex items-start justify-between gap-3 rounded-xl bg-success/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-success">
          {aviso}
          <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso"><X className="size-3.5" /></button>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tarjeta titulo="Importados" valor={String(resumen.importados)} pie={`${sinBorrador.length} sin borrador`} />
        <Tarjeta titulo="Por revisar" valor={String(resumen.porRevisar)} pie="Generados, sin aprobar" />
        <Tarjeta titulo="Aprobados" valor={String(resumen.aprobados)} pie="Listos para el próximo lote" />
        <Tarjeta
          titulo="Enviados" valor={String(resumen.enviados)}
          pie={resumen.fallidos > 0 ? `${resumen.fallidos} fallaron` : 'sin fallos'}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="text-[14px] font-bold text-foreground">Importar estudios</h2>
          <p className="text-[12.5px] text-muted-foreground">
            CSV con al menos email y nombre del estudio. Web, Instagram, teléfono, ciudad y
            software actual son opcionales — cuanto más haya, más concreto es el correo.
          </p>
          {importacion && (
            <p className="mt-1.5 text-[12px] font-bold text-success">
              {importacion.nuevos} nuevos · {importacion.actualizados} actualizados
              {importacion.rechazadas.length > 0 && (
                <span className="text-destructive"> · {importacion.rechazadas.length} rechazados</span>
              )}
            </p>
          )}
          {importacion && importacion.rechazadas.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {importacion.rechazadas.slice(0, 6).map(r => (
                <li key={r.fila} className="text-[11.5px] text-muted-foreground">
                  Fila {r.fila}: {r.motivo}
                </li>
              ))}
              {importacion.rechazadas.length > 6 && (
                <li className="text-[11.5px] text-muted-foreground">
                  …y {importacion.rechazadas.length - 6} más
                </li>
              )}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={archivo} type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => void alSubirArchivo(e)}
          />
          <button
            type="button" onClick={() => archivo.current?.click()}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-[13px] font-bold text-foreground"
          >
            <Upload className="size-4" /> Importar CSV
          </button>
          {sinBorrador.length > 0 && (
            <button
              type="button" disabled={generando !== null} onClick={() => void generarTodos()}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-bold text-brand-foreground disabled:opacity-50"
            >
              {generando
                ? <><Loader2 className="size-4 animate-spin" /> {generando.hechos}/{generando.total}</>
                : <><Sparkles className="size-4" /> Generar {sinBorrador.length} borradores</>}
            </button>
          )}
        </div>
      </div>

      {fallidos.length > 0 && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/[0.05] px-4 py-3">
          <p className="text-[12.5px] font-bold text-foreground">{fallidos.length} correo(s) no salieron</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {fallidos.map(b => (
              <li key={b.id} className="text-[11.5px] text-muted-foreground">
                <strong className="text-foreground">
                  {prospectoPorId.get(b.leadId)?.estudio ?? b.leadId}
                </strong>: {b.error ?? 'sin detalle'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cola.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
          {resumen.importados === 0
            ? 'Todavía no has importado ningún estudio.'
            : sinBorrador.length > 0
              ? 'Ningún borrador generado todavía. Pulsa «Generar borradores».'
              : 'No queda nada por revisar.'}
        </p>
      ) : (
        <>
          <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Cola de revisión · {cola.length}
          </p>
          <div className="flex flex-col gap-3 pb-24">
            {cola.map(b => {
              const p = prospectoPorId.get(b.leadId);
              if (!p) return null;
              return (
                <TarjetaBorrador
                  key={b.id} borrador={b} prospecto={p}
                  onError={setError}
                  onCambiado={actualizado => setD(prev => prev && ({
                    ...prev,
                    borradores: prev.borradores.map(x => (x.id === actualizado.id ? actualizado : x)),
                  }))}
                />
              );
            })}
          </div>
        </>
      )}

      {resumen.aprobados > 0 && (
        <div className="sticky bottom-4 -mt-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-lg">
          <div className="min-w-0 text-[13px]">
            <b className="tabular-nums">{resumen.aprobados}</b> aprobados listos para enviar
            <span className="block text-[11.5px] text-muted-foreground">
              Salen de {TAMANO_LOTE} en {TAMANO_LOTE}, no todos de golpe: un dominio nuevo que
              suelta cien correos iguales en un minuto acaba en spam.
            </span>
          </div>
          <button
            type="button" disabled={enviando || !d.buzonConfigurado} onClick={() => void enviarLote()}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-[13px] font-bold text-brand-foreground disabled:opacity-50"
          >
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Enviar siguiente lote ({Math.min(resumen.aprobados, TAMANO_LOTE)})
          </button>
        </div>
      )}
    </div>
  );
}
