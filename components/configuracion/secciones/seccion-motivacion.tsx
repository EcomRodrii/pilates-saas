'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Coins, Sparkles } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { supabase } from '@/lib/db/supabase';
import { REWARD_TRIGGERS } from '@/lib/engines/reward-engine';
import { PLAN_INFO, accesoProducto, entitlementsDe, planMinimoPara, tieneFeature } from '@/lib/billing/entitlements';
import { nombreCreditos } from '@/lib/creditos-nombre';
import { useInterruptor } from '@/lib/estudio/interruptores-cliente';
import { useRol } from '@/lib/permisos';
import { contarCifrasMotivacion, type CifrasMotivacion, type ClienteCifras } from '@/lib/configuracion/motivacion-cifras';
import {
  estadoDelPlan, resumenCreditosPorAccion, resumenHerramienta, resumenReglasCreditos,
} from '@/lib/configuracion/resumenes';
import type { TarjetaId } from '@/lib/configuracion/secciones';
import { cn } from '@/lib/utils';
import { PlanGate } from '@/components/ui/plan-gate';
import { cardCls } from '@/components/configuracion/estilos';
import { FormCreditosPorAccion, FormReglasCreditos } from '@/components/configuracion/creditos';
import { TabRecompensas } from '@/components/configuracion/tab-recompensas';
import { TabLogros } from '@/components/configuracion/tab-logros';
import { TabNiveles } from '@/components/configuracion/tab-niveles';
import { EditorNiveles } from '@/components/configuracion/niveles/editor-niveles';
import { TabRetos } from '@/components/configuracion/tab-retos';
import { VistaPreviaAlumna } from '@/components/configuracion/motivacion/vista-previa-alumna';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { EstadoAjuste } from '@/components/configuracion/shell/estado-ajuste';
import { FilaAjuste, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import { FilaHerramienta } from '@/components/configuracion/shell/fila-herramienta';

// Motivación, en UNA pantalla (20-oct-2026; el fundador: «muy muy muy mal
// organizado»). Antes eran dos cajones aquí, una herramienta aparte con cinco
// catálogos seguidos y los códigos de descuento colgando al final. Ahora:
//
//   cabecera   el plan y tres cifras contadas en la base (motivacion-cifras.ts)
//   aviso      los canjes por entregar, con su pantalla (son trabajo, no ajuste)
//   1–5        cómo se ganan → en qué se gastan → qué desbloquean → niveles → retos
//   al lado    lo que ve la alumna con lo guardado (vista-previa-alumna.tsx)
//
// Los códigos de descuento pasaron a Cobros: son dinero y no dependen del plan.
// El plan no tapa la sección: lo que tu plan no incluye se ve, pero no se toca.

const CAJONES = ['reglas', 'creditos-por-accion'] as const satisfies readonly TarjetaId[];
const DISPARADORES = REWARD_TRIGGERS.map(d => d.trigger);

export function SeccionMotivacion({ showToast }: { showToast: (m: string) => void }) {
  const {
    studio, dataLoaded, cargarGamificacion, gamificacionCargada, rewardRules, rewardRedemptions,
  } = useStudio();
  const { cajon, abrir, cerrar } = useCajonAbierto(CAJONES);
  // Niveles con ritmo (P3.8), tras `GAMIFICACION_NIVELES_RITMO`. Solo la
  // propietaria: la ruta que guarda (y que impide que nadie baje) es suya.
  const rol = useRol();
  const nivelesConRitmo = useInterruptor('nivelesConRitmo', studio?.id) && rol === 'PROPIETARIO';
  const rachaUnica = useInterruptor('rachaUnica', studio?.id);

  // Las diez tablas de gamificación NO vienen en el arranque del panel (#1375):
  // se piden aquí y en la pantalla de canjes. `cargarGamificacion` es
  // idempotente por estudio.
  useEffect(() => { cargarGamificacion(); }, [cargarGamificacion]);

  const cifras = useCifras(studio?.id ?? null, gamificacionCargada ? rewardRedemptions : null);

  function guardado(texto: string) {
    cerrar();
    showToast(texto);
  }

  const cargado = dataLoaded ? studio : null;
  const moneda = nombreCreditos(cargado?.creditosNombre);
  const minimo = planMinimoPara('gamificacion');
  const plan = cargado
    ? estadoDelPlan({
      enTuPlan: entitlementsDe(cargado).features.gamificacion,
      activo: accesoProducto(cargado),
      planMinimo: minimo ? PLAN_INFO[minimo].nombre : null,
    })
    : null;
  // Sin cargar no se tapa nada: un bloqueo que parpadea y se va miente.
  const sinPlan = !!cargado && !tieneFeature(cargado, 'gamificacion');
  const conPlan = (hijos: ReactNode) => (sinPlan ? <PlanGate studio={cargado ?? {}} feature="gamificacion">{hijos}</PlanGate> : hijos);

  // Si no se pudieron contar, los canjes salen de lo cargado: el aviso no puede
  // desaparecer por un fallo de red.
  const pendientes = cifras.estado === 'ok'
    ? cifras.valor.canjesPorEntregar
    : cifras.estado === 'error' && gamificacionCargada
      ? rewardRedemptions.filter(r => r.estado === 'PENDIENTE').length
      : null;

  return (
    <div className="@4xl/config:grid @4xl/config:grid-cols-[minmax(0,1fr)_300px] @4xl/config:items-start @4xl/config:gap-8">
      <div className="min-w-0 space-y-8">
        <Cabecera plan={plan} cifras={cifras} moneda={moneda} />

        {/* Un aviso, no un ajuste: solo se pinta con algo por entregar. */}
        {pendientes != null && pendientes > 0 && (
          <GrupoFilas titulo="Te esperan">
            <FilaHerramienta
              id="canjes"
              valor={resumenHerramienta('canjes', { canjesPendientes: pendientes })}
              estado={{ tono: 'pendiente', etiqueta: pendientes === 1 ? '1 canje' : `${pendientes} canjes` }}
            />
          </GrupoFilas>
        )}

        <Paso n={1} titulo="Cómo se ganan">
          <GrupoFilas titulo="Tus créditos">
            <FilaAjuste id="reglas" icono={Coins} valor={cargado ? resumenReglasCreditos(cargado, { sinRacha: rachaUnica }) : null} estado={plan} onAbrir={abrir} />
            <FilaAjuste
              id="creditos-por-accion"
              icono={Sparkles}
              valor={resumenCreditosPorAccion(gamificacionCargada ? rewardRules : null, DISPARADORES, moneda)}
              estado={plan}
              onAbrir={abrir}
            />
          </GrupoFilas>
        </Paso>

        <Paso n={2} titulo="En qué se gastan">{conPlan(<TabRecompensas showToast={showToast} />)}</Paso>
        <Paso n={3} titulo="Qué desbloquean">{conPlan(<TabLogros showToast={showToast} />)}</Paso>
        <Paso n={4} titulo="Hasta dónde suben">
          {conPlan(nivelesConRitmo ? <EditorNiveles showToast={showToast} /> : <TabNiveles showToast={showToast} />)}
        </Paso>
        <Paso n={5} titulo="Retos con fecha">{conPlan(<TabRetos showToast={showToast} />)}</Paso>

        {/* Sin canjes pendientes, la pantalla de canjes (el historial y
            «Cancelar») sigue a mano, al final. */}
        {pendientes === 0 && (
          <GrupoFilas titulo="Historial">
            <FilaHerramienta id="canjes" valor={resumenHerramienta('canjes', { canjesPendientes: 0 })} />
          </GrupoFilas>
        )}
      </div>

      <aside className="mt-10 @4xl/config:sticky @4xl/config:top-24 @4xl/config:mt-0">
        <VistaPreviaAlumna />
      </aside>

      <CajonAjuste id="reglas" abierto={cajon === 'reglas'} onCerrar={cerrar}>
        {conPlan(<FormReglasCreditos onGuardado={guardado} />)}
      </CajonAjuste>
      <CajonAjuste id="creditos-por-accion" abierto={cajon === 'creditos-por-accion'} onCerrar={cerrar}>
        {conPlan(<FormCreditosPorAccion onGuardado={guardado} />)}
      </CajonAjuste>
    </div>
  );
}

/**
 * Las cifras de la cabecera. Se vuelven a contar cuando cambia la lista de
 * canjes cargada (entregar o cancelar uno desde el panel), no en cada render.
 */
type EstadoCifras = { estado: 'cargando' } | { estado: 'error' } | { estado: 'ok'; valor: CifrasMotivacion };

function useCifras(studioId: string | null, canjes: readonly unknown[] | null): EstadoCifras {
  const [cifras, setCifras] = useState<{ de: string; valor: CifrasMotivacion | null } | null>(null);
  useEffect(() => {
    if (!studioId) return;
    let vivo = true;
    contarCifrasMotivacion(supabase as unknown as ClienteCifras, studioId)
      .then(valor => { if (vivo) setCifras({ de: studioId, valor }); })
      .catch(() => { if (vivo) setCifras({ de: studioId, valor: null }); });
    return () => { vivo = false; };
  }, [studioId, canjes]);
  if (!cifras || cifras.de !== studioId) return { estado: 'cargando' };
  return cifras.valor ? { estado: 'ok', valor: cifras.valor } : { estado: 'error' };
}

function Cabecera({ plan, cifras, moneda }: {
  plan: { tono: 'activo' | 'pendiente' | 'problema' | 'neutro'; etiqueta: string } | null;
  cifras: EstadoCifras;
  moneda: string;
}) {
  const v = cifras.estado === 'ok' ? cifras.valor : undefined;
  const datos: { etiqueta: string; valor: number | undefined }[] = [
    { etiqueta: `Alumnas con ${moneda}`, valor: v?.alumnasConCreditos },
    { etiqueta: 'Logros este mes', valor: v?.logrosEsteMes },
    { etiqueta: 'Canjes por entregar', valor: v?.canjesPorEntregar },
  ];
  return (
    <section aria-label="Cómo va la motivación" className="max-w-3xl space-y-3">
      {plan && <EstadoAjuste tono={plan.tono}>{plan.etiqueta}</EstadoAjuste>}
      {/* Sin poder contar, ninguna cifra: un 0 inventado sería peor que nada. */}
      {cifras.estado !== 'error' && <dl className="grid grid-cols-3 gap-2 @md/config:gap-3">
        {datos.map(d => (
          <div key={d.etiqueta} className={cn(cardCls, 'min-w-0 px-3 py-3 @md/config:px-4')}>
            <dt className="text-xs leading-tight text-muted-foreground text-balance @md/config:text-sm">{d.etiqueta}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {d.valor === undefined ? <span className="inline-block h-7 w-10 animate-pulse rounded bg-muted align-middle" aria-label="Cargando" /> : d.valor.toLocaleString('es-ES')}
            </dd>
          </div>
        ))}
      </dl>}
    </section>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="space-y-3">
      <p className="flex items-center gap-2 px-1 text-sm font-semibold text-foreground">
        <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background tabular-nums">{n}</span>
        {titulo}
      </p>
      {children}
    </section>
  );
}
