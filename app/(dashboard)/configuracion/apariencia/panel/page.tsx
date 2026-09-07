'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Personalizar tu panel.
//
// Cinco cosas, todas del PANEL (no del portal de clientas):
//   1. Los colores de tu software.
//   2. Los módulos del menú: orden y cuáles se ven.
//   3. Las secciones de Inicio: orden y cuáles se ven.
//   4. Dónde va el menú: a la izquierda o arriba.
//   5. Claro u oscuro (esto sí, solo para ti).
//
// ⚠️ Los colores NO son un ajuste nuevo. El panel ya se tiñe con `--brand`, que
// `PanelThemeProvider` deriva del tema PUBLICADO del estudio. Un color «solo
// del panel» sería una segunda fuente para lo mismo, y a la primera divergencia
// el panel diría un color y el portal otro. Se edita ESE color y la pantalla lo
// dice — es tu marca, y se ve en los dos sitios.
//
// ⚠️ Y hay que DISPARAR `tentare-theme-changed` al publicar. El proveedor ya lo
// escucha y repinta sin recargar; no hacerlo fue exactamente por qué la primera
// versión de esta pantalla «no hacía nada» al guardar un color.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, PanelLeft, PanelTop, Check, Moon, Sun, RotateCcw } from 'lucide-react';
import { usePermisos } from '@/lib/permisos';
import { usePanelTheme } from '@/lib/panel-theme';
import { cn } from '@/lib/utils';
import { Toast, useToast } from '@/components/ui/toast';
import { fetchThemePublicado, guardarThemeBorrador, publicarThemeApi } from '@/lib/api-client';
import { ListaOrdenable } from '@/components/panel/lista-ordenable';
import { usePersonalizacionPanel } from '@/components/panel/use-personalizacion-panel';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import { type MenuPosicion } from '@/lib/layout-runtime';
import type { ThemeConfig } from '@/lib/theme-schema';

const HEX = /^#[0-9a-fA-F]{6}$/;

const POSICIONES: { id: MenuPosicion; label: string; pista: string; Icon: typeof PanelLeft }[] = [
  { id: 'lateral', label: 'Fijo a la izquierda', pista: 'Lo de siempre. Cabe todo el menú sin recortar.', Icon: PanelLeft },
  { id: 'superior', label: 'Fijo arriba', pista: 'Gana alto para las tablas. Si no cabe, el menú se desplaza de lado.', Icon: PanelTop },
];

function Bloque({ titulo, pista, children }: { titulo: string; pista: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-[15px] font-semibold text-foreground">{titulo}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{pista}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CampoColor({ label, valor, onChange }: { label: string; valor: string; onChange: (v: string) => void }) {
  const valido = HEX.test(valor);
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        aria-label={label}
        value={valido ? valor : '#000000'}
        onChange={e => onChange(e.target.value)}
        className="h-10 w-12 shrink-0 cursor-pointer rounded-xl border border-border bg-transparent p-1"
      />
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        <input
          type="text"
          aria-label={`${label} en hexadecimal`}
          value={valor}
          onChange={e => onChange(e.target.value.trim())}
          spellCheck={false}
          className={cn(
            'mt-0.5 h-8 w-28 rounded-lg border bg-background px-2 font-mono text-[12.5px] text-foreground',
            valido ? 'border-border' : 'border-destructive',
          )}
        />
      </div>
    </div>
  );
}

export default function PersonalizarPanelPage() {
  const { rol } = usePermisos();
  const { dark, setDark } = usePanelTheme();
  const toast = useToast();
  const p = usePersonalizacionPanel();

  const [publicado, setPublicado] = useState<ThemeConfig | null>(null);
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [guardandoColor, setGuardandoColor] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetchThemePublicado()
      .then(t => { if (!vivo) return; setPublicado(t); setPrimary(t.primary); setSecondary(t.secondary); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  // Vista previa en vivo: el color se ve MIENTRAS se elige, no después de
  // guardar. Se pinta sobre el mismo nodo que usa `PanelThemeProvider`.
  useEffect(() => {
    if (!HEX.test(primary)) return;
    document.documentElement.style.setProperty('--brand', primary);
  }, [primary]);

  // Y si se sale sin guardar, se deshace: el proveedor vuelve a leer del
  // servidor. Sin esto, un color probado y descartado se quedaría puesto hasta
  // recargar, que es peor que no tener vista previa.
  const publicadoRef = useRef<ThemeConfig | null>(null);
  // En su propio efecto: el compilador de React rechaza escribir un ref
  // durante el render, y con razón.
  useEffect(() => { publicadoRef.current = publicado; }, [publicado]);
  const guardadoRef = useRef(false);
  useEffect(() => () => {
    if (!guardadoRef.current) {
      document.documentElement.style.removeProperty('--brand');
      window.dispatchEvent(new CustomEvent('tentare-theme-changed'));
    }
  }, []);

  const colorCambiado = Boolean(publicado)
    && (primary !== publicado?.primary || secondary !== publicado?.secondary);

  const guardarColor = useCallback(async () => {
    const base = publicadoRef.current;
    if (!base || !HEX.test(primary) || !HEX.test(secondary)) return;
    setGuardandoColor(true);
    try {
      // ⚠️ El parche se construye sobre lo PUBLICADO, no sobre el borrador.
      // `guardarBorradorTheme` fusiona sobre el borrador actual, así que un
      // borrador a medias del editor antiguo se habría publicado sin que nadie
      // lo pidiera. Así, publicar es «lo que ya se ve» + estos dos colores.
      await guardarThemeBorrador({ ...base, primary, secondary });
      const res = await publicarThemeApi();
      if (!res.ok) {
        toast.show(res.errores[0]?.mensaje ?? 'Ese color no tiene contraste suficiente para leerse encima.');
        return;
      }
      setPublicado(res.theme);
      guardadoRef.current = true;
      document.documentElement.style.removeProperty('--brand');
      // Esto es lo que repinta el panel entero al momento.
      window.dispatchEvent(new CustomEvent('tentare-theme-changed'));
      toast.show('Colores aplicados.');
    } catch (e) {
      toast.show(mensajeSeguro((e as Error).message, ERROR_RED));
    } finally {
      setGuardandoColor(false);
    }
  }, [primary, secondary, toast]);

  // Las tres primeras son del ESTUDIO: lo que se elija lo ve todo el equipo.
  if (rol !== 'PROPIETARIO') {
    return (
      <div className="max-w-2xl">
        <h1 className="text-[22px] font-bold text-foreground">Personalizar tu panel</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          Esto lo configura la propietaria del estudio: el color, el menú y las secciones de
          Inicio los ve todo el equipo. Lo que sí puedes cambiar tú es si prefieres el panel
          claro u oscuro, desde el icono de apariencia de la barra superior.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4 pb-24">
      <Link href="/configuracion/apariencia" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Apariencia
      </Link>
      <h1 className="text-[22px] font-bold text-foreground">Personalizar tu panel</h1>

      <Bloque
        titulo="Los colores de tu software"
        pista="Es tu marca: tiñe los botones y lo destacado de tu panel, y también lo que ven tus clientas en el portal. No son dos colores distintos. Los ves aplicados según los eliges."
      >
        {!publicado ? (
          <p className="text-[13px] text-muted-foreground">Cargando tus colores…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-5">
              <CampoColor label="Color principal" valor={primary} onChange={setPrimary} />
              <CampoColor label="Color secundario" valor={secondary} onChange={setSecondary} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={guardarColor}
                disabled={guardandoColor || !colorCambiado || !HEX.test(primary) || !HEX.test(secondary)}
                className="h-10 rounded-xl bg-brand px-4 text-[13px] font-semibold text-brand-foreground disabled:opacity-40"
              >
                {guardandoColor ? 'Guardando…' : 'Guardar colores'}
              </button>
              {colorCambiado && (
                <button
                  onClick={() => { setPrimary(publicado.primary); setSecondary(publicado.secondary); }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw size={14} /> Descartar
                </button>
              )}
              {(!HEX.test(primary) || !HEX.test(secondary)) && (
                <p className="w-full text-[12px] text-destructive">
                  Escríbelo como #RRGGBB — seis cifras, por ejemplo #7C3AED.
                </p>
              )}
            </div>
          </div>
        )}
      </Bloque>

      <Bloque
        titulo="Los módulos de tu menú"
        pista="Arrastra para ordenarlos y usa el ojo para esconder los que no uses. Inicio, Configuración y Suscripción no se pueden esconder: sin ellos no habría por dónde volver."
      >
        {p.estado === 'cargando' ? (
          <p className="text-[13px] text-muted-foreground">Cargando tu menú…</p>
        ) : (
          <ListaOrdenable items={p.modulos} ocultos={p.modulosOcultos} onDragEnd={p.moverModulo} onToggle={p.ocultarModulo} />
        )}
      </Bloque>

      <Bloque
        titulo="Las secciones de tu Inicio"
        pista="Lo mismo, para la pantalla de Inicio. Los avisos de estado se quedan siempre arriba y no se listan aquí."
      >
        {p.estado === 'cargando' ? (
          <p className="text-[13px] text-muted-foreground">Cargando tu Inicio…</p>
        ) : (
          <ListaOrdenable
            items={p.seccionesHome.map(id => ({ id, label: p.secciones.find(s => s.id === id)?.label ?? id }))}
            ocultos={p.homeOcultos}
            onDragEnd={p.moverSeccion}
            onToggle={p.ocultarSeccion}
          />
        )}
      </Bloque>

      <Bloque
        titulo="Dónde va el menú"
        pista="Solo cambia en ordenador. En el móvil el menú ya es una barra arriba y otra abajo, y eso no se toca."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {POSICIONES.map(({ id, label, pista, Icon }) => {
            const activa = p.posicion === id;
            return (
              <button
                key={id}
                onClick={() => p.elegirPosicion(id)}
                aria-pressed={activa}
                className={cn(
                  'flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors',
                  activa ? 'border-brand bg-brand/5' : 'border-border hover:border-brand/50',
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <Icon size={16} className={activa ? 'text-brand' : 'text-muted-foreground'} />
                  <span className="text-[13.5px] font-semibold text-foreground">{label}</span>
                  {activa && <Check size={15} className="ml-auto text-brand" />}
                </span>
                <span className="text-[12px] leading-relaxed text-muted-foreground">{pista}</span>
              </button>
            );
          })}
        </div>
      </Bloque>

      <Bloque titulo="Claro u oscuro" pista="Esto sí es solo tuyo: se guarda en este navegador y no afecta a nadie más del equipo.">
        <button
          onClick={() => setDark(!dark)}
          aria-pressed={dark}
          className="flex w-full items-center justify-between rounded-xl bg-muted px-3.5 py-3"
        >
          <span className="flex items-center gap-2.5 text-[13px] font-semibold text-foreground">
            {dark ? <Moon size={16} /> : <Sun size={16} />}
            Modo oscuro
          </span>
          <span className="flex h-6 w-10 items-center rounded-full px-0.5 transition-colors" style={{ backgroundColor: dark ? 'var(--brand)' : 'var(--muted-foreground)' }}>
            <span className="size-5 rounded-full bg-card shadow transition-transform" style={{ transform: dark ? 'translateX(16px)' : 'translateX(0)' }} />
          </span>
        </button>
      </Bloque>

      {/* Barra de guardado del LAYOUT (menú + Inicio + posición): son campos del
          mismo documento, así que un solo botón. Los colores van por su propia
          API y llevan el suyo arriba. */}
      {p.sucio && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-lg">
          <span className="flex-1 text-[13px] text-muted-foreground">Tienes cambios sin guardar en el menú o en Inicio.</span>
          <button onClick={p.descartar} className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground">
            Descartar
          </button>
          <button
            onClick={p.guardar}
            disabled={p.guardando || p.estado === 'error'}
            className="h-9 rounded-lg bg-brand px-4 text-[13px] font-semibold text-brand-foreground disabled:opacity-40"
          >
            {p.guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      )}
      {p.estado === 'error' && (
        <p className="text-[12.5px] text-destructive">
          No hemos podido leer cómo tienes montado el panel, así que no se puede guardar encima:
          borraría lo que ya tuvieras. Recarga la página para intentarlo de nuevo.
        </p>
      )}
      {p.aviso && (
        <p className={cn('text-[12.5px]', p.aviso.tipo === 'ok' ? 'text-muted-foreground' : 'text-destructive')}>{p.aviso.texto}</p>
      )}

      {toast.message && <Toast message={toast.message} onDismiss={toast.dismiss} action={toast.action} />}
    </div>
  );
}
