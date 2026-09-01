'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X, Check, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { GoogleIcon } from '@/components/icons/brand-icons';
import { NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_SAND, NW_PRODUCTO } from './tokens';

// "Mi cuenta" del autoservicio — pedido explícito del fundador tras ver el
// menú del avatar con SOLO "Cerrar sesión" (2026-09). Reutiliza los mismos
// métodos de auth.updateEmail/updatePassword/linkGoogle/unlinkGoogle que ya
// usa components/configuracion/tab-perfil.tsx (lado Studio) — es la misma
// cuenta de Supabase Auth, el flujo no cambia por venir de Network, solo el
// envoltorio visual (tokens NW_*, modal en vez de sección de página).
//
// El "número de teléfono" que pedía el fundador NO es un teléfono de
// acceso/login (eso no existe en ningún sitio del repo — ni aquí ni en el
// panel de Studio: exigiría SMS provider + esquema nuevo, alcance mucho
// mayor, confirmado explícitamente que NO es lo que se pedía). Es
// `red_perfiles.telefonoContacto`, que YA tiene su propio formulario en
// Mi perfil → Contacto privado — aquí solo hay un atajo directo, no un
// formulario duplicado que pudiera desincronizarse del real.
export function ModalCuenta({ onClose }: { onClose: () => void }) {
  const { user, updateEmail, updatePassword, linkGoogle, unlinkGoogle } = useAuth();
  const { widget: captcha, pedirToken } = useCaptcha();

  const [nuevoEmail, setNuevoEmail] = useState('');
  const [cambiandoEmail, setCambiandoEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ error: boolean; texto: string } | null>(null);

  const [passwordForm, setPasswordForm] = useState({ actual: '', nueva: '', confirmar: '' });
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ error: boolean; texto: string } | null>(null);

  const identidades = user?.identities ?? [];
  const tieneGoogle = identidades.some(i => i.provider === 'google');
  const tieneEmail = identidades.some(i => i.provider === 'email');
  const puedeDesconectarGoogle = tieneGoogle && identidades.length > 1;
  const [conectandoAcceso, setConectandoAcceso] = useState(false);
  const [accesoMsg, setAccesoMsg] = useState<{ error: boolean; texto: string } | null>(null);

  async function cambiarEmail() {
    if (!nuevoEmail.trim()) return;
    setCambiandoEmail(true);
    setEmailMsg(null);
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
    setPasswordMsg(null);
    const token = await pedirToken();
    if (token === null) { setPasswordMsg({ error: true, texto: ERROR_CAPTCHA }); setCambiandoPassword(false); return; }
    const { error } = await updatePassword(passwordForm.actual, passwordForm.nueva, token || undefined);
    setCambiandoPassword(false);
    if (error) { setPasswordMsg({ error: true, texto: error }); return; }
    setPasswordMsg({ error: false, texto: 'Contraseña actualizada.' });
    setPasswordForm({ actual: '', nueva: '', confirmar: '' });
  }

  async function conectarGoogle() {
    setAccesoMsg(null);
    setConectandoAcceso(true);
    const { error } = await linkGoogle();
    if (error) { setAccesoMsg({ error: true, texto: error }); setConectandoAcceso(false); }
  }

  async function desconectarGoogle() {
    setAccesoMsg(null);
    setConectandoAcceso(true);
    const { error } = await unlinkGoogle();
    setConectandoAcceso(false);
    if (error) { setAccesoMsg({ error: true, texto: error }); return; }
    setAccesoMsg({ error: false, texto: 'Google desconectado.' });
  }

  const campoLabel = 'text-[11px] font-bold uppercase tracking-wide mb-1.5 block';
  const campoCls = 'w-full px-3.5 py-2.5 rounded-xl text-[13.5px] outline-none';
  const campoStyle = { border: `1px solid ${NW_BORDE}`, color: NW_TINTA, background: '#fff' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-[22px] bg-white p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-[15px] font-extrabold" style={{ color: NW_TINTA }}>Mi cuenta</p>
          <button onClick={onClose} aria-label="Cerrar"><X size={18} style={{ color: NW_MUTED_2 }} /></button>
        </div>

        <div className="space-y-5">
          {/* Teléfono de contacto — atajo, no formulario duplicado (ver nota arriba). */}
          <Link
            href="/network/mi-perfil"
            onClick={onClose}
            className="flex items-center justify-between px-3.5 py-3 rounded-xl transition-opacity hover:opacity-80"
            style={{ background: NW_SAND }}
          >
            <div>
              <p className="text-[13px] font-bold" style={{ color: NW_TINTA }}>Teléfono de contacto</p>
              <p className="text-[11.5px]" style={{ color: NW_MUTED_2 }}>Se edita en Mi perfil → Contacto privado</p>
            </div>
            <ArrowRight size={14} style={{ color: NW_MUTED_2 }} />
          </Link>

          <div style={{ borderTop: `1px solid ${NW_BORDE}` }} className="pt-5">
            <p className="text-[13px] font-bold mb-1" style={{ color: NW_TINTA }}>Email</p>
            <p className="text-[12px] mb-3" style={{ color: NW_MUTED }}>
              Entras con <span className="font-semibold" style={{ color: NW_TINTA }}>{user?.email}</span>.
            </p>
            <div className="flex gap-2">
              <input
                type="email" placeholder="Nuevo email" className={campoCls} style={campoStyle}
                value={nuevoEmail} onChange={e => setNuevoEmail(e.target.value)}
              />
              <button
                onClick={cambiarEmail}
                disabled={cambiandoEmail || !nuevoEmail.trim()}
                className="px-4 py-2 rounded-xl text-[12.5px] font-bold disabled:opacity-60 shrink-0 transition-opacity hover:opacity-80"
                style={{ border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}
              >
                {cambiandoEmail ? 'Enviando…' : 'Cambiar'}
              </button>
            </div>
            {emailMsg && (
              <p className="text-[11.5px] mt-2" style={{ color: emailMsg.error ? '#A04A3C' : NW_PRODUCTO }}>{emailMsg.texto}</p>
            )}
          </div>

          <div style={{ borderTop: `1px solid ${NW_BORDE}` }} className="pt-5">
            <p className="text-[13px] font-bold mb-3" style={{ color: NW_TINTA }}>Cambiar contraseña</p>
            <div className="space-y-3">
              <div>
                <span className={campoLabel} style={{ color: NW_MUTED_2 }}>Contraseña actual</span>
                <input
                  type="password" className={campoCls} style={campoStyle}
                  value={passwordForm.actual} onChange={e => setPasswordForm(f => ({ ...f, actual: e.target.value }))}
                />
              </div>
              <div>
                <span className={campoLabel} style={{ color: NW_MUTED_2 }}>Nueva contraseña</span>
                <input
                  type="password" className={campoCls} style={campoStyle}
                  value={passwordForm.nueva} onChange={e => setPasswordForm(f => ({ ...f, nueva: e.target.value }))}
                />
              </div>
              <div>
                <span className={campoLabel} style={{ color: NW_MUTED_2 }}>Confirmar nueva contraseña</span>
                <input
                  type="password" className={campoCls} style={campoStyle}
                  value={passwordForm.confirmar} onChange={e => setPasswordForm(f => ({ ...f, confirmar: e.target.value }))}
                />
              </div>
            </div>
            {/* Sin margen propio: el widget mide 0 px casi siempre (captcha
                invisible, execution:'execute') y un mt-3 aquí dejaría un
                hueco en blanco permanente. */}
            {captcha}
            <button
              onClick={cambiarPassword}
              disabled={cambiandoPassword || !passwordForm.actual || !passwordForm.nueva || !passwordForm.confirmar}
              className="mt-3 px-4 py-2.5 rounded-full text-[13px] font-bold text-white disabled:opacity-60 transition-opacity hover:opacity-90"
              style={{ background: NW_PRODUCTO }}
            >
              {cambiandoPassword ? 'Cambiando…' : 'Cambiar contraseña'}
            </button>
            {passwordMsg && (
              <p className="text-[11.5px] mt-2" style={{ color: passwordMsg.error ? '#A04A3C' : NW_PRODUCTO }}>{passwordMsg.texto}</p>
            )}
          </div>

          <div style={{ borderTop: `1px solid ${NW_BORDE}` }} className="pt-5">
            <p className="text-[13px] font-bold mb-1" style={{ color: NW_TINTA }}>Métodos de acceso</p>
            <p className="text-[12px] mb-3" style={{ color: NW_MUTED }}>Cómo puedes entrar en tu cuenta. Puedes tener varios a la vez.</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl" style={{ border: `1px solid ${NW_BORDE}` }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[13px]" style={{ background: NW_SAND }}>✉️</div>
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: NW_TINTA }}>Email y contraseña</p>
                    <p className="text-[11px]" style={{ color: NW_MUTED_2 }}>{user?.email}</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold" style={{ color: NW_PRODUCTO }}>{tieneEmail ? 'Conectado' : 'No configurado'}</span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl" style={{ border: `1px solid ${NW_BORDE}` }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: NW_SAND }}>
                    <GoogleIcon size={15} />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: NW_TINTA }}>Google</p>
                    {tieneGoogle && <p className="text-[11px]" style={{ color: NW_MUTED_2 }}>Conectado</p>}
                  </div>
                </div>
                {tieneGoogle ? (
                  puedeDesconectarGoogle ? (
                    <button
                      onClick={() => void desconectarGoogle()}
                      disabled={conectandoAcceso}
                      className="text-[11.5px] font-bold disabled:opacity-60"
                      style={{ color: '#A04A3C' }}
                    >
                      {conectandoAcceso ? 'Un momento…' : 'Desconectar'}
                    </button>
                  ) : (
                    <span className="text-[11px]" style={{ color: NW_MUTED_2 }} title="Añade otro método antes de desconectar este">
                      <Check size={12} className="inline mr-1" />Conectado
                    </span>
                  )
                ) : (
                  <button
                    onClick={() => void conectarGoogle()}
                    disabled={conectandoAcceso}
                    className="px-3 py-1.5 rounded-full text-[11.5px] font-bold disabled:opacity-60 transition-opacity hover:opacity-80"
                    style={{ border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}
                  >
                    {conectandoAcceso ? 'Conectando…' : 'Conectar Google'}
                  </button>
                )}
              </div>
            </div>
            {accesoMsg && (
              <p className="text-[11.5px] mt-2.5" style={{ color: accesoMsg.error ? '#A04A3C' : NW_PRODUCTO }}>{accesoMsg.texto}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
