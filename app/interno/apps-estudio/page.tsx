'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Apps de estudio: la cola de «Pedir mi app».
//
// Cada estudio que pide su app de la App Store aparece aquí. Quien tramita mueve el estado
// (lo que el estudio ve en su panel), pone el enlace de la tienda cuando está publicada y apunta
// notas internas (el estudio nunca las ve).
//
// ⚠️ «Activa» NO es lo mismo que el estado: cambia qué abre la app instalada con ese bundle y
// el fichero de enlaces universales. Se activa al prepararla (la compilación lee de ahí el nombre
// y el icono), nunca con la app solo «Pedida», y una publicada no se puede desactivar: las reglas
// las pone el servidor (`leerCambio`), aquí solo se piden confirmaciones.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { validarNombreApp } from '@/lib/app-nativa/pedir-app';
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
  const [cuposLibres, setCuposLibres] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { const r = await fetchAppsEstudio(); setApps(r.apps); setCuposLibres(r.cuposLibres ?? null); setError(null); }
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
          tienda cuando esté publicada y apunta notas: el estudio solo ve el estado, el nombre y el enlace. Los estudios solo pueden
          pedirla con el interruptor <span className="font-mono text-[12px]">APP_PROPIA_PEDIR</span> encendido para ellos y con
          Estudio o Cadena pagado (en una cadena, una sola app, pedida desde la sede principal).
        </p>
      </header>

      {cuposLibres !== null && (
        <p className={`rounded-xl px-4 py-2.5 text-[13px] ${cuposLibres <= 2 ? 'bg-warning/15 text-foreground' : 'bg-muted text-muted-foreground'}`} data-testid="cupos-libres">
          {cuposLibres === 0
            ? 'No queda ningún hueco libre en el lote: la próxima petición tendrá que crearse a mano en App Store Connect. Toca preparar otro lote.'
            : `Huecos libres en el lote: ${cuposLibres}. Cada petición nueva se lleva uno (su app ya existe en App Store Connect).`}
        </p>
      )}
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
  onCambio: (c: { estado?: EstadoApp; activa?: boolean; urlTienda?: string | null; notaInterna?: string | null; nombreApp?: string }, mensaje: string) => Promise<void>;
}) {
  const [url, setUrl] = useState(a.urlTienda ?? '');
  const [nota, setNota] = useState(a.notaInterna ?? '');
  const [nombre, setNombre] = useState(a.nombreApp);
  const [ocupado, setOcupado] = useState(false);
  // Tras guardar se recarga la cola: los campos vuelven a lo que hay en el servidor.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setUrl(a.urlTienda ?? ''); setNota(a.notaInterna ?? ''); setNombre(a.nombreApp); }, [a.urlTienda, a.notaInterna, a.nombreApp]);
  const urlEscrita = url.trim() || null;
  const nombreValido = validarNombreApp(nombre);
  const ejecutar = async (c: Parameters<typeof onCambio>[0], mensaje: string) => { setOcupado(true); try { await onCambio(c, mensaje); } finally { setOcupado(false); } };

  return (
    <li data-testid={`app-${a.studioId}`} className="rounded-2xl border border-border bg-card px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 text-[14px] font-bold text-foreground">
            <span className="truncate">{a.estudio}</span>
            {a.esDemo && <Etiqueta>demo</Etiqueta>}
            {a.motivoSinPlan === 'plan' && <Etiqueta aviso>su plan no la incluye</Etiqueta>}
            {a.motivoSinPlan === 'prueba' && <Etiqueta aviso>en prueba</Etiqueta>}
            {a.motivoSinPlan === 'cobro' && <Etiqueta aviso>cobro pendiente</Etiqueta>}
            {a.motivoSinPlan === 'sin-plan' && <Etiqueta aviso>sin plan activo ({a.estadoPago ?? 'sin estado'})</Etiqueta>}
            {a.sinPlanDesde && <Etiqueta aviso>sin pagar desde el {fecha(a.sinPlanDesde)}{a.estado === 'PAUSADA' ? '' : ' · se pausa a los 30 días'}</Etiqueta>}
          </p>
          <p className="text-[12px] text-muted-foreground">
            /{a.slug ?? '—'} · {a.plan ?? '—'} · pedida el {fecha(a.pedidaEn)} · «{a.nombreApp}» · <span className="font-mono">{a.bundleId}</span>
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {a.ascAppId ? (
              <>
                Hueco del lote: la app ya existe.{' '}
                <a href={`https://appstoreconnect.apple.com/apps/${a.ascAppId}/distribution`} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
                  Abrir en App Store Connect
                </a>
                {' '}· el nombre en App Store Connect tiene que ser «{a.nombreApp}» (orden «nombre» de Actions).
              </>
            ) : 'Sin hueco del lote: hay que crear la app a mano en App Store Connect con este identificador.'}
          </p>
        </div>
        <label className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          Estado
          <select
            value={a.estado} disabled={!puedeEditar || ocupado} aria-label={`Estado de la app de ${a.estudio}`}
            onChange={(e) => {
              const estado = e.target.value as EstadoApp;
              // El enlace escrito y sin guardar va con el cambio: publicar lo necesita.
              const conUrl = urlEscrita !== (a.urlTienda ?? null) ? { urlTienda: urlEscrita } : {};
              if (estado === 'PAUSADA' && !window.confirm(`¿Poner en pausa la app de ${a.estudio}? El estudio verá «En pausa».`)) { e.target.value = a.estado; return; }
              void ejecutar({ estado, ...conUrl }, `Estado de ${a.estudio}: ${textoDeEstado(estado).titulo}.`);
            }}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-[13px]"
          >
            {ESTADOS_APP.map((e) => <option key={e} value={e}>{textoDeEstado(e).titulo}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[12.5px] font-medium text-foreground">
          Nombre de la app
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={!puedeEditar || ocupado} maxLength={30}
            aria-label={`Nombre de la app de ${a.estudio}`} className="rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-normal" />
          {!nombreValido.ok && <span className="text-[11.5px] font-normal text-destructive">{nombreValido.error}</span>}
        </label>
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
            onClick={() => {
              if (!nombreValido.ok) return;
              const cambios = {
                ...(urlEscrita !== (a.urlTienda ?? null) ? { urlTienda: urlEscrita } : {}),
                ...((nota.trim() || null) !== (a.notaInterna ?? null) ? { notaInterna: nota.trim() || null } : {}),
                ...(nombreValido.nombre !== a.nombreApp ? { nombreApp: nombreValido.nombre } : {}),
              };
              if (Object.keys(cambios).length === 0) return;
              void ejecutar(cambios, `Guardado: ${a.estudio}.`);
            }}
            className="min-h-9 rounded-lg border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground hover:bg-muted disabled:opacity-50">
            Guardar nombre, enlace y nota
          </button>
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <span>{a.activa ? 'Activa: la app abre directa en este estudio' : 'Sin activar: la app instalada dice «no disponible»'}</span>
            <button type="button" disabled={ocupado} data-testid={`activa-${a.studioId}`}
              onClick={() => {
                if (a.activa && !window.confirm(`¿Desactivar la app de ${a.estudio}? Quien la tenga instalada verá «no disponible» y dejará de recibir avisos.`)) return;
                void ejecutar({ activa: !a.activa }, a.activa ? `App de ${a.estudio} desactivada.` : `App de ${a.estudio} activada.`);
              }}
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
