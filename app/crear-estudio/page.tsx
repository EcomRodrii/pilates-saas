'use client';

import { useState, useId } from 'react';
import Link from 'next/link';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { captchaGastado } from '@/lib/auth/captcha-usado';
import { CAMPO_TRAMPA } from '@/lib/auth/trampa-bots';

// Tentare todavía no está lanzado al público: crear un estudio de verdad aquí
// crearía cuentas antes de que el producto esté listo para recibirlas. Mientras
// tanto, esta pantalla solo recoge el email (vía /api/public/interes-lanzamiento,
// que cae en `plataforma_lead` con origen `ALTA`) para avisar por email
// marketing en cuanto se active. La lógica de alta real sigue viva en
// `dbCreateStudio`/`app/login` (metadata `pending_studio`) para cuando se
// reactive — no se ha borrado, solo ha dejado de dispararse desde aquí.
export default function CrearEstudioPage() {
  const uid = useId();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [estudio, setEstudio] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');
  // El campo trampa. Una persona no puede verlo ni enfocarlo, así que esto se
  // queda vacío siempre; si llega con algo, lo ha rellenado un bot.
  const [trampa, setTrampa] = useState('');
  const { widget: captcha, pedirToken } = useCaptcha();

  // El captcha de esta pantalla estuvo un tiempo siendo decoración: el widget
  // se pintaba y bloqueaba el botón, pero la petición **jamás incluyó el
  // token** y el endpoint no comprobaba ninguno. Frenaba a personas y a ningún
  // bot, porque un bot llama a la API directamente sin abrir el formulario.
  //
  // Ahora el token viaja y `/api/public/interes-lanzamiento` lo verifica
  // contra el `siteverify` de Cloudflare. Y ya no se ve nada: el widget está
  // invisible hasta que de verdad haya que resolver algo a mano.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      // Se pide AL ENVIAR, con el botón ya en «Enviando…»: tarda unos
      // segundos, y antes de esta llamada no hay nada que verificar.
      const token = await pedirToken();
      if (token === null) { setError(ERROR_CAPTCHA); return; }
      const res = await fetch('/api/public/interes-lanzamiento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, nombre, estudio, ciudad, captchaToken: token || undefined, [CAMPO_TRAMPA]: trampa }),
      });
      // Un token se gasta al verificarlo, vaya bien o mal. Sin esto, corregir
      // el email y reintentar fallaría por el captcha y no por el email.
      if (token) captchaGastado();
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'No se ha podido registrar tu email. Inténtalo de nuevo.');
        return;
      }
      setEnviado(true);
    } catch {
      setError('No se ha podido registrar tu email. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#EEEEE8] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-border overflow-hidden">
          {!enviado ? (
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                  <Sparkles size={20} className="text-[#5A6142]" />
                </div>
                <div>
                  <h1 className="text-[18px] font-bold text-[#111827] leading-tight">Todavía no hemos abierto</h1>
                  <p className="text-[13px] text-[#6B7280]">Estamos afinando los últimos detalles</p>
                </div>
              </div>

              <p className="text-[14px] text-[#374151]">
                Deja tu email y te avisamos en cuanto puedas crear tu estudio en Tentare.
              </p>

              <div className="space-y-3">
                <div>
                  <label htmlFor={`${uid}-email`} className="block text-[13px] font-medium text-[#374151] mb-1">Email</label>
                  <input id={`${uid}-email`}
                    required
                    type="email"
                    placeholder="maria@miestudio.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#1A1A1A] focus:ring-2 focus:ring-[#1A1A1A]/10 transition"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-nombre`} className="block text-[13px] font-medium text-[#374151] mb-1">Tu nombre <span className="font-normal text-[#9CA3AF]">(opcional)</span></label>
                  <input id={`${uid}-nombre`}
                    type="text"
                    placeholder="Ej. María García"
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#1A1A1A] focus:ring-2 focus:ring-[#1A1A1A]/10 transition"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-estudio`} className="block text-[13px] font-medium text-[#374151] mb-1">Nombre del estudio <span className="font-normal text-[#9CA3AF]">(opcional)</span></label>
                  <input id={`${uid}-estudio`}
                    type="text"
                    placeholder="Ej. Tentare"
                    value={estudio}
                    onChange={e => setEstudio(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#1A1A1A] focus:ring-2 focus:ring-[#1A1A1A]/10 transition"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-ciudad`} className="block text-[13px] font-medium text-[#374151] mb-1">Ciudad <span className="font-normal text-[#9CA3AF]">(opcional)</span></label>
                  <input id={`${uid}-ciudad`}
                    type="text"
                    placeholder="Ej. Madrid"
                    value={ciudad}
                    onChange={e => setCiudad(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-[14px] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#1A1A1A] focus:ring-2 focus:ring-[#1A1A1A]/10 transition"
                  />
                </div>
              </div>

              {/* El campo trampa. Fuera de la pantalla y no `display:none`: hay
                  bots que saltan lo oculto por CSS pero no lo que está
                  desplazado. `aria-hidden` + `tabIndex={-1}` lo dejan
                  inalcanzable para un lector de pantalla y para el tabulador,
                  así que ninguna persona puede rellenarlo sin querer.
                  `autoComplete="off"` evita que el navegador lo rellene solo,
                  que sería un falso positivo con nombre y apellidos. */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
                <label htmlFor={`${uid}-${CAMPO_TRAMPA}`}>Tu página web</label>
                <input
                  id={`${uid}-${CAMPO_TRAMPA}`}
                  name={CAMPO_TRAMPA}
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={trampa}
                  onChange={e => setTrampa(e.target.value)}
                />
              </div>

              {error && (
                <p className="text-[13px] text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
              )}

              {/* Sin margen propio: mide 0 px salvo que Cloudflare pida
                  resolver algo a mano. */}
              {captcha}

              <button
                type="submit"
                disabled={enviando}
                className="w-full py-3 rounded-xl bg-[var(--brand)] text-[var(--brand-foreground)] font-semibold text-[15px] hover:brightness-110 transition-all disabled:opacity-60"
              >
                {enviando ? 'Enviando…' : 'Avísame cuando esté activo →'}
              </button>
            </form>
          ) : (
            <div className="p-6 space-y-4 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
                  <CheckCircle2 size={32} className="text-[#5A6142]" />
                </div>
              </div>
              <div>
                <h1 className="text-[18px] font-bold text-[#111827]">¡Apuntado!</h1>
                <p className="text-[14px] text-[#6B7280] mt-1">
                  Te escribiremos a <strong className="text-[#111827]">{email}</strong> en cuanto Tentare esté activo.
                </p>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-[12px] text-[#9CA3AF] mt-4">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-[#5A6142] hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
