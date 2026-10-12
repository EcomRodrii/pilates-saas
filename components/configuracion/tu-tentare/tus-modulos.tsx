'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { usePermisos } from '@/lib/permisos';
import { useStudio } from '@/lib/studio-context';
import { useTutorial } from '@/lib/tutorial-context';
import { estadoBilling, fetchLayout, guardarLayoutApi, olvidarLayout } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import { EVENTO_MODO_MENU, guardarModoMenu, leerModoMenu, modoDelEvento, type ModoMenu } from '@/lib/nav-modo';
import { estadoDelPlan } from '@/lib/configuracion/resumenes';
import {
  contar, estadoEnMenu, gruposTuTentare, incluidoEnPlan, ocultosTrasCambiar, planQueLoIncluye,
  type GrupoTuTentare, type ModuloTuTentare,
} from '@/lib/tu-tentare/catalogo';
import { Button } from '@/components/ui/button';
import { Interruptor } from '@/components/ui/interruptor';
import { GrupoFilas, TituloFila } from '@/components/configuracion/shell/fila-ajuste';
import { IconoFila } from '@/components/configuracion/shell/fila-herramienta';
import { EstadoAjuste } from '@/components/configuracion/shell/estado-ajuste';

const ENLACE = 'inline-flex min-h-11 items-center rounded-sm sm:min-h-10 underline-offset-2 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

// ─────────────────────────────────────────────────────────────────────────────
// «Tu Tentare» (P2.5): todos los módulos del menú, con lo que hacen, el plan que
// necesitan y si están en el menú. Se monta en Configuración › Tu panel SOLO si
// el servidor lo enciende para el estudio (interruptor `TU_TENTARE`); si no, la
// sección se ve exactamente como siempre.
//
// El interruptor escribe `ocultos`, el MISMO dato que el cajón «Tu menú», con
// sus mismas reglas: nada se resetea y el PUT lleva solo `ocultos` (el servidor
// fusiona por clave: el orden y el Resumen no se tocan). Nada optimista: el
// interruptor está «ocupado» mientras guarda y la fila cambia con lo que
// contesta el servidor.
//
// ⚠️ Quitar un módulo solo lo quita del menú: no lo apaga ni cambia permisos.
// Por eso «en el menú» y no «activo» (lib/tu-tentare/catalogo.ts). Y el menú es
// el de todo el equipo (y, en una cadena, el de todas las sedes).
// ─────────────────────────────────────────────────────────────────────────────

/** Los grupos sin rótulo de arriba del menú (Resumen, Centro de Control…) van juntos. */
function conRotulos(grupos: GrupoTuTentare[]): { label: string; modulos: ModuloTuTentare[] }[] {
  const out: { label: string; modulos: ModuloTuTentare[] }[] = [];
  for (const g of grupos) {
    const label = g.label ?? 'Principal';
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.label === label) ultimo.modulos.push(...g.modulos);
    else out.push({ label, modulos: [...g.modulos] });
  }
  return out;
}

export function TusModulos({ onCambio }: { onCambio: () => void }) {
  const { puedeVer } = usePermisos();
  const { studio } = useStudio();
  const tutorial = useTutorial();
  const idTitulo = useId();
  const [ocultos, setOcultos] = useState<string[] | null>(null);
  const [errorLectura, setErrorLectura] = useState(false);
  const [plan, setPlan] = useState<{ plan: string | null; activo: boolean } | null>(null);
  const [modo, setModo] = useState<ModoMenu>('esencial');
  const [guardando, setGuardando] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [recien, setRecien] = useState<string | null>(null);
  const enVuelo = useRef(false);

  useEffect(() => {
    let vivo = true;
    const leer = () => fetchLayout()
      .then(l => { if (vivo) { setOcultos(l.ocultos); setErrorLectura(false); } })
      .catch(() => { if (vivo) setErrorLectura(true); });
    void leer();
    void estadoBilling().then(b => { if (vivo) setPlan(b ? { plan: b.plan ?? null, activo: b.activo } : null); });
    setModo(leerModoMenu());
    // Si el cajón «Tu menú» guarda, esta lista se pone al día con lo guardado; y
    // si el selector Esencial/Todo del menú cambia, también.
    const alCambiar = () => { void leer(); };
    const alCambiarModo = (e: Event) => setModo(modoDelEvento(e));
    window.addEventListener('tentare-layout-changed', alCambiar);
    window.addEventListener(EVENTO_MODO_MENU, alCambiarModo);
    return () => {
      vivo = false;
      window.removeEventListener('tentare-layout-changed', alCambiar);
      window.removeEventListener(EVENTO_MODO_MENU, alCambiarModo);
    };
  }, []);

  const grupos = gruposTuTentare(puedeVer);
  const vistos = new Set(ocultos ?? []);
  const cuenta = contar(grupos, vistos);

  async function cambiar(m: ModuloTuTentare, enMenu: boolean) {
    if (enVuelo.current || ocultos === null) return;
    enVuelo.current = true;
    setGuardando(m.href);
    setErrores(prev => { const { [m.href]: _, ...resto } = prev; return resto; });
    try {
      // Sobre el menú de AHORA, no el de cuando se abrió la pestaña: otra pestaña
      // u otro dispositivo pueden haberlo cambiado, y mandar `ocultos` entero con
      // datos viejos desharía lo suyo.
      olvidarLayout();
      const fresco = await fetchLayout();
      const nuevos = ocultosTrasCambiar(fresco.ocultos, m, enMenu);
      if (!nuevos) return;
      // Solo `ocultos`: el servidor fusiona por clave y no toca el orden ni el Resumen.
      const config = await guardarLayoutApi({ ocultos: nuevos });
      setOcultos(config.ocultos);
      setRecien(enMenu ? m.href : null);
      // El menú escucha esto y se recoloca sin recargar; la fila «Tu menú», también.
      window.dispatchEvent(new CustomEvent('tentare-layout-changed'));
      onCambio();
    } catch (e) {
      setErrores(prev => ({ ...prev, [m.href]: mensajeSeguro((e as Error).message, ERROR_RED) }));
    } finally {
      enVuelo.current = false;
      setGuardando(null);
    }
  }

  return (
    <section aria-labelledby={idTitulo} className="max-w-2xl space-y-4" data-testid="tu-tentare">
      <div className="space-y-1.5 px-1">
        <h2 id={idTitulo} className="text-base font-semibold text-foreground">Tus módulos</h2>
        <p className="text-sm text-muted-foreground text-pretty">
          {ocultos !== null && <span className="font-medium text-foreground">En tu menú: {cuenta.en} de {cuenta.de}. </span>}
          {studio?.cadenaId ? 'El menú es el de todo tu equipo y de todas tus sedes. ' : 'El menú es el de todo tu equipo. '}
          Quitar un módulo no lo apaga ni borra nada.
        </p>
        {/* Los dos sentidos: en el móvil no hay otro sitio donde cambiarlo. */}
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground text-pretty">
          {modo === 'esencial'
            ? 'En este navegador tienes el menú en «Esencial»: algunos no se ven aunque estén puestos.'
            : 'En este navegador tienes el menú en «Todo».'}
          <Button size="sm" variant="ghost" className="-ml-2 min-h-11 px-2 font-medium md:min-h-8"
            onClick={() => { const otro = modo === 'esencial' ? 'avanzado' : 'esencial'; guardarModoMenu(otro); setModo(otro); }}>
            {modo === 'esencial' ? 'Poner el menú en «Todo»' : 'Volver a «Esencial»'}
          </Button>
        </p>
        {errorLectura && (
          <p role="alert" className="text-sm font-medium text-destructive">
            No hemos podido leer tu menú, así que aquí no se puede cambiar nada. Recarga la página para intentarlo de nuevo.
          </p>
        )}
      </div>

      {conRotulos(grupos).map(g => (
        <GrupoFilas key={g.label} titulo={g.label}>
          {g.modulos.map(m => {
            const estado = estadoEnMenu(m, vistos);
            const enMenu = estado !== 'fuera';
            // Del plan solo se dice algo cuando se SABE: mientras carga, o si no se
            // ha podido leer, nada (decir «necesita el plan Estudio» a quien ya lo
            // tiene sería mentir).
            const incluido = plan ? incluidoEnPlan(m, plan.plan, true) : null;
            const minimo = planQueLoIncluye(m);
            const estadoPlan = m.feature && plan && incluido !== null
              ? estadoDelPlan({ enTuPlan: incluido, activo: plan.activo, planMinimo: minimo })
              : undefined;
            const nota = estado === 'solo-todo' && modo === 'esencial' ? 'Lo verás al poner el menú en «Todo».' : null;
            return (
              <li key={m.href} data-testid="modulo-tu-tentare" data-modulo={m.href} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <IconoFila icono={m.icon as LucideIcon} />
                  <span className="min-w-0 flex-1"><TituloFila titulo={m.label} estado={estadoPlan} /></span>
                  {m.fijo ? (
                    <EstadoAjuste tono="neutro" className="shrink-0">No se puede quitar</EstadoAjuste>
                  ) : (
                    <Interruptor
                      on={enMenu}
                      ariaLabel={`${m.label} en el menú`}
                      disabled={ocultos === null || (guardando !== null && guardando !== m.href)}
                      ocupado={guardando === m.href}
                      onChange={v => { void cambiar(m, v); }}
                    />
                  )}
                </div>
                {/* En el móvil, el texto va a todo el ancho; en pantallas más anchas, alineado con el nombre. */}
                <div className="mt-1 sm:pl-12">
                  <p className="text-sm text-muted-foreground text-pretty">{m.frase}</p>
                  {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
                  {errores[m.href] && (
                    <p role="alert" className="mt-0.5 text-xs font-medium text-destructive">{errores[m.href]}</p>
                  )}
                  <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
                    {/* Configuración ya es esta pantalla: «Abrir» no lleva a ningún sitio nuevo. */}
                    {m.href !== '/configuracion' && (
                      <Link href={m.href}
                        onClick={() => { if (m.tutorial) tutorial?.abrirAlLlegar(m.href); }}
                        className={`${ENLACE} text-foreground ${recien === m.href ? 'font-semibold underline' : 'font-medium hover:underline'}`}>
                        {m.tutorial ? 'Abrir y ver cómo se usa' : 'Abrir'}<span className="sr-only"> {m.label}</span>
                      </Link>
                    )}
                    {m.configurar && (
                      <Link href={m.configurar} className={`${ENLACE} text-muted-foreground underline decoration-border hover:decoration-current`}>
                        Configurar<span className="sr-only"> {m.label}</span>
                      </Link>
                    )}
                    {incluido === false && (
                      <Link href="/suscripcion" className={`${ENLACE} text-muted-foreground underline decoration-border hover:decoration-current`}>
                        Ver planes
                      </Link>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </GrupoFilas>
      ))}
    </section>
  );
}
