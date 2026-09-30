'use client';

// Veri*Factu — lo que hace el productor del software y apoderado, en persona:
// suscribir la declaración responsable del SIF (y, desde la PR 3, verificar
// los poderes IZ860 que otorgan los estudios).
//
// La declaración se construye en el servidor con los datos del productor de la
// configuración; desde aquí solo se ponen la fecha y el lugar de suscripción.

import { useCallback, useEffect, useState } from 'react';
import { FileCheck2 } from 'lucide-react';
import {
  fetchDeclaracionVerifactu, suscribirDeclaracionVerifactu, type DeclaracionVerifactuInterna,
  fetchVerifactuEstudios, accionVerifactuEstudios, type VerifactuEstudiosInterno, type RepresentacionVerifactuInterna,
} from '@/lib/interno/client';

/** Una autorización en revisión: el apoderado la comprueba en la sede y la verifica o la rechaza. */
function Revision({ r, onAccion }: { r: RepresentacionVerifactuInterna; onAccion: (c: Record<string, unknown>) => Promise<void> }) {
  const [referencia, setReferencia] = useState('');
  const [cotejado, setCotejado] = useState(false);
  const [motivo, setMotivo] = useState('');
  return (
    <li className="rounded-xl border border-border px-3 py-3 text-[13px] space-y-2">
      <p><strong>{r.nombre_representado}</strong> · NIF {r.nif_representado} · estudio {r.studio_id}</p>
      <p className="text-muted-foreground">
        Poder {r.tramite} a {r.apoderado_nombre} ({r.apoderado_nif}), otorgado el {r.otorgado_en} por {r.otorgante_nombre} ({r.otorgante_nif}, {r.otorgante_cargo}), vale hasta {r.vigente_hasta}.
      </p>
      <p>CSV declarado: <code className="break-all">{r.csv_aeat}</code></p>
      <p className="text-[12px] text-muted-foreground">Compruébalo en la sede: «Consulta, confirmación, prórroga y renuncia de apoderamientos recibidos» y coteja el CSV en «Cotejo de documentos mediante CSV».</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[12px] font-semibold">Referencia del apoderamiento en la sede
          <input value={referencia} onChange={e => setReferencia(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] font-normal" />
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={cotejado} onChange={e => setCotejado(e.target.checked)} /> CSV cotejado en la sede</label>
        <button type="button" disabled={!referencia.trim() || !cotejado}
          onClick={() => void onAccion({ accion: 'verificar', representacionId: r.id, referenciaAeat: referencia, csvCotejado: cotejado, tramiteComprobado: r.tramite })}
          className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-bold text-brand-foreground disabled:opacity-50">Verificar</button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[12px] font-semibold">Motivo si no se puede verificar
          <input value={motivo} onChange={e => setMotivo(e.target.value)} className="mt-1 block w-72 max-w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] font-normal" />
        </label>
        <button type="button" disabled={!motivo.trim()} onClick={() => void onAccion({ accion: 'rechazar', representacionId: r.id, motivo })}
          className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-50">No verificar</button>
      </div>
    </li>
  );
}

function hoyDdMmAaaa(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

export default function VerifactuInternoPage() {
  const [dr, setDr] = useState<DeclaracionVerifactuInterna | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoyDdMmAaaa());
  const [lugar, setLugar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [vf, setVf] = useState<VerifactuEstudiosInterno | null>(null);

  const accion = async (cuerpo: Record<string, unknown>) => {
    setError(null);
    try { setVf(await accionVerifactuEstudios(cuerpo)); } catch (e) { setError(e instanceof Error ? e.message : 'No se ha podido completar.'); }
  };

  const cargar = useCallback(async () => {
    try {
      setDr(await fetchDeclaracionVerifactu());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido cargar.');
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const [d, v] = await Promise.all([fetchDeclaracionVerifactu(), fetchVerifactuEstudios()]);
        if (vivo) { setDr(d); setVf(v); }
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se ha podido cargar.');
      }
    })();
    return () => { vivo = false; };
  }, []);

  const suscribir = async () => {
    setGuardando(true);
    setError(null);
    try {
      await suscribirDeclaracionVerifactu(fecha.trim(), lugar.trim());
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido suscribir.');
    } finally {
      setGuardando(false);
    }
  };

  const faltaProductor = (dr?.falta ?? []).filter(f => !f.startsWith('fecha y lugar'));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-bold">Veri*Factu</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Declaración responsable del sistema de facturación. Sin una declaración suscrita para la versión actual, no se transmite ningún registro.
        </p>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/[0.05] px-4 py-3 text-[13.5px]">{error}</p>}

      {dr && (
        <section className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2">
            <FileCheck2 className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="text-[15px] font-bold">Declaración responsable · versión {dr.version}</h2>
          </div>

          {dr.suscrita ? (
            <p className="mt-2 text-[13.5px]">
              Suscrita el <strong>{dr.suscrita.fecha}</strong> en <strong>{dr.suscrita.lugar}</strong>.
              <span className="block mt-1 text-[11.5px] text-muted-foreground break-all">Huella del texto: {dr.suscrita.sha256}</span>
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {faltaProductor.length > 0 && (
                <div className="rounded-xl border border-amber-500/35 bg-amber-500/[0.06] px-3 py-2 text-[13px]">
                  <p className="font-semibold">Faltan datos del productor en la configuración del servidor:</p>
                  <ul className="mt-1 list-disc pl-5">{faltaProductor.map(f => <li key={f}>{f}</li>)}</ul>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-[12.5px] font-semibold">
                  Fecha de suscripción (dd-mm-aaaa)
                  <input value={fecha} onChange={e => setFecha(e.target.value)} inputMode="numeric"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] font-normal" />
                </label>
                <label className="text-[12.5px] font-semibold">
                  Lugar («Localidad, País»)
                  <input value={lugar} onChange={e => setLugar(e.target.value)} placeholder="Localidad, España"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] font-normal" />
                </label>
              </div>
              <p className="text-[12.5px] text-muted-foreground">
                Al suscribirla declaras, como productor, que esta versión del sistema cumple el art. 29.2.j) LGT, el RD 1007/2023 y la Orden HAC/1177/2024. Queda guardada tal cual, con su huella, y no se puede editar: si cambia algo, se suscribe otra.
              </p>
              <button type="button" onClick={() => void suscribir()} disabled={guardando || faltaProductor.length > 0 || !lugar.trim()}
                className="rounded-xl bg-brand px-4 py-2 text-[13.5px] font-bold text-brand-foreground disabled:opacity-50">
                {guardando ? 'Suscribiendo…' : 'Suscribir declaración'}
              </button>
            </div>
          )}

          <details className="mt-4">
            <summary className="cursor-pointer text-[13px] font-semibold">Ver el texto</summary>
            <dl className="mt-3 space-y-3">
              {dr.apartados.map((a, i) => (
                <div key={`${a.letra}-${i}`}>
                  <dt className="text-[12px] font-semibold text-muted-foreground">{a.letra}) {a.etiqueta}{a.valor === '' ? '' : ':'}</dt>
                  {a.valor !== '' && <dd className="mt-0.5 text-[13px] whitespace-pre-line">{a.valor ?? 'PENDIENTE'}</dd>}
                </div>
              ))}
            </dl>
          </details>
        </section>
      )}

      {vf && (
        <section className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5 space-y-4">
          <h2 className="text-[15px] font-bold">Autorizaciones por comprobar</h2>
          {vf.representaciones.filter(r => r.estado === 'EN_REVISION').length === 0
            ? <p className="text-[13px] text-muted-foreground">Ninguna pendiente.</p>
            : <ul className="space-y-3">{vf.representaciones.filter(r => r.estado === 'EN_REVISION').map(r => <Revision key={r.id} r={r} onAccion={accion} />)}</ul>}

          <h2 className="text-[15px] font-bold pt-2">Estudios dados de alta</h2>
          {vf.estudios.length === 0 ? <p className="text-[13px] text-muted-foreground">Ninguno.</p> : (
            <ul className="space-y-2">
              {vf.estudios.map(e => (
                <li key={e.studio_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-[13px]">
                  <span><strong>{e.nombre_fiscal}</strong> · {e.nif} · <span className="font-mono">{e.estado}</span>{e.estado_motivo ? ` · ${e.estado_motivo}` : ''}</span>
                  {e.facturas_anteriores_sin_decidir > 0 && (
                    <span className="basis-full text-[12.5px] text-amber-700 dark:text-amber-400">
                      {e.facturas_anteriores_sin_decidir === 1 ? '1 factura emitida' : `${e.facturas_anteriores_sin_decidir} facturas emitidas`} antes de activar VERI*FACTU que la AEAT no tiene.
                      No se puede activar hasta que haya criterio escrito sobre ellas: no se envían solas.
                    </span>
                  )}
                  <span className="flex gap-2">
                    {e.estado === 'VERIFICADO' && e.facturas_anteriores_sin_decidir === 0 && (
                      <button type="button" onClick={() => { if (window.confirm(`¿Activar el envío REAL a la AEAT para ${e.nombre_fiscal}?`)) void accion({ accion: 'activar_produccion', studioId: e.studio_id }); }}
                        className="rounded-lg bg-brand px-3 py-1 text-[12.5px] font-bold text-brand-foreground">Activar producción</button>
                    )}
                    {(e.estado === 'PRODUCCION' || e.estado === 'VERIFICADO') && (
                      <button type="button" onClick={() => void accion({ accion: 'pausar', studioId: e.studio_id, motivo: 'Pausado por Tentare' })}
                        className="rounded-lg border border-border px-3 py-1 text-[12.5px] font-bold">Pausar</button>
                    )}
                    {(e.estado === 'PAUSADO' || e.estado === 'SUSPENDIDO_AEAT') && (
                      <button type="button" onClick={() => void accion({ accion: 'reanudar', studioId: e.studio_id })}
                        className="rounded-lg border border-border px-3 py-1 text-[12.5px] font-bold">Reanudar (vuelve a verificado)</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
