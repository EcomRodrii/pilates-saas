'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Apariencia de tu app» — cómo ven la app sus alumnas (22-sep-2026).
//
// Sustituye al editor de marca del portal, cerrado desde el 7-sep: aquel tenía
// ~20 ajustes de los que 19 no llegaban a la app actual, y su vista previa
// montaba el portal borrado. Este es GUIADO (decisión del fundador): estilos y
// parejas tipográficas hechos por nosotros, el color de la marca y las fotos.
// Lo que se elige está en `lib/student/apariencia.ts`, con sus garantías de
// contraste medidas en test.
//
// La vista previa es la app REAL (`/portal/<slug>` en un iframe del mismo
// origen): se le inyecta el borrador como un `<style>` más específico que el
// publicado, así que se ve con los datos de verdad y se puede navegar por ella.
// Nada llega a las alumnas hasta «Publicar».
//
// ⚠️ Las FOTOS son la excepción y se dice en pantalla: se guardan al subirlas,
// igual que el logo en Marca. Su fichero en Storage tiene una ruta fija por
// estudio, así que subir una nueva ya la cambia para todas; fingir que espera a
// «Publicar» sería mentir.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, ExternalLink, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { tieneFeature } from '@/lib/billing/entitlements';
import { fetchThemePublicado, publicarThemeApi } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import type { ThemeConfig } from '@/lib/theme-schema';
import { subirImagenBienvenida, eliminarImagenBienvenida } from '@/lib/portal-storage';
import { imagenDeEstudio } from '@/lib/imagenes-por-defecto';
import { CampoImagen } from '@/components/ui/campo-imagen';
import { btnPrimary, btnSecondary, cardCls, inputCls } from '@/components/configuracion/estilos';
import {
  ESTILOS, TIPOGRAFIAS, acentoDe, estiloPorId, resolverApariencia, temaAppCssText,
  type AparienciaApp, type EncuadrePortada,
} from '@/lib/student/apariencia';

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID_ESTILO_BORRADOR = 'apariencia-borrador';
/** Tamaño lógico del móvil de la vista previa: un iPhone de 390 pt. */
const MOVIL = { ancho: 390, alto: 800 };

interface Borrador { primary: string; secondary: string; app: AparienciaApp }

function borradorDe(t: ThemeConfig): Borrador {
  return { primary: t.primary, secondary: t.secondary, app: resolverApariencia(t.appAlumna) };
}

const mismaApp = (a: AparienciaApp, b: AparienciaApp) =>
  a.estilo === b.estilo && a.tipografia === b.tipografia && a.marca === b.marca && a.boton === b.boton && a.encuadre === b.encuadre;

/** Pinta el borrador dentro de la app del iframe. Mismo origen: se escribe en su `<head>`. */
function pintarBorrador(iframe: HTMLIFrameElement | null, css: string) {
  const doc = iframe?.contentDocument;
  if (!doc?.head) return;
  let el = doc.getElementById(ID_ESTILO_BORRADOR);
  if (!el) {
    el = doc.createElement('style');
    el.id = ID_ESTILO_BORRADOR;
    doc.head.appendChild(el);
  }
  el.textContent = css;
}

// ── Piezas ───────────────────────────────────────────────────────────────────

function Seccion({ titulo, detalle, children }: { titulo: string; detalle: string; children: React.ReactNode }) {
  return (
    <section className={cn(cardCls, 'p-5')}>
      <h2 className="text-[15px] font-semibold text-foreground">{titulo}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground text-pretty">{detalle}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Segmentado<T extends string>({ etiqueta, valor, opciones, onChange }: {
  etiqueta: string;
  valor: T;
  opciones: readonly { valor: T; texto: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex w-fit max-w-full flex-wrap rounded-lg border border-border bg-muted/60 p-0.5">
      {opciones.map(o => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            'min-h-9 rounded-md px-3 text-[13px] font-medium transition-colors',
            valor === o.valor ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/** Miniatura de un estilo: su fondo, una tarjeta y el botón como quedaría con la marca actual. */
function MuestraEstilo({ app, primary, activo, onElegir }: {
  app: AparienciaApp; primary: string; activo: boolean; onElegir: () => void;
}) {
  const e = estiloPorId(app.estilo);
  const a = acentoDe(primary, app);
  const boton = app.boton === 'marca' ? { bg: a.accent, fg: a.accentForeground } : { bg: e.tinta, fg: e.tintaForeground };
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activo}
      onClick={onElegir}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border text-left transition-shadow',
        activo ? 'border-brand ring-2 ring-brand/30' : 'border-border hover:shadow-sm',
      )}
    >
      <span aria-hidden className="block px-3 pb-3 pt-4" style={{ background: e.background }}>
        <span className="block p-2.5" style={{ background: e.card, borderRadius: e.radios.card * 0.7, border: `1px solid ${e.border}`, boxShadow: '0 6px 14px -8px rgba(26,26,26,.25)' }}>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: a.accent }} />
            <span className="h-1.5 w-12 rounded-full" style={{ background: e.foreground, opacity: 0.8 }} />
          </span>
          <span className="mt-1.5 block h-1.5 w-16 rounded-full" style={{ background: e.mutedForeground, opacity: 0.45 }} />
          <span
            className="mt-2.5 flex h-5 items-center justify-center text-[9px] font-semibold"
            style={{ background: boton.bg, color: boton.fg, borderRadius: Math.min(e.radios.pill, 999) * (e.radios.pill > 100 ? 1 : 0.6) }}
          >
            Reservar
          </span>
        </span>
      </span>
      <span className="block border-t border-border bg-card px-3 py-2">
        <span className="flex items-center justify-between gap-2 text-[13px] font-semibold text-foreground">
          {e.nombre}
          {activo && <Check size={14} className="text-brand" aria-hidden />}
        </span>
        <span className="block text-[12px] leading-snug text-muted-foreground">{e.descripcion}</span>
      </span>
    </button>
  );
}

function CampoColor({ etiqueta, valor, onChange }: { etiqueta: string; valor: string; onChange: (v: string) => void }) {
  const valido = HEX.test(valor);
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        aria-label={etiqueta}
        value={valido ? valor : '#000000'}
        onChange={e => onChange(e.target.value)}
        className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-card p-1"
      />
      <input
        type="text"
        aria-label={`${etiqueta} en hexadecimal`}
        aria-invalid={!valido}
        value={valor}
        onChange={e => onChange(e.target.value.trim())}
        spellCheck={false}
        autoComplete="off"
        className={cn(inputCls, 'w-32 font-mono', !valido && 'border-destructive')}
      />
    </div>
  );
}

function VistaPrevia({ slug, css, recarga }: { slug: string; css: string; recarga: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  // El borrador se repinta en cada cambio; al cargar (o recargar) la app, en `onLoad`.
  useEffect(() => { pintarBorrador(ref.current, css); }, [css]);
  const escala = 0.8;
  return (
    <div className="flex flex-col items-center">
      <div
        className="overflow-hidden rounded-[38px] border-[10px] border-neutral-900 bg-neutral-900 shadow-xl"
        style={{ width: MOVIL.ancho * escala + 20, height: MOVIL.alto * escala + 20 }}
      >
        <iframe
          key={recarga}
          ref={ref}
          title="Vista previa de la app de tus alumnas"
          src={`/portal/${encodeURIComponent(slug)}`}
          onLoad={() => pintarBorrador(ref.current, css)}
          className="origin-top-left rounded-[28px] bg-white"
          style={{ width: MOVIL.ancho, height: MOVIL.alto, transform: `scale(${escala})`, border: 0 }}
        />
      </div>
      <a
        href={`/portal/${encodeURIComponent(slug)}`}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        Abrir la app publicada <ExternalLink size={12} aria-hidden />
      </a>
    </div>
  );
}

// ── Pantalla ─────────────────────────────────────────────────────────────────

export function EditorAparienciaApp() {
  const { studio, updateStudio } = useStudio();
  const rol = useRol();
  const [publicado, setPublicado] = useState<ThemeConfig | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [intento, setIntento] = useState(0);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetchThemePublicado()
      .then(t => { if (vivo) { setPublicado(t); setBorrador(borradorDe(t)); setErrorCarga(false); } })
      .catch(() => { if (vivo) setErrorCarga(true); });
    return () => { vivo = false; };
  }, [intento]);

  const soyPropietaria = rol === 'PROPIETARIO';
  const incluidoEnPlan = !!studio && tieneFeature(studio, 'marca');
  const css = useMemo(
    () => (borrador ? temaAppCssText(HEX.test(borrador.primary) ? borrador.primary : publicado?.primary, borrador.app, '.student-app.student-app') : ''),
    [borrador, publicado],
  );

  if (!studio || (!publicado && !errorCarga)) {
    return <p role="status" className="text-sm text-muted-foreground">Cargando la apariencia de tu app…</p>;
  }
  if (!publicado || !borrador) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm font-medium text-destructive">No hemos podido leer la apariencia de tu app.</p>
        <button type="button" onClick={() => setIntento(n => n + 1)} className={btnSecondary}>Volver a intentarlo</button>
      </div>
    );
  }

  const inicial = borradorDe(publicado);
  const cambios = [
    borrador.primary !== inicial.primary || borrador.secondary !== inicial.secondary ? 'colores' : null,
    !mismaApp(borrador.app, inicial.app) ? 'estilo' : null,
  ].filter(Boolean);
  const coloresValidos = HEX.test(borrador.primary) && HEX.test(borrador.secondary);
  const puedePublicar = soyPropietaria && incluidoEnPlan && cambios.length > 0 && coloresValidos && !publicando;

  const setApp = (cambio: Partial<AparienciaApp>) => {
    setAviso(null);
    setBorrador(b => (b ? { ...b, app: { ...b.app, ...cambio } } : b));
  };

  async function publicar() {
    if (!borrador || !publicado) return;
    setPublicando(true);
    setAviso(null);
    try {
      const res = await publicarThemeApi({
        ...(borrador.primary !== publicado.primary ? { primary: borrador.primary } : {}),
        ...(borrador.secondary !== publicado.secondary ? { secondary: borrador.secondary } : {}),
        ...(!mismaApp(borrador.app, inicial.app) ? { appAlumna: borrador.app } : {}),
      });
      if (!res.ok) {
        setAviso({ tipo: 'error', texto: res.errores[0]?.mensaje ?? 'Ese color no tiene contraste suficiente para leerse encima.' });
        return;
      }
      setPublicado(res.theme);
      setBorrador(borradorDe(res.theme));
      // Repinta el panel (el color de marca también es el suyo) y la app de la vista previa.
      window.dispatchEvent(new CustomEvent('tentare-theme-changed'));
      setRecarga(n => n + 1);
      setAviso({ tipo: 'ok', texto: 'Publicado. Tus alumnas ya ven tu app así.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeSeguro((e as Error).message, ERROR_RED) });
    } finally {
      setPublicando(false);
    }
  }

  async function subirPortada(file: File) {
    setSubiendo(true);
    const r = await subirImagenBienvenida(studio!.id, file);
    setSubiendo(false);
    return r;
  }

  async function cambiarPortada(url: string | null) {
    setSubiendo(true);
    if (url === null) await eliminarImagenBienvenida(studio!.id);
    const res = await updateStudio({ imagenBienvenidaUrl: url });
    setSubiendo(false);
    setAviso(res.ok
      ? { tipo: 'ok', texto: url ? 'Portada cambiada. Ya la ven tus alumnas.' : 'Portada quitada: vuelve la foto por defecto.' }
      : { tipo: 'error', texto: res.error });
    if (res.ok) setRecarga(n => n + 1);
  }

  const encuadre: EncuadrePortada = borrador.app.encuadre;

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="text-[22px] font-bold text-foreground">Apariencia de tu app</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          Cómo ven tus alumnas su app: el estilo, tu color, la tipografía y tus fotos. Pruébalo aquí y mira el
          resultado en el móvil de la derecha; nadie lo ve hasta que publiques.
        </p>
        {!soyPropietaria && (
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-[13px] text-foreground">
            Puedes probar estilos, pero solo la propietaria del estudio puede publicarlos.
          </p>
        )}
        {soyPropietaria && !incluidoEnPlan && (
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-[13px] text-foreground">
            Puedes probarlo todo. Para publicarlo, la app con tu marca está incluida a partir del plan Estudio.{' '}
            <Link href="/suscripcion" className="font-medium underline underline-offset-2">Ver planes</Link>
          </p>
        )}
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="order-2 flex min-w-0 flex-col gap-5 lg:order-1">
          <Seccion titulo="Estilo" detalle="El fondo, las tarjetas y la forma de las esquinas. Todos están pensados para leerse bien con cualquier color.">
            <div role="radiogroup" aria-label="Estilo de la app" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {ESTILOS.map(e => (
                <MuestraEstilo
                  key={e.id}
                  app={{ ...borrador.app, estilo: e.id }}
                  primary={borrador.primary}
                  activo={borrador.app.estilo === e.id}
                  onElegir={() => setApp({ estilo: e.id })}
                />
              ))}
            </div>
          </Seccion>

          <Seccion titulo="Tu color" detalle="El de tu marca. Sale en enlaces, avisos y la tarjeta de la próxima clase, y en tu panel y tu página de reservas.">
            <div className="flex flex-col gap-5">
              <CampoColor
                etiqueta="Color de tu marca"
                valor={borrador.primary}
                onChange={v => { setAviso(null); setBorrador(b => (b ? { ...b, primary: v } : b)); }}
              />
              {!coloresValidos && (
                <p role="alert" className="text-sm text-destructive">Escríbelo como #RRGGBB: seis cifras, por ejemplo #7C3AED.</p>
              )}
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-medium text-foreground">Intensidad</p>
                <Segmentado
                  etiqueta="Intensidad del color"
                  valor={borrador.app.marca}
                  opciones={[{ valor: 'suave', texto: 'Suave' }, { valor: 'fiel', texto: 'Tal cual' }]}
                  onChange={marca => setApp({ marca })}
                />
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {borrador.app.marca === 'suave'
                    ? 'Tu tono, en una versión apagada y elegante.'
                    : 'Tu color como es. Si es muy claro, lo oscurecemos lo justo para que el texto encima se lea.'}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-medium text-foreground">Botón principal</p>
                <Segmentado
                  etiqueta="Color del botón principal"
                  valor={borrador.app.boton}
                  opciones={[{ valor: 'tinta', texto: 'Oscuro' }, { valor: 'marca', texto: 'En tu color' }]}
                  onChange={boton => setApp({ boton })}
                />
                <p className="text-[12px] leading-relaxed text-muted-foreground">«Reservar», «Comprar», la pestaña activa…</p>
              </div>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
                  <ChevronRight size={14} className="transition-transform group-open:rotate-90" aria-hidden />
                  Color secundario (solo tu panel y tu página de reservas)
                </summary>
                <div className="mt-3">
                  <CampoColor
                    etiqueta="Color secundario"
                    valor={borrador.secondary}
                    onChange={v => { setAviso(null); setBorrador(b => (b ? { ...b, secondary: v } : b)); }}
                  />
                </div>
              </details>
            </div>
          </Seccion>

          <Seccion titulo="Tipografía" detalle="Una letra para los títulos y otra para el texto, elegidas para ir juntas.">
            <div role="radiogroup" aria-label="Tipografía de la app" className="grid gap-2 sm:grid-cols-2">
              {TIPOGRAFIAS.map(t => {
                const activo = borrador.app.tipografia === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    onClick={() => setApp({ tipografia: t.id })}
                    className={cn(
                      'rounded-xl border px-4 py-3 text-left transition-shadow',
                      activo ? 'border-brand ring-2 ring-brand/30' : 'border-border hover:shadow-sm',
                    )}
                  >
                    <span className="flex items-center justify-between text-[12px] text-muted-foreground">
                      {t.nombre}
                      {activo && <Check size={14} className="text-brand" aria-hidden />}
                    </span>
                    <span
                      className="mt-1 block text-foreground"
                      style={{ fontFamily: t.titulos, fontWeight: t.pesoTitulo, fontSize: 21 * t.escalaTitulo, lineHeight: 1.15 }}
                    >
                      Buenos días, Lucía
                    </span>
                    <span className="mt-0.5 block text-[13px] text-muted-foreground" style={{ fontFamily: t.texto }}>
                      Reformer · 18:00 · {t.familias}
                    </span>
                  </button>
                );
              })}
            </div>
          </Seccion>

          <Seccion
            titulo="Fotos"
            detalle="Las fotos se guardan al subirlas, sin esperar a «Publicar»: tus alumnas las ven al momento."
          >
            <div className="flex flex-col gap-5">
              <div>
                <p className="mb-2 text-[13px] font-medium text-foreground">Portada</p>
                <CampoImagen
                  etiqueta="portada"
                  valor={studio.imagenBienvenidaUrl}
                  respaldo={imagenDeEstudio('portada', null, studio.slug)}
                  onSubir={subirPortada}
                  onCambiar={cambiarPortada}
                  ocupado={subiendo}
                  clasePreview="w-40 h-24"
                  textoSubir="Subir portada"
                  textoCambiar="Cambiar portada"
                  ayuda={
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      La primera imagen que ven al abrir la app y al entrar. Horizontal, de tu sala o de una clase; mejor sin texto encima.
                    </p>
                  }
                />
                <div className="mt-4 flex flex-col gap-2">
                  <p className="text-[13px] font-medium text-foreground">Qué parte de la foto se ve</p>
                  <Segmentado
                    etiqueta="Encuadre de la portada"
                    valor={encuadre ?? 'auto'}
                    opciones={[
                      { valor: 'auto', texto: 'Automático' },
                      { valor: 'arriba', texto: 'Arriba' },
                      { valor: 'centro', texto: 'Centro' },
                      { valor: 'abajo', texto: 'Abajo' },
                    ]}
                    onChange={v => setApp({ encuadre: v === 'auto' ? null : v })}
                  />
                </div>
              </div>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {[
                  { href: '/configuracion?tab=marca#logo-y-favicon', titulo: 'Logo', detalle: 'En la cabecera de la app y en el icono del móvil' },
                  { href: '/configuracion?tab=clases', titulo: 'Fotos de tus clases', detalle: 'Una por tipo de clase, en el horario y en cada reserva' },
                  { href: '/equipo', titulo: 'Fotos de tu equipo', detalle: 'En la ficha de cada instructora' },
                ].map(f => (
                  <li key={f.href}>
                    <Link href={f.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                      <span>
                        <span className="block text-[13px] font-medium text-foreground">{f.titulo}</span>
                        <span className="block text-[12px] text-muted-foreground">{f.detalle}</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Seccion>
        </div>

        <div className="order-1 lg:sticky lg:top-20 lg:order-2">
          {studio.slug
            ? <VistaPrevia slug={studio.slug} css={css} recarga={recarga} />
            : <p className="max-w-xs text-[13px] text-muted-foreground">Tu estudio aún no tiene dirección propia, así que no hay app que enseñar. Se la pones en «Mi app y mi web».</p>}
        </div>
      </div>

      {/* Barra fija: lo que hay sin publicar y las dos salidas. */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-border bg-card/95 backdrop-blur sm:mx-0 sm:rounded-t-xl sm:border-x">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:pr-24">
          <p
            role={aviso?.tipo === 'error' ? 'alert' : 'status'}
            className={cn('text-[13px]', aviso?.tipo === 'error' ? 'text-destructive' : 'text-muted-foreground')}
          >
            {aviso?.texto ?? (cambios.length > 0 ? 'Tienes cambios sin publicar.' : 'Todo publicado.')}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={btnSecondary}
              disabled={cambios.length === 0 || publicando}
              onClick={() => { setBorrador(inicial); setAviso(null); }}
            >
              <span className="inline-flex items-center gap-1.5"><RotateCcw size={14} aria-hidden /> Descartar</span>
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={!puedePublicar}
              onClick={publicar}
              title={!soyPropietaria ? 'Solo la propietaria puede publicar' : undefined}
            >
              {publicando ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
