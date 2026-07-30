'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { inputCls, labelCls, btnPrimary, btnSecondary, cardCls, Field, Toggle, ConfirmDialog } from '@/app/(dashboard)/configuracion/page';
import { useStudio } from '@/lib/studio-context';
import { usePermisos } from '@/lib/permisos';
import { subirBannerEstudio, eliminarBannerEstudio } from '@/lib/portal-storage';
import type { BannerPortal } from '@/lib/types';
import { cn } from '@/lib/utils';

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

function BannerRow({ banner, onToast }: { banner: BannerPortal; onToast: (m: string) => void }) {
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

  return (
    <div className={cn(cardCls, 'p-4 space-y-3')}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={subiendo}
          className="w-20 h-20 shrink-0 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center"
        >
          {banner.imagenUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={banner.imagenUrl} alt="" className="w-full h-full object-cover" />
            : <Upload size={18} className="text-muted-foreground" />}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFoto} className="hidden" />
        <div className="flex-1 min-w-0 space-y-2">
          <input
            className={inputCls}
            value={banner.titulo ?? ''}
            placeholder="Título del banner"
            onChange={e => updateBannerPortal(banner.id, { titulo: e.target.value || null })}
          />
          <input
            className={inputCls}
            value={banner.texto ?? ''}
            placeholder="Texto corto (opcional)"
            onChange={e => updateBannerPortal(banner.id, { texto: e.target.value || null })}
          />
        </div>
        <div className="flex flex-col items-center gap-2 shrink-0">
          <Toggle on={banner.activo} onChange={v => updateBannerPortal(banner.id, { activo: v })} />
          <button type="button" onClick={() => setConfirmDel(true)} className="text-muted-foreground hover:text-destructive" aria-label="Eliminar banner">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Enlace">
          <div className="flex gap-2">
            <select
              className={inputCls}
              value={banner.linkTipo}
              onChange={e => updateBannerPortal(banner.id, { linkTipo: e.target.value as BannerPortal['linkTipo'] })}
            >
              <option value="interno">Página interna</option>
              <option value="externo">URL externa</option>
            </select>
            <input
              className={inputCls}
              value={banner.linkValor}
              placeholder={banner.linkTipo === 'interno' ? '/bonos' : 'https://…'}
              onChange={e => updateBannerPortal(banner.id, { linkValor: e.target.value })}
            />
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Desde (opcional)">
            <input
              type="date" className={inputCls}
              value={banner.fechaInicio ?? ''}
              onChange={e => updateBannerPortal(banner.id, { fechaInicio: e.target.value || null })}
            />
          </Field>
          <Field label="Hasta (opcional)">
            <input
              type="date" className={inputCls}
              value={banner.fechaFin ?? ''}
              onChange={e => updateBannerPortal(banner.id, { fechaFin: e.target.value || null })}
            />
          </Field>
        </div>
      </div>
      {!linkValido(banner.linkTipo, banner.linkValor) && (
        <p className="text-xs text-destructive">
          {banner.linkTipo === 'interno' ? 'La página interna debe empezar por "/" (ej. /bonos).' : 'La URL externa debe empezar por http:// o https://.'}
        </p>
      )}

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title="¿Eliminar este banner?"
        description="Se quitará del portal de tus clientas. No se puede deshacer."
        onConfirm={handleEliminar}
      />
    </div>
  );
}

export function ContenidoPortalEditor() {
  const { rol } = usePermisos();
  const { contenidoPortal, bannersPortal, updateMensajeDestacado, addBannerPortal } = useStudio();
  const [mensaje, setMensaje] = useState(contenidoPortal?.mensajeDestacado ?? '');
  const [guardandoMensaje, setGuardandoMensaje] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  if (rol !== 'PROPIETARIO' && rol !== 'MANAGER') {
    return <p className="text-sm text-muted-foreground">Solo la propietaria o la gerencia del estudio pueden editar el contenido del portal.</p>;
  }

  async function handleGuardarMensaje() {
    setGuardandoMensaje(true);
    const res = await updateMensajeDestacado(mensaje.trim() || null);
    setGuardandoMensaje(false);
    setAviso(res.ok ? 'Mensaje destacado guardado.' : res.error);
  }

  async function handleNuevoBanner() {
    const orden = bannersPortal.length > 0 ? Math.max(...bannersPortal.map(b => b.orden)) + 1 : 0;
    const res = await addBannerPortal({
      imagenUrl: '', titulo: 'Nuevo banner', texto: null,
      linkTipo: 'interno', linkValor: '/bonos', ubicacion: ['home'],
      activo: false, orden, fechaInicio: null, fechaFin: null,
    });
    if (!res.ok) setAviso(res.error);
  }

  return (
    <div className="space-y-6">
      <section className={cn(cardCls, 'p-5 space-y-3')}>
        <p className={labelCls}>Mensaje destacado</p>
        <p className="text-xs text-muted-foreground -mt-1">
          Se muestra al final de la pantalla de Inicio del portal de tus clientas, solo si escribes algo aquí.
        </p>
        <textarea
          className={cn(inputCls, 'min-h-20')}
          value={mensaje}
          onChange={e => setMensaje(e.target.value)}
          placeholder="Ej. Este mes estrenamos horario de mañana los sábados."
          maxLength={280}
        />
        <button type="button" className={btnPrimary} disabled={guardandoMensaje} onClick={handleGuardarMensaje}>
          {guardandoMensaje ? 'Guardando…' : 'Guardar mensaje'}
        </button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className={labelCls}>Banners</p>
            <p className="text-xs text-muted-foreground">
              Aparecen en Inicio, activados y dentro de sus fechas. Un banner nuevo empieza desactivado hasta que lo configures.
            </p>
          </div>
          <button type="button" className={btnSecondary} onClick={handleNuevoBanner}>
            <Plus size={14} className="inline -mt-0.5 mr-1" /> Nuevo banner
          </button>
        </div>
        {bannersPortal.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">Aún no has creado ningún banner.</p>
        )}
        <div className="space-y-3">
          {bannersPortal.map(b => <BannerRow key={b.id} banner={b} onToast={setAviso} />)}
        </div>
      </section>

      {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}
    </div>
  );
}
