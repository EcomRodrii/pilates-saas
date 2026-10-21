'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Paso 5 del alta nueva: «Que se vea tu estudio» (opcional, «Más tarde»).
// Logo y color con la app de la alumna al lado, cambiando con cada toque; en el
// móvil, una franja fija arriba y «Ver en grande» (antes no había vista previa
// en el móvil: `hidden lg:block` en la bienvenida de siempre).
//
// Qué se guarda y cuándo, dicho en pantalla:
//   · el logo, AL SUBIRLO (como en Configuración › Marca: es un fichero que ya
//     está en Storage; fingir que espera a «Siguiente» sería mentir), por el
//     mismo camino de siempre (`subirLogoEstudio` + `studios.logo_url`), y el
//     favicon sale de él si no tiene uno (`/api/onboarding/configurar` sin
//     respuestas: solo hace eso);
//   · el color, al pulsar «Siguiente», con `publicarThemeApi` (el servidor vuelve
//     a comprobar el contraste); hasta entonces solo está en la vista previa;
//   · el nombre que verán sus alumnas, al salir del campo (así la vista previa lo
//     enseña) o al pulsar «Siguiente».
// Las paletas son las de «Apariencia de tu app» más «De serie», el color con el
// que nace el portal (lib/apariencia/paletas.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ImageIcon, Loader2, Upload } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import type { Studio } from '@/lib/types';
import type { ThemeConfig } from '@/lib/theme-schema';
import { authHeader, fetchThemePublicado, publicarThemeApi } from '@/lib/api-client';
import { eliminarLogoEstudio, subirLogoEstudio } from '@/lib/portal-storage';
import { capturarExcepcion } from '@/lib/sentry-cliente';
import { temaAppCssText } from '@/lib/student/apariencia';
import { PALETAS_CON_DE_SERIE, colorValido, contrasteDeBotones } from '@/lib/apariencia/paletas';
import { useEscalaIphone } from '@/components/ui/marco-iphone';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { BOTON_BORDE } from '@/components/dashboard/vivo-seccion';
import { cn } from '@/lib/utils';
import { AppEnVivo } from './app-en-vivo';
import { CLASE_AYUDA, CLASE_CAMPO, CLASE_ERROR, CLASE_ETIQUETA, CabeceraPaso, ErrorGuardado, LineaDePasos, NavPaso } from './piezas';

function inicial(nombre: string): string {
  return (nombre.trim().charAt(0) || 'T').toUpperCase();
}

export function PasoMarca({ studio, onAtras, onListo, saliendo }: {
  studio: Studio;
  onAtras: () => void;
  /** Sigue a la primera clase. */
  onListo: () => void;
  saliendo: boolean;
}) {
  const { updateStudio } = useStudio();
  const [publicado, setPublicado] = useState<ThemeConfig | null>(null);
  const [sinTema, setSinTema] = useState(false);
  const [color, setColor] = useState('');
  const [nombre, setNombre] = useState(studio.nombre ?? '');
  const [recarga, setRecarga] = useState(0);
  const [subiendo, setSubiendo] = useState(false);
  const [errorLogo, setErrorLogo] = useState<string | null>(null);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verGrande, setVerGrande] = useState(false);
  // «Ver en grande»: lo más grande que quepa a lo ancho y a lo alto (el teléfono mide 420 × escala).
  const [escalaVer, setEscalaVer] = useState(0.7);
  const archivo = useRef<HTMLInputElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const escala = useEscalaIphone(0.62, 300);
  const escalaGrande = useEscalaIphone(0.8, 140);
  useEffect(() => { titulo.current?.focus(); }, []);

  useEffect(() => {
    let vivo = true;
    fetchThemePublicado()
      .then(t => { if (vivo) { setPublicado(t); setColor(c => c || t.primary); } })
      .catch(() => { if (vivo) setSinTema(true); });
    return () => { vivo = false; };
  }, []);

  const valido = colorValido(color);
  const contraste = contrasteDeBotones(color);
  const css = useMemo(
    () => (publicado ? temaAppCssText(valido ? color : publicado.primary, publicado.appAlumna, '.student-app.student-app', { completo: true }) : ''),
    [publicado, color, valido],
  );
  const ocupado = trabajando || saliendo;

  async function elegirLogo(file: File | undefined) {
    if (!file) return;
    setErrorLogo(null);
    setSubiendo(true);
    try {
      const r = await subirLogoEstudio(studio.id, file);
      if ('error' in r) { setErrorLogo(r.error); return; }
      // Se enseña cuando `studios.logo_url` lo ha aceptado, no al subir.
      const res = await updateStudio({ logoUrl: r.url });
      if (!res.ok) { setErrorLogo(res.error); return; }
      setRecarga(n => n + 1);
      // El favicon sale del logo si no tiene uno. Sin respuestas, el ejecutor
      // del asistente de siempre no crea nada más (`planVacio`). Si falla, el
      // logo ya está: no se dice nada.
      void (async () => {
        try {
          await fetch('/api/onboarding/configurar', {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) }, body: '{}',
          });
        } catch { /* el favicon no es el paso */ }
      })();
    } catch {
      setErrorLogo('No hemos podido subir la imagen. Prueba otra vez o hazlo luego desde Configuración › Marca.');
    } finally {
      setSubiendo(false);
    }
  }

  async function quitarLogo() {
    setErrorLogo(null);
    setSubiendo(true);
    try {
      await eliminarLogoEstudio(studio.id);
      const res = await updateStudio({ logoUrl: null });
      if (!res.ok) { setErrorLogo(res.error); return; }
      setRecarga(n => n + 1);
    } finally {
      setSubiendo(false);
    }
  }

  /** Guarda el nombre si ha cambiado. `false` si no se pudo (y lo dice). */
  async function guardarNombre(): Promise<boolean> {
    const limpio = nombre.replace(/\s+/g, ' ').trim();
    if (!limpio) { setErrorNombre('Ponle un nombre a tu estudio.'); return false; }
    if (limpio === studio.nombre) return true;
    const res = await updateStudio({ nombre: limpio });
    if (!res.ok) { setErrorNombre(`No hemos podido guardar el nombre. ${res.error}`); return false; }
    setErrorNombre(null);
    setRecarga(n => n + 1);
    return true;
  }

  async function siguiente(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado || subiendo) return;
    setError(null);
    if (color && !valido) { setError('Escribe el color como #RRGGBB: seis cifras, por ejemplo #2F6F8F.'); return; }
    setTrabajando(true);
    try {
      if (!(await guardarNombre())) return;
      if (publicado && valido && color.toLowerCase() !== publicado.primary.toLowerCase()) {
        const res = await publicarThemeApi({ primary: color });
        if (!res.ok) {
          setError(res.errores[0]?.mensaje ?? 'Ese color no tiene contraste suficiente para leerse encima.');
          return;
        }
        setPublicado(res.theme);
        // El color de marca es también el del panel: que se repinte.
        window.dispatchEvent(new CustomEvent('tentare-theme-changed'));
      }
      onListo();
    } catch (err) {
      capturarExcepcion(err instanceof Error ? err : new Error(String(err)), { tags: { area: 'onboarding' } });
      setError(err instanceof Error && err.message ? err.message : 'No hemos podido publicar tu color. Vuelve a pulsar «Siguiente».');
    } finally {
      setTrabajando(false);
    }
  }

  const fondo = valido ? color : publicado?.primary ?? PALETAS_CON_DE_SERIE[0].color;
  const textoBoton = contrasteDeBotones(fondo)?.texto;
  const muestra = (
    <span
      className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full text-[15px] font-bold"
      style={{ backgroundColor: fondo, color: textoBoton }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {studio.logoUrl ? <img src={studio.logoUrl} alt="" className="size-full bg-card object-contain" /> : inicial(nombre || studio.nombre)}
    </span>
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)] lg:gap-14">
      <form noValidate onSubmit={siguiente} className="min-w-0">
        <LineaDePasos actual={5} />
        <CabeceraPaso
          etiqueta="Paso 5 de 7 · opcional · unos 2 minutos"
          titulo="Que se vea tu estudio"
          masTarde={{ onClick: onListo, disabled: ocupado }}
          tituloRef={titulo}
        />
        <p className="mt-2.5 max-w-[48ch] text-[16px] leading-[25px] text-muted-foreground">
          Tu logo y tu color en la app y la página de reservas de tus alumnas. Lo cambias cuando quieras en Configuración › Marca.
        </p>

        {/* Móvil: la franja fija con su marca y «Ver en grande». */}
        <div className="sticky top-0 z-10 -mx-5 mt-4 flex items-center gap-3 border-y border-border bg-background/95 px-5 py-2.5 backdrop-blur lg:hidden" data-testid="franja-marca">
          {muestra}
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">{nombre.trim() || studio.nombre || 'Tu estudio'}</span>
          <span className="rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ backgroundColor: fondo, color: textoBoton }} aria-hidden>Reservar</span>
          {studio.slug && (
            <button
              type="button"
              onClick={() => { setEscalaVer(Math.max(0.5, Math.min(escalaGrande, (window.innerWidth - 72) / 420))); setVerGrande(true); }}
              className={cn(BOTON_BORDE, 'h-9 px-3')}
            >
              Ver en grande
            </button>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-6">
          <div>
            <p className={CLASE_ETIQUETA}>Tu logo</p>
            <div className="mt-2 flex items-center gap-4">
              <div className={cn(
                'grid size-[88px] shrink-0 place-items-center overflow-hidden rounded-[20px] bg-card',
                studio.logoUrl ? 'border border-border shadow-xs' : 'border-[1.5px] border-dashed border-input text-muted-foreground',
              )}>
                {studio.logoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={studio.logoUrl} alt={`Logo de ${studio.nombre}`} className="max-h-[72px] max-w-[72px] object-contain" />
                  : <span className="grid justify-items-center gap-1 text-[12px] font-medium"><ImageIcon size={18} aria-hidden />Sin logo</span>}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] leading-[18px] text-muted-foreground">PNG, JPG o WebP, hasta 2 MB. Mejor cuadrado y con el fondo transparente.</p>
                <input ref={archivo} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={e => { void elegirLogo(e.target.files?.[0]); e.target.value = ''; }} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={subiendo || ocupado} onClick={() => archivo.current?.click()} className={cn(BOTON_BORDE, 'h-9 disabled:opacity-60')}>
                    {subiendo ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Upload size={14} aria-hidden />}
                    {studio.logoUrl ? 'Cambiar' : 'Subir mi logo'}
                  </button>
                  {studio.logoUrl && (
                    <button type="button" disabled={subiendo || ocupado} onClick={() => void quitarLogo()} className="h-9 rounded-full px-3 text-[13px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60">
                      Quitar
                    </button>
                  )}
                </div>
                <p className={CLASE_AYUDA}>Se guarda al subirlo.</p>
                {errorLogo && <p role="alert" className={CLASE_ERROR}>{errorLogo}</p>}
              </div>
            </div>
          </div>

          <div>
            <p id={`${id}-pal`} className={CLASE_ETIQUETA}>Tu color</p>
            <div role="radiogroup" aria-labelledby={`${id}-pal`} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PALETAS_CON_DE_SERIE.map(p => {
                const activa = color.toLowerCase() === p.color.toLowerCase();
                return (
                  <button
                    key={p.nombre}
                    type="button"
                    role="radio"
                    aria-checked={activa}
                    onClick={() => { setError(null); setColor(p.color); }}
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-xl border bg-card px-2.5 text-left text-[13px] font-medium text-foreground transition-shadow',
                      activa ? 'border-transparent ring-2 ring-foreground' : 'border-border hover:shadow-sm',
                    )}
                  >
                    <i aria-hidden className="size-5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="min-w-0 truncate">{p.nombre}</span>
                    {activa && <Check size={13} className="ml-auto shrink-0" aria-hidden />}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                type="color"
                aria-label="Elegir otro color"
                value={valido ? color.toLowerCase() : '#000000'}
                onChange={e => { setError(null); setColor(e.target.value); }}
                className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-card p-1"
              />
              <input
                aria-label="Código del color, por ejemplo #2F6F8F"
                aria-invalid={!!color && !valido}
                value={color}
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
                onChange={e => { setError(null); setColor(e.target.value.trim()); }}
                className={cn(CLASE_CAMPO, 'w-32 font-mono', color && !valido && 'border-destructive')}
              />
              {contraste && (
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground" data-testid="contraste">
                  <i aria-hidden className={cn('size-2 rounded-full', contraste.seLee ? 'bg-success' : 'bg-warning')} />
                  {contraste.frase}
                </span>
              )}
            </div>
            <p className={CLASE_AYUDA}>
              {sinTema ? 'No hemos podido leer tu color de ahora: lo puedes cambiar luego en Configuración › Marca.' : 'Se publica al pulsar «Siguiente».'}
            </p>
          </div>

          <div>
            <label htmlFor={`${id}-nombre`} className={CLASE_ETIQUETA}>Nombre que verán tus alumnas</label>
            <input
              id={`${id}-nombre`}
              className={cn(CLASE_CAMPO, 'mt-1.5')}
              value={nombre}
              maxLength={120}
              onChange={e => { setErrorNombre(null); setNombre(e.target.value); }}
              onBlur={() => { if (nombre.trim() && nombre.trim() !== studio.nombre) void guardarNombre(); }}
              aria-invalid={!!errorNombre}
            />
            {errorNombre && <p role="alert" className={CLASE_ERROR}>{errorNombre}</p>}
          </div>
        </div>

        <ErrorGuardado mensaje={error} />
        <NavPaso onAtras={onAtras} trabajando={ocupado} />
      </form>

      <aside aria-label="Así lo verá tu alumna" className="hidden min-w-0 flex-col items-center gap-4 self-start rounded-3xl bg-muted/70 p-8 text-center lg:flex">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Así lo verá tu alumna · en vivo</p>
        {studio.slug && publicado
          ? <AppEnVivo slug={studio.slug} css={css} recarga={recarga} escala={escala} />
          : <p className="py-24 text-[13px] text-muted-foreground">{sinTema ? 'No hemos podido cargar tu app.' : 'Cargando tu app…'}</p>}
      </aside>

      {studio.slug && (
        <DashboardSheet
          open={verGrande}
          onClose={() => setVerGrande(false)}
          label="Así lo verá tu alumna"
          sheetClassName="flex max-h-[96dvh] w-full max-w-sm flex-col items-center gap-3 overflow-y-auto rounded-3xl bg-card p-4"
        >
          <div className="flex w-full items-center justify-between">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Así lo verá tu alumna</p>
            <button type="button" onClick={() => setVerGrande(false)} className={cn(BOTON_BORDE, 'h-9 px-3')}>Cerrar</button>
          </div>
          {publicado
            ? <AppEnVivo slug={studio.slug} css={css} recarga={recarga} escala={escalaVer} />
            : <p className="py-16 text-[13px] text-muted-foreground">{sinTema ? 'No hemos podido cargar tu app.' : 'Cargando tu app…'}</p>}
        </DashboardSheet>
      )}
    </div>
  );
}
