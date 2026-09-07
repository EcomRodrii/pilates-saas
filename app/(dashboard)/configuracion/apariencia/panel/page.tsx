'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Personalizar tu panel — lo que SÍ se puede tocar mientras el editor de marca
// está en mantenimiento.
//
// Tres cosas, y las tres del PANEL (no del portal de clientas):
//   1. El color de tu software.
//   2. El orden de los módulos de Inicio.
//   3. Dónde va el menú: fijo a la izquierda o fijo arriba.
//
// ⚠️ El color NO es un ajuste nuevo. El panel ya se tiñe con `--brand`, que
// `PanelThemeProvider` deriva del tema PUBLICADO del estudio. Añadir aquí un
// color «solo del panel» habría creado una segunda fuente para lo mismo, y a la
// primera divergencia el panel diría un color y el portal otro. Así que se
// edita ESE color: es tu marca, y se aplica a los dos sitios. La pantalla lo
// dice, no lo esconde.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, PanelLeft, PanelTop, Check } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { usePermisos } from '@/lib/permisos';
import { cn } from '@/lib/utils';
import { Toast, useToast } from '@/components/ui/toast';
import { fetchThemePublicado, guardarThemeBorrador, publicarThemeApi } from '@/lib/api-client';
import { useHomeSeccionesEditor, HomeSeccionesList } from '@/components/theme/home-editor';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import type { MenuPosicion } from '@/lib/types';
import type { ThemeConfig } from '@/lib/theme-schema';

const HEX = /^#[0-9a-fA-F]{6}$/;

const POSICIONES: { id: MenuPosicion; label: string; pista: string; Icon: typeof PanelLeft }[] = [
  { id: 'izquierda', label: 'Fijo a la izquierda', pista: 'Lo de siempre. Cabe todo el menú sin recortar.', Icon: PanelLeft },
  { id: 'arriba', label: 'Fijo arriba', pista: 'Gana ancho para las tablas. El menú se desplaza de lado si no cabe.', Icon: PanelTop },
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

export default function PersonalizarPanelPage() {
  const { studio, updateStudio } = useStudio();
  const { rol } = usePermisos();
  const toast = useToast();
  const home = useHomeSeccionesEditor();

  const [publicado, setPublicado] = useState<ThemeConfig | null>(null);
  const [primary, setPrimary] = useState('');
  const [guardandoColor, setGuardandoColor] = useState(false);
  const [guardandoMenu, setGuardandoMenu] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetchThemePublicado()
      .then(t => { if (!vivo) return; setPublicado(t); setPrimary(t.primary); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  // Solo la propietaria: las tres cosas son del ESTUDIO, no de quien mira.
  // Mismo criterio que ya usa el panel de Apariencia para la marca.
  if (rol !== 'PROPIETARIO') {
    return (
      <div className="max-w-2xl">
        <h1 className="text-[22px] font-bold text-foreground">Personalizar tu panel</h1>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Esto lo configura la propietaria del estudio: lo que se elija aquí lo ve todo el equipo.
        </p>
      </div>
    );
  }

  async function guardarColor() {
    if (!publicado || !HEX.test(primary)) return;
    setGuardandoColor(true);
    try {
      // ⚠️ El parche se construye sobre lo PUBLICADO, no sobre el borrador.
      // `guardarBorradorTheme` fusiona sobre el borrador actual, así que si
      // hubiera uno a medias del editor viejo —el que está en mantenimiento—,
      // publicar habría sacado a producción cambios que nadie pidió sacar.
      // Enviando el publicado entero, el borrador queda EXACTAMENTE «lo que ya
      // se ve» + el color nuevo, y publicar es predecible.
      await guardarThemeBorrador({ ...publicado, primary });
      const res = await publicarThemeApi();
      if (!res.ok) {
        // El guardia de contraste ya existía: un color sobre el que no se lea
        // el texto no llega a publicarse. Se dice el motivo, no un genérico.
        toast.show(res.errores[0]?.mensaje ?? 'Ese color no tiene contraste suficiente.');
        return;
      }
      setPublicado(res.theme);
      toast.show('Color guardado. Recarga para verlo en todo el panel.');
    } catch (e) {
      toast.show(mensajeSeguro((e as Error).message, ERROR_RED));
    } finally {
      setGuardandoColor(false);
    }
  }

  async function elegirPosicion(p: MenuPosicion) {
    if (p === (studio?.menuPosicion ?? 'izquierda')) return;
    setGuardandoMenu(true);
    const res = await updateStudio({ menuPosicion: p });
    setGuardandoMenu(false);
    toast.show(res.ok ? 'Menú movido.' : (res.error ?? 'No se ha podido cambiar el menú.'));
  }

  const posicionActual: MenuPosicion = studio?.menuPosicion ?? 'izquierda';
  const colorCambiado = Boolean(publicado) && primary !== publicado?.primary;

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/configuracion/apariencia" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Apariencia
      </Link>
      <h1 className="text-[22px] font-bold text-foreground">Personalizar tu panel</h1>

      <Bloque
        titulo="El color de tu software"
        pista="Es el color de tu marca: tiñe los botones y lo destacado de tu panel, y también lo que ven tus clientas en el portal. No son dos colores distintos."
      >
        {!publicado ? (
          <p className="text-[13px] text-muted-foreground">Cargando tu color…</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              aria-label="Color de tu marca"
              value={HEX.test(primary) ? primary : '#000000'}
              onChange={e => setPrimary(e.target.value)}
              className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-transparent p-1"
            />
            <input
              type="text"
              aria-label="Color en hexadecimal"
              value={primary}
              onChange={e => setPrimary(e.target.value.trim())}
              placeholder="#7C3AED"
              spellCheck={false}
              className="h-11 w-32 rounded-xl border border-border bg-background px-3 font-mono text-[13px] text-foreground"
            />
            <button
              onClick={guardarColor}
              disabled={guardandoColor || !colorCambiado || !HEX.test(primary)}
              className="h-11 rounded-xl bg-brand px-4 text-[13px] font-semibold text-brand-foreground disabled:opacity-40"
            >
              {guardandoColor ? 'Guardando…' : 'Guardar color'}
            </button>
            {!HEX.test(primary) && primary !== '' && (
              <p className="w-full text-[12px] text-destructive">
                Escríbelo como #RRGGBB — seis cifras, por ejemplo #7C3AED.
              </p>
            )}
          </div>
        )}
      </Bloque>

      <Bloque
        titulo="Los módulos de tu Inicio"
        pista="Arrastra para cambiar el orden y usa el ojo para esconder lo que no uses. Es para todo el equipo, no solo para ti."
      >
        <HomeSeccionesList hook={home} />
      </Bloque>

      <Bloque
        titulo="Dónde va el menú"
        pista="Solo cambia en ordenador. En el móvil el menú ya es una barra arriba y otra abajo, y eso no se toca."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {POSICIONES.map(({ id, label, pista, Icon }) => {
            const activa = posicionActual === id;
            return (
              <button
                key={id}
                onClick={() => elegirPosicion(id)}
                disabled={guardandoMenu}
                aria-pressed={activa}
                className={cn(
                  'flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors disabled:opacity-50',
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

      {toast.message && <Toast message={toast.message} onDismiss={toast.dismiss} action={toast.action} />}
    </div>
  );
}
