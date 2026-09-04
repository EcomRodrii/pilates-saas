'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2, Upload, MessageSquare, Image as ImageIcon, Megaphone } from 'lucide-react';
import { inputCls, labelCls, btnPrimary, Field, Toggle } from '@/app/(dashboard)/configuracion/page';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useStudio } from '@/lib/studio-context';
import { usePermisos } from '@/lib/permisos';
import { subirBannerEstudio, eliminarBannerEstudio } from '@/lib/portal-storage';
import type { BannerPortal, NovedadEstudio } from '@/lib/types';
import { cn } from '@/lib/utils';

// Id fijo de la fila "Mensaje destacado" en la lista de Secciones — no es un
// banner real, así que no puede colisionar con un id de BannerPortal (uuid).
export const MENSAJE_DESTACADO_ID = 'mensaje-destacado';

// Solo se sanea (evita `javascript:` y similares) al RENDERIZAR el link en el
// portal — aquí basta con validar la forma del valor al guardar. Los links
// internos son rutas del propio portal (empiezan por "/"); los externos deben
// ser http(s).
function linkValido(tipo: BannerPortal['linkTipo'], valor: string): boolean {
  const v = valor.trim();
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
  const [aviso, setAviso] = useState<string | null>(null);

  async function handleGuardarMensaje() {
    setGuardandoMensaje(true);
    const res = await updateMensajeDestacado(mensaje.trim() || null);
    setGuardandoMensaje(false);
    setAviso(res.ok ? 'Mensaje destacado guardado.' : res.error);
  }

  async function handleNuevoBanner(): Promise<boolean> {
    const orden = bannersPortal.length > 0 ? Math.max(...bannersPortal.map(b => b.orden)) + 1 : 0;
    const res = await addBannerPortal({
      imagenUrl: '', titulo: 'Nuevo banner', texto: null,
      linkTipo: 'interno', linkValor: '/bonos', ubicacion: ['home'],
      activo: false, orden, fechaInicio: null, fechaFin: null,
    });
    if (!res.ok) { setAviso(res.error); return false; }
    return true;
  }

  async function handleNuevaNovedad(): Promise<boolean> {
    const res = await addNovedadEstudio({
      titulo: 'Nuevo aviso', texto: null, emoji: null,
      activo: false, fechaInicio: null, fechaFin: null,
    });
    if (!res.ok) { setAviso(res.error); return false; }
    return true;
  }

  return {
    rol, bannersPortal, novedadesEstudio, mensaje, setMensaje, guardandoMensaje, aviso, setAviso,
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
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted-foreground">
        Elige el mensaje destacado o un banner para configurarlo a la derecha.
      </p>
      <div className="space-y-1.5">
        <button type="button" onClick={() => onSeleccionar(MENSAJE_DESTACADO_ID)} className={filaCls(seleccionId === MENSAJE_DESTACADO_ID)}>
          <MessageSquare size={16} className="text-muted-foreground shrink-0" />
          <span className="flex-1 text-[13px] font-medium text-foreground">Mensaje destacado</span>
        </button>
        {hook.bannersPortal.map((b) => (
          <button key={b.id} type="button" onClick={() => onSeleccionar(b.id)} className={filaCls(seleccionId === b.id)}>
            <span className="w-8 h-8 shrink-0 rounded-md border border-border bg-muted overflow-hidden flex items-center justify-center">
              {b.imagenUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={b.imagenUrl} alt="" className="w-full h-full object-cover" />
                : <ImageIcon size={14} className="text-muted-foreground" />}
            </span>
            <span className={cn('flex-1 text-[13px] font-medium truncate', b.activo ? 'text-foreground' : 'text-muted-foreground/60')}>
              {b.titulo || 'Banner sin título'}
            </span>
            {!b.activo && <span className="text-[10px] text-muted-foreground shrink-0">Oculto</span>}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void hook.handleNuevoBanner()}
        className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border text-foreground"
      >
        <Plus size={14} /> Añadir banner
      </button>

      <p className="text-[12.5px] text-muted-foreground pt-2 border-t border-border">
        Tablón — avisos de texto para tus clientas (horario especial, un taller, un cierre puntual).
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
        onClick={() => void hook.handleNuevaNovedad()}
        className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border text-foreground"
      >
        <Plus size={14} /> Añadir aviso
      </button>
      {hook.aviso && <p className="text-[12.5px] text-muted-foreground">{hook.aviso}</p>}
    </div>
  );
}

function MensajeDestacadoPanel({ hook }: { hook: ReturnType<typeof useContenidoPortalEditor> }) {
  return (
    <div className="space-y-3">
      <p className={labelCls}>Mensaje destacado</p>
      <p className="text-xs text-muted-foreground -mt-1">
        Se muestra al final de la pantalla de Inicio del portal de tus clientas, solo si escribes algo aquí.
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

function BannerPanel({ banner, onToast }: { banner: BannerPortal; onToast: (m: string) => void }) {
  const { updateBannerPortal, deleteBannerPortal } = useStudio();
  const [subiendo, setSubiendo] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubiendo(true);
    const r = await subirBannerEstudio(banner.id, file);
    setSubiendo(false);
    if ('error' in r) { onToast(r.error); return; }
    await updateBannerPortal(banner.id, { imagenUrl: r.url });
  }

  async function handleEliminar() {
    setConfirmDel(false);
    await eliminarBannerEstudio(banner.id);
    const res = await deleteBannerPortal(banner.id);
    if (!res.ok) onToast(res.error);
  }

  // Guardado de campo suelto: sin esto, un fallo de red/RLS al teclear se
  // perdía en silencio (updateBannerPortal sin await ni comprobar el
  // resultado) y el manager creía que se había guardado.
  function guardarCampo(changes: Partial<Omit<BannerPortal, 'id' | 'studioId'>>) {
    void updateBannerPortal(banner.id, changes).then(res => { if (!res.ok) onToast(res.error); });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={subiendo}
          className="w-16 h-16 shrink-0 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center"
        >
          {banner.imagenUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={banner.imagenUrl} alt="" className="w-full h-full object-cover" />
            : <Upload size={16} className="text-muted-foreground" />}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFoto} className="hidden" />
        <div className="flex flex-col items-center gap-2 shrink-0 ml-auto">
          <Toggle on={banner.activo} onChange={v => guardarCampo({ activo: v })} />
          <button type="button" onClick={() => setConfirmDel(true)} className="text-muted-foreground hover:text-destructive" aria-label="Eliminar banner">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <input
        className={inputCls}
        value={banner.titulo ?? ''}
        placeholder="Título del banner"
        onChange={e => guardarCampo({ titulo: e.target.value || null })}
      />
      <input
        className={inputCls}
        value={banner.texto ?? ''}
        placeholder="Texto corto (opcional)"
        onChange={e => guardarCampo({ texto: e.target.value || null })}
      />
      <Field label="Enlace">
        <div className="flex gap-2">
          <select
            className={inputCls}
            value={banner.linkTipo}
            onChange={e => guardarCampo({ linkTipo: e.target.value as BannerPortal['linkTipo'] })}
          >
            <option value="interno">Página interna</option>
            <option value="externo">URL externa</option>
          </select>
          <input
            className={inputCls}
            value={banner.linkValor}
            placeholder={banner.linkTipo === 'interno' ? '/bonos' : 'https://…'}
            onChange={e => guardarCampo({ linkValor: e.target.value })}
          />
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Desde (opcional)">
          <input
            type="date" className={inputCls}
            value={banner.fechaInicio ?? ''}
            onChange={e => guardarCampo({ fechaInicio: e.target.value || null })}
          />
        </Field>
        <Field label="Hasta (opcional)">
          <input
            type="date" className={inputCls}
            value={banner.fechaFin ?? ''}
            onChange={e => guardarCampo({ fechaFin: e.target.value || null })}
          />
        </Field>
      </div>
      {!linkValido(banner.linkTipo, banner.linkValor) && (
        <p className="text-xs text-destructive">
          {banner.linkTipo === 'interno' ? 'La página interna debe empezar por "/" (ej. /bonos).' : 'La URL externa debe empezar por http:// o https://.'}
        </p>
      )}

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        titulo="¿Eliminar este banner?"
        descripcion="Se quitará del portal de tus clientas. No se puede deshacer."
        textoConfirmar="Eliminar"
        destructivo
        onConfirm={handleEliminar}
      />
    </div>
  );
}

function NovedadPanel({ novedad, onToast }: { novedad: NovedadEstudio; onToast: (m: string) => void }) {
  const { updateNovedadEstudio, deleteNovedadEstudio } = useStudio();
  const [confirmDel, setConfirmDel] = useState(false);

  // Guardado de campo suelto: mismo criterio que BannerPanel — un fallo de
  // red/RLS al teclear no puede perderse en silencio.
  function guardarCampo(changes: Partial<Omit<NovedadEstudio, 'id' | 'studioId'>>) {
    void updateNovedadEstudio(novedad.id, changes).then(res => { if (!res.ok) onToast(res.error); });
  }

  async function handleEliminar() {
    setConfirmDel(false);
    const res = await deleteNovedadEstudio(novedad.id);
    if (!res.ok) onToast(res.error);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <input
          className={cn(inputCls, 'w-16 text-center')}
          value={novedad.emoji ?? ''}
          placeholder="📣"
          maxLength={4}
          onChange={e => guardarCampo({ emoji: e.target.value || null })}
        />
        <div className="flex flex-col items-center gap-2 shrink-0 ml-auto">
          <Toggle on={novedad.activo} onChange={v => guardarCampo({ activo: v })} />
          <button type="button" onClick={() => setConfirmDel(true)} className="text-muted-foreground hover:text-destructive" aria-label="Eliminar aviso">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <input
        className={inputCls}
        value={novedad.titulo}
        placeholder="Título del aviso"
        onChange={e => guardarCampo({ titulo: e.target.value })}
      />
      <textarea
        className={cn(inputCls, 'min-h-16')}
        value={novedad.texto ?? ''}
        placeholder="Texto (opcional)"
        onChange={e => guardarCampo({ texto: e.target.value || null })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Desde (opcional)">
          <input
            type="date" className={inputCls}
            value={novedad.fechaInicio ?? ''}
            onChange={e => guardarCampo({ fechaInicio: e.target.value || null })}
          />
        </Field>
        <Field label="Hasta (opcional)">
          <input
            type="date" className={inputCls}
            value={novedad.fechaFin ?? ''}
            onChange={e => guardarCampo({ fechaFin: e.target.value || null })}
          />
        </Field>
      </div>

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        titulo="¿Eliminar este aviso?"
        descripcion="Se quitará del portal de tus clientas. No se puede deshacer."
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
  const banner = hook.bannersPortal.find(b => b.id === seleccionId);
  if (banner) return <BannerPanel banner={banner} onToast={hook.setAviso} />;
  const novedad = hook.novedadesEstudio.find(n => n.id === seleccionId);
  if (novedad) return <NovedadPanel novedad={novedad} onToast={hook.setAviso} />;
  return <p className="text-[13px] text-muted-foreground">Selecciona el mensaje destacado, un banner o un aviso del tablón de la izquierda.</p>;
}
