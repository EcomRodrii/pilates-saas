'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Apps de estudio: la cola de «Pedir mi app».
//
// Cada estudio que pide su app de la App Store aparece aquí. Quien tramita mueve el estado
// (lo que el estudio ve en su panel), pone el enlace de la tienda cuando está publicada y apunta
// notas internas (el estudio nunca las ve).
//
// ⚠️ «Activa» NO es lo mismo que el estado: cambia qué abre la app instalada con ese bundle y
// el fichero de enlaces universales. Se activa cuando la app existe en App Store Connect y se ha
// subido a TestFlight (`npm run app:estudio -- <slug>`), nunca antes.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { cambiarAppEstudio, fetchAppsEstudio, type AppDeEstudioInterna } from '@/lib/interno/client';
import { tienePermiso } from '@/lib/interno/permisos';
import { ESTADOS_APP, textoDeEstado, type EstadoApp } from '@/lib/app-nativa/pedir-app';
import { useSesionInterna } from '../layout';

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' }) : '—';

export default function AppsEstudioInterno() {
  const sesion = useSesionInterna();
  const puedeEditar = tienePermiso(sesion.permisos, 'studios.update');
  const [apps, setApps] = useState<AppDeEstudioInterna[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setApps((await fetchAppsEstudio()).apps); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se ha podido cargar.'); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  if (!apps && !error) return <p className="text-[13.5px] text-muted-foreground">Cargando…</p>;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-[20px] font-extrabold tracking-tight text-foreground">Apps de estudio</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
          Los estudios que han pedido su app de la App Store (con el nombre y el icono del estudio). Mueve el estado, pon el enlace de la
          tienda cuando esté publicada y apunta notas: el estudio solo ve el estado y el enlace. Los estudios solo pueden pedirla con
          el interruptor <span className="font-mono text-[12px]">APP_PROPIA_PEDIR</span> encendido para ellos y con un plan que la incluya.
        </p>
      </header>

      {error && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-2.5 text-[13px] text-destructive">{error}</p>}
      {aviso && <p role="status" className="rounded-xl bg-success/10 px-4 py-2.5 text-[13px] text-success">{aviso}</p>}

      {apps && apps.length === 0 && (
        <p className="rounded-2xl border border-border bg-card px-4 py-4 text-[13.5px] text-muted-foreground">Ningún estudio ha pedido su app todavía.</p>
      )}

      {apps && apps.length > 0 && (
        <ul className="flex flex-col gap-3" data-testid="cola-apps">
          {apps.map((a) => (
            <FilaApp key={a.studioId} app={a} puedeEditar={puedeEditar} onCambio={async (cuerpo, mensaje) => {
              setError(null); setAviso(null);
              try { await cambiarAppEstudio({ studioId: a.studioId, ...cuerpo }); setAviso(mensaje); await cargar(); }
              catch (e) { setError(e instanceof Error ? e.message : 'No se ha podido guardar.'); }
            }} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaApp({ app: a, puedeEditar, onCambio }: {
  app: AppDeEstudioInterna; puedeEditar: boolean;
  onCambio: (c: { estado?: EstadoApp; activa?: boolean; urlTienda?: string | null; notaInterna?: string | null }, mensaje: string) => Promise<void>;
}) {
  const [url, setUrl] = useState(a.urlTienda ?? '');
  const [nota, setNota] = useState(a.notaInterna ?? '');
  const [ocupado, setOcupado] = useState(false);
  const ejecutar = async (c: Parameters<typeof onCambio>[0], mensaje: string) => { setOcupado(true); try { await onCambio(c, mensaje); } finally { setOcupado(false); } };

  return (
    <li data-testid={`app-${a.studioId}`} className="rounded-2xl border border-border bg-card px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 text-[14px] font-bold text-foreground">
            <span className="truncate">{a.estudio}</span>
            {a.esDemo && <Etiqueta>demo</Etiqueta>}
            {!a.planIncluye && <Etiqueta aviso>su plan no la incluye</Etiqueta>}
          </p>
          <p className="text-[12px] text-muted-foreground">
            /{a.slug ?? '—'} · {a.plan ?? '—'} · pedida el {fecha(a.pedidaEn)} · «{a.nombreApp}» · <span className="font-mono">{a.bundleId}</span>
          </p>
        </div>
        <label className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          Estado
          <select
            value={a.estado} disabled={!puedeEditar || ocupado} aria-label={`Estado de la app de ${a.estudio}`}
            onChange={(e) => void ejecutar({ estado: e.target.value as EstadoApp }, `Estado de ${a.estudio}: ${textoDeEstado(e.target.value as EstadoApp).titulo}.`)}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-[13px]"
          >
            {ESTADOS_APP.map((e) => <option key={e} value={e}>{textoDeEstado(e).titulo}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12.5px] font-medium text-foreground">
          Enlace de la App Store
          <input value={url} onChange={(e) => setUrl(e.target.value)} disabled={!puedeEditar || ocupado} placeholder="https://apps.apple.com/es/app/…"
            aria-label={`Enlace de la tienda de ${a.estudio}`} className="rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] font-medium text-foreground">
          Nota interna (el estudio no la ve)
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} disabled={!puedeEditar || ocupado} rows={2}
            aria-label={`Nota interna de ${a.estudio}`} className="rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-normal" />
        </label>
      </div>

      {puedeEditar && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={ocupado} data-testid={`guardar-${a.studioId}`}
            onClick={() => void ejecutar({ urlTienda: url.trim() || null, notaInterna: nota.trim() || null }, `Guardado: ${a.estudio}.`)}
            className="min-h-9 rounded-lg border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground hover:bg-muted disabled:opacity-50">
            Guardar enlace y nota
          </button>
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <span>{a.activa ? 'Activa: la app abre directa en este estudio' : 'Sin activar: la app aún abre el selector'}</span>
            <button type="button" disabled={ocupado} data-testid={`activa-${a.studioId}`}
              onClick={() => void ejecutar({ activa: !a.activa }, a.activa ? `App de ${a.estudio} desactivada.` : `App de ${a.estudio} activada.`)}
              className="min-h-9 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-brand-foreground hover:brightness-95 disabled:opacity-50">
              {a.activa ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Etiqueta({ children, aviso }: { children: React.ReactNode; aviso?: boolean }) {
  return <span className={`rounded-full border px-1.5 py-px text-[10.5px] font-medium ${aviso ? 'border-warning/50 bg-warning/15 text-foreground' : 'border-border text-muted-foreground'}`}>{children}</span>;
}
