'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Visita guiada: a quién se le da, desde aquí.
//
// Tres decisiones, todas auditadas en el servidor:
//   · los estudios NUEVOS: si la llevan de serie (el trigger de la base de datos lee
//     este ajuste al nacer un estudio);
//   · todos a la vez: activar o desactivar (nunca una demo; «activar» solo a quien aún no
//     la ha completado);
//   · un estudio: activar (conserva lo que lleva), activar desde cero o desactivar.
//
// Los botones que cambian algo piden un segundo clic cuando afectan a muchos estudios: un
// «activar en todos» sin red es la clase de clic que se lamenta.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { accionVisitaGuiada, fetchVisitaGuiada, type EstudioVisita } from '@/lib/interno/client';
import { tienePermiso } from '@/lib/interno/permisos';
import { useSesionInterna } from '../layout';

type Respuesta = { nuevos: boolean; estudios: EstudioVisita[] };

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' });

const TONO: Record<EstudioVisita['resumen']['estado'], string> = {
  desactivada: 'bg-muted text-muted-foreground',
  'sin-empezar': 'bg-warning/15 text-warning',
  'en-curso': 'bg-brand/15 text-brand-medio',
  completada: 'bg-success/15 text-success',
};

export default function VisitaGuiadaInterno() {
  const sesion = useSesionInterna();
  const puedeEditar = tienePermiso(sesion.permisos, 'studios.update');
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [q, setQ] = useState('');
  // Qué acción masiva espera su segundo clic.
  const [confirmando, setConfirmando] = useState<'activar-todos' | 'desactivar-todos' | null>(null);

  const cargar = useCallback(async () => {
    try { setDatos(await fetchVisitaGuiada()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se ha podido cargar.'); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  async function ejecutar(clave: string, hacer: () => Promise<string>) {
    setOcupado(clave); setError(null); setAviso(null);
    try { setAviso(await hacer()); await cargar(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se ha podido completar.'); }
    finally { setOcupado(null); setConfirmando(null); }
  }

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (datos?.estudios ?? []).filter(e => !t || e.nombre.toLowerCase().includes(t) || e.slug.toLowerCase().includes(t));
  }, [datos, q]);

  if (!datos && !error) return <p className="text-[13.5px] text-muted-foreground">Cargando…</p>;

  const estudios = datos?.estudios ?? [];
  const activables = estudios.filter(e => !e.esDemo && !e.obligatorio && e.resumen.estado !== 'completada').length;
  const activas = estudios.filter(e => e.obligatorio).length;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-[20px] font-extrabold tracking-tight text-foreground">Visita guiada</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
          La visita por los 10 capítulos del panel. Aquí decides a quién se le impone: solo la propietaria del estudio la ve
          obligatoria; el resto de personas del equipo no la notan. Quien no la tiene activada puede verla igualmente desde
          «Primeros pasos», y puede cerrarla.
        </p>
      </header>

      {error && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-2.5 text-[13px] text-destructive">{error}</p>}
      {aviso && <p role="status" className="rounded-xl bg-success/10 px-4 py-2.5 text-[13px] text-success">{aviso}</p>}

      {datos && (
        <>
          <section className="rounded-2xl border border-border bg-card px-4 py-4" aria-labelledby="vg-nuevos">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id="vg-nuevos" className="text-[14px] font-bold text-foreground">Estudios nuevos</h2>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  {datos.nuevos
                    ? 'Todo estudio que se cree desde ahora recibe la visita al darse de alta (salvo sedes de cadena y demos).'
                    : 'Los estudios que se creen ahora NO reciben la visita. Se activa a mano, estudio a estudio.'}
                </p>
              </div>
              <button
                type="button" role="switch" aria-checked={datos.nuevos} aria-label="Visita guiada en estudios nuevos"
                disabled={!puedeEditar || ocupado !== null}
                onClick={() => void ejecutar('nuevos', async () => {
                  await accionVisitaGuiada({ accion: 'nuevos', activar: !datos.nuevos });
                  return !datos.nuevos ? 'Los estudios nuevos recibirán la visita.' : 'Los estudios nuevos ya no reciben la visita.';
                })}
                className="relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50"
                style={{ background: datos.nuevos ? 'var(--brand)' : 'var(--muted)' }}
              >
                <span className="absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform" style={{ left: 4, transform: datos.nuevos ? 'translateX(20px)' : 'none' }} />
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card px-4 py-4" aria-labelledby="vg-todos">
            <h2 id="vg-todos" className="text-[14px] font-bold text-foreground">Todos los estudios</h2>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
              Ahora la tienen activada {activas} de {estudios.length}. «Activar en todos» no toca las demos ni a quien ya la completó.
            </p>
            {puedeEditar && (
              <div className="mt-3 flex flex-wrap gap-2">
                <BotonMasivo
                  etiqueta={`Activar en todos (${activables})`} confirmar={`¿Activar en ${activables}? Pulsa otra vez`}
                  esperando={confirmando === 'activar-todos'} deshabilitado={ocupado !== null || activables === 0}
                  alPulsar={() => setConfirmando('activar-todos')}
                  alConfirmar={() => void ejecutar('todos', async () => {
                    const r = await accionVisitaGuiada({ accion: 'todos', activar: true });
                    return `Visita activada en ${r.cambiados ?? 0} estudio${r.cambiados === 1 ? '' : 's'}.`;
                  })}
                />
                <BotonMasivo
                  etiqueta={`Desactivar en todos (${activas})`} confirmar={`¿Desactivar en ${activas}? Pulsa otra vez`}
                  esperando={confirmando === 'desactivar-todos'} deshabilitado={ocupado !== null || activas === 0}
                  alPulsar={() => setConfirmando('desactivar-todos')}
                  alConfirmar={() => void ejecutar('todos', async () => {
                    const r = await accionVisitaGuiada({ accion: 'todos', activar: false });
                    return `Visita desactivada en ${r.cambiados ?? 0} estudio${r.cambiados === 1 ? '' : 's'}.`;
                  })}
                />
                {confirmando && (
                  <button type="button" onClick={() => setConfirmando(null)} className="min-h-10 rounded-xl px-3 text-[12.5px] text-muted-foreground underline underline-offset-2">Cancelar</button>
                )}
              </div>
            )}
          </section>

          <section aria-labelledby="vg-lista">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 id="vg-lista" className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Estudios ({filtrados.length})</h2>
            </div>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar estudio"
                placeholder="Buscar por nombre o slug…"
                className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-[13.5px] outline-none focus:border-brand"
              />
            </div>
            <ul className="overflow-hidden rounded-2xl border border-border bg-card">
              {filtrados.length === 0 && <li className="px-4 py-3 text-[13px] text-muted-foreground">Ningún estudio coincide.</li>}
              {filtrados.map(e => (
                <li key={e.id} data-testid={`estudio-${e.id}`} className="flex flex-col gap-2 border-b border-border/60 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 text-[13.5px] font-semibold text-foreground">
                      <span className="truncate">{e.nombre}</span>
                      {e.esDemo && <Etiqueta>demo</Etiqueta>}
                      {e.deCadena && <Etiqueta>sede de cadena</Etiqueta>}
                      {e.suspendido && <Etiqueta>suspendido</Etiqueta>}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">/{e.slug} · {e.plan} · alta el {fecha(e.creadoEn)}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px]">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${TONO[e.resumen.estado]}`}>{e.resumen.texto}</span>
                      {e.resumen.estado === 'en-curso' && <span className="tabular-nums text-muted-foreground">{e.resumen.porcentaje} %</span>}
                    </p>
                  </div>
                  {puedeEditar && (
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {e.obligatorio ? (
                        <Boton onClick={() => void ejecutar(e.id, async () => { await accionVisitaGuiada({ accion: 'estudio', id: e.id, operacion: 'desactivar' }); return `Visita desactivada en ${e.nombre}.`; })}
                          deshabilitado={ocupado !== null}>Desactivar</Boton>
                      ) : (
                        <Boton principal deshabilitado={ocupado !== null || e.esDemo}
                          onClick={() => void ejecutar(e.id, async () => { await accionVisitaGuiada({ accion: 'estudio', id: e.id, operacion: 'activar' }); return `Visita activada en ${e.nombre}.`; })}>
                          Activar
                        </Boton>
                      )}
                      <Boton deshabilitado={ocupado !== null || e.esDemo}
                        onClick={() => void ejecutar(e.id, async () => { await accionVisitaGuiada({ accion: 'estudio', id: e.id, operacion: 'activar-desde-cero' }); return `Visita de ${e.nombre} activada desde cero.`; })}>
                        Activar desde cero
                      </Boton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-border px-1.5 py-px text-[10.5px] font-medium text-muted-foreground">{children}</span>;
}

function Boton({ children, onClick, deshabilitado, principal }: { children: React.ReactNode; onClick: () => void; deshabilitado?: boolean; principal?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={deshabilitado}
      className={`min-h-9 rounded-lg px-3 text-[12.5px] font-semibold transition-colors disabled:opacity-50 ${principal ? 'bg-brand text-brand-foreground hover:brightness-95' : 'border border-border bg-card text-foreground hover:bg-muted'}`}>
      {children}
    </button>
  );
}

function BotonMasivo({ etiqueta, confirmar, esperando, deshabilitado, alPulsar, alConfirmar }: {
  etiqueta: string; confirmar: string; esperando: boolean; deshabilitado: boolean; alPulsar: () => void; alConfirmar: () => void;
}) {
  return (
    <button type="button" disabled={deshabilitado} onClick={esperando ? alConfirmar : alPulsar}
      className={`min-h-10 rounded-xl px-4 text-[13px] font-semibold transition-colors disabled:opacity-50 ${esperando ? 'bg-destructive text-white' : 'border border-border bg-card text-foreground hover:bg-muted'}`}>
      {esperando ? confirmar : etiqueta}
    </button>
  );
}
