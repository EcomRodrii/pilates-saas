'use client';

import { Check, Moon, PanelLeft, PanelTop, Sun } from 'lucide-react';
import { usePanelTheme } from '@/lib/panel-theme';
import { cn } from '@/lib/utils';
import { type MenuPosicion } from '@/lib/layout-runtime';
import { tarjetaPorId } from '@/lib/configuracion/secciones';
import { ListaOrdenable } from '@/components/panel/lista-ordenable';
import { usePersonalizacionPanel } from '@/components/panel/use-personalizacion-panel';
import { Interruptor } from '@/components/ui/interruptor';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';

// ─────────────────────────────────────────────────────────────────────────────
// Tu panel: el menú, el Inicio, dónde va el menú y claro u oscuro.
//
// Vivía en «Personalizar tu panel» (/configuracion/apariencia/panel), que hoy
// redirige aquí. Mismo hook y mismo guardado sobre `studio_layout`; el color de
// esa pantalla está en Marca (tab-color-marca.tsx).
//
// ⚠️ Menú, Inicio y posición son campos del MISMO documento: una sola barra de
// guardar para los tres, o guardar uno pisaría lo que el otro tuviera a medias.
// Claro u oscuro es de este navegador y se guarda al pulsar, en su propia
// tarjeta: los dos modelos nunca en el mismo contenedor (#1971).
// ─────────────────────────────────────────────────────────────────────────────

const POSICIONES: { id: MenuPosicion; label: string; pista: string; Icon: typeof PanelLeft }[] = [
  { id: 'lateral', label: 'Fijo a la izquierda', pista: 'Lo de siempre. Cabe todo el menú sin recortar.', Icon: PanelLeft },
  { id: 'superior', label: 'Fijo arriba', pista: 'Gana alto para las tablas. Si no cabe, el menú se desplaza de lado.', Icon: PanelTop },
];

export function SeccionPanel({ showToast }: { showToast: (m: string) => void }) {
  const { dark, setDark } = usePanelTheme();
  const p = usePersonalizacionPanel();
  const cargando = <p className="text-sm text-muted-foreground">Cargando…</p>;

  const cambios = [
    p.cambios.menu && tarjetaPorId('menu-del-panel').titulo,
    p.cambios.inicio && tarjetaPorId('inicio-del-panel').titulo,
    p.cambios.posicion && tarjetaPorId('posicion-del-menu').titulo,
  ].filter((t): t is string => !!t);

  async function guardar(): Promise<string | null> {
    const fallo = await p.guardar();
    if (!fallo) showToast('Tu panel, guardado y aplicado');
    return fallo;
  }

  return (
    <>
      {p.estado === 'error' && (
        <p role="alert" className="max-w-2xl rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          No hemos podido leer cómo tienes montado el panel, así que no se puede guardar encima: borraría lo que ya
          tuvieras. Recarga la página para intentarlo de nuevo.
        </p>
      )}

      <TarjetaAjuste id="menu-del-panel">
        {p.estado === 'cargando' ? cargando : (
          // Un bloque por grupo del menú, con su mismo rótulo: así se ve dónde
          // puede moverse cada módulo (fuera de su grupo no se puede).
          <div className="space-y-4">
            {p.grupos.map((g, i) => (
              <div key={g.label ?? `sin-rotulo-${i}`} className="space-y-1.5">
                {g.label && <p className="px-1 text-xs font-semibold text-muted-foreground">{g.label}</p>}
                <ListaOrdenable
                  items={g.items}
                  ocultos={p.modulosOcultos}
                  onDragEnd={e => p.moverModulo(i, e)}
                  onToggle={p.ocultarModulo}
                />
              </div>
            ))}
          </div>
        )}
      </TarjetaAjuste>

      <TarjetaAjuste id="inicio-del-panel">
        {p.estado === 'cargando' ? cargando : (
          <ListaOrdenable
            items={p.seccionesHome.map(id => ({ id, label: p.secciones.find(s => s.id === id)?.label ?? id }))}
            ocultos={p.homeOcultos}
            onDragEnd={p.moverSeccion}
            onToggle={p.ocultarSeccion}
          />
        )}
      </TarjetaAjuste>

      <TarjetaAjuste id="posicion-del-menu">
        <div className="grid gap-2 @md/config:grid-cols-2">
          {POSICIONES.map(({ id, label, pista, Icon }) => {
            const activa = p.posicion === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => p.elegirPosicion(id)}
                aria-pressed={activa}
                className={cn(
                  'flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  activa ? 'border-foreground bg-muted' : 'border-border hover:bg-muted',
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <Icon size={16} className={activa ? 'text-foreground' : 'text-muted-foreground'} aria-hidden />
                  <span className="text-sm font-semibold text-foreground">{label}</span>
                  {activa && <Check size={15} className="ml-auto text-foreground" aria-hidden />}
                </span>
                <span className="text-[13px] leading-relaxed text-muted-foreground">{pista}</span>
              </button>
            );
          })}
        </div>
      </TarjetaAjuste>

      <TarjetaAjuste id="claro-u-oscuro">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <span className="flex items-center gap-2.5 text-sm font-medium text-foreground">
            {dark ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
            Modo oscuro
          </span>
          <Interruptor on={dark} onChange={setDark} ariaLabel="Modo oscuro" />
        </div>
      </TarjetaAjuste>

      <BarraGuardar
        seccion="panel"
        cambios={cambios}
        bloqueo={p.estado === 'error' ? 'No se puede guardar: no hemos podido leer cómo tienes el panel.' : null}
        onGuardar={guardar}
        onDescartar={p.descartar}
      />
    </>
  );
}
