'use client';

import { useEffect, useState, type ComponentType, type FormEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { NOMBRE_PLATAFORMA, PLATAFORMAS, type Plataforma } from '@/lib/plataformas/catalogo';
import { uscPublicaPorApi } from '@/lib/plataformas/usc/horario';
import { porQueSinVentaExterna, type MotivoSinVentaExterna } from '@/lib/plataformas/venta-externa';
import { PLATAFORMAS_QUE_APARTAN } from '@/lib/plataformas/apartadas';
import { dbGuardarLiberarHorasPlataforma, dbLeerLiberarHorasPlataforma } from '@/lib/supabase-data';
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

interface EstadoUsc {
  config: Record<string, string>;
  apiDisponible: boolean;
  /** Sin contrato o suspendido: aunque esté conectada, ni publica ni entran reservas. */
  ventaCortada: MotivoSinVentaExterna | null;
}

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
      .then((j: { config?: Record<string, string>; apiDisponible?: boolean; ventaCortada?: MotivoSinVentaExterna | null }) => {
        if (vivo) setUsc({ config: j.config ?? {}, apiDisponible: j.apiDisponible === true, ventaCortada: j.ventaCortada ?? null });
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
 * Los pasos para pedir la conexión a Wellhub. Es SU trámite, no el nuestro:
 * Wellhub activa la integración de un software cuando sus estudios se la piden
 * desde su portal (su ayuda: «How to set up your CMS integration?»), y mientras
 * no lo hagan Tentare no tiene a quién pedir credenciales para esa sede. Por eso
 * el estudio lo ve aquí, sin buscarlo. No promete plazo: lo que ocurre después
 * lo decide Wellhub.
 */
function PedirConexionWellhub() {
  return (
    <details className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-semibold text-foreground">
        Cómo pedir la conexión automática a Wellhub
      </summary>
      <ol className="mt-2 list-decimal space-y-1 pl-4">
        <li>Entra en tu <span className="font-semibold text-foreground">Partner Portal</span> de Wellhub.</li>
        <li>En el menú, abre <span className="font-semibold text-foreground">Integraciones</span> y elige tu sede.</li>
        <li>En el sistema de gestión elige <span className="font-semibold text-foreground">«Others»</span> y escribe <span className="font-semibold text-foreground">Tentare</span>.</li>
        <li>Pulsa <span className="font-semibold text-foreground">«Request integration»</span>.</li>
      </ol>
      <p className="mt-2">
        Wellhub se pone en contacto con Tentare para activarla. Hasta entonces, apunta tú sus reservas desde la clase.
        Cuantos más estudios la pidan, antes la abren.
      </p>
    </details>
  );
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
        const resumen = resumenPlataformaVenta({
          activa: activas.includes(p), conexionDisponible: c.disponible, conectada: c.conectada,
          ventaCortada: p === USC ? usc?.ventaCortada : null,
        });
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
  // La que se acaba de encender: si aparta plazas, su pregunta sale con el foco.
  const [recienActivada, setRecienActivada] = useState<Plataforma | null>(null);
  const { usc, setUsc, errorUsc } = useEstadoUsc();

  async function cambiar(p: Plataforma, activo: boolean) {
    const anterior = p === USC ? usc?.config ?? null : { modo: 'manual' };
    if (!anterior) return;
    const config = Object.keys(anterior).length > 0 ? anterior : { modo: 'manual' };
    setGuardando(p);
    const res = await upsertIntegracion(p, activo, config, anterior);
    setGuardando(null);
    if (!res.ok) { showToast(res.error); return; }
    setRecienActivada(activo ? p : null);
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
          const cortada = p === USC ? usc?.ventaCortada ?? null : null;
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
                  {!activa ? 'No vendo aquí'
                    : porApi && cortada ? `Vendo aquí · en pausa: ${porQueSinVentaExterna(cortada)}`
                    : porApi ? 'Vendo aquí · conectada: el horario y las reservas van solos'
                    : 'Vendo aquí · apunto yo las reservas'}
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
            {activa && !porApi && (PLATAFORMAS_QUE_APARTAN as readonly Plataforma[]).includes(p) && (
              <LiberarApartadas plataforma={p} preguntar={recienActivada === p} showToast={showToast} />
            )}
            {p === USC && activa && usc?.apiDisponible && (
              <ConexionUsc
                config={usc.config}
                ventaCortada={usc.ventaCortada}
                onGuardada={config => setUsc({ ...usc, config })}
                showToast={showToast}
              />
            )}
            {p === 'WELLHUB' && !porApi && <PedirConexionWellhub />}
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

/**
 * ClassPass vende a mano: las plazas que se le ceden quedan APARTADAS (tus
 * alumnas no pueden cogerlas mientras ClassPass no las venda) y las que no venda
 * se liberan X horas antes de la clase. Se pregunta al encenderla (decisión del
 * fundador, 7-oct-2026); sin respuesta, quedan apartadas hasta que empieza la
 * clase: nunca sobreventa. La regla la aplica la base de datos (`plazas_apartadas`).
 */
function LiberarApartadas({ plataforma, preguntar, showToast }: {
  plataforma: Plataforma; preguntar: boolean; showToast: (m: string) => void;
}) {
  const nombre = NOMBRE_PLATAFORMA[plataforma];
  // `undefined`: cargando o sin poder leer; `null`: sin configurar.
  const [horas, setHoras] = useState<number | null | undefined>(undefined);
  const [cargado, setCargado] = useState(false);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void dbLeerLiberarHorasPlataforma(plataforma).then(h => {
      if (!vivo) return;
      setHoras(h);
      setTexto(h == null ? '' : String(h));
      setCargado(true);
    });
    return () => { vivo = false; };
  }, [plataforma]);

  const valor = Number(texto);
  const valido = texto.trim() !== '' && Number.isInteger(valor) && valor >= 0 && valor <= 72;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!valido || guardando) return;
    setGuardando(true);
    const res = await dbGuardarLiberarHorasPlataforma(plataforma, valor);
    setGuardando(false);
    if (!res.ok) { showToast(res.error); return; }
    setHoras(valor);
    setEditando(false);
    showToast(valor === 0
      ? `Las plazas de ${nombre} se quedan apartadas hasta que empieza la clase`
      : `Las plazas que ${nombre} no venda se liberarán ${valor} ${valor === 1 ? 'hora' : 'horas'} antes de la clase`);
  }

  if (!cargado) return null;
  const sinConfigurar = horas === null;

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-muted/60 px-3 py-3" data-testid={`liberar-apartadas-${plataforma.toLowerCase()}`}>
      <p className="text-xs text-muted-foreground">
        Las plazas que cedes a {nombre} quedan apartadas: tus alumnas no pueden reservarlas mientras {nombre} no las venda.
      </p>
      {horas === undefined ? (
        <p className="text-xs text-warning">No hemos podido leer cuándo se liberan. Vuelve a abrir esta pantalla en un momento.</p>
      ) : !sinConfigurar && !editando ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-foreground">
            {horas === 0
              ? 'Se quedan apartadas hasta que empieza la clase.'
              : `Las que no venda se liberan ${horas} ${horas === 1 ? 'hora' : 'horas'} antes de la clase.`}
          </p>
          <button type="button" onClick={() => setEditando(true)} className="text-xs font-semibold text-brand-medio underline-offset-2 hover:underline">
            Cambiar
          </button>
        </div>
      ) : (
        <form onSubmit={guardar} className="space-y-2">
          <label className="block text-sm font-semibold text-foreground" htmlFor={`liberar-horas-${plataforma}`}>
            ¿Hasta cuántas horas antes de la clase se puede reservar en {nombre}?
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`liberar-horas-${plataforma}`}
              inputMode="numeric"
              autoFocus={preguntar || editando}
              value={texto}
              onChange={e => setTexto(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
              className="h-10 w-20 rounded-lg border border-foreground/30 bg-background px-3 text-base text-foreground focus:outline-none pointer-fine:text-sm"
              aria-describedby={`liberar-horas-ayuda-${plataforma}`}
            />
            <span className="text-sm text-muted-foreground">horas</span>
            <button
              type="submit"
              disabled={!valido || guardando}
              aria-busy={guardando}
              className="ml-auto min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
          <p id={`liberar-horas-ayuda-${plataforma}`} className="text-xs text-muted-foreground">
            Pon las mismas que tengas en {nombre}: a esa hora, las plazas que no haya vendido pasan a tus alumnas (entre 0 y 72).
            {sinConfigurar && ' Mientras no lo pongas, se quedan apartadas hasta que empieza la clase.'}
          </p>
        </form>
      )}
    </div>
  );
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ConexionUsc({ config, ventaCortada, onGuardada, showToast }: {
  config: Record<string, string>;
  ventaCortada: MotivoSinVentaExterna | null;
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
        {conectada && ventaCortada
          ? `En pausa: ${porQueSinVentaExterna(ventaCortada)}. Mientras tanto no se publica nada en Urban Sports Club ni entran sus reservas, y lo que estaba publicado se retira.`
          : conectada
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
