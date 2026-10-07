'use client';

import { useEffect, useState, type ComponentType, type FormEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { NOMBRE_PLATAFORMA, PLATAFORMAS, type Plataforma } from '@/lib/plataformas/catalogo';
import { uscPublicaPorApi } from '@/lib/plataformas/usc/horario';
import { resumenPlataformaVenta } from '@/lib/configuracion/resumenes';
import { ClassPassIcon, UrbanSportsClubIcon, WellhubIcon } from '@/components/icons/brand-icons';
import { LogoConexion } from '@/components/configuracion/canales-comunicacion';
import { TituloFila, ValorFila } from '@/components/configuracion/shell/fila-ajuste';
import { FILA } from '@/components/configuracion/shell/fila-herramienta';

// Qué plataformas venden plazas de este estudio (ClassPass, Urban Sports Club,
// Wellhub). En modo manual, encenderla deja apuntar sus ventas desde la hoja de
// la clase, para que ocupen plaza y no se venda dos veces el mismo hueco.
// Urban Sports Club tiene además conexión por API: con su ID de proveedor y de
// ubicación guardados en esta misma fila, el cron publica el horario y sus
// reservas entran solas (lib/plataformas/usc/). El formulario solo aparece
// cuando Tentare tiene las credenciales de integrador de USC; mientras no haya
// conexión automática, cada plataforma lo dice con «próximamente» (decisión del
// fundador, 1-oct-2026): el modo manual sigue funcionando igual.
//
// ⚠️ Encender/apagar reescribe la config entera: se reenvía la que ya había,
// o un simple interruptor borraría los IDs de USC.

// Para todo el equipo: recepción y gerencia, que apuntan estas ventas, no leen
// `integraciones` (solo la propietaria) — ver lib/integraciones/activas.ts.
export function usePlataformasActivas(): Plataforma[] {
  const { integracionActiva } = useStudio();
  return PLATAFORMAS.filter(p => integracionActiva(p));
}

const USC: Plataforma = 'URBAN_SPORTS_CLUB';

/** El logo de cada plataforma, en la misma placa que el resto de conexiones. */
const LOGO_PLATAFORMA: Record<Plataforma, ComponentType<{ size?: number }>> = {
  CLASSPASS: ClassPassIcon,
  URBAN_SPORTS_CLUB: UrbanSportsClubIcon,
  WELLHUB: WellhubIcon,
};

function LogoPlataforma({ p }: { p: Plataforma }) {
  const Icono = LOGO_PLATAFORMA[p];
  return <LogoConexion><Icono size={20} /></LogoConexion>;
}

interface EstadoUsc { config: Record<string, string>; apiDisponible: boolean }

/**
 * La config de USC y si Tentare tiene sus credenciales de integrador. `usc`
 * null = cargando; si falla la lectura, `error` y se trabaja en manual sin
 * perder nada (el interruptor de USC espera a saber qué config hay para no pisarla).
 */
function useEstadoUsc() {
  const [usc, setUsc] = useState<EstadoUsc | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch('/api/integrations/config?tipo=URBAN_SPORTS_CLUB')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { config?: Record<string, string>; apiDisponible?: boolean }) => {
        if (vivo) setUsc({ config: j.config ?? {}, apiDisponible: j.apiDisponible === true });
      })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, []);
  return { usc, setUsc, errorUsc: error };
}

/** Hoy solo USC se puede conectar, y solo con las credenciales de Tentare. */
function conexionDe(p: Plataforma, usc: EstadoUsc | null): { disponible: boolean; conectada: boolean } {
  const disponible = p === USC && usc?.apiDisponible === true;
  return { disponible, conectada: disponible && !!usc && uscPublicaPorApi(usc.config) };
}

/**
 * Una fila por plataforma en Conexiones, como el resto de conexiones: su logo,
 * su estado y lo que hace el estudio con ella. Las tres abren el mismo cajón.
 * La primera lleva el ancla de siempre (`#plataformas-externas`).
 */
export function FilasPlataformas({ onAbrir }: { onAbrir: () => void }) {
  const activas = usePlataformasActivas();
  const { usc } = useEstadoUsc();
  return (
    <>
      {PLATAFORMAS.map((p, i) => {
        const c = conexionDe(p, usc);
        const resumen = resumenPlataformaVenta({ activa: activas.includes(p), conexionDisponible: c.disponible, conectada: c.conectada });
        return (
          <li key={p}>
            <button
              id={i === 0 ? 'plataformas-externas' : `plataformas-externas-${p.toLowerCase()}`}
              type="button"
              aria-haspopup="dialog"
              onClick={onAbrir}
              className={cn(FILA, 'w-full scroll-mt-32 scroll-mb-32 text-left')}
            >
              <LogoPlataforma p={p} />
              <span className="min-w-0 flex-1">
                <TituloFila titulo={NOMBRE_PLATAFORMA[p]} estado={resumen.estado} />
                <ValorFila valor={resumen.valor} descripcion="" entero />
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        );
      })}
    </>
  );
}

export function DetallePlataformasExternas({ showToast }: { showToast: (m: string) => void }) {
  const { upsertIntegracion } = useStudio();
  const activas = usePlataformasActivas();
  const [guardando, setGuardando] = useState<Plataforma | null>(null);
  const { usc, setUsc, errorUsc } = useEstadoUsc();

  async function cambiar(p: Plataforma, activo: boolean) {
    const anterior = p === USC ? usc?.config ?? null : { modo: 'manual' };
    if (!anterior) return;
    const config = Object.keys(anterior).length > 0 ? anterior : { modo: 'manual' };
    setGuardando(p);
    const res = await upsertIntegracion(p, activo, config, anterior);
    setGuardando(null);
    if (!res.ok) { showToast(res.error); return; }
    showToast(activo
      ? `${NOMBRE_PLATAFORMA[p]} activada: ya puedes apuntar sus reservas desde la clase`
      : `${NOMBRE_PLATAFORMA[p]} desactivada`);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Marca las plataformas en las que vendes plazas. Cuando alguien reserve allí, apúntalo en la clase
        (<span className="font-semibold text-foreground">Añadir → ClassPass</span>, por ejemplo): ocupa su plaza,
        no gasta bonos ni pasa por tus cobros, y sale en la lista con la etiqueta de la plataforma.
      </p>
      <ul className="divide-y divide-border rounded-2xl border border-border">
        {PLATAFORMAS.map(p => {
          const activa = activas.includes(p);
          const { disponible: conexionDisponible, conectada: porApi } = conexionDe(p, usc);
          const esperandoUsc = p === USC && !usc && !errorUsc;
          return (
            <li key={p} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <LogoPlataforma p={p} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-foreground">
                  {NOMBRE_PLATAFORMA[p]}
                  {!conexionDisponible && (
                    <span className="rounded-full border border-border px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                      Conexión automática: próximamente
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {!activa ? 'No vendo aquí' : porApi ? 'Vendo aquí · conectada: el horario y las reservas van solos' : 'Vendo aquí · apunto yo las reservas'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={activa}
                aria-label={`Vendo en ${NOMBRE_PLATAFORMA[p]}`}
                disabled={guardando !== null || esperandoUsc || (p === USC && errorUsc)}
                onClick={() => cambiar(p, !activa)}
                className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50"
                style={{ background: activa ? 'var(--brand)' : 'var(--muted)' }}
              >
                <span
                  className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                  style={{ left: 2, transform: activa ? 'translateX(20px)' : 'none' }}
                />
              </button>
            </div>
            {p === USC && activa && usc?.apiDisponible && (
              <ConexionUsc
                config={usc.config}
                onGuardada={config => setUsc({ ...usc, config })}
                showToast={showToast}
              />
            )}
            </li>
          );
        })}
      </ul>
      {!usc?.apiDisponible && (
        <p className="text-xs text-muted-foreground">
          Cuando llegue la conexión automática, las reservas de cada plataforma entrarán solas en la clase. Hasta entonces, apúntalas tú.
        </p>
      )}
    </div>
  );
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ConexionUsc({ config, onGuardada, showToast }: {
  config: Record<string, string>;
  onGuardada: (config: Record<string, string>) => void;
  showToast: (m: string) => void;
}) {
  const { upsertIntegracion } = useStudio();
  const conectada = uscPublicaPorApi(config);
  const [providerId, setProviderId] = useState(conectada ? config.providerId ?? '' : '');
  const [locationId, setLocationId] = useState(conectada ? config.locationId ?? '' : '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const prov = providerId.trim();
    const loc = locationId.trim();
    if ((prov || loc) && !(RE_UUID.test(prov) && RE_UUID.test(loc))) {
      setError('Los dos IDs tienen este formato: 8-4-4-4-12 letras y números, separados por guiones.');
      return;
    }
    setError(null);
    // Vaciar los dos campos vuelve a manual SIN borrar los IDs: el cron los
    // necesita para cancelar en USC lo que ya estaba publicado.
    const nueva: Record<string, string> = prov
      ? { ...config, modo: 'api', providerId: prov.toLowerCase(), locationId: loc.toLowerCase() }
      : { ...config, modo: 'manual' };
    setGuardando(true);
    const res = await upsertIntegracion('URBAN_SPORTS_CLUB', true, nueva, config);
    setGuardando(false);
    if (!res.ok) { setError(res.error); return; }
    onGuardada(nueva);
    showToast(prov ? 'Conexión con Urban Sports Club guardada' : 'Urban Sports Club vuelve a modo manual');
  }

  return (
    <form onSubmit={guardar} className="mt-3 space-y-2 rounded-xl bg-muted/50 p-3" data-testid="conexion-usc">
      <p className="text-xs text-muted-foreground">
        {conectada
          ? 'Conectada. Las clases cuyo tipo tiene plazas cedidas a Urban Sports Club se publican solas en su app (dos semanas vista), y sus reservas entran solas en la clase.'
          : 'Pega los dos IDs que te da Urban Sports Club al activar la conexión con Tentare. Se publicarán solas las clases cuyo tipo tenga plazas cedidas a Urban Sports Club.'}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-medium text-foreground">
          ID de proveedor
          <input
            value={providerId}
            onChange={e => setProviderId(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
          />
        </label>
        <label className="block text-xs font-medium text-foreground">
          ID de ubicación
          <input
            value={locationId}
            onChange={e => setLocationId(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
          />
        </label>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={guardando}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-50"
        style={{ background: 'var(--brand)' }}
      >
        {guardando ? 'Guardando…' : 'Guardar conexión'}
      </button>
    </form>
  );
}
