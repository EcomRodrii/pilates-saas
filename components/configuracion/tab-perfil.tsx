'use client';

import { useRef, useState } from 'react';
import { Camera, Check, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { useAuth } from '@/lib/auth-context';
import { ProfileAvatar, AvatarPicker } from '@/components/ui/profile-avatar';
import { subirFotoAdmin, eliminarFotoAdmin, subirFotoInstructor, eliminarFotoInstructor, validarFotoPerfil } from '@/lib/portal-storage';
import { inputCls, labelCls, cardCls } from '@/app/(dashboard)/configuracion/page';

const ROL_LABEL: Record<string, { label: string; bg: string; text: string }> = {
  PROPIETARIO: { label: 'Propietaria', bg: '#F1F2EA', text: '#343825' },
  INSTRUCTOR: { label: 'Instructora', bg: '#FFF2F7', text: '#5A6142' },
  RECEPCION: { label: 'Recepción', bg: '#EAF6FF', text: '#3F5A7A' },
};

export function TabPerfil({ showToast }: { showToast: (m: string) => void }) {
  const { studio, updateAvatarAdmin, updateStudio, instructores, updateInstructor, sesiones } = useStudio();
  const { user, updateProfile, updateEmail, updatePassword } = useAuth();

  const yo = instructores.find(i => i.authUserId === user?.id) ?? null;
  const rol = yo?.rol ?? 'PROPIETARIO';
  const rolInfo = ROL_LABEL[rol];
  const metaNombre = (user?.user_metadata?.nombre as string | undefined) ?? '';
  const metaApellidos = (user?.user_metadata?.apellidos as string | undefined) ?? '';

  const [form, setForm] = useState({
    nombre: yo?.nombre ?? metaNombre ?? 'Propietaria',
    email: yo?.email ?? user?.email ?? '',
    telefono: yo?.telefono ?? '',
  });
  const [guardado, setGuardado] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fase 1 del perfil de la propietaria (sin fila en `instructores`, el caso
  // normal): nombre/apellidos viven en auth.users.user_metadata (ver
  // lib/auth-context.tsx). Formularios separados de email/contraseña porque
  // cada uno tiene su propio flujo de verificación con Supabase Auth.
  const [propietariaForm, setPropietariaForm] = useState({ nombre: metaNombre, apellidos: metaApellidos });
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [perfilGuardado, setPerfilGuardado] = useState(false);

  const [nuevoEmail, setNuevoEmail] = useState('');
  const [cambiandoEmail, setCambiandoEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ error: boolean; texto: string } | null>(null);

  const [passwordForm, setPasswordForm] = useState({ actual: '', nueva: '', confirmar: '' });
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ error: boolean; texto: string } | null>(null);

  async function guardarPerfilPropietaria() {
    setGuardandoPerfil(true);
    const { error } = await updateProfile({ nombre: propietariaForm.nombre.trim(), apellidos: propietariaForm.apellidos.trim() });
    setGuardandoPerfil(false);
    if (error) { showToast(`Error: ${error}`); return; }
    setPerfilGuardado(true);
    showToast('Perfil actualizado');
    setTimeout(() => setPerfilGuardado(false), 2000);
  }

  async function cambiarEmail() {
    if (!nuevoEmail.trim()) return;
    setCambiandoEmail(true);
    const { error, pendiente } = await updateEmail(nuevoEmail.trim());
    setCambiandoEmail(false);
    if (error) { setEmailMsg({ error: true, texto: error }); return; }
    setEmailMsg({
      error: false,
      texto: pendiente
        ? 'Te hemos enviado un email de confirmación. El cambio se aplicará cuando lo confirmes.'
        : 'Email actualizado.',
    });
    setNuevoEmail('');
  }

  async function cambiarPassword() {
    if (passwordForm.nueva !== passwordForm.confirmar) {
      setPasswordMsg({ error: true, texto: 'Las contraseñas nuevas no coinciden.' });
      return;
    }
    if (passwordForm.nueva.length < 8) {
      setPasswordMsg({ error: true, texto: 'La contraseña nueva debe tener al menos 8 caracteres.' });
      return;
    }
    setCambiandoPassword(true);
    const { error } = await updatePassword(passwordForm.actual, passwordForm.nueva);
    setCambiandoPassword(false);
    if (error) { setPasswordMsg({ error: true, texto: error }); return; }
    setPasswordMsg({ error: false, texto: 'Contraseña actualizada.' });
    setPasswordForm({ actual: '', nueva: '', confirmar: '' });
  }

  // El avatar/foto es de QUIEN ha iniciado sesión: si es instructora/recepción
  // con ficha propia, se guarda en su propia fila (yo.avatar/yo.fotoUrl), no
  // en la del estudio — si no, la foto de una instructora sobrescribiría la
  // que ven la propietaria y el resto del equipo en el sidebar.
  const avatarId = yo ? yo.avatar : studio?.avatarAdmin;
  const fotoUrl = yo ? yo.fotoUrl : studio?.fotoUrl;

  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || (!yo && !studio)) return;
    const invalido = validarFotoPerfil(file);
    if (invalido) { setErrorFoto(invalido); return; }
    setErrorFoto('');
    setSubiendoFoto(true);
    const result = yo ? await subirFotoInstructor(yo.id, file) : await subirFotoAdmin(studio!.id, file);
    setSubiendoFoto(false);
    if ('error' in result) { setErrorFoto(result.error); return; }
    if (yo) updateInstructor(yo.id, { fotoUrl: result.url });
    else updateStudio({ fotoUrl: result.url });
    showToast('Foto actualizada');
  }

  async function handleEliminarFoto() {
    if (!yo && !studio) return;
    setSubiendoFoto(true);
    const result = yo ? await eliminarFotoInstructor(yo.id) : await eliminarFotoAdmin(studio!.id);
    setSubiendoFoto(false);
    if ('error' in result) { setErrorFoto(result.error); return; }
    if (yo) updateInstructor(yo.id, { fotoUrl: null });
    else updateStudio({ fotoUrl: null });
  }

  const now = new Date();
  const clasesImpartidas = yo ? sesiones.filter(s => s.instructorId === yo.id && new Date(s.inicio) < now) : [];
  const clasesEsteMes = clasesImpartidas.filter(s => {
    const d = new Date(s.inicio);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const proximaClase = yo
    ? sesiones.filter(s => s.instructorId === yo.id && new Date(s.inicio) > now).sort((a, b) => a.inicio.localeCompare(b.inicio))[0]
    : null;

  function guardar() {
    if (!yo) return;
    updateInstructor(yo.id, { nombre: form.nombre.trim(), email: form.email.trim() || null, telefono: form.telefono.trim() || null });
    setGuardado(true);
    showToast('Perfil actualizado');
    setTimeout(() => setGuardado(false), 2000);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className={cn(cardCls, 'p-6')}>
        <div className="flex items-center gap-4 mb-1">
          <div className="relative shrink-0">
            <ProfileAvatar avatarId={avatarId} fotoUrl={fotoUrl} nombre={form.nombre || 'Admin'} size="xl" />
            {subiendoFoto && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <Loader2 size={18} className="text-white animate-spin" />
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-background transition-colors"
              aria-label="Subir foto"
            >
              <Camera size={13} className="text-foreground" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFotoChange} className="hidden" />
          </div>
          <div>
            <p className="text-[15px] font-bold text-foreground">{form.nombre || 'Sin nombre'}</p>
            <p className="text-[12px] text-muted-foreground">{form.email}</p>
            <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: rolInfo.bg, color: rolInfo.text }}>
              {rolInfo.label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2">
          {fotoUrl && (
            <button onClick={handleEliminarFoto} className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1">
              <Trash2 size={11} />Quitar foto
            </button>
          )}
        </div>
        {yo && (
          <p className="text-[11px] text-muted-foreground mt-1">Sube una foto de tu cara — es la que verán tus compañeras en el equipo.</p>
        )}
        {errorFoto && <p className="text-[11px] text-destructive mt-1">{errorFoto}</p>}
        <div className="mt-5">
          <AvatarPicker
            value={avatarId ?? null}
            onChange={id => {
              if (yo) updateInstructor(yo.id, { avatar: id });
              else updateAvatarAdmin(id);
              showToast('Avatar actualizado');
            }}
          />
        </div>
      </div>

      {rol === 'INSTRUCTOR' && yo && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { v: clasesEsteMes, l: 'Este mes' },
            { v: clasesImpartidas.length, l: 'Impartidas' },
            { v: proximaClase ? new Date(proximaClase.inicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—', l: 'Próxima clase' },
          ].map(({ v, l }) => (
            <div key={l} className={cn(cardCls, 'p-4 text-center')}>
              <p className="text-[20px] font-extrabold text-foreground leading-none">{v}</p>
              <p className="text-[10px] font-bold text-muted-foreground mt-1.5 uppercase tracking-wider">{l}</p>
            </div>
          ))}
        </div>
      )}

      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-4">Tus datos</h3>
        {yo ? (
          <>
            <div className="space-y-3.5">
              <div>
                <p className={labelCls}>Nombre</p>
                <input className={inputCls} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <p className={labelCls}>Email</p>
                <input type="email" className={inputCls} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <p className={labelCls}>Teléfono</p>
                <input type="tel" className={inputCls} value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
              </div>
            </div>
            <button onClick={guardar} className="mt-4 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors flex items-center gap-1.5">
              {guardado && <Check size={13} />}
              {guardado ? 'Guardado' : 'Guardar cambios'}
            </button>
          </>
        ) : (
          <>
            <div className="space-y-3.5">
              <div>
                <p className={labelCls}>Nombre</p>
                <input className={inputCls} value={propietariaForm.nombre} onChange={e => setPropietariaForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <p className={labelCls}>Apellidos</p>
                <input className={inputCls} value={propietariaForm.apellidos} onChange={e => setPropietariaForm(f => ({ ...f, apellidos: e.target.value }))} />
              </div>
            </div>
            <button
              onClick={guardarPerfilPropietaria}
              disabled={guardandoPerfil}
              className="mt-4 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors flex items-center gap-1.5 disabled:opacity-60"
            >
              {perfilGuardado && <Check size={13} />}
              {guardandoPerfil ? 'Guardando…' : perfilGuardado ? 'Guardado' : 'Guardar cambios'}
            </button>

            <div className="mt-6 pt-6 border-t border-muted">
              <h4 className="text-[13px] font-semibold text-foreground mb-1">Email</h4>
              <p className="text-[12px] text-muted-foreground mb-3">
                Entras con <span className="font-medium text-foreground">{user?.email}</span>.
              </p>
              <div className="flex gap-2">
                <input
                  type="email" placeholder="Nuevo email" className={inputCls}
                  value={nuevoEmail} onChange={e => setNuevoEmail(e.target.value)}
                />
                <button
                  onClick={cambiarEmail}
                  disabled={cambiandoEmail || !nuevoEmail.trim()}
                  className="px-4 py-2 rounded-lg bg-card border border-border text-[12px] font-medium hover:bg-background transition-colors disabled:opacity-60 shrink-0"
                >
                  {cambiandoEmail ? 'Enviando…' : 'Cambiar email'}
                </button>
              </div>
              {emailMsg && (
                <p className={cn('text-[11px] mt-2', emailMsg.error ? 'text-destructive' : 'text-success')}>{emailMsg.texto}</p>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-muted">
              <h4 className="text-[13px] font-semibold text-foreground mb-3">Cambiar contraseña</h4>
              <div className="space-y-3.5">
                <div>
                  <p className={labelCls}>Contraseña actual</p>
                  <input
                    type="password" className={inputCls}
                    value={passwordForm.actual} onChange={e => setPasswordForm(f => ({ ...f, actual: e.target.value }))}
                  />
                </div>
                <div>
                  <p className={labelCls}>Nueva contraseña</p>
                  <input
                    type="password" className={inputCls}
                    value={passwordForm.nueva} onChange={e => setPasswordForm(f => ({ ...f, nueva: e.target.value }))}
                  />
                </div>
                <div>
                  <p className={labelCls}>Confirmar nueva contraseña</p>
                  <input
                    type="password" className={inputCls}
                    value={passwordForm.confirmar} onChange={e => setPasswordForm(f => ({ ...f, confirmar: e.target.value }))}
                  />
                </div>
              </div>
              <button
                onClick={cambiarPassword}
                disabled={cambiandoPassword || !passwordForm.actual || !passwordForm.nueva || !passwordForm.confirmar}
                className="mt-4 px-4 py-2 rounded-lg bg-card border border-border text-[12px] font-medium hover:bg-background transition-colors disabled:opacity-60"
              >
                {cambiandoPassword ? 'Cambiando…' : 'Cambiar contraseña'}
              </button>
              {passwordMsg && (
                <p className={cn('text-[11px] mt-2', passwordMsg.error ? 'text-destructive' : 'text-success')}>{passwordMsg.texto}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
