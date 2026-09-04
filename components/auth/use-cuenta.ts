'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';

// P-10 (auditoría 21ª pasada): `ModalCuenta.tsx` (Network) y `TabPerfil.tsx`
// (Studio) implementaban por separado el MISMO flujo — cambiar email, cambiar
// contraseña (con captcha y reauth), conectar/desconectar Google — sobre la
// misma cuenta de Supabase Auth. Hoy eran idénticos; ya habían empezado a
// divergir (`ModalCuenta` limpiaba el mensaje de error al reintentar,
// `TabPerfil` no lo hacía). Extraído aquí para que el próximo fix de auth
// llegue a los dos a la vez, no a uno solo.
//
// Solo la LÓGICA: cada superficie pinta su propio envoltorio visual (tokens
// NW_* en modal vs cardCls/inputCls de configuración) — unificar eso sería
// forzar un mismo diseño donde el propio kit de marca dice que no lo es.
export function useCuenta() {
  const { user, updateEmail, updatePassword, linkGoogle, unlinkGoogle } = useAuth();
  // Cambiar la contraseña reautentica por detrás, y eso es una llamada de auth
  // más: con Turnstile activo en el proyecto, sin token la rechaza gotrue.
  const { widget: captcha, pedirToken } = useCaptcha();

  const [nuevoEmail, setNuevoEmail] = useState('');
  const [cambiandoEmail, setCambiandoEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ error: boolean; texto: string } | null>(null);

  const [passwordForm, setPasswordForm] = useState({ actual: '', nueva: '', confirmar: '' });
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ error: boolean; texto: string } | null>(null);

  // Se lee de user.identities (fuente nativa de Supabase, no un booleano
  // propio) para que nunca se desincronice de lo que gotrue realmente tiene
  // vinculado.
  const identidades = user?.identities ?? [];
  const tieneGoogle = identidades.some(i => i.provider === 'google');
  const tieneEmail = identidades.some(i => i.provider === 'email');
  // Desvincular deja al usuario sin ese método: solo se ofrece si queda al
  // menos otro (mismo requisito que ya impone gotrue del lado servidor —
  // esto es solo para no enseñar un botón que unlinkGoogle acabaría
  // rechazando).
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
    // En el caso feliz esta pestaña navega a Google y no vuelve a este punto;
    // solo llegamos aquí si gotrue rechazó antes de redirigir.
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

  return {
    user, captcha,
    nuevoEmail, setNuevoEmail, cambiandoEmail, emailMsg, cambiarEmail,
    passwordForm, setPasswordForm, cambiandoPassword, passwordMsg, cambiarPassword,
    tieneGoogle, tieneEmail, puedeDesconectarGoogle, conectandoAcceso, accesoMsg,
    conectarGoogle, desconectarGoogle,
  };
}
