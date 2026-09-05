'use client';

import { useId, useRef, useState } from 'react';
import { ChevronDown, Sparkles, X } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from '@/components/ui/collapsible';
import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { InfoTip } from '@/components/ui/tooltip';
import { CampoImagen } from '@/components/ui/campo-imagen';
import { btnPrimary, btnSecondary, inputCls, Toggle } from '@/app/(dashboard)/configuracion/page';
import { OBJETIVOS } from '@/lib/reservar/objetivos';
import { ESPECIALIDADES_NETWORK, ESPECIALIDAD_LABEL } from '@/lib/network/catalogo.ts';
import { imagenDeClase, IMAGENES_CLASE, type FamiliaClase } from '@/lib/imagenes-por-defecto';
import type { Studio, TipoClase } from '@/lib/types';
import { cn, formatEuro } from '@/lib/utils';
import {
  DURACIONES_HABITUALES,
  NIVEL_LABELS,
  hayVentanaImposible,
  plazasSiPropias,
  resumenAforo,
  resumenAntelacionMaxima,
  resumenAntelacionMinima,
  resumenHoras,
  resumenMinimoAsistentes,
  resumenPenalizacion,
  resumenPlazoEspera,
  resumenSiNo,
  type ClaseForm,
  type TriEstado,
} from '@/lib/configuracion/tipo-clase-form';

// ─────────────────────────────────────────────────────────────────────────────
// El formulario de un tipo de clase, rediseñado.
//
// Antes eran 18 controles en un diálogo de 24rem, todos con el mismo peso
// visual: el nombre de la clase pesaba lo mismo que "Plazo para aceptar una
// plaza liberada (minutos)". Para dar de alta un "Reformer 50 min" había que
// pasar por delante de las 8 reglas de reserva.
//
// Tres decisiones sostienen el rediseño:
//
//  1. **Panel lateral ancho, no diálogo estrecho.** `DashboardDrawer` con
//     720px en escritorio y pantalla completa en móvil, cabecera y pie fijos:
//     el botón de guardar no se pierde nunca al bajar, que es lo que pasaba
//     con 18 campos apilados en un modal centrado de 384px.
//
//  2. **Divulgación progresiva por secciones.** Lo básico (nombre, duración,
//     nivel, plazas, color) va abierto; reservas, cancelaciones, online y
//     Network van plegados, y cada sección plegada resume en una línea lo que
//     tiene dentro — plegar comprime, no esconde. NO es un asistente por pasos
//     a propósito: editar exige llegar a cualquier ajuste de un salto, y un
//     stepper obliga a desfilar por delante de todo lo demás.
//
//  3. **La herencia se lee, no se adivina.** Antes, un hueco vacío con
//     `placeholder="Ajuste del estudio"` era todo lo que decía que esa regla
//     la ponía el estudio — y nunca decía CUÁL era el ajuste. Ahora cada regla
//     heredada enseña el valor real ("Ajuste del estudio: hasta 12 horas
//     antes") con un botón "Personalizar" al lado. `<CampoHeredado>` es ese
//     patrón, y lo usan las 8 reglas sin excepción.
//
// Lo que NO cambia: qué campos se guardan, sus nombres, sus unidades y su
// semántica de override (`null` = hereda). Es un rediseño de presentación
// sobre el mismo contrato de datos — la conversión vive entera en
// `lib/configuracion/tipo-clase-form.ts`, que sí tiene tests.
// ─────────────────────────────────────────────────────────────────────────────

const secLabelCls = 'text-[13px] font-semibold text-foreground';
const campoLabelCls = 'text-[12.5px] font-medium text-foreground';
const ayudaCls = 'text-[11.5px] leading-relaxed text-muted-foreground';

function Seccion({
  titulo,
  ayuda,
  resumen,
  defaultOpen = false,
  abierta,
  onAbrir,
  anclaRef,
  children,
}: {
  titulo: string;
  ayuda?: string;
  /** Lo configurado aquí dentro, en una línea. */
  resumen?: string;
  defaultOpen?: boolean;
  /** Modo controlado: para poder abrirla desde fuera (p. ej. desde la
   *  previsualización, que enseña justo lo que se configura aquí dentro). */
  abierta?: boolean;
  onAbrir?: (abierta: boolean) => void;
  anclaRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const controlada = abierta !== undefined;
  return (
    <Collapsible
      ref={anclaRef}
      {...(controlada ? { open: abierta, onOpenChange: onAbrir } : { defaultOpen })}
      className="border-t border-border"
    >
      <CollapsibleTrigger className="w-full py-4 text-left">
        <ChevronDown aria-hidden="true" className="shrink-0 text-muted-foreground" />
        <span className="flex-1 min-w-0">
          <span className={cn(secLabelCls, 'block')}>{titulo}</span>
          {resumen && (
            <span className="block text-[11.5px] font-normal text-muted-foreground truncate">{resumen}</span>
          )}
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="pb-5 space-y-5">
          {ayuda && <p className={ayudaCls}>{ayuda}</p>}
          {children}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/** Etiqueta + ayuda + control, sin caja propia. §14: nada de un borde por campo. */
function Campo({
  label,
  ayuda,
  hint,
  error,
  children,
}: {
  label: string;
  ayuda?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <p className={cn(campoLabelCls, 'flex items-center gap-1.5 mb-0.5')}>
        {label}
        {hint}
      </p>
      {ayuda && (
        <p className={cn(ayudaCls, 'mb-1.5')} id={`${id}-ayuda`}>
          {ayuda}
        </p>
      )}
      {children}
      {error && (
        <p role="alert" className="mt-1.5 text-[11.5px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Una regla que por defecto pone el estudio.
 *
 * Heredada enseña el valor REAL del estudio, no un hueco vacío: "Ajuste del
 * estudio: hasta 12 horas antes" se entiende sin abrir otra pestaña.
 * "Personalizar" revela el control ya relleno con ese mismo valor —para editar
 * desde donde estaba, no desde cero— y "Volver al ajuste del estudio" deshace,
 * que es exactamente devolver el campo a `null`.
 */
function CampoHeredado({
  label,
  ayuda,
  hint,
  heredado,
  onHeredar,
  onPersonalizar,
  resumenEstudio,
  error,
  children,
}: {
  label: string;
  ayuda?: React.ReactNode;
  hint?: React.ReactNode;
  heredado: boolean;
  onHeredar: () => void;
  onPersonalizar: () => void;
  resumenEstudio: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <Campo label={label} ayuda={ayuda} hint={hint} error={heredado ? null : error}>
      {heredado ? (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2">
          <p className="min-w-0 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">Ajuste del estudio:</span> {resumenEstudio}
          </p>
          {/* El nombre accesible lleva el campo: con 8 reglas heredadas, ocho
              botones llamados solo "Personalizar" son indistinguibles en un
              lector de pantalla (y en un test). */}
          <button
            type="button"
            onClick={onPersonalizar}
            aria-label={`Personalizar: ${label}`}
            className="shrink-0 text-[12px] font-semibold text-brand hover:underline"
          >
            Personalizar
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {children}
          <button
            type="button"
            onClick={onHeredar}
            aria-label={`Volver al ajuste del estudio: ${label}`}
            className="block text-[11.5px] text-muted-foreground hover:text-foreground hover:underline"
          >
            Volver al ajuste del estudio
          </button>
        </div>
      )}
    </Campo>
  );
}

/**
 * Sí / No para un override booleano ya personalizado.
 *
 * Es el MISMO control que la duración o el nivel a propósito: el primer intento
 * lo pintó como un segmented gris (activo = `bg-card` sobre `bg-muted/40`) y en
 * pantalla no se distinguía cuál de las dos opciones estaba elegida — con
 * "Sí/No" eso no es un matiz estético, es no saber qué has configurado.
 */
function SiNo({
  value,
  onChange,
  etiquetaSi = 'Sí',
  etiquetaNo = 'No',
  etiquetaGrupo,
}: {
  value: Exclude<TriEstado, 'hereda'>;
  onChange: (v: Exclude<TriEstado, 'hereda'>) => void;
  etiquetaSi?: string;
  etiquetaNo?: string;
  etiquetaGrupo: string;
}) {
  return (
    <Segmentado
      etiquetaGrupo={etiquetaGrupo}
      opciones={[
        { valor: 'si' as const, label: etiquetaSi },
        { valor: 'no' as const, label: etiquetaNo },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

/** Botonera de opciones excluyentes (duración, nivel). 40px de alto: cómodo con el dedo. */
function Segmentado<T extends string | number>({
  opciones,
  value,
  onChange,
  disposicion = 'flex',
  etiquetaGrupo,
}: {
  opciones: { valor: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  disposicion?: 'flex' | 'grid';
  etiquetaGrupo: string;
}) {
  return (
    <div
      role="group"
      aria-label={etiquetaGrupo}
      className={cn(disposicion === 'grid' ? 'grid grid-cols-2 gap-1.5 sm:grid-cols-4' : 'flex flex-wrap gap-1.5')}
    >
      {opciones.map(o => (
        <button
          key={String(o.valor)}
          type="button"
          aria-pressed={value === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            'h-10 rounded-xl border px-3.5 text-[12.5px] font-semibold transition-colors',
            value === o.valor
              ? 'border-transparent bg-brand text-brand-foreground'
              : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** "Así la verá tu alumna" — lo que se está configurando, con su forma real. */
function Previsualizacion({ form, fotoUrl, logoUrl, onEditarImagenes }: {
  form: ClaseForm; fotoUrl?: string | null; logoUrl?: string | null;
  /** Sin esto la previsualización enseña dos imágenes y no dice cómo se ponen. */
  onEditarImagenes?: () => void;
}) {
  const partes = [NIVEL_LABELS[form.nivel], `${form.duracionMinutos || '—'} min`];
  const plazas = plazasSiPropias(form.aforoPorDefecto);
  if (plazas) partes.push(plazas);
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Así la verá tu alumna</p>
      {/* La FILA del horario: es donde va el logo, no el banner. Antes esta
          previsualización recortaba el banner a 48×48 y lo llamaba «así la
          verá tu alumna» — pero en la fila no salía ninguna imagen, y el
          banner solo aparece al abrir la clase. Enseñaba algo que no pasaba
          en ninguna de las dos pantallas. */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- puede ser una URL de Storage o pegada; next/image exigiría allowlist de dominios
          <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-[10px] border border-black/5 object-cover" />
        ) : (
          <span className="h-9 w-9 shrink-0 rounded-[10px] border border-dashed border-border" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-foreground">{form.nombre.trim() || 'Tu clase'}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">{partes.join(' · ')}</p>
        </div>
        <span
          className="h-3 w-3 shrink-0 rounded-full border border-black/10"
          style={{ backgroundColor: form.color }}
          aria-hidden="true"
        />
      </div>
      {/* Y el BANNER, que es lo que ve al abrirla. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- respaldo local ya optimizado, sin pasar por next/image */}
      <img
        src={imagenDeClase({ fotoUrl, nombre: form.nombre })}
        alt=""
        className="mt-2 h-20 w-full rounded-lg border border-black/5 object-cover"
      />
      {/* ⚠️ Este pie era solo un cartel, y por eso se reportó «no se puede
          agregar ni banner ni logo»: los controles SÍ existen, pero viven
          dentro de una sección plegada cuyo resumen habla de objetivos y no
          menciona ninguna imagen. Quien mira esta previsualización tiene ya la
          intención delante — el sitio del botón es aquí. */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-[10.5px] text-muted-foreground">Arriba, en el horario. Abajo, al abrir la clase.</p>
        {onEditarImagenes && (
          <button
            type="button"
            onClick={onEditarImagenes}
            className="text-[10.5px] font-semibold text-brand underline underline-offset-2 hover:opacity-80"
          >
            {logoUrl || fotoUrl ? 'Cambiar logo o banner' : 'Poner logo y banner'}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Las imágenes de banner que ya trae Tentare.
 *
 * Existen desde siempre en `public/por-defecto/` y se usaban SOLO como
 * respaldo automático adivinado por el nombre de la clase: no había forma de
 * elegir otra a mano. Una propietaria cuyo «Circuito» no case con ninguna
 * familia se quedaba con la genérica sin saber que había cinco más.
 */
function BannersPorDefecto({ actual, onElegir, ocupado }: {
  actual: string | null;
  onElegir: (url: string | null) => Promise<void>;
  ocupado: boolean;
}) {
  const opciones = Object.entries(IMAGENES_CLASE) as [FamiliaClase, string][];
  return (
    <div className="mt-2">
      <p className="mb-1.5 text-[11px] text-muted-foreground">O elige una de Tentare:</p>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map(([familia, url]) => (
          <button
            key={familia}
            type="button"
            disabled={ocupado}
            aria-pressed={actual === url}
            aria-label={`Usar el banner ${familia}`}
            onClick={() => onElegir(url)}
            className={cn(
              'h-11 w-16 overflow-hidden rounded-md border transition-colors disabled:opacity-50',
              actual === url ? 'border-brand ring-2 ring-[color-mix(in_srgb,var(--brand)_35%,transparent)]' : 'border-border hover:border-muted-foreground/50',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- respaldo local ya optimizado */}
            <img src={url} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── El panel ────────────────────────────────────────────────────────────────

export function PanelTipoClase({
  open,
  modo,
  form,
  setForm,
  studio,
  editando,
  guardando,
  errorGuardar,
  subiendoFoto,
  onSubirFoto,
  onCambiarFoto,
  subiendoLogo,
  onSubirLogo,
  onCambiarLogo,
  onGuardar,
  onCerrar,
}: {
  open: boolean;
  modo: 'nueva' | 'editar';
  form: ClaseForm;
  setForm: React.Dispatch<React.SetStateAction<ClaseForm>>;
  studio: Studio | null;
  editando: TipoClase | null;
  guardando: boolean;
  errorGuardar: string | null;
  subiendoFoto: boolean;
  onSubirFoto: (file: File) => Promise<{ url: string } | { error: string }>;
  onCambiarFoto: (url: string | null) => Promise<void>;
  subiendoLogo: boolean;
  onSubirLogo: (file: File) => Promise<{ url: string } | { error: string }>;
  onCambiarLogo: (url: string | null) => Promise<void>;
  onGuardar: () => void;
  onCerrar: () => void;
}) {
  // Los errores no saltan mientras se escribe: aparecen al intentar guardar y,
  // a partir de ahí, se corrigen en vivo. Un "Ponle un nombre" en rojo antes de
  // haber podido teclear la primera letra es ruido, no ayuda.
  const [intentado, setIntentado] = useState(false);
  // La sección de imágenes se abre también desde la previsualización, así que
  // va controlada. Se despliega Y se trae a la vista: abrirla sin desplazar
  // deja el cambio fuera de pantalla en un panel que ya viene con scroll.
  const [seccionImagenes, setSeccionImagenes] = useState(false);
  const refImagenes = useRef<HTMLDivElement>(null);
  const abrirImagenes = () => {
    setSeccionImagenes(true);
    requestAnimationFrame(() =>
      refImagenes.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };
  const zoomConectado = !!studio?.zoomEmail;

  const nombreVacio = form.nombre.trim() === '';
  const duracion = parseInt(form.duracionMinutos, 10);
  const duracionInvalida = !form.duracionMinutos.trim() || !Number.isFinite(duracion) || duracion < 5;
  const ventanaImposible = hayVentanaImposible(form);

  const errorNombre = intentado && nombreVacio ? 'Ponle un nombre a la clase — es lo primero que ve tu alumna.' : null;
  const errorDuracion = intentado && duracionInvalida ? 'Dinos cuánto dura: al menos 5 minutos.' : null;

  function intentarGuardar() {
    setIntentado(true);
    if (nombreVacio || duracionInvalida || ventanaImposible) return;
    onGuardar();
  }

  function cerrar() {
    setIntentado(false);
    onCerrar();
  }

  // Una duración fuera del atajo (por ejemplo 55) no puede desaparecer del
  // formulario: se enseña el campo libre con su valor.
  const duracionSuelta = !DURACIONES_HABITUALES.includes(duracion);

  return (
    <DashboardDrawer
      open={open}
      onClose={cerrar}
      label={modo === 'nueva' ? 'Nuevo tipo de clase' : 'Editar tipo de clase'}
      // Sin portal, `.panel-page-in` ancla el `fixed` a la caja de la página y
      // el panel sale corto y desplazado — ver el comentario de la prop.
      portal
      sheetClassName="relative w-full sm:w-[min(720px,92vw)] bg-card h-full flex flex-col shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.3)]"
    >
      {/* ─── Cabecera fija ─── */}
      <div className="flex items-start gap-3 border-b border-border px-5 pb-4 pt-5 sm:px-7">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-foreground">
            {modo === 'nueva' ? 'Nuevo tipo de clase' : 'Editar tipo de clase'}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Define cómo es esta clase y cómo la verán tus alumnas. Lo demás lo hereda de tu estudio.
          </p>
        </div>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar"
          className="-mr-1 -mt-1 shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      {/* ─── Cuerpo ─── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
        <Previsualizacion
          form={form}
          fotoUrl={editando?.fotoUrl}
          logoUrl={editando?.logoUrl}
          onEditarImagenes={modo === 'editar' ? abrirImagenes : undefined}
        />

        {/* NIVEL 1 — lo básico, siempre a la vista */}
        <div className="space-y-5 py-5">
          <Campo
            label="Nombre"
            ayuda="Como se llama en tu horario. Es lo primero que lee tu alumna."
            error={errorNombre}
          >
            <input
              className={cn(inputCls, errorNombre && 'border-destructive')}
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: Reformer Avanzado"
              aria-label="Nombre de la clase"
              aria-invalid={!!errorNombre}
            />
          </Campo>

          <Campo
            label="¿Cuánto dura?"
            ayuda="La duración de partida. Al programarla en la agenda puedes ajustarla."
            error={errorDuracion}
          >
            <Segmentado
              etiquetaGrupo="Duración de la clase"
              opciones={DURACIONES_HABITUALES.map(d => ({ valor: d, label: `${d} min` }))}
              value={duracionSuelta ? null : duracion}
              onChange={v => setForm(f => ({ ...f, duracionMinutos: String(v) }))}
            />
            {duracionSuelta ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  className={cn(inputCls, 'w-28', errorDuracion && 'border-destructive')}
                  type="number"
                  min={5}
                  step={5}
                  value={form.duracionMinutos}
                  onChange={e => setForm(f => ({ ...f, duracionMinutos: e.target.value }))}
                  aria-label="Duración en minutos"
                  aria-invalid={!!errorDuracion}
                  autoFocus
                />
                <span className="text-[12.5px] text-muted-foreground">minutos</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, duracionMinutos: '' }))}
                className="mt-2 text-[11.5px] text-muted-foreground hover:text-foreground hover:underline"
              >
                Otra duración
              </button>
            )}
          </Campo>

          <Campo label="¿A quién va dirigida?" ayuda="Orienta a tu alumna sobre si le encaja. No le impide reservar.">
            <Segmentado
              etiquetaGrupo="Nivel de la clase"
              disposicion="grid"
              opciones={(Object.keys(NIVEL_LABELS) as TipoClase['nivel'][]).map(n => ({
                valor: n,
                label: NIVEL_LABELS[n],
              }))}
              value={form.nivel}
              onChange={v => setForm(f => ({ ...f, nivel: v }))}
            />
          </Campo>

          <Campo
            label="¿Cuántas alumnas caben?"
            ayuda="Las plazas con las que sale cada sesión. Si lo dejas vacío se usan las de la sala donde la programes."
          >
            <div className="flex items-center gap-2">
              <input
                className={cn(inputCls, 'w-28')}
                type="number"
                min={1}
                max={300}
                placeholder="Las de la sala"
                value={form.aforoPorDefecto}
                onChange={e => setForm(f => ({ ...f, aforoPorDefecto: e.target.value }))}
                aria-label="Plazas por defecto"
              />
              <span className="text-[12.5px] text-muted-foreground">{resumenAforo(form.aforoPorDefecto)}</span>
            </div>
          </Campo>

          <Campo label="Color" ayuda="Para distinguirla de un vistazo en la agenda.">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-border p-0.5"
                aria-label="Color de la clase"
              />
              <input
                className={cn(inputCls, 'w-32 font-mono')}
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                maxLength={7}
                aria-label="Color en hexadecimal"
              />
            </div>
          </Campo>
        </div>

        {/* NIVEL 2 — cómo la encuentran */}
        <Seccion
          titulo="Imágenes y cómo la encuentran tus alumnas"
          ayuda="Lo que ve quien entra en tu página de reservas sin conocer todavía tu estudio."
          abierta={seccionImagenes}
          onAbrir={setSeccionImagenes}
          anclaRef={refImagenes}
          resumen={
            // El resumen es la única pista de lo que hay dentro cuando está
            // plegada. Antes solo hablaba de objetivos, así que el logo y el
            // banner no se mencionaban en ninguna parte de la pantalla salvo
            // en una previsualización que no se podía tocar.
            [
              modo === 'editar'
                ? [editando?.logoUrl && 'con logo', editando?.fotoUrl && 'con banner']
                    .filter(Boolean).join(' · ') || 'sin logo ni banner'
                : null,
              form.objetivos.length > 0
                ? `${form.objetivos.length} objetivo${form.objetivos.length === 1 ? '' : 's'}`
                : 'todos los objetivos',
              form.descripcion.trim() ? 'con descripción' : null,
            ].filter(Boolean).join(' · ')
          }
        >
          {/* La foto necesita el id de la clase para subirse a Storage, así que
              solo aparece al editar — enseñar un campo inservible al crear era
              peor que no enseñarlo (P4). */}
          {modo === 'editar' && (
            <>
              <Campo
                label="Logo"
                ayuda="El icono cuadrado que acompaña a esta clase en el horario de tus alumnas. Si no pones ninguno, la fila se queda sin icono — mejor eso que el mismo dibujo repetido en todas."
              >
                <CampoImagen
                  etiqueta={`logo de ${form.nombre || 'la clase'}`}
                  valor={editando?.logoUrl}
                  onSubir={onSubirLogo}
                  onCambiar={onCambiarLogo}
                  ocupado={subiendoLogo}
                  clasePreview="w-12 h-12"
                  textoSubir="Subir logo"
                  textoCambiar="Cambiar logo"
                />
              </Campo>

              <Campo
                label="Banner"
                ayuda="La imagen ancha de cabecera al abrir la clase. Lo ideal es 1600 × 900 px."
              >
                <CampoImagen
                  etiqueta={`banner de ${form.nombre || 'la clase'}`}
                  valor={editando?.fotoUrl}
                  respaldo={imagenDeClase({ nombre: form.nombre })}
                  onSubir={onSubirFoto}
                  onCambiar={onCambiarFoto}
                  ocupado={subiendoFoto}
                  clasePreview="w-24 h-14"
                  ajuste="cover"
                  textoSubir="Subir banner"
                  textoCambiar="Cambiar banner"
                />
                <BannersPorDefecto
                  actual={editando?.fotoUrl ?? null}
                  onElegir={onCambiarFoto}
                  ocupado={subiendoFoto}
                />
              </Campo>
            </>
          )}

          <Campo
            label="¿Para qué sirve esta clase?"
            ayuda="Lo usa el asistente de tu página pública para recomendarla. Sin marcar nada, se ofrece para todo."
          >
            <div className="flex flex-wrap gap-2">
              {OBJETIVOS.map(o => {
                const activo = form.objetivos.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    title={o.ayuda}
                    aria-pressed={activo}
                    onClick={() =>
                      setForm(f => ({
                        ...f,
                        objetivos: activo ? f.objetivos.filter(x => x !== o.id) : [...f.objetivos, o.id],
                      }))
                    }
                    className={cn(
                      'rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors',
                      activo
                        ? 'border-transparent bg-brand text-brand-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </Campo>

          <Campo label="Descripción" ayuda="Qué se trabaja y para quién es. Aparece en la página de reservas.">
            <textarea
              className={cn(inputCls, 'h-20 resize-none')}
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              placeholder="Breve descripción de la clase..."
              aria-label="Descripción de la clase"
            />
          </Campo>

        </Seccion>

        {/* NIVEL 3 — reservas */}
        <Seccion
          titulo="Reservas"
          ayuda="Cuándo y cómo puede tu alumna coger sitio en esta clase. Sin tocar nada, valen las reglas de tu estudio."
          resumen={resumenSeccionReservas(form, studio)}
        >
          <CampoHeredado
            label="¿Hace falta bono o plan para reservar?"
            ayuda="Si no hace falta, cualquiera con ficha puede coger sitio y ya lo cobras tú aparte."
            heredado={form.reservaExigirPlan === 'hereda'}
            onHeredar={() => setForm(f => ({ ...f, reservaExigirPlan: 'hereda' }))}
            onPersonalizar={() =>
              setForm(f => ({ ...f, reservaExigirPlan: studio?.reservaExigirPlan === false ? 'no' : 'si' }))
            }
            resumenEstudio={resumenSiNo(studio?.reservaExigirPlan ?? true, 'sí hace falta', 'no hace falta')}
          >
            <SiNo
              etiquetaGrupo="¿Hace falta bono o plan para reservar?"
              value={form.reservaExigirPlan === 'no' ? 'no' : 'si'}
              onChange={v => setForm(f => ({ ...f, reservaExigirPlan: v }))}
              etiquetaSi="Sí hace falta"
              etiquetaNo="No hace falta"
            />
          </CampoHeredado>

          <CampoHeredado
            label="¿Hasta cuándo se puede reservar?"
            ayuda="Cuánto antes de empezar se cierra la reserva, para que te dé tiempo a preparar la sala."
            heredado={form.reservaVentanaMinimaMinutos.trim() === ''}
            onHeredar={() => setForm(f => ({ ...f, reservaVentanaMinimaMinutos: '' }))}
            onPersonalizar={() =>
              setForm(f => ({ ...f, reservaVentanaMinimaMinutos: String(studio?.reservaVentanaMinimaMinutos ?? 0) }))
            }
            resumenEstudio={resumenAntelacionMinima(studio?.reservaVentanaMinimaMinutos ?? 0)}
          >
            <div className="flex items-center gap-2">
              <input
                className={cn(inputCls, 'w-28')}
                type="number"
                min={0}
                placeholder="Ajuste del estudio"
                value={form.reservaVentanaMinimaMinutos}
                onChange={e => setForm(f => ({ ...f, reservaVentanaMinimaMinutos: e.target.value }))}
                aria-label="Antelación mínima para reservar, en minutos"
              />
              <span className="text-[12.5px] text-muted-foreground">minutos antes de empezar</span>
            </div>
          </CampoHeredado>

          <CampoHeredado
            label="¿Con cuánta antelación se abre?"
            ayuda="Cuántos días antes aparece la clase como reservable."
            heredado={form.reservaAntelacionMaximaDias.trim() === ''}
            onHeredar={() => setForm(f => ({ ...f, reservaAntelacionMaximaDias: '' }))}
            onPersonalizar={() =>
              setForm(f => ({ ...f, reservaAntelacionMaximaDias: String(studio?.reservaAntelacionMaximaDias ?? 30) }))
            }
            resumenEstudio={resumenAntelacionMaxima(studio?.reservaAntelacionMaximaDias ?? null)}
            error={
              ventanaImposible
                ? `No cuadra con el cierre de reservas: se cerraría (${form.reservaVentanaMinimaMinutos} min antes) sin haberse llegado a abrir. Nunca habría un momento válido para reservar esta clase.`
                : null
            }
          >
            <div className="flex items-center gap-2">
              <input
                className={cn(inputCls, 'w-28', ventanaImposible && 'border-destructive')}
                type="number"
                min={0}
                placeholder="Ajuste del estudio"
                value={form.reservaAntelacionMaximaDias}
                onChange={e => setForm(f => ({ ...f, reservaAntelacionMaximaDias: e.target.value }))}
                aria-label="Antelación máxima para reservar, en días"
                aria-invalid={ventanaImposible}
              />
              <span className="text-[12.5px] text-muted-foreground">días antes</span>
            </div>
          </CampoHeredado>

          <CampoHeredado
            label="¿Apruebas tú cada reserva?"
            ayuda="La reserva queda pendiente hasta que la aceptas o la rechazas desde el calendario."
            heredado={form.requiereAprobacion === 'hereda'}
            onHeredar={() => setForm(f => ({ ...f, requiereAprobacion: 'hereda' }))}
            onPersonalizar={() => setForm(f => ({ ...f, requiereAprobacion: studio?.requiereAprobacion ? 'si' : 'no' }))}
            resumenEstudio={resumenSiNo(studio?.requiereAprobacion ?? false, 'las apruebas tú', 'se confirman solas')}
          >
            <SiNo
              etiquetaGrupo="¿Apruebas tú cada reserva?"
              value={form.requiereAprobacion === 'si' ? 'si' : 'no'}
              onChange={v => setForm(f => ({ ...f, requiereAprobacion: v }))}
              etiquetaSi="Las apruebo yo"
              etiquetaNo="Se confirman solas"
            />
          </CampoHeredado>

          {/* Niveles. NO va en CampoHeredado: no hereda del estudio — que una
              clase pida autorización es propiedad suya, no una política que
              tenga un "por defecto" con sentido. */}
          <div className="rounded-xl border border-border p-3.5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.requiereAutorizacion}
                onChange={e => setForm(f => ({ ...f, requiereAutorizacion: e.target.checked }))}
                className="w-4 h-4 mt-0.5 rounded accent-brand shrink-0"
              />
              <span>
                <span className="text-[13px] font-semibold text-foreground block">Solo para alumnas autorizadas</span>
                <span className="text-[12px] text-muted-foreground block mt-0.5">
                  Para clases con nivel o requisitos. Nadie puede reservarla salvo que se la abras
                  desde su ficha, una a una. Si lo dejas apagado, la reserva cualquiera con plan.
                </span>
              </span>
            </label>
          </div>

          <CampoHeredado
            label="¿Hay lista de espera cuando se llena?"
            heredado={form.permiteListaEspera === 'hereda'}
            onHeredar={() => setForm(f => ({ ...f, permiteListaEspera: 'hereda' }))}
            onPersonalizar={() =>
              setForm(f => ({ ...f, permiteListaEspera: studio?.permiteListaEspera === false ? 'no' : 'si' }))
            }
            resumenEstudio={resumenSiNo(studio?.permiteListaEspera ?? true, 'sí, con lista de espera', 'sin lista de espera')}
          >
            <SiNo
              etiquetaGrupo="¿Hay lista de espera cuando se llena?"
              value={form.permiteListaEspera === 'no' ? 'no' : 'si'}
              onChange={v => setForm(f => ({ ...f, permiteListaEspera: v }))}
              etiquetaSi="Sí, con lista de espera"
              etiquetaNo="Sin lista de espera"
            />
          </CampoHeredado>

          {/* El plazo solo tiene sentido si hay cola. Si ESTA clase la ha
              apagado explícitamente, el campo no pinta nada — §6 del encargo:
              nada de configuraciones que no vienen a cuento. Si hereda, sí se
              enseña: el estudio puede tenerla encendida. */}
          {form.permiteListaEspera !== 'no' && (
            <CampoHeredado
              label="¿Cuánto tiempo le das para aceptar una plaza libre?"
              ayuda="Cuando se libera un sitio, la primera de la cola tiene ese rato para confirmar antes de que pase a la siguiente."
              heredado={form.listaEsperaPlazoAceptacionMinutos.trim() === ''}
              onHeredar={() => setForm(f => ({ ...f, listaEsperaPlazoAceptacionMinutos: '' }))}
              onPersonalizar={() =>
                setForm(f => ({
                  ...f,
                  listaEsperaPlazoAceptacionMinutos: String(studio?.listaEsperaPlazoAceptacionMinutos ?? 0),
                }))
              }
              resumenEstudio={resumenPlazoEspera(studio?.listaEsperaPlazoAceptacionMinutos ?? 0)}
            >
              <div className="flex items-center gap-2">
                <input
                  className={cn(inputCls, 'w-28')}
                  type="number"
                  min={0}
                  placeholder="Ajuste del estudio"
                  value={form.listaEsperaPlazoAceptacionMinutos}
                  onChange={e => setForm(f => ({ ...f, listaEsperaPlazoAceptacionMinutos: e.target.value }))}
                  aria-label="Plazo para aceptar una plaza liberada, en minutos"
                />
                <span className="text-[12.5px] text-muted-foreground">minutos · 0 = se le asigna al instante</span>
              </div>
            </CampoHeredado>
          )}

          <CampoHeredado
            label="¿Cuántas alumnas hacen falta para que la clase salga?"
            ayuda="Si a 2 horas del inicio no se llega, la clase se cancela sola y se les devuelve la sesión."
            heredado={form.minimoAsistentesPorClase.trim() === ''}
            onHeredar={() => setForm(f => ({ ...f, minimoAsistentesPorClase: '' }))}
            onPersonalizar={() =>
              setForm(f => ({ ...f, minimoAsistentesPorClase: String(studio?.minimoAsistentesPorClase ?? 0) }))
            }
            resumenEstudio={resumenMinimoAsistentes(studio?.minimoAsistentesPorClase ?? 0)}
          >
            <div className="flex items-center gap-2">
              <input
                className={cn(inputCls, 'w-28')}
                type="number"
                min={0}
                placeholder="Ajuste del estudio"
                value={form.minimoAsistentesPorClase}
                onChange={e => setForm(f => ({ ...f, minimoAsistentesPorClase: e.target.value }))}
                aria-label="Mínimo de asistentes para mantener la clase"
              />
              <span className="text-[12.5px] text-muted-foreground">alumnas · 0 = sin mínimo</span>
            </div>
          </CampoHeredado>
        </Seccion>

        {/* NIVEL 3 — cancelaciones */}
        <Seccion
          titulo="Si cancelan o no vienen"
          ayuda="Qué pasa cuando una alumna avisa tarde, o directamente no aparece."
          resumen={resumenSeccionCancelaciones(form, studio)}
        >
          <CampoHeredado
            label="¿Hasta cuándo puede cancelar sin perder la sesión?"
            heredado={form.ventanaCancelacionHoras.trim() === ''}
            onHeredar={() => setForm(f => ({ ...f, ventanaCancelacionHoras: '' }))}
            onPersonalizar={() =>
              setForm(f => ({ ...f, ventanaCancelacionHoras: String(studio?.cancelacionVentanaHoras ?? 12) }))
            }
            resumenEstudio={resumenHoras(studio?.cancelacionVentanaHoras ?? 12)}
          >
            <div className="flex items-center gap-2">
              <input
                className={cn(inputCls, 'w-28')}
                type="number"
                min={0}
                placeholder="Ventana del estudio"
                value={form.ventanaCancelacionHoras}
                onChange={e => setForm(f => ({ ...f, ventanaCancelacionHoras: e.target.value }))}
                aria-label="Ventana de cancelación, en horas"
              />
              <span className="text-[12.5px] text-muted-foreground">horas antes de la clase</span>
            </div>
          </CampoHeredado>

          <CampoHeredado
            label="¿Se le cobra algo por cancelar tarde o no venir?"
            hint={
              <InfoTip label="Qué implica poner un importe aquí">
                Se cobra a la tarjeta guardada de la socia, si tiene una. Aquí solo cambias el IMPORTE para este
                tipo de clase: a qué motivos se aplica (tardía, no-show, o ambos) y si el cobro es automático o
                espera tu aprobación se decide en Configuración → Estudio → Reservas y cancelaciones, y afecta
                también a esta clase.
              </InfoTip>
            }
            heredado={form.penalizacionImporteEur.trim() === ''}
            onHeredar={() => setForm(f => ({ ...f, penalizacionImporteEur: '' }))}
            onPersonalizar={() =>
              setForm(f => ({ ...f, penalizacionImporteEur: String(studio?.penalizacionImporteEur ?? 0) }))
            }
            resumenEstudio={resumenPenalizacion(studio?.penalizacionImporteEur ?? null)}
          >
            <div className="flex items-center gap-2">
              <input
                className={cn(inputCls, 'w-28')}
                type="number"
                min={0}
                step="0.01"
                placeholder="Ajuste del estudio"
                value={form.penalizacionImporteEur}
                onChange={e => setForm(f => ({ ...f, penalizacionImporteEur: e.target.value }))}
                aria-label="Penalización en euros"
              />
              <span className="text-[12.5px] text-muted-foreground">€ · 0 = no se cobra nada</span>
            </div>
          </CampoHeredado>
        </Seccion>

        {/* NIVEL 4 — online */}
        <Seccion titulo="Clase online" resumen={form.esOnline ? 'Se da por Zoom' : 'Presencial'}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={campoLabelCls}>Esta clase se da online</p>
              <p className={ayudaCls}>
                {zoomConectado
                  ? 'Cada sesión tendrá su propio enlace de Zoom, generado automáticamente.'
                  : 'Necesitas conectar tu cuenta de Zoom en Configuración → Integraciones.'}
              </p>
            </div>
            <div className="shrink-0 pt-0.5">
              <Toggle
                on={form.esOnline}
                onChange={v => zoomConectado && setForm(f => ({ ...f, esOnline: v }))}
                ariaLabel="Esta clase se da online"
              />
            </div>
          </div>
          {!zoomConectado && !form.esOnline && (
            <p className="text-[11.5px] text-muted-foreground">No disponible sin Zoom conectado.</p>
          )}
        </Seccion>

        {/* NIVEL 4 — instructoras / Network */}
        <Seccion
          titulo="Instructoras y sustituciones"
          ayuda="Solo entra en juego cuando te falta instructora para esta clase y quieres que Tentare te sugiera a alguien de fuera de tu equipo."
          resumen={
            form.especialidadNetwork
              ? `Busca ${ESPECIALIDAD_LABEL[form.especialidadNetwork]} en Network`
              : 'No sugiere a nadie de Network'
          }
        >
          <Campo
            label="¿Qué especialidad es, para Tentare Network?"
            ayuda="Sin elegir ninguna, esta clase no sugiere a nadie de fuera de tu equipo."
          >
            <select
              className={inputCls}
              value={form.especialidadNetwork}
              onChange={e =>
                setForm(f => ({ ...f, especialidadNetwork: e.target.value as ClaseForm['especialidadNetwork'] }))
              }
              aria-label="Especialidad en Tentare Network"
            >
              <option value="">Sin mapear (no sugiere Network)</option>
              {ESPECIALIDADES_NETWORK.map(e => (
                <option key={e} value={e}>
                  {ESPECIALIDAD_LABEL[e]}
                </option>
              ))}
            </select>
          </Campo>
        </Seccion>

        {/* Qué productos sirven para esta clase se decide desde el PLAN
            (`plan_tipos_clase`), no desde aquí: el dato vive del otro lado de
            la relación y duplicar el editor daría dos sitios donde cambiar lo
            mismo. Se dice dónde está, que es lo que faltaba. */}
        <div className="flex items-start gap-2 border-t border-border pt-4">
          <Sparkles size={13} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className={ayudaCls}>
            Qué bonos y planes sirven para esta clase se decide en{' '}
            <span className="font-medium text-foreground">Configuración → Planes</span>, desde cada plan. Un bono
            sin clases marcadas vale para todas.
          </p>
        </div>
      </div>

      {/* ─── Pie fijo ─── */}
      <div className="border-t border-border bg-card px-5 py-3.5 sm:px-7">
        {errorGuardar && (
          <p role="alert" className="mb-2.5 text-[12.5px] text-destructive">
            No se ha guardado. {errorGuardar}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button className={cn(btnSecondary, 'flex-1 justify-center sm:flex-none')} onClick={cerrar} disabled={guardando}>
            Cancelar
          </button>
          <button
            className={cn(btnPrimary, 'flex-1 justify-center sm:flex-none')}
            onClick={intentarGuardar}
            disabled={guardando}
          >
            {guardando ? 'Guardando…' : modo === 'nueva' ? 'Crear tipo de clase' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </DashboardDrawer>
  );
}

// ─── Resúmenes de sección plegada ────────────────────────────────────────────

function resumenSeccionReservas(form: ClaseForm, studio: Studio | null): string {
  const propias = [
    form.reservaExigirPlan !== 'hereda' && (form.reservaExigirPlan === 'si' ? 'exige bono' : 'sin bono'),
    form.reservaVentanaMinimaMinutos.trim() !== '' && 'cierre propio',
    form.reservaAntelacionMaximaDias.trim() !== '' && 'apertura propia',
    form.requiereAprobacion !== 'hereda' && (form.requiereAprobacion === 'si' ? 'apruebas tú' : 'sin aprobar'),
    form.permiteListaEspera !== 'hereda' && (form.permiteListaEspera === 'si' ? 'con espera' : 'sin espera'),
    form.listaEsperaPlazoAceptacionMinutos.trim() !== '' && 'plazo propio',
    form.minimoAsistentesPorClase.trim() !== '' && 'mínimo propio',
  ].filter(Boolean) as string[];
  if (propias.length === 0) {
    return `Como el resto de tu estudio · ${resumenSiNo(studio?.reservaExigirPlan ?? true, 'con bono', 'sin bono')}`;
  }
  return `Propio de esta clase: ${propias.join(', ')}`;
}

function resumenSeccionCancelaciones(form: ClaseForm, studio: Studio | null): string {
  const propio = form.ventanaCancelacionHoras.trim() !== '' || form.penalizacionImporteEur.trim() !== '';
  const horas = resumenHoras(
    form.ventanaCancelacionHoras.trim() !== ''
      ? Number(form.ventanaCancelacionHoras)
      : studio?.cancelacionVentanaHoras ?? 12,
  );
  const importe =
    form.penalizacionImporteEur.trim() !== ''
      ? Number(form.penalizacionImporteEur)
      : studio?.penalizacionImporteEur ?? null;
  const cobro = importe && importe > 0 ? ` · ${formatEuro(importe)} si avisa tarde` : '';
  return `${propio ? '' : 'Como el resto de tu estudio: '}${horas}${cobro}`;
}
