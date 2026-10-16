'use client';

// «Contenido de tu app» v2 (decisiones 10–13 de «Mi app y mi web», aprobadas por el
// fundador el 15-oct-2026 «todas si»), tras `MI_WEB_NUEVA` (`useMiWebNueva`):
//  · «banner» pasa a «tarjeta» en todo, con su estado claro y subir/bajar el orden (10);
//  · el mensaje destacado sale arriba del inicio de su app, en una franja (11A);
//  · el tablón sale de aquí: los avisos que ya había se ofrecen como «Pasar a mensaje
//    destacado», y no se borra ninguno (12). Nada se llama «tablón»: ese es el de Comunidad;
//  · una tarjeta nueva no lleva a ningún sitio, y las pantallas de su app van por su
//    nombre (13; la base lo admite desde la migración `…_tarjeta_sin_enlace`).
// A la derecha, su app en un móvil con las piezas de verdad (`vista-app-movil.tsx`).
//
// Lo que se teclea en una tarjeta se guarda al dejar de escribir y se dice cómo ha ido
// (`useGuardadoDiferido`, #2744). El mensaje NO: ahora sí lo leen todas sus alumnas en
// cuanto se guarda, así que se guarda con su botón, nunca a medio escribir.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ChevronDown, ChevronUp, ExternalLink, Eye, Image as ImageIcon, Loader2, Megaphone, Plus, Trash2, Upload, X } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { usePermisos } from '@/lib/permisos';
import { subirBannerEstudio, eliminarBannerEstudio } from '@/lib/portal-storage';
import { esUrlImagenValida } from '@/lib/imagen-url';
import { imagenDeEstudio } from '@/lib/imagenes-por-defecto';
import { cn, hoyEnEstudio } from '@/lib/utils';
import { tarjetasDescubre } from '@/lib/student/descubre';
import { mensajeParaLaApp } from '@/lib/student/mensaje-destacado';
import {
  MAX_MENSAJE, PANTALLAS_APP, PANTALLA_POR_DEFECTO, avisoComoMensaje, enOrden, estadoTarjeta, llevaA, modoEnlace,
  moverTarjeta, webValida, type ModoEnlace, type TonoEstado,
} from '@/lib/configuracion/contenido-app';
import type { EstadoGuardado } from '@/lib/configuracion/guardado-diferido';
import type { BannerPortal, NovedadEstudio } from '@/lib/types';
import { Toggle, btnSecondary, inputCls } from '@/components/configuracion/estilos';
import { BOTON_VIVO, FONDO_VISTA_MOVIL } from '@/components/dashboard/vivo';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { useGuardadoDiferido } from '@/components/theme/usar-guardado-diferido';
import { VistaAppMovil, type TarjetaEnVista } from './vista-app-movil';

type Pildora = 'tarjetas' | 'mensaje';
type Avisar = (texto: string | null) => void;
type CamposBanner = Omit<BannerPortal, 'id' | 'studioId'>;

const TONO: Record<TonoEstado, string> = {
  sale: 'border-success/30 bg-success/10 text-success',
  futura: 'border-info/30 bg-info/10 text-foreground',
  apagada: 'border-border bg-muted text-muted-foreground',
  aviso: 'border-warning/40 bg-warning/10 text-foreground',
};
// El punto lleva el color del estado (el texto se queda legible en los dos temas):
// la que pide hacer algo —sin foto— tiene que destacar en la lista.
const PUNTO: Record<TonoEstado, string> = {
  sale: 'bg-success', futura: 'bg-info', apagada: 'bg-muted-foreground', aviso: 'bg-warning',
};

function Segmentado<T extends string>({ etiqueta, valor, opciones, onChange }: {
  etiqueta: string; valor: T; opciones: readonly { valor: T; texto: string }[]; onChange: (v: T) => void;
}) {
  // Con las flechas, como un grupo de radios; en el móvil, una columna por opción (no se parte en dos filas).
  function teclas(e: React.KeyboardEvent<HTMLDivElement>) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = (opciones.findIndex(o => o.valor === valor) + d + opciones.length) % opciones.length;
    onChange(opciones[i].valor);
    (e.currentTarget.children[i] as HTMLElement | undefined)?.focus();
  }
  return (
    <div role="radiogroup" aria-label={etiqueta} onKeyDown={teclas}
      className="grid w-full rounded-xl border border-border bg-muted/60 p-0.5 sm:inline-flex sm:w-fit"
      style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}>
      {opciones.map(o => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          tabIndex={valor === o.valor ? 0 : -1}
          onClick={() => onChange(o.valor)}
          className={cn(
            'zona-tactil min-h-10 rounded-lg px-2 text-[13px] font-medium leading-tight transition-colors sm:px-3.5',
            valor === o.valor ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

function Bloque({ titulo, ayuda, children }: { titulo: React.ReactNode; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[14px] font-semibold text-foreground">{titulo}</h4>
      {ayuda && <p className="-mt-1 text-[12.5px] text-muted-foreground">{ayuda}</p>}
      {children}
    </section>
  );
}

function Contador({ n, max }: { n: number; max: number }) {
  return <span className={cn('w-12 shrink-0 text-right font-mono text-[11.5px] tabular-nums', n > max ? 'text-destructive' : 'text-muted-foreground')}>{n}/{max}</span>;
}

// ── Una tarjeta ──────────────────────────────────────────────────────────────

function LineaEstado({ estado, frase, onReintentar }: { estado: EstadoGuardado; frase: string; onReintentar: () => void }) {
  return (
    <p role="status" aria-live="polite" data-testid="estado-guardado"
      className={cn('flex min-h-5 flex-wrap items-center gap-1.5 text-[12.5px]', estado.e === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
      {(estado.e === 'pendiente' || estado.e === 'guardando') && <><Loader2 size={13} className="animate-spin" aria-hidden />Guardando…</>}
      {(estado.e === 'guardado' || estado.e === 'quieto') && <><Check size={13} className="text-success" aria-hidden />Guardado · {frase}</>}
      {estado.e === 'error' && (
        <>No se ha guardado.
          <button type="button" onClick={onReintentar} className="font-medium underline underline-offset-2 hover:no-underline">Reintentar</button>
        </>
      )}
    </p>
  );
}

function EditorTarjeta({ banner, hoy, onVolver, onAvisar }: {
  banner: BannerPortal; hoy: string; onVolver: () => void; onAvisar: Avisar;
}) {
  const { updateBannerPortal, deleteBannerPortal, achievementDefinitions, challengeDefinitions, levelDefinitions, rewardCatalog } = useStudio();
  const idPublicar = useId();
  // Los fallos de la foto, del interruptor y de eliminar se dicen JUNTO a lo que se tocó:
  // arriba del todo quedaban fuera de vista en el móvil.
  const [falloFoto, setFalloFoto] = useState<string | null>(null);
  const [falloPublicar, setFalloPublicar] = useState<string | null>(null);
  const [falloBorrar, setFalloBorrar] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  // Logros sale vacío en su app si el estudio no tiene nada de motivación.
  const sinMotivacion = !achievementDefinitions.length && !challengeDefinitions.length && !levelDefinitions.length && !rewardCatalog.length;
  const fileRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const ultimoFallo = useRef(false);
  // Lo tecleado vive aquí (va con `key={banner.id}`); se guarda al dejar de escribir.
  const [campos, setCampos] = useState(() => ({
    titulo: banner.titulo ?? '',
    texto: banner.texto ?? '',
    modo: modoEnlace(banner) as ModoEnlace,
    pantalla: banner.linkTipo === 'interno' && banner.linkValor ? banner.linkValor : PANTALLA_POR_DEFECTO,
    web: banner.linkTipo === 'externo' ? banner.linkValor : '',
    cuando: (banner.fechaInicio || banner.fechaFin ? 'fechas' : 'siempre') as 'siempre' | 'fechas',
    desde: banner.fechaInicio ?? '',
    hasta: banner.fechaFin ?? '',
  }));
  const guardado = useGuardadoDiferido<CamposBanner>(async (cambios) => {
    const res = await updateBannerPortal(banner.id, cambios);
    ultimoFallo.current = !res.ok;
    onAvisar(res.ok ? null : res.error);
    return res;
  });
  function editar(local: Partial<typeof campos>, aGuardar: Partial<CamposBanner> | null, inmediato = false) {
    setCampos(prev => ({ ...prev, ...local }));
    if (aGuardar) guardado.cambiar(aGuardar, inmediato);
  }

  // Al abrir la ficha, el foco y la vista van a su título: el control que se pulsó ya no existe.
  const tituloRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    tituloRef.current?.focus({ preventScroll: true });
    tituloRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  const conFoto = esUrlImagenValida(banner.imagenUrl);
  const estado = estadoTarjeta(banner, hoy);
  const fechasAlReves = campos.cuando === 'fechas' && !!campos.desde && !!campos.hasta && campos.hasta < campos.desde;
  const pantallaConocida = PANTALLAS_APP.some(p => p.ruta === campos.pantalla);

  function cambiarModo(m: ModoEnlace) {
    if (m === 'nada') return editar({ modo: m }, { linkTipo: 'ninguno', linkValor: '' }, true);
    if (m === 'app') return editar({ modo: m }, { linkTipo: 'interno', linkValor: campos.pantalla }, true);
    // Una web solo se guarda entera (la base exige `https://`): mientras, no lleva a ningún sitio.
    return editar({ modo: m }, webValida(campos.web) ? { linkTipo: 'externo', linkValor: campos.web.trim() } : { linkTipo: 'ninguno', linkValor: '' }, true);
  }

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubiendo(true);
    setFalloFoto(null);
    const r = await subirBannerEstudio(banner.id, file);
    if ('error' in r) { setSubiendo(false); setFalloFoto(r.error); return; }
    const res = await updateBannerPortal(banner.id, { imagenUrl: r.url });
    setSubiendo(false);
    setFalloFoto(res.ok ? null : res.error);
  }

  async function quitarFoto() {
    // Sin foto no sale: se apaga en la misma escritura, para no dejarla «publicada» sin salir.
    setSubiendo(true);
    setFalloFoto(null);
    const res = await updateBannerPortal(banner.id, { imagenUrl: '', activo: false });
    setSubiendo(false);
    if (!res.ok) { setFalloFoto(res.error); return; }
    void eliminarBannerEstudio(banner.id);
  }

  // El interruptor escribe solo, sin la cola de lo tecleado (otra columna), y enseña lo
  // que confirma el servidor: nada optimista.
  async function publicar(v: boolean) {
    setPublicando(true);
    setFalloPublicar(null);
    const res = await updateBannerPortal(banner.id, { activo: v });
    setPublicando(false);
    if (!res.ok) setFalloPublicar(res.error);
  }

  async function eliminar() {
    setBorrar(false);
    await guardado.esperar();
    setFalloBorrar(null);
    const res = await deleteBannerPortal(banner.id);
    if (!res.ok) { setFalloBorrar(res.error); return; }
    // La foto, después de la fila: si borrar la fila fallara, la tarjeta seguiría con su foto.
    void eliminarBannerEstudio(banner.id);
    onVolver();
  }

  async function listo() {
    await guardado.esperar();
    if (!ultimoFallo.current) onVolver();
  }

  return (
    <div className="space-y-6" data-testid="editor-tarjeta">
      <div>
        <button type="button" onClick={() => void listo()} className="zona-tactil -ml-2 inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-[13.5px] font-medium text-foreground hover:bg-muted">
          <ArrowLeft size={16} aria-hidden /> Tus tarjetas
        </button>
        <h3 ref={tituloRef} tabIndex={-1} className="mt-2 scroll-mt-28 text-[22px] font-semibold tracking-tight text-foreground outline-none">{campos.titulo.trim() || 'Nueva tarjeta'}</h3>
        <LineaEstado estado={guardado.estado} frase={estado.frase} onReintentar={guardado.vaciar} />
      </div>

      <Bloque titulo="La foto" ayuda="Vertical o cuadrada, de tu sala o de una clase, mejor sin texto encima: el título va sobre ella.">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-[134px] w-[118px] shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-border bg-muted">
            {subiendo ? <Loader2 size={18} className="animate-spin text-muted-foreground" aria-hidden />
              // eslint-disable-next-line @next/next/no-img-element -- la foto que subió el estudio
              : conFoto ? <img src={banner.imagenUrl} alt="" className="h-full w-full object-cover" />
                : <ImageIcon size={22} className="text-muted-foreground" aria-hidden />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
            <button type="button" className={cn(btnSecondary, 'inline-flex items-center gap-1.5')} disabled={subiendo} onClick={() => fileRef.current?.click()}>
              <Upload size={14} aria-hidden /> {conFoto ? 'Cambiar la foto' : 'Subir una foto'}
            </button>
            {conFoto && (
              <button type="button" disabled={subiendo} onClick={() => void quitarFoto()} className="text-[13px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                Quitar la foto
              </button>
            )}
            <p className="text-[12px] text-muted-foreground">JPG, PNG o WEBP, hasta 2 MB. Se ve recortada a la forma de la tarjeta, como en la vista previa.</p>
            {!conFoto && <p className="text-[12.5px] font-medium text-foreground">Sin foto no sale en su app: allí la foto es la tarjeta.</p>}
            {falloFoto && <p role="alert" className="text-[12.5px] font-medium text-destructive">{falloFoto}</p>}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void subirFoto(e)} className="hidden" aria-label="Foto de la tarjeta" />
        </div>
      </Bloque>

      <Bloque titulo="Título" ayuda="Así se lee encima de la foto.">
        <div className="flex items-center gap-2">
          <input
            className={inputCls} value={campos.titulo} maxLength={40} aria-label="Título"
            placeholder="Taller de suelo pélvico"
            onChange={e => editar({ titulo: e.target.value }, { titulo: e.target.value.trim() || null })}
            onBlur={guardado.vaciar}
          />
          <Contador n={campos.titulo.length} max={40} />
        </div>
      </Bloque>

      <Bloque titulo={<>Texto corto <span className="font-normal text-muted-foreground">(si quieres)</span></>} ayuda="Dos líneas como mucho en la app.">
        <div className="flex items-center gap-2">
          <input
            className={inputCls} value={campos.texto} maxLength={70} aria-label="Texto corto"
            placeholder="Sábado 25 · 10:00 · quedan 6 plazas"
            onChange={e => editar({ texto: e.target.value }, { texto: e.target.value.trim() || null })}
            onBlur={guardado.vaciar}
          />
          <Contador n={campos.texto.length} max={70} />
        </div>
      </Bloque>

      <Bloque titulo="Al tocarla, lleva a">
        <Segmentado<ModoEnlace>
          etiqueta="Al tocarla, lleva a"
          valor={campos.modo}
          opciones={[{ valor: 'nada', texto: 'Ningún sitio' }, { valor: 'app', texto: 'Una pantalla de su app' }, { valor: 'web', texto: 'Una web' }]}
          onChange={cambiarModo}
        />
        {campos.modo === 'nada' && <p className="text-[12.5px] text-muted-foreground">Se ve y no se puede tocar: sin flecha.</p>}
        {campos.modo === 'app' && (
          <select
            className={inputCls} aria-label="Pantalla de su app" value={campos.pantalla}
            onChange={e => editar({ pantalla: e.target.value }, { linkTipo: 'interno', linkValor: e.target.value }, true)}
          >
            {PANTALLAS_APP.map(p => <option key={p.ruta} value={p.ruta}>{p.nombre}</option>)}
            {!pantallaConocida && <option value={campos.pantalla}>La de antes: {campos.pantalla}</option>}
          </select>
        )}
        {campos.modo === 'app' && campos.pantalla === '/logros' && sinMotivacion && (
          <p className="text-[12.5px] text-foreground">
            Aún no tienes logros, retos ni recompensas: en su app esa pantalla diría «Tu estudio aún no ha configurado esto».{' '}
            <Link href="/configuracion?tab=motivacion&abrir=recompensas-y-logros" className="font-medium underline underline-offset-2">Crearlos</Link>
          </p>
        )}
        {campos.modo === 'web' && (
          <>
            <input
              className={cn(inputCls, campos.web && !webValida(campos.web) && 'border-destructive')}
              value={campos.web} aria-label="Dirección web" inputMode="url" placeholder="https://instagram.com/tuestudio"
              aria-invalid={!!campos.web && !webValida(campos.web)}
              onChange={e => {
                const v = e.target.value;
                editar({ web: v }, webValida(v) ? { linkTipo: 'externo', linkValor: v.trim() } : null);
              }}
              onBlur={guardado.vaciar}
            />
            <p className={cn('text-[12.5px]', campos.web && !webValida(campos.web) ? 'text-destructive' : 'text-muted-foreground')}>
              {campos.web && !webValida(campos.web)
                ? 'Escríbela entera, empezando por https://. Hasta entonces no se guarda.'
                : webValida(campos.web) ? 'Se abre en una pestaña nueva.' : 'Hasta que la escribas, no lleva a ningún sitio.'}
            </p>
          </>
        )}
      </Bloque>

      <Bloque titulo="Cuándo sale">
        <Segmentado<'siempre' | 'fechas'>
          etiqueta="Cuándo sale"
          valor={campos.cuando}
          opciones={[{ valor: 'siempre', texto: 'Siempre' }, { valor: 'fechas', texto: 'Solo unas fechas' }]}
          onChange={v => v === 'siempre'
            ? editar({ cuando: v, desde: '', hasta: '' }, { fechaInicio: null, fechaFin: null }, true)
            : editar({ cuando: v }, null)}
        />
        {campos.cuando === 'fechas' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[12.5px] text-muted-foreground">Desde
              <input type="date" className={cn(inputCls, 'mt-1')} value={campos.desde}
                onChange={e => editar({ desde: e.target.value }, { fechaInicio: e.target.value || null }, true)} />
            </label>
            <label className="block text-[12.5px] text-muted-foreground">Hasta (incluido)
              <input type="date" className={cn(inputCls, 'mt-1')} value={campos.hasta}
                onChange={e => editar({ hasta: e.target.value }, { fechaFin: e.target.value || null }, true)} />
            </label>
          </div>
        )}
        {fechasAlReves && <p role="alert" className="text-[12.5px] text-destructive">«Hasta» es antes que «Desde»: así no saldría ningún día.</p>}
      </Bloque>

      <div className="rounded-t-card border border-border bg-card px-4 py-3.5">
       <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-foreground">Que la vean en su app</p>
          <p id={idPublicar} className="text-[12.5px] text-muted-foreground">
            {!conFoto
              ? banner.activo ? 'Está encendida, pero sin foto no sale. Ponle una o apágala.' : 'Ponle una foto para poder publicarla: sin foto no sale.'
              : 'Si la apagas, se queda guardada y solo la ves tú.'}
          </p>
        </div>
        <Toggle
          on={banner.activo}
          onChange={v => void publicar(v)}
          ariaLabel="Que la vean en su app"
          describedBy={idPublicar}
          disabled={!banner.activo && !conFoto}
          ocupado={publicando}
        />
       </div>
        {falloPublicar && <p role="alert" className="mt-2 text-[12.5px] font-medium text-destructive">No se ha cambiado: {falloPublicar}</p>}
      </div>

      {falloBorrar && <p role="alert" className="text-[12.5px] font-medium text-destructive">No se ha eliminado: {falloBorrar}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <button type="button" onClick={() => setBorrar(true)} className="zona-tactil inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-[13.5px] font-medium text-destructive hover:bg-destructive/10">
          <Trash2 size={15} aria-hidden /> Eliminar la tarjeta
        </button>
        <button type="button" onClick={() => void listo()} className={cn(BOTON_VIVO, 'h-10 px-5 text-[14px]')}>
          <Check size={15} aria-hidden /> Listo
        </button>
      </div>

      <ConfirmDialog
        open={borrar}
        onOpenChange={setBorrar}
        titulo="¿Eliminar esta tarjeta?"
        descripcion="Se quita de la app de tus alumnas. No se puede deshacer. Si solo quieres quitarla un tiempo, apaga «Que la vean en su app»."
        textoConfirmar="Eliminar"
        destructivo
        onConfirm={() => void eliminar()}
      />
    </div>
  );
}

// ── La lista ─────────────────────────────────────────────────────────────────

function ListaTarjetas({ tarjetas, hoy, creando, moviendo, enfocar, posicion, onNueva, onEditar, onMover }: {
  tarjetas: BannerPortal[]; hoy: string | null; creando: boolean; moviendo: boolean;
  /** Al volver de una ficha, el foco vuelve a su fila (o a la lista, si se borró). */
  enfocar: string | null;
  /** Lo que se anuncia tras mover una: «“Taller” es ahora la 2 de 4». */
  posicion: string | null;
  onNueva: () => void; onEditar: (id: string) => void; onMover: (id: string, d: -1 | 1) => void;
}) {
  const lista = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enfocar || !lista.current) return;
    const fila = lista.current.querySelector<HTMLElement>(`[data-fila-id="${CSS.escape(enfocar)}"]`)
      ?? lista.current.querySelector<HTMLElement>('h3');
    fila?.focus({ preventScroll: true });
    fila?.scrollIntoView({ block: 'center' });
  }, [enfocar]);
  return (
    <div className="space-y-4" ref={lista}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 tabIndex={-1} className="text-[20px] font-semibold tracking-tight text-foreground outline-none">Tus tarjetas</h3>
          <p className="max-w-[46ch] text-[13px] text-muted-foreground">Salen en este orden, de izquierda a derecha, debajo de su próxima clase.</p>
        </div>
        <button type="button" onClick={onNueva} disabled={creando} className={cn(BOTON_VIVO, 'h-10 px-4 text-[14px] disabled:opacity-60')}>
          {creando ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Plus size={15} aria-hidden />} Nueva tarjeta
        </button>
      </div>
      <ol className="space-y-2" aria-label="Tus tarjetas, en orden">
        {tarjetas.map((t, i) => {
          const e = hoy ? estadoTarjeta(t, hoy) : null;
          const nombre = t.titulo?.trim() || 'Tarjeta sin título';
          const conFoto = esUrlImagenValida(t.imagenUrl);
          return (
            <li key={t.id} className="flex items-center gap-2 rounded-t-card border border-border bg-card p-2 pr-3" data-testid="fila-tarjeta">
              <div className="flex shrink-0 flex-col">
                {/* `aria-disabled` mientras se guarda: con `disabled` el botón perdía el foco y había que volver a tabular. */}
                <button type="button" aria-label={`Subir «${nombre}»`} disabled={i === 0} aria-disabled={moviendo || undefined}
                  data-mover={`${t.id}:-1`} onClick={() => { if (!moviendo) onMover(t.id, -1); }}
                  className="zona-tactil flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-25 aria-disabled:opacity-50">
                  <ChevronUp size={16} aria-hidden />
                </button>
                <button type="button" aria-label={`Bajar «${nombre}»`} disabled={i === tarjetas.length - 1} aria-disabled={moviendo || undefined}
                  data-mover={`${t.id}:1`} onClick={() => { if (!moviendo) onMover(t.id, 1); }}
                  className="zona-tactil flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-25 aria-disabled:opacity-50">
                  <ChevronDown size={16} aria-hidden />
                </button>
              </div>
              <button type="button" data-fila-id={t.id} onClick={() => onEditar(t.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left hover:bg-muted/50">
                <span className="flex h-[52px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- la foto que subió el estudio */}
                  {conFoto ? <img src={t.imagenUrl} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={16} className="text-muted-foreground" aria-hidden />}
                </span>
                {/* El estado, debajo en el móvil y a la derecha desde `sm` (como la maqueta). */}
                <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-foreground">{nombre}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">{llevaA(t)}</span>
                  </span>
                  {e && (
                    <span className={cn('inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium', TONO[e.tono])}>
                      <span aria-hidden className={cn('h-2 w-2 rounded-full', PUNTO[e.tono])} />{e.texto}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-[12.5px] text-muted-foreground">Una tarjeta sin foto no sale en la app: allí la foto es la tarjeta.</p>
      <p role="status" aria-live="polite" className="sr-only">{posicion}</p>
    </div>
  );
}

function VacioTarjetas({ creando, onNueva }: { creando: boolean; onNueva: () => void }) {
  return (
    <div className="space-y-4" data-testid="tarjetas-vacio">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-white" style={{ background: 'var(--t-magenta-500)' }}>
        <ImageIcon size={24} aria-hidden />
      </span>
      <h3 className="text-[24px] font-semibold tracking-tight text-foreground">Pon tarjetas en el inicio de su app</h3>
      <p className="max-w-[52ch] text-[14.5px] text-muted-foreground">
        Una foto con un título, debajo de su próxima clase. Sirven para anunciar un taller, un bono o tu Instagram. Si no pones ninguna, esa parte no sale en su app.
      </p>
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ejemplos</p>
        <ul className="space-y-2 text-[13.5px] text-foreground">
          {[
            ['Taller de suelo pélvico el sábado', 'y, al tocarla, a reservar.'],
            ['Bono de 10 clases con un 10 % menos', 'y, al tocarla, a comprarlo.'],
            ['Síguenos en Instagram', 'y, al tocarla, a tu perfil.'],
          ].map(([b, r]) => (
            <li key={b} className="flex items-start gap-2">
              <Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden /><span><b className="font-semibold">{b}</b> {r}</span>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={onNueva} disabled={creando} className={cn(BOTON_VIVO, 'h-11 px-5 text-[14px] disabled:opacity-60')}>
        {creando ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Plus size={15} aria-hidden />} Crear mi primera tarjeta
      </button>
    </div>
  );
}

// ── El mensaje ───────────────────────────────────────────────────────────────

function EditorMensaje({ guardado, borrador, onBorrador, estado, onGuardar, onQuitar, avisos, onPasar, onDeshacerPaso, textareaRef, pasado }: {
  guardado: string | null; borrador: string; onBorrador: (v: string) => void;
  estado: 'quieto' | 'guardando' | 'guardado';
  onGuardar: () => void; onQuitar: () => void;
  avisos: NovedadEstudio[]; onPasar: (a: NovedadEstudio) => void;
  /** Vuelve al texto que había antes de pasar el aviso. */
  onDeshacerPaso: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  pasado: string | null;
}) {
  const limpio = mensajeParaLaApp(borrador);
  const cambiado = limpio !== guardado;
  const [quitar, setQuitar] = useState(false);
  return (
    <div className="space-y-5" data-testid="editor-mensaje">
      <div>
        <h3 className="text-[20px] font-semibold tracking-tight text-foreground">Un mensaje para todas tus alumnas</h3>
        <p className="max-w-[56ch] text-[13.5px] text-muted-foreground">
          Sale arriba en el inicio de su app, justo debajo de la foto de portada, mientras tenga texto. Para algo puntual: un cierre, un cambio de horario, una bienvenida.
        </p>
      </div>
      <Bloque titulo="El mensaje">
        <textarea
          ref={textareaRef}
          rows={4}
          className={cn(inputCls, 'min-h-28 resize-y [@media(pointer:fine)]:min-h-28')}
          value={borrador}
          maxLength={MAX_MENSAJE}
          aria-label="Mensaje destacado"
          placeholder="Este mes estrenamos horario de mañana los sábados."
          onChange={e => onBorrador(e.target.value)}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-muted-foreground">Mejor corto: en el móvil se lee entero, y uno largo empuja hacia abajo todo su inicio.</span>
          <Contador n={borrador.length} max={MAX_MENSAJE} />
        </div>
        {pasado && cambiado && (
          <p role="status" className="text-[12.5px] font-medium text-foreground">
            Lo tienes aquí: revísalo y guárdalo para que salga en su app.{' '}
            <button type="button" onClick={onDeshacerPaso} className="font-medium underline underline-offset-2 hover:no-underline">Deshacer</button>
          </p>
        )}
      </Bloque>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        {guardado ? (
          <button type="button" onClick={() => setQuitar(true)} disabled={estado === 'guardando'} className="zona-tactil inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-[13.5px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50">
            <X size={15} aria-hidden /> Quitar el mensaje
          </button>
        ) : <span />}
        <button type="button" onClick={onGuardar} disabled={!cambiado || estado === 'guardando'} className={cn(BOTON_VIVO, 'h-10 px-5 text-[14px] disabled:pointer-events-none disabled:opacity-50')}>
          {estado === 'guardando' ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Guardando…</>
            // Sin cambios, el botón dice cómo está: con un mensaje guardado, «Guardado».
            : !cambiado && guardado ? <><Check size={15} aria-hidden /> Guardado</>
              : cambiado && !limpio ? 'Guardar sin mensaje' : 'Guardar el mensaje'}
        </button>
      </div>
      <p role="status" aria-live="polite" className="-mt-2 min-h-5 text-[12.5px] text-muted-foreground">
        {estado === 'guardado' && !cambiado ? (guardado ? 'Guardado: ya sale en su app.' : 'Quitado: ya no sale en su app.') : null}
      </p>

      <ConfirmDialog
        open={quitar}
        onOpenChange={setQuitar}
        titulo="¿Quitar el mensaje?"
        descripcion="Deja de salir en su app ahora mismo, y el texto no se guarda en ningún sitio."
        textoConfirmar="Quitar el mensaje"
        destructivo
        onConfirm={() => { setQuitar(false); onQuitar(); }}
      />

      {avisos.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4" aria-labelledby="avisos-de-antes">
          <h4 id="avisos-de-antes" className="text-[14px] font-semibold text-foreground">Avisos que escribiste antes</h4>
          <p className="text-[12.5px] text-muted-foreground">
            Tus alumnas no los ven: su app ya no tiene ese apartado. Si quieres que uno les llegue, pásalo a mensaje destacado. No se borra ninguno.
          </p>
          <ul className="space-y-2">
            {avisos.map(a => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-[16px]" aria-hidden>
                  {a.emoji || <Megaphone size={15} className="text-muted-foreground" />}
                </span>
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block truncate text-[13.5px] font-semibold text-foreground">{a.titulo}</span>
                  {a.texto && <span className="block truncate text-[12.5px] text-muted-foreground">{a.texto}</span>}
                </span>
                {limpio === mensajeParaLaApp(avisoComoMensaje(a))
                  ? <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground"><Check size={14} className="text-success" aria-hidden /> Es tu mensaje</span>
                  : <button type="button" onClick={() => onPasar(a)} className={cn(btnSecondary, 'shrink-0 rounded-full')}>Pasar a mensaje destacado</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── La pantalla ──────────────────────────────────────────────────────────────

export function ContenidoDeTuApp() {
  const { rol } = usePermisos();
  const {
    studio, bannersPortal, novedadesEstudio, contenidoPortal,
    addBannerPortal, updateBannerPortal, updateMensajeDestacado,
  } = useStudio();
  const [pildora, setPildora] = useState<Pildora>('tarjetas');
  const [editando, setEditando] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [moviendo, setMoviendo] = useState(false);
  // Solo fallos: se pinta en rojo y como `alert`.
  const [fallo, setFallo] = useState<string | null>(null);
  const [hoja, setHoja] = useState(false);
  const [enfocar, setEnfocar] = useState<string | null>(null);
  const [posicion, setPosicion] = useState<string | null>(null);
  // El día del estudio: se lee una vez al montar, no en cada render (sería impuro).
  const [hoy, setHoy] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- La hora del reloj no se puede derivar en render.
    setHoy(hoyEnEstudio());
  }, []);

  const mensajeGuardado = mensajeParaLaApp(contenidoPortal?.mensajeDestacado);
  // `null` = sin tocar: se enseña lo guardado, también si llega después de montar.
  const [editado, setBorrador] = useState<string | null>(null);
  const borrador = editado ?? contenidoPortal?.mensajeDestacado ?? '';
  const [estadoMensaje, setEstadoMensaje] = useState<'quieto' | 'guardando' | 'guardado'>('quieto');
  const [pasado, setPasado] = useState<string | null>(null);
  const antesDelPaso = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const tarjetas = useMemo(() => enOrden(bannersPortal), [bannersPortal]);
  const enEdicion = editando ? tarjetas.find(t => t.id === editando) ?? null : null;

  const crear = useCallback(async () => {
    if (creando) return;
    setCreando(true);
    const orden = tarjetas.length ? Math.max(...tarjetas.map(t => t.orden)) + 1 : 0;
    // Nace oculta, sin foto y sin llevar a ningún sitio (decisión 13): nada que nadie haya elegido.
    const res = await addBannerPortal({
      imagenUrl: '', titulo: null, texto: null, linkTipo: 'ninguno', linkValor: '', ubicacion: ['home'],
      activo: false, orden, fechaInicio: null, fechaFin: null,
    });
    setCreando(false);
    if (!res.ok) { setFallo(res.error); return; }
    setFallo(null);
    setEditando(res.id);
  }, [creando, tarjetas, addBannerPortal]);

  const mover = useCallback(async (id: string, d: -1 | 1) => {
    const cambios = moverTarjeta(tarjetas, id, d);
    if (!cambios.length) return;
    setMoviendo(true);
    // De una en una: el contexto solo cambia con lo que el servidor confirma.
    for (const c of cambios) {
      const res = await updateBannerPortal(c.id, { orden: c.orden });
      if (!res.ok) { setFallo(res.error); setMoviendo(false); return; }
    }
    setFallo(null);
    setMoviendo(false);
    // Se dice dónde ha quedado, y el foco se queda en la flecha (o en la otra, si ya no se puede mover más).
    const i = tarjetas.findIndex(t => t.id === id) + d;
    const nombre = tarjetas.find(t => t.id === id)?.titulo?.trim() || 'La tarjeta';
    setPosicion(`«${nombre}» es ahora la ${i + 1} de ${tarjetas.length}.`);
    requestAnimationFrame(() => {
      const misma = document.querySelector<HTMLButtonElement>(`[data-mover="${CSS.escape(id)}:${d}"]`);
      const otra = document.querySelector<HTMLButtonElement>(`[data-mover="${CSS.escape(id)}:${-d}"]`);
      (misma && !misma.disabled ? misma : otra)?.focus();
    });
  }, [tarjetas, updateBannerPortal]);

  async function guardarMensaje(texto: string | null) {
    setEstadoMensaje('guardando');
    const res = await updateMensajeDestacado(texto);
    if (!res.ok) { setEstadoMensaje('quieto'); setFallo(res.error); return; }
    setFallo(null);
    setBorrador(null);
    setPasado(null);
    setEstadoMensaje('guardado');
  }

  function pasarAMensaje(a: NovedadEstudio) {
    const texto = avisoComoMensaje(a);
    if (!pasado) antesDelPaso.current = borrador;
    setBorrador(texto);
    setPasado(a.id);
    setEstadoMensaje('quieto');
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  // Misma puerta que la RLS de las dos tablas (PROPIETARIO/MANAGER): la UI no es el
  // límite, pero no se enseña un editor que el servidor va a rechazar.
  if (rol !== 'PROPIETARIO' && rol !== 'MANAGER') {
    return <p className="text-[13px] text-muted-foreground">Solo la propietaria y gerencia pueden publicar contenido en la app de las alumnas.</p>;
  }

  const enVista: TarjetaEnVista[] = hoy ? tarjetas.flatMap(t => {
    const sale = estadoTarjeta(t, hoy).sale;
    if (!sale && t.id !== editando) return [];
    // La que se edita se pinta aunque hoy no salga (oculta, fuera de fechas): con su foto, sin fechas.
    const [real] = tarjetasDescubre([{ ...t, fechaInicio: null, fechaFin: null }], hoy);
    return [{ id: t.id, t: real ?? null, titulo: t.titulo ?? '', editando: t.id === editando, sale }];
  }) : [];
  const mensajeEnVista = pildora === 'mensaje' ? mensajeParaLaApp(borrador) : mensajeGuardado;
  const pie = pildora === 'mensaje'
    ? (mensajeParaLaApp(borrador) !== mensajeGuardado ? 'Así quedará al guardarlo: arriba, debajo de la foto de portada.' : 'El mensaje, arriba, debajo de la foto de portada.')
    : 'Tus tarjetas, debajo de su próxima clase. Las ocultas y las que no tienen foto no salen.';

  // En la hoja del móvil, cerrar va donde estaba «abrir su app» (arriba ya está «Ver mi app»).
  const panelVista = (cerrar?: () => void) => (
    <div
      className="flex flex-col items-center gap-3 rounded-[28px] px-4 py-6 sm:px-6"
      style={FONDO_VISTA_MOVIL}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="rounded-full bg-black/35 px-3 py-1 text-[13.5px] font-semibold text-white">Así lo ven tus alumnas</span>
        {cerrar ? (
          <button type="button" onClick={cerrar} aria-label="Cerrar"
            className="zona-tactil flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/45">
            <X size={16} aria-hidden />
          </button>
        ) : studio?.slug && (
          <a href={`/portal/${encodeURIComponent(studio.slug)}`} target="_blank" rel="noreferrer" aria-label="Abrir su app en otra pestaña"
            className="zona-tactil flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/45">
            <ExternalLink size={15} aria-hidden />
          </a>
        )}
      </div>
      <VistaAppMovil
        nombreEstudio={studio?.nombre ?? ''}
        portadaUrl={imagenDeEstudio('portada', studio?.imagenBienvenidaUrl ?? null, studio?.slug ?? null)}
        color={studio?.colorPrimario}
        mensaje={mensajeEnVista}
        tarjetas={enVista}
        foco={pildora}
        pie={pie}
      />
    </div>
  );

  const nTarjetas = tarjetas.length;
  const izquierda = pildora === 'mensaje'
    ? (
      <EditorMensaje
        guardado={mensajeGuardado}
        borrador={borrador}
        onBorrador={v => { setBorrador(v); setEstadoMensaje('quieto'); }}
        estado={estadoMensaje}
        onGuardar={() => void guardarMensaje(mensajeParaLaApp(borrador))}
        onQuitar={() => void guardarMensaje(null)}
        avisos={novedadesEstudio}
        onPasar={pasarAMensaje}
        onDeshacerPaso={() => { setBorrador(antesDelPaso.current); setPasado(null); }}
        textareaRef={textareaRef}
        pasado={pasado}
      />
    )
    : enEdicion && hoy
      ? <EditorTarjeta key={enEdicion.id} banner={enEdicion} hoy={hoy} onVolver={() => { setEnfocar(enEdicion.id); setEditando(null); }} onAvisar={setFallo} />
      : nTarjetas === 0
        ? <VacioTarjetas creando={creando} onNueva={() => void crear()} />
        : <ListaTarjetas tarjetas={tarjetas} hoy={hoy} creando={creando} moviendo={moviendo} enfocar={enfocar} posicion={posicion}
            onNueva={() => void crear()} onEditar={id => { setPosicion(null); setEditando(id); }} onMover={(id, d) => void mover(id, d)} />;

  return (
    // Abajo, sitio para el botón flotante del móvil: si no, tapa la última fila.
    <div className="space-y-5 pb-20 @4xl/config:pb-0" data-testid="contenido-de-tu-app-v2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Qué editar" className="inline-flex rounded-full bg-muted p-1">
          {([['tarjetas', nTarjetas ? `Tarjetas · ${nTarjetas}` : 'Tarjetas'], ['mensaje', 'Mensaje destacado']] as const).map(([v, texto]) => (
            <button
              key={v}
              type="button"
              aria-pressed={pildora === v}
              onClick={() => { setPildora(v); setEditando(null); }}
              className={cn('zona-tactil min-h-10 rounded-full px-4 text-[13.5px] font-semibold transition-colors',
                pildora === v ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
            >
              {texto}
            </button>
          ))}
        </div>
        {studio?.slug && (
          <a href={`/portal/${encodeURIComponent(studio.slug)}`} target="_blank" rel="noreferrer" className={cn(btnSecondary, 'inline-flex items-center gap-1.5 rounded-full')}>
            <ExternalLink size={14} aria-hidden /> Ver mi app
          </a>
        )}
      </div>

      {fallo && <p role="alert" className="text-[13px] font-medium text-destructive">{fallo}</p>}

      <div className="grid items-start gap-8 @4xl/config:grid-cols-[minmax(0,1fr)_minmax(352px,420px)]">
        <div className="min-w-0">{izquierda}</div>
        <div className="hidden @4xl/config:sticky @4xl/config:top-[calc(var(--panel-sticky-top,0px)+4rem)] @4xl/config:block">{panelVista()}</div>
      </div>

      {/* En el móvil la vista va en una hoja: a la derecha no cabe. */}
      <button
        type="button"
        onClick={() => setHoja(true)}
        className={cn(BOTON_VIVO, 'fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] left-1/2 z-30 h-11 lg:bottom-6 -translate-x-1/2 whitespace-nowrap px-5 text-[14px] shadow-lg @4xl/config:hidden')}
      >
        <Eye size={16} aria-hidden /> Ver cómo queda en su app
      </button>
      <DashboardSheet
        open={hoja}
        onClose={() => setHoja(false)}
        label="Así lo ven tus alumnas"
        sheetClassName="w-full max-w-md rounded-[30px]"
      >
        {panelVista(() => setHoja(false))}
      </DashboardSheet>
    </div>
  );
}
