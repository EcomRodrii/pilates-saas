'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { Plus, Trash2, Upload, MessageSquare, Image as ImageIcon, Megaphone, Loader2, Check } from 'lucide-react';
import { inputCls, labelCls, btnPrimary, Field, Toggle } from '@/components/configuracion/estilos';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useStudio } from '@/lib/studio-context';
import { usePermisos } from '@/lib/permisos';
import { subirBannerEstudio, eliminarBannerEstudio } from '@/lib/portal-storage';
import { esUrlImagenValida } from '@/lib/imagen-url';
import type { EstadoGuardado } from '@/lib/configuracion/guardado-diferido';
import type { BannerPortal, NovedadEstudio } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { MostrarToast } from '@/components/ui/toast';
import { useGuardadoDiferido } from './usar-guardado-diferido';

// Id fijo de la fila "Mensaje destacado" en la lista de Secciones — no es un
// banner real, así que no puede colisionar con un id de BannerPortal (uuid).
export const MENSAJE_DESTACADO_ID = 'mensaje-destacado';

// Solo se sanea (evita `javascript:` y similares) al RENDERIZAR el link en el
// portal — aquí basta con validar la forma del valor al guardar. Los links
// internos son rutas del propio portal (empiezan por "/"); los externos deben
// ser http(s).
function linkValido(tipo: BannerPortal['linkTipo'], valor: string): boolean {
  const v = valor.trim();
  // Sin enlace (lo crea el editor nuevo, tras MI_WEB_NUEVA): no hay nada que validar.
  if (tipo === 'ninguno') return true;
  if (!v) return false;
  if (tipo === 'interno') return v.startsWith('/');
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Estado + persistencia de "Contenido del portal" (mensaje destacado +
// banners), separado de la presentación para poder montarlo dentro del
// workspace único de Apariencia. Ambas entidades guardan EN VIVO campo a
// campo (sin borrador/publicar) — igual que siempre.
export function useContenidoPortalEditor() {
  const { rol } = usePermisos();
  const { contenidoPortal, bannersPortal, novedadesEstudio, updateMensajeDestacado, addBannerPortal, addNovedadEstudio } = useStudio();
  const [mensaje, setMensaje] = useState(contenidoPortal?.mensajeDestacado ?? '');
  const [guardandoMensaje, setGuardandoMensaje] = useState(false);
  // Mientras se crea uno, los dos «Añadir» se apagan: un doble toque eran dos filas.
  const [creando, setCreando] = useState<'banner' | 'aviso' | null>(null);
  // El aviso en línea distingue el acierto del fallo (P0.3): el fallo, en rojo y
  // como `alert`. Misma firma que el toast del panel, para que las piezas avisen igual.
  const [aviso, setAvisoEstado] = useState<{ texto: string; error: boolean } | null>(null);
  const setAviso: MostrarToast = useCallback((texto, opciones) => setAvisoEstado({ texto, error: opciones?.variant === 'error' }), []);

  async function handleGuardarMensaje() {
    setGuardandoMensaje(true);
    const res = await updateMensajeDestacado(mensaje.trim() || null);
    setGuardandoMensaje(false);
    if (res.ok) setAviso('Mensaje destacado guardado.');
    else setAviso(res.error, { variant: 'error' });
  }

  /** Crea el banner y devuelve su id (para abrirlo), o `null` si el servidor dijo que no. */
  async function handleNuevoBanner(): Promise<string | null> {
    if (creando) return null;
    setCreando('banner');
    const orden = bannersPortal.length > 0 ? Math.max(...bannersPortal.map(b => b.orden)) + 1 : 0;
    const res = await addBannerPortal({
      imagenUrl: '', titulo: 'Nuevo banner', texto: null,
      linkTipo: 'interno', linkValor: '/bonos', ubicacion: ['home'],
      activo: false, orden, fechaInicio: null, fechaFin: null,
    });
    setCreando(null);
    if (!res.ok) { setAviso(res.error, { variant: 'error' }); return null; }
    return res.id;
  }

  async function handleNuevaNovedad(): Promise<string | null> {
    if (creando) return null;
    setCreando('aviso');
    const res = await addNovedadEstudio({
      titulo: 'Nuevo aviso', texto: null, emoji: null,
      activo: false, fechaInicio: null, fechaFin: null,
    });
    setCreando(null);
    if (!res.ok) { setAviso(res.error, { variant: 'error' }); return null; }
    return res.id;
  }

  return {
    rol, bannersPortal, novedadesEstudio, mensaje, setMensaje, guardandoMensaje, aviso, setAviso, creando,
    handleGuardarMensaje, handleNuevoBanner, handleNuevaNovedad,
  };
}

export function ContenidoPortalList({
  hook, seleccionId, onSeleccionar,
}: {
  hook: ReturnType<typeof useContenidoPortalEditor>;
  seleccionId: string | null;
  onSeleccionar: (id: string) => void;
}) {
  const filaCls = (activa: boolean) => cn(
    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left',
    activa ? 'border-brand bg-brand/5' : 'border-border bg-card',
  );
  // «Añadir» abre lo que acaba de crear: antes lo creaba (oculto) y el panel seguía
  // en el mensaje destacado, y parecía que no había pasado nada.
  async function anadir(crear: () => Promise<string | null>) {
    const id = await crear();
    if (id) onSeleccionar(id);
  }
  return (
    <div className="space-y-3">
      {/* Dónde está el panel depende del ancho: al lado a partir de @3xl, debajo antes. */}
      <p className="text-[12.5px] text-muted-foreground">
        Elige el mensaje destacado o un banner para configurarlo{' '}
        <span className="@3xl/config:hidden">debajo</span><span className="hidden @3xl/config:inline">a la derecha</span>.
      </p>
      <div className="space-y-1.5">
        <button type="button" onClick={() => onSeleccionar(MENSAJE_DESTACADO_ID)} className={filaCls(seleccionId === MENSAJE_DESTACADO_ID)}>
          <MessageSquare size={16} className="text-muted-foreground shrink-0" />
          <span className="flex-1 text-[13px] font-medium text-foreground">Mensaje destacado</span>
        </button>
        {hook.bannersPortal.map((b) => {
          // Lo que la app de verdad enseña: publicado Y con foto (`tarjetasDescubre`).
          const conFoto = esUrlImagenValida(b.imagenUrl);
          return (
            <button key={b.id} type="button" onClick={() => onSeleccionar(b.id)} className={filaCls(seleccionId === b.id)}>
              <span className="w-8 h-8 shrink-0 rounded-md border border-border bg-muted overflow-hidden flex items-center justify-center">
                {b.imagenUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={b.imagenUrl} alt="" className="w-full h-full object-cover" />
                  : <ImageIcon size={14} className="text-muted-foreground" />}
              </span>
              <span className={cn('flex-1 text-[13px] font-medium truncate', b.activo && conFoto ? 'text-foreground' : 'text-muted-foreground/60')}>
                {b.titulo || 'Banner sin título'}
              </span>
              {!b.activo
                ? <span className="text-[10px] text-muted-foreground shrink-0">Oculto</span>
                : !conFoto && <span className="text-[10px] font-medium text-warning shrink-0">Sin foto: no sale</span>}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => void anadir(hook.handleNuevoBanner)}
        disabled={hook.creando !== null}
        className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border text-foreground disabled:opacity-60"
      >
        {hook.creando === 'banner' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} />} Añadir banner
      </button>

      {/* ⚠️ Auditoría 2026-09-22 (F-3): este texto decía «avisos de texto para
          tus clientas (horario especial, un taller, un cierre puntual)». Ni el
          tablón (`novedadesEstudio`) ni el mensaje destacado (`contenidoPortal`)
          los pinta ninguna pantalla: el `Payload` de `lib/student/catalogo.ts`
          ni siquiera declara esos campos, y `app/portal/[slug]/page.tsx:446-451`
          documenta que «Del estudio» se retiró por decisión del fundador. Los
          banners SÍ se ven (vía `getDescubre`), estos dos no. Un «cerramos el
          24» escrito aquí no lo lee nadie, y eso tiene consecuencias reales, así
          que el copy deja de prometerlo mientras no haya render. */}
      <p className="text-[12.5px] text-muted-foreground pt-2 border-t border-border">
        Tablón — notas internas del estudio. <strong className="font-semibold">Ahora mismo tus clientas no las ven</strong>:
        para un aviso que sí les llegue, usa un banner o una campaña.
      </p>
      <div className="space-y-1.5">
        {hook.novedadesEstudio.map((n) => (
          <button key={n.id} type="button" onClick={() => onSeleccionar(n.id)} className={filaCls(seleccionId === n.id)}>
            <span className="w-8 h-8 shrink-0 rounded-md border border-border bg-muted flex items-center justify-center text-[15px]">
              {n.emoji || <Megaphone size={14} className="text-muted-foreground" />}
            </span>
            <span className={cn('flex-1 text-[13px] font-medium truncate', n.activo ? 'text-foreground' : 'text-muted-foreground/60')}>
              {n.titulo}
            </span>
            {!n.activo && <span className="text-[10px] text-muted-foreground shrink-0">Oculto</span>}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void anadir(hook.handleNuevaNovedad)}
        disabled={hook.creando !== null}
        className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border text-foreground disabled:opacity-60"
      >
        {hook.creando === 'aviso' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} />} Añadir aviso
      </button>
      {/* El aviso lo pinta UNA vez quien monta la lista (tab-descubre), encima de
          lista y panel: aquí salía repetido en la misma pantalla. */}
    </div>
  );
}

function MensajeDestacadoPanel({ hook }: { hook: ReturnType<typeof useContenidoPortalEditor> }) {
  return (
    <div className="space-y-3">
      <p className={labelCls}>Mensaje destacado</p>
      {/* Decía «Se muestra al final de la pantalla de Inicio del portal»: ninguna
          pantalla de su app lo pinta (lo lleva el payload público, pero no lo lee
          nadie). Si algún día se enseña, este texto cambia con esa pantalla. */}
      <p className="text-xs text-muted-foreground -mt-1">
        Hoy su app no enseña el mensaje destacado: lo que escribas se guarda, pero no lo ve nadie.
      </p>
      <textarea
        className={cn(inputCls, 'min-h-20')}
        value={hook.mensaje}
        onChange={e => hook.setMensaje(e.target.value)}
        placeholder="Ej. Este mes estrenamos horario de mañana los sábados."
        maxLength={280}
      />
      <button type="button" className={btnPrimary} disabled={hook.guardandoMensaje} onClick={hook.handleGuardarMensaje}>
        {hook.guardandoMensaje ? 'Guardando…' : 'Guardar mensaje'}
      </button>
    </div>
  );
}

// Cómo va lo que se teclea: «Guardado» solo cuando el servidor dice que sí. El motivo
// de un fallo lo da el aviso en rojo de arriba (`alert`); aquí, que no se guardó y cómo
// volver a intentarlo.
function LineaGuardado({ estado, onReintentar }: { estado: EstadoGuardado; onReintentar: () => void }) {
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="estado-guardado"
      className={cn('flex min-h-5 items-center gap-1.5 text-[12px]', estado.e === 'error' ? 'text-destructive' : 'text-muted-foreground')}
    >
      {(estado.e === 'pendiente' || estado.e === 'guardando') && <><Loader2 size={12} className="animate-spin" aria-hidden />Guardando…</>}
      {estado.e === 'guardado' && <><Check size={12} className="text-success" aria-hidden />Guardado</>}
      {estado.e === 'error' && (
        <>
          No se ha guardado.
          <button type="button" onClick={onReintentar} className="font-medium underline underline-offset-2 hover:no-underline">Reintentar</button>
        </>
      )}
    </p>
  );
}

type CamposBanner = Omit<BannerPortal, 'id' | 'studioId'>;

function BannerPanel({ banner, onToast }: { banner: BannerPortal; onToast: MostrarToast }) {
  const { updateBannerPortal, deleteBannerPortal } = useStudio();
  const [subiendo, setSubiendo] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const idPublicar = useId();

  // Lo que se teclea vive AQUÍ, no en el contexto. Antes cada tecla mandaba una
  // escritura y el campo enseñaba el valor del contexto, que solo cambia cuando
  // vuelve el servidor: mientras tanto React pintaba el viejo y la tecla siguiente
  // se añadía sobre él, y escribiendo deprisa se comían letras. Ahora se manda al
  // dejar de escribir (`useGuardadoDiferido`), de una en una, y se dice cómo ha ido.
  // El panel va con `key={banner.id}`: cambiar de banner empieza de cero.
  const [campos, setCampos] = useState(() => ({
    titulo: banner.titulo ?? '',
    texto: banner.texto ?? '',
    linkTipo: banner.linkTipo,
    linkValor: banner.linkValor,
    fechaInicio: banner.fechaInicio ?? '',
    fechaFin: banner.fechaFin ?? '',
  }));
  const guardado = useGuardadoDiferido<CamposBanner>(async (cambios) => {
    const res = await updateBannerPortal(banner.id, cambios);
    // Sin esto, un fallo de red/RLS se perdía en silencio y se creía guardado.
    if (!res.ok) onToast(res.error, { variant: 'error' });
    return res;
  });
  function editar(local: Partial<typeof campos>, aGuardar: Partial<CamposBanner>, inmediato = false) {
    setCampos(prev => ({ ...prev, ...local }));
    guardado.cambiar(aGuardar, inmediato);
  }

  // La app solo enseña un banner publicado CON foto (`tarjetasDescubre` descarta el
  // resto): sin foto no se deja publicar, porque la fila lo contaría y no saldría.
  const conFoto = esUrlImagenValida(banner.imagenUrl);
  const textoPublicar = banner.activo
    ? conFoto ? 'Publicado en su app' : 'Publicado, pero sin foto no sale en su app'
    : conFoto ? 'Oculto: publícalo para que salga en su app' : 'Ponle una foto para poder publicarlo';

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubiendo(true);
    const r = await subirBannerEstudio(banner.id, file);
    if ('error' in r) { setSubiendo(false); onToast(r.error, { variant: 'error' }); return; }
    const res = await updateBannerPortal(banner.id, { imagenUrl: r.url });
    setSubiendo(false);
    if (!res.ok) onToast(res.error, { variant: 'error' });
  }

  async function handleEliminar() {
    setConfirmDel(false);
    // Lo que quedara por guardar sale antes: después ya no habría fila sobre la que escribir.
    await guardado.esperar();
    await eliminarBannerEstudio(banner.id);
    const res = await deleteBannerPortal(banner.id);
    if (!res.ok) onToast(res.error, { variant: 'error' });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={subiendo}
          aria-label={conFoto ? 'Cambiar la foto' : 'Subir la foto'}
          className="w-16 h-16 shrink-0 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center"
        >
          {subiendo
            ? <Loader2 size={16} className="animate-spin text-muted-foreground" aria-hidden />
            : banner.imagenUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={banner.imagenUrl} alt="" className="w-full h-full object-cover" />
              : <Upload size={16} className="text-muted-foreground" />}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFoto} className="hidden" />
        <div className="flex flex-col items-end gap-2 shrink-0 ml-auto">
          <div className="flex items-center gap-2">
            <span id={idPublicar} className={cn('max-w-[16ch] text-right text-[12px] leading-snug', banner.activo && !conFoto ? 'font-medium text-warning' : 'text-muted-foreground')}>
              {textoPublicar}
            </span>
            {/* Apagado sin foto, salvo para apagar uno que ya estaba publicado. */}
            <Toggle
              on={banner.activo}
              onChange={v => guardado.cambiar({ activo: v }, true)}
              ariaLabel="Publicar en su app"
              describedBy={idPublicar}
              disabled={!banner.activo && !conFoto}
            />
          </div>
          <button type="button" onClick={() => setConfirmDel(true)} className="text-muted-foreground hover:text-destructive" aria-label="Eliminar banner">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <input
        className={inputCls}
        value={campos.titulo}
        placeholder="Título del banner"
        aria-label="Título del banner"
        onChange={e => editar({ titulo: e.target.value }, { titulo: e.target.value || null })}
        onBlur={guardado.vaciar}
      />
      <input
        className={inputCls}
        value={campos.texto}
        placeholder="Texto corto (opcional)"
        aria-label="Texto corto"
        onChange={e => editar({ texto: e.target.value }, { texto: e.target.value || null })}
        onBlur={guardado.vaciar}
      />
      <Field label="Enlace">
        <div className="flex gap-2">
          <select
            className={inputCls}
            value={campos.linkTipo}
            onChange={e => { const v = e.target.value as BannerPortal['linkTipo']; editar({ linkTipo: v }, { linkTipo: v }, true); }}
          >
            <option value="interno">Página interna</option>
            <option value="externo">URL externa</option>
          </select>
          <input
            className={inputCls}
            value={campos.linkValor}
            placeholder={campos.linkTipo === 'interno' ? '/bonos' : 'https://…'}
            onChange={e => editar({ linkValor: e.target.value }, { linkValor: e.target.value })}
            onBlur={guardado.vaciar}
          />
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Desde (opcional)">
          <input
            type="date" className={inputCls}
            value={campos.fechaInicio}
            onChange={e => editar({ fechaInicio: e.target.value }, { fechaInicio: e.target.value || null }, true)}
          />
        </Field>
        <Field label="Hasta (opcional)">
          <input
            type="date" className={inputCls}
            value={campos.fechaFin}
            onChange={e => editar({ fechaFin: e.target.value }, { fechaFin: e.target.value || null }, true)}
          />
        </Field>
      </div>
      {!linkValido(campos.linkTipo, campos.linkValor) && (
        <p className="text-xs text-destructive">
          {campos.linkTipo === 'interno' ? 'La página interna debe empezar por "/" (ej. /bonos).' : 'La URL externa debe empezar por http:// o https://.'}
        </p>
      )}
      <LineaGuardado estado={guardado.estado} onReintentar={guardado.vaciar} />

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        titulo="¿Eliminar este banner?"
        descripcion="Se quitará de su app. No se puede deshacer."
        textoConfirmar="Eliminar"
        destructivo
        onConfirm={handleEliminar}
      />
    </div>
  );
}

type CamposNovedad = Omit<NovedadEstudio, 'id' | 'studioId'>;

function NovedadPanel({ novedad, onToast }: { novedad: NovedadEstudio; onToast: MostrarToast }) {
  const { updateNovedadEstudio, deleteNovedadEstudio } = useStudio();
  const [confirmDel, setConfirmDel] = useState(false);
  const idActivo = useId();

  // Mismo motivo que BannerPanel: lo tecleado vive aquí y se guarda al dejar de
  // escribir, con el resultado a la vista. El panel va con `key={novedad.id}`.
  const [campos, setCampos] = useState(() => ({
    emoji: novedad.emoji ?? '',
    titulo: novedad.titulo,
    texto: novedad.texto ?? '',
    fechaInicio: novedad.fechaInicio ?? '',
    fechaFin: novedad.fechaFin ?? '',
  }));
  const guardado = useGuardadoDiferido<CamposNovedad>(async (cambios) => {
    const res = await updateNovedadEstudio(novedad.id, cambios);
    if (!res.ok) onToast(res.error, { variant: 'error' });
    return res;
  });
  function editar(local: Partial<typeof campos>, aGuardar: Partial<CamposNovedad>, inmediato = false) {
    setCampos(prev => ({ ...prev, ...local }));
    guardado.cambiar(aGuardar, inmediato);
  }

  async function handleEliminar() {
    setConfirmDel(false);
    await guardado.esperar();
    const res = await deleteNovedadEstudio(novedad.id);
    if (!res.ok) onToast(res.error, { variant: 'error' });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <input
          className={cn(inputCls, 'w-16 text-center')}
          value={campos.emoji}
          placeholder="📣"
          aria-label="Emoji del aviso"
          maxLength={4}
          onChange={e => editar({ emoji: e.target.value }, { emoji: e.target.value || null })}
          onBlur={guardado.vaciar}
        />
        <div className="flex flex-col items-end gap-2 shrink-0 ml-auto">
          <div className="flex items-center gap-2">
            {/* Decía «Aviso visible en su app»: estos avisos no los enseña ninguna
                pantalla. «Estos avisos» y no «el tablón»: el tablón de Comunidad
                (`app/portal/[slug]/comunidad`) es otra cosa, y ese sí se ve. */}
            <span id={idActivo} className="max-w-[18ch] text-right text-[12px] leading-snug text-muted-foreground">
              {novedad.activo ? 'Activo' : 'Desactivado'} · hoy su app no enseña estos avisos
            </span>
            <Toggle on={novedad.activo} onChange={v => guardado.cambiar({ activo: v }, true)} ariaLabel="Aviso activo" describedBy={idActivo} />
          </div>
          <button type="button" onClick={() => setConfirmDel(true)} className="text-muted-foreground hover:text-destructive" aria-label="Eliminar aviso">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <input
        className={inputCls}
        value={campos.titulo}
        placeholder="Título del aviso"
        aria-label="Título del aviso"
        onChange={e => editar({ titulo: e.target.value }, { titulo: e.target.value })}
        onBlur={guardado.vaciar}
      />
      <textarea
        className={cn(inputCls, 'min-h-16')}
        value={campos.texto}
        placeholder="Texto (opcional)"
        aria-label="Texto del aviso"
        onChange={e => editar({ texto: e.target.value }, { texto: e.target.value || null })}
        onBlur={guardado.vaciar}
      />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Desde (opcional)">
          <input
            type="date" className={inputCls}
            value={campos.fechaInicio}
            onChange={e => editar({ fechaInicio: e.target.value }, { fechaInicio: e.target.value || null }, true)}
          />
        </Field>
        <Field label="Hasta (opcional)">
          <input
            type="date" className={inputCls}
            value={campos.fechaFin}
            onChange={e => editar({ fechaFin: e.target.value }, { fechaFin: e.target.value || null }, true)}
          />
        </Field>
      </div>
      <LineaGuardado estado={guardado.estado} onReintentar={guardado.vaciar} />

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        titulo="¿Eliminar este aviso?"
        descripcion="Se borrará del tablón. No se puede deshacer."
        textoConfirmar="Eliminar"
        destructivo
        onConfirm={handleEliminar}
      />
    </div>
  );
}

export function ContenidoPortalPanel({
  hook, seleccionId,
}: {
  hook: ReturnType<typeof useContenidoPortalEditor>;
  seleccionId: string | null;
}) {
  if (seleccionId === MENSAJE_DESTACADO_ID) return <MensajeDestacadoPanel hook={hook} />;
  // `key`: cada ficha empieza con sus valores; al cambiar de una a otra, lo pendiente
  // de la anterior sale al desmontarse (`useGuardadoDiferido`).
  const banner = hook.bannersPortal.find(b => b.id === seleccionId);
  if (banner) return <BannerPanel key={banner.id} banner={banner} onToast={hook.setAviso} />;
  const novedad = hook.novedadesEstudio.find(n => n.id === seleccionId);
  if (novedad) return <NovedadPanel key={novedad.id} novedad={novedad} onToast={hook.setAviso} />;
  return <p className="text-[13px] text-muted-foreground">Selecciona el mensaje destacado, un banner o un aviso del tablón en la lista.</p>;
}
