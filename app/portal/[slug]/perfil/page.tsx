'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { subirFotoPerfil, eliminarFotoPerfil } from '@/lib/portal-storage';
import { ProfileAvatar, AvatarPicker } from '@/components/ui/profile-avatar';
import {
  Camera, Trash2, LogOut, ChevronRight, Bell, SlidersHorizontal, Loader2, Check,
} from 'lucide-react';

const inputCls = 'w-full rounded-2xl border border-[#E7E7E0] bg-white px-4 py-3 text-[14px] text-[#171717] placeholder:text-[#A8A89E] outline-none focus:border-[#1A1A1A] focus:ring-2 focus:ring-[#1A1A1A]/10 transition-all';
const labelCls = 'text-[12px] font-semibold text-[#3A3A34] block mb-1.5';

export default function PerfilPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { session, logout } = usePortalAuth();
  const { socios, updateSocio, preferenciasSocio, upsertPreferenciasSocio } = useStudio();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const socio = socios.find(s => s.id === session?.socioId);
  const prefs = preferenciasSocio.find(p => p.socioId === session?.socioId);

  const [form, setForm] = useState({
    nombre: socio?.nombre ?? '',
    apellidos: socio?.apellidos ?? '',
    email: socio?.email ?? '',
    telefono: socio?.telefono ?? '',
    fechaNacimiento: socio?.fechaNacimiento ?? '',
    direccion: socio?.direccion ?? '',
  });
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState('');

  if (!socio || !session) return null;

  function handleGuardar() {
    if (!socio) return;
    updateSocio(socio.id, {
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim(),
      email: form.email.trim(),
      telefono: form.telefono.trim() || null,
      fechaNacimiento: form.fechaNacimiento || null,
      direccion: form.direccion.trim() || null,
    });
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  }

  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !socio) return;
    if (!file.type.startsWith('image/')) {
      setError('Elige un archivo de imagen.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('La imagen no puede superar 5 MB.');
      return;
    }
    setError('');
    setSubiendoFoto(true);
    const result = await subirFotoPerfil(socio.id, file);
    setSubiendoFoto(false);
    if ('error' in result) { setError(result.error); return; }
    updateSocio(socio.id, { fotoUrl: result.url });
  }

  async function handleEliminarFoto() {
    if (!socio) return;
    setSubiendoFoto(true);
    const result = await eliminarFotoPerfil(socio.id);
    setSubiendoFoto(false);
    if ('error' in result) { setError(result.error); return; }
    updateSocio(socio.id, { fotoUrl: null });
  }

  function handleLogout() {
    logout();
    router.replace(`/portal/${slug}/login`);
  }

  return (
    <div className="bg-white min-h-full">
      {/* Header */}
      <div className="px-5 pt-6 pb-8" style={{ background: 'linear-gradient(160deg, #131313 0%, #1A1A1A 55%, #F7A6C4 100%)' }}>
        <h1 className="text-white text-[28px] font-extrabold tracking-tight mb-6">Tu perfil</h1>

        {/* Foto */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <ProfileAvatar avatarId={socio.avatar} fotoUrl={socio.fotoUrl} nombre={socio.nombre} apellidos={socio.apellidos} size="xl" />
            {subiendoFoto && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <Loader2 size={20} className="text-white animate-spin" />
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-md active:scale-95 transition-transform"
            >
              <Camera size={14} className="text-[#171717]" />
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFotoChange} className="hidden" />
          <div className="flex items-center gap-3">
            <button onClick={() => setShowAvatarPicker(true)} className="text-white/70 text-[12px] font-semibold underline underline-offset-2">
              Elegir avatar
            </button>
            {socio.fotoUrl && (
              <button onClick={handleEliminarFoto} className="text-white/70 text-[12px] font-semibold flex items-center gap-1">
                <Trash2 size={12} />Quitar foto
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 pb-6 space-y-5">
        {error && (
          <div className="bg-red-50 text-red-700 text-[13px] font-medium rounded-2xl px-4 py-3">{error}</div>
        )}

        {/* Datos personales */}
        <div className="bg-white rounded-3xl border border-black/[0.06] p-5" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-4">Datos personales</p>
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nombre</label>
                <input className={inputCls} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Apellidos</label>
                <input className={inputCls} value={form.apellidos} onChange={e => setForm(f => ({ ...f, apellidos: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" className={inputCls} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Teléfono</label>
              <input type="tel" className={inputCls} placeholder="+34 600 000 000" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Fecha de nacimiento</label>
              <input type="date" className={inputCls} value={form.fechaNacimiento} onChange={e => setForm(f => ({ ...f, fechaNacimiento: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Dirección</label>
              <input className={inputCls} placeholder="Calle, número, ciudad" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
            </div>
          </div>
          <button
            onClick={handleGuardar}
            className="w-full mt-5 py-3 rounded-2xl bg-[#FFC8E2] text-[#171717] font-bold text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            {guardado ? <><Check size={15} />Guardado</> : 'Guardar cambios'}
          </button>
        </div>

        {/* Notificaciones */}
        <div className="bg-white rounded-3xl border border-black/[0.06] p-5" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Bell size={15} className="text-[#8E8E93]" />
            <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest">Notificaciones</p>
          </div>
          <div className="space-y-3">
            {([
              { key: 'notifEmail' as const, label: 'Recordatorios por email' },
              { key: 'notifWhatsapp' as const, label: 'Recordatorios por WhatsApp' },
            ]).map(({ key, label }) => {
              const activo = prefs ? prefs[key] : true;
              return (
                <label key={key} className="flex items-center justify-between">
                  <span className="text-[14px] text-[#171717]">{label}</span>
                  <button
                    type="button"
                    onClick={() => upsertPreferenciasSocio(socio.id, { [key]: !activo })}
                    className="w-11 h-6 rounded-full transition-colors relative shrink-0"
                    style={{ backgroundColor: activo ? '#171717' : '#E7E7E0' }}
                  >
                    <span
                      className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                      style={{ transform: activo ? 'translateX(22px)' : 'translateX(2px)' }}
                    />
                  </button>
                </label>
              );
            })}
          </div>
        </div>

        {/* Link a preferencias / disponibilidad */}
        <Link
          href={`/portal/${slug}/preferencias`}
          className="flex items-center justify-between bg-white rounded-3xl border border-black/[0.06] p-5 active:scale-[0.98] transition-transform"
          style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#F3EEFF] flex items-center justify-center">
              <SlidersHorizontal size={17} className="text-[#6D28D9]" />
            </div>
            <div>
              <p className="text-[14px] font-bold text-[#171717]">Disponibilidad y preferencias</p>
              <p className="text-[12px] text-[#8E8E93]">Instructor favorito, tipo de clase, horarios…</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-[#C7C7CC] shrink-0" />
        </Link>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-[#E7E7E0] text-[#B91C1C] text-[14px] font-semibold active:bg-[#FEF2F2] transition-colors"
        >
          <LogOut size={15} />Cerrar sesión
        </button>
      </div>

      {showAvatarPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAvatarPicker(false)} />
          <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-6 max-h-[85vh] overflow-y-auto">
            <p className="text-[15px] font-bold text-[#171717] mb-3">Elige tu avatar</p>
            <AvatarPicker
              value={socio.avatar ?? null}
              onChange={id => { updateSocio(socio.id, { avatar: id }); setShowAvatarPicker(false); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
