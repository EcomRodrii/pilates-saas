'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { subirFotoPerfil, eliminarFotoPerfil } from '@/lib/portal-storage';
import { ProfileAvatar, AvatarPicker } from '@/components/ui/profile-avatar';
import { useModo } from '@/lib/portal-modo';
import {
  Camera, Trash2, LogOut, ChevronRight, Bell, SlidersHorizontal, Loader2, Check, Trophy,
} from 'lucide-react';

export default function PerfilPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { session, logout } = usePortalAuth();
  const {
    socios, updateSocio, preferenciasSocio, upsertPreferenciasSocio,
    reservas, sesiones, nivelSocio, rachaSocio, achievementDefinitions, achievementProgress,
  } = useStudio();
  const { t } = useModo();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const socio = socios.find(s => s.id === session?.socioId);
  const prefs = preferenciasSocio.find(p => p.socioId === session?.socioId);

  const misReservas = useMemo(() => reservas.filter(r => r.socioId === session?.socioId), [reservas, session?.socioId]);
  const asistidas = useMemo(() => misReservas.filter(r => r.estado === 'ASISTIDA'), [misReservas]);
  const clasesEsteMes = useMemo(() => {
    const now = new Date();
    return asistidas.filter(r => {
      const s = sesiones.find(x => x.id === r.sesionId);
      if (!s) return false;
      const d = new Date(s.inicio);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [asistidas, sesiones]);
  const racha = session ? rachaSocio(session.socioId) : null;
  const nivel = session ? nivelSocio(session.socioId) : null;

  const logrosPreview = useMemo(() => {
    if (!session) return [];
    return achievementDefinitions
      .filter(a => a.activo)
      .map(def => ({ def, completado: achievementProgress.some(p => p.socioId === session.socioId && p.achievementId === def.id && p.completado) }))
      .sort((a, b) => (b.completado ? 1 : 0) - (a.completado ? 1 : 0))
      .slice(0, 4);
  }, [achievementDefinitions, achievementProgress, session]);

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

  function handleGuardar(e?: React.FormEvent) {
    e?.preventDefault();
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

  const card: React.CSSProperties = { background: t.surface, border: `1px solid ${t.line}`, borderRadius: 26 };
  const microLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.muted };
  // fontSize 16 (no 14): por debajo de 16px iOS hace zoom automático al enfocar el campo.
  const inputStyle: React.CSSProperties = { width: '100%', borderRadius: 16, border: `1px solid ${t.line}`, background: t.bg, padding: '12px 16px', fontSize: 16, color: t.ink, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: t.muted2, display: 'block', marginBottom: 6 };

  return (
    <div style={{ minHeight: '100%', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 32px' }}>
        <h1 style={{ color: t.ink, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase', lineHeight: 1, marginBottom: 24 }}>Tu perfil</h1>

        {/* Foto */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <ProfileAvatar avatarId={socio.avatar} fotoUrl={socio.fotoUrl} nombre={socio.nombre} apellidos={socio.apellidos} size="xl" />
            {subiendoFoto && (
              <div style={{ position: 'absolute', inset: 0, borderRadius: 999, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={20} style={{ color: '#fff' }} className="animate-spin" />
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ position: 'absolute', bottom: -4, right: -4, width: 32, height: 32, borderRadius: 999, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Camera size={14} style={{ color: t.ink }} />
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFotoChange} style={{ display: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setShowAvatarPicker(true)} style={{ color: t.muted, fontSize: 12, fontWeight: 700, textDecoration: 'underline', background: 'none', border: 'none' }}>
              Elegir avatar
            </button>
            {socio.fotoUrl && (
              <button onClick={handleEliminarFoto} style={{ color: t.muted, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none' }}>
                <Trash2 size={12} />Quitar foto
              </button>
            )}
          </div>
          <p style={{ color: t.ink, fontWeight: 800, fontSize: 16, marginTop: 4, textTransform: 'uppercase' }}>{socio.nombre} {socio.apellidos}</p>
          <p style={{ color: t.muted, fontSize: 12 }}>{socio.email}</p>
          {nivel?.actual && (
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, backgroundColor: `${nivel.actual.color}33`, color: t.ink }}
            >
              {nivel.actual.icono} Nivel {nivel.actual.nombre}
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { v: clasesEsteMes, l: 'Este mes' },
            { v: racha?.semanas ?? 0, l: 'Racha 🔥' },
            { v: asistidas.length, l: 'Total clases' },
          ].map(({ v, l }) => (
            <div key={l} style={{ ...card, borderRadius: 18, padding: '12px 8px', textAlign: 'center' }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: t.ink, lineHeight: 1 }}>{v}</p>
              <p style={{ fontSize: 9, fontWeight: 800, color: t.muted, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</p>
            </div>
          ))}
        </div>
      </div>

      {logrosPreview.length > 0 && (
        <div style={{ padding: '16px 16px 0' }}>
          <Link href={`/portal/${slug}/progreso?tab=logros`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Trophy size={13} style={{ color: t.muted }} />
              <p style={microLabel}>Logros</p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: t.heroAccent, display: 'flex', alignItems: 'center', gap: 2 }}>Ver todos <ChevronRight size={12} /></span>
          </Link>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {logrosPreview.map(({ def, completado }) => (
              <div
                key={def.id}
                style={{ borderRadius: 18, padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center', backgroundColor: completado ? 'color-mix(in srgb, var(--portal-brand) 12%, transparent)' : t.surface2, opacity: completado ? 1 : 0.45 }}
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>{def.icono}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: 13, fontWeight: 600, borderRadius: 16, padding: '12px 16px' }}>{error}</div>
        )}

        {/* Datos personales */}
        <form onSubmit={handleGuardar} style={{ ...card, padding: 20 }}>
          <p style={{ ...microLabel, marginBottom: 16 }}>Datos personales</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Nombre</label>
                <input style={inputStyle} autoComplete="given-name" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Apellidos</label>
                <input style={inputStyle} autoComplete="family-name" value={form.apellidos} onChange={e => setForm(f => ({ ...f, apellidos: e.target.value }))} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" style={inputStyle} autoComplete="email" inputMode="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Teléfono</label>
              <input type="tel" style={inputStyle} autoComplete="tel" inputMode="tel" placeholder="+34 600 000 000" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Fecha de nacimiento</label>
              <input type="date" style={inputStyle} value={form.fechaNacimiento} onChange={e => setForm(f => ({ ...f, fechaNacimiento: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Dirección</label>
              <input style={inputStyle} autoComplete="street-address" placeholder="Calle, número, ciudad" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
            </div>
          </div>
          <button
            type="submit"
            style={{ width: '100%', marginTop: 20, padding: '13px 0', borderRadius: 16, background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none', textTransform: 'uppercase' }}
          >
            {guardado ? <><Check size={15} />Guardado</> : 'Guardar cambios'}
          </button>
        </form>

        {/* Notificaciones */}
        <div style={{ ...card, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Bell size={15} style={{ color: t.muted }} />
            <p style={microLabel}>Notificaciones</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {([
              { key: 'notifEmail' as const, label: 'Recordatorios por email' },
              { key: 'notifWhatsapp' as const, label: 'Recordatorios por WhatsApp' },
            ]).map(({ key, label }) => {
              const activo = prefs ? prefs[key] : true;
              return (
                // El área táctil es la fila entera (min 44px de alto), no solo el
                // interruptor de 24px — antes solo el propio <button> respondía,
                // aunque visualmente parecía que toda la fila era interactiva.
                <button
                  key={key}
                  type="button"
                  onClick={() => upsertPreferenciasSocio(socio.id, { [key]: !activo })}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 44, padding: '4px 0', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 14, color: t.ink }}>{label}</span>
                  <span
                    aria-hidden
                    style={{ width: 44, height: 24, borderRadius: 999, position: 'relative', flexShrink: 0, backgroundColor: activo ? 'var(--portal-brand)' : t.surface2 }}
                  >
                    <span
                      style={{ position: 'absolute', top: 2, width: 20, height: 20, borderRadius: 999, background: t.surface, transition: 'transform 0.15s', transform: activo ? 'translateX(22px)' : 'translateX(2px)' }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Link a preferencias / disponibilidad */}
        <Link
          href={`/portal/${slug}/preferencias`}
          style={{ ...card, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 14, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SlidersHorizontal size={17} style={{ color: t.heroAccent }} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: t.ink }}>Disponibilidad y preferencias</p>
              <p style={{ fontSize: 12, color: t.muted }}>Instructor favorito, tipo de clase, horarios…</p>
            </div>
          </div>
          <ChevronRight size={16} style={{ color: t.muted, flexShrink: 0 }} />
        </Link>

        {/* Logout */}
        <button
          onClick={handleLogout}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, border: `1px solid ${t.line}`, color: '#EF4444', fontSize: 14, fontWeight: 700, background: 'transparent' }}
        >
          <LogOut size={15} />Cerrar sesión
        </button>
      </div>

      {showAvatarPicker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowAvatarPicker(false)} />
          <div style={{ position: 'relative', width: '100%', background: t.bg, borderRadius: '24px 24px 0 0', padding: '20px 20px max(32px, calc(env(safe-area-inset-bottom) + 20px))', maxHeight: '85vh', overflowY: 'auto' }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: t.ink, marginBottom: 12 }}>Elige tu avatar</p>
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
