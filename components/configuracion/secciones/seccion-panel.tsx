'use client';

import { Check, LayoutDashboard, Menu, Moon, PanelLeft, PanelTop } from 'lucide-react';
import { usePanelTheme } from '@/lib/panel-theme';
import { cn } from '@/lib/utils';
import { type MenuPosicion } from '@/lib/layout-runtime';
import { resumenInicioPanel, resumenMenuPanel, resumenPosicionMenu } from '@/lib/configuracion/resumenes';
import { tarjetaPorId, type TarjetaId } from '@/lib/configuracion/secciones';
import { ListaOrdenable } from '@/components/panel/lista-ordenable';
import { usePersonalizacionPanel } from '@/components/panel/use-personalizacion-panel';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaAjuste, FilaInterruptor, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';

// ─────────────────────────────────────────────────────────────────────────────
// Tu panel: el menú, el Inicio, dónde va el menú y claro u oscuro.
//
// Vivía en «Personalizar tu panel» (/configuracion/apariencia/panel), que hoy
// redirige aquí. Mismo hook y mismo guardado sobre `studio_layout`; el color de
// esa pantalla está en Marca, que lleva a «Apariencia de tu app».
//
// Filas con su valor de hoy (16-sep, v2): era la ÚLTIMA sección con barra de
// guardar propia, la última que quedaba con el modelo viejo.
//
// ⚠️ Menú, Inicio y posición son campos del MISMO documento, y `guardarLayoutApi`
// lo manda entero: guardar uno pisaría lo que otro tuviera a medias. Lo que lo
// impide es que solo hay UN cajón abierto a la vez (`useCajonAbierto`) y que
// cerrar sin guardar DESCARTA (`cerrarCajon`), así que nunca hay cambios sin
// guardar en dos sitios. Es la misma promesa de #2027 —«guardar manda solo lo
// suyo»— para un ajuste que físicamente es un solo documento.
//
// Claro u oscuro es de este navegador y se guarda al tocarlo: por eso es un
// interruptor en la fila y no un cajón, que es lo que hace visible la diferencia
// (los dos modelos nunca escondidos en el mismo sitio, #1971).
// ─────────────────────────────────────────────────────────────────────────────

const CAJONES = ['menu-del-panel', 'inicio-del-panel', 'posicion-del-menu'] as const satisfies readonly TarjetaId[];

const POSICIONES: { id: MenuPosicion; label: string; pista: string; Icon: typeof PanelLeft }[] = [
  { id: 'lateral', label: 'Fijo a la izquierda', pista: 'Lo de siempre. Cabe todo el menú sin recortar.', Icon: PanelLeft },
  { id: 'superior', label: 'Fijo arriba', pista: 'Gana alto para las tablas. Si no cabe, el menú se desplaza de lado.', Icon: PanelTop },
];

export function SeccionPanel({ showToast }: { showToast: (m: string) => void }) {
  const { dark, setDark } = usePanelTheme();
  const p = usePersonalizacionPanel();
  const { cajon, abrir, cerrar } = useCajonAbierto(CAJONES);
  // Solo con el layout leído se cuenta algo: con la lectura fallida se enseñan
  // los módulos de fábrica, y decir «ninguno escondido» sobre eso sería mentira.
  const listo = p.estado === 'listo';

  function cerrarCajon() {
    // Cerrar sin guardar tiene que dejar el hook como estaba: si no, el
    // «Guardar» del cajón de al lado publicaría también esto.
    if (p.sucio) p.descartar();
    cerrar();
  }

  function barra(id: (typeof CAJONES)[number], hayCambios: boolean) {
    return (
      <BarraGuardar
        seccion="panel"
        cambios={hayCambios ? [tarjetaPorId(id).titulo] : []}
        bloqueo={p.estado === 'error' ? 'No se puede guardar: no hemos podido leer cómo tienes el panel.' : null}
        onGuardar={async () => {
          const fallo = await p.guardar();
          if (!fallo) { cerrar(); showToast('Tu panel, guardado y aplicado'); }
          return fallo;
        }}
        onDescartar={p.descartar}
      />
    );
  }

  const cargando = <p className="pb-6 text-sm text-muted-foreground">Cargando…</p>;

  return (
    <>
      {p.estado === 'error' && (
        <p role="alert" className="max-w-2xl rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          No hemos podido leer cómo tienes montado el panel, así que no se puede guardar encima: borraría lo que ya
          tuvieras. Recarga la página para intentarlo de nuevo.
        </p>
      )}

      <GrupoFilas titulo="Cómo se ordena tu panel">
        <FilaAjuste
          id="menu-del-panel"
          icono={Menu}
          valor={resumenMenuPanel(listo ? { total: p.grupos.reduce((n, g) => n + g.items.length, 0), ocultos: p.modulosOcultos.size } : null)}
          onAbrir={abrir}
        />
        <FilaAjuste
          id="inicio-del-panel"
          icono={LayoutDashboard}
          valor={resumenInicioPanel(listo ? { total: p.seccionesHome.length, ocultos: p.homeOcultos.size } : null)}
          onAbrir={abrir}
        />
        <FilaAjuste
          id="posicion-del-menu"
          icono={PanelLeft}
          valor={resumenPosicionMenu(listo ? p.posicion : null)}
          onAbrir={abrir}
        />
      </GrupoFilas>

      <GrupoFilas titulo="Solo para ti">
        {/* De este navegador y de nadie más: no pasa por el servidor, así que no
            hay respuesta que esperar y nunca falla. */}
        <FilaInterruptor id="claro-u-oscuro" icono={Moon} on={dark} onCambiar={async v => { setDark(v); return null; }} />
      </GrupoFilas>

      <CajonAjuste id="menu-del-panel" abierto={cajon === 'menu-del-panel'} onCerrar={cerrarCajon}>
        {p.estado === 'cargando' ? cargando : (
          <>
            {/* Un bloque por grupo del menú, con su mismo rótulo: así se ve dónde
                puede moverse cada módulo (fuera de su grupo no se puede). */}
            <div className="flex flex-col gap-4 pb-6">
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
            {barra('menu-del-panel', p.cambios.menu)}
          </>
        )}
      </CajonAjuste>

      <CajonAjuste id="inicio-del-panel" abierto={cajon === 'inicio-del-panel'} onCerrar={cerrarCajon}>
        {p.estado === 'cargando' ? cargando : (
          <>
            <div className="pb-6">
              <ListaOrdenable
                items={p.seccionesHome.map(id => ({ id, label: p.secciones.find(s => s.id === id)?.label ?? id }))}
                ocultos={p.homeOcultos}
                onDragEnd={p.moverSeccion}
                onToggle={p.ocultarSeccion}
              />
            </div>
            {barra('inicio-del-panel', p.cambios.inicio)}
          </>
        )}
      </CajonAjuste>

      <CajonAjuste id="posicion-del-menu" abierto={cajon === 'posicion-del-menu'} onCerrar={cerrarCajon}>
        <div className="grid gap-2 pb-6">
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
        {barra('posicion-del-menu', p.cambios.posicion)}
      </CajonAjuste>
    </>
  );
}
