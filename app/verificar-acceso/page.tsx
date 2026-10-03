'use client';
// Verificación en dos pasos del PANEL de un estudio (2-oct-2026, contrato de
// encargo; reglas en lib/auth/doble-factor-reglas.ts).
//
// Tres trabajos en una pantalla:
//   - pedir el código a quien la tiene activada y ha entrado solo con contraseña
//     (`?` sin más): sin él, la base de datos no le da nada;
//   - activarla (`?activar=1`): desde «Mi perfil», o porque su estudio la exige;
//   - decir que ya está, si la sesión ya la pasó.
// Al verificar, Supabase sube la sesión a `aal2` y se vuelve a donde se estaba.
//
// Fuera del layout del panel a propósito: ese layout carga los datos del
// estudio, que con la sesión sin verificar llegarían vacíos. Aquí solo se habla
// con `supabase.auth.mfa`. La zona interna de Tentare tiene su propia pantalla
// (app/interno/mfa), con otra marca y otro destino.
//
// ⚠️ Verificar un factor nuevo cierra las DEMÁS sesiones de esa cuenta (así lo
// hace Supabase): en otro dispositivo le pedirá entrar otra vez.
//
// «No volver a pedir el código en este dispositivo» (3-oct-2026): desmarcada
// por defecto (en el iPad compartido de recepción el código es justo lo que
// protege la cuenta), recuerda el navegador 30 días desde su último uso
// (lib/auth/dispositivo-confianza-reglas.ts). Si llega aquí con el navegador
// ya recordado, entra sin escribir nada; `?codigo=1` lo pide igual (para lo
// que Supabase solo deja hacer con el código de verdad, como quitar la
// verificación).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/db/supabase';
import { useAuth } from '@/lib/auth-context';
import { pasoMfa, puedeEnrolarFactor, type NivelAal, type PasoMfa } from '@/lib/interno/mfa';
import { destinoTrasVerificar } from '@/lib/auth/doble-factor-reglas';
import { confiarEnEsteDispositivo, recordarEsteDispositivo } from '@/lib/auth/doble-factor-cliente';
import { DIAS_DISPOSITIVO_CONFIANZA } from '@/lib/auth/dispositivo-confianza-reglas';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'sin-sesion' }
  | { tipo: 'paso'; paso: PasoMfa; nivel: NivelAal; factorVerificadoId: string | null; verificados: number };

interface Enrolando { factorId: string; qr: string; secreto: string }

function mensajeDeError(e: { code?: string; message?: string } | null | undefined): string {
  switch (e?.code) {
    case 'mfa_verification_failed':
    case 'mfa_verification_rejected':
      return 'Código incorrecto. Comprueba que la hora del móvil es la correcta y prueba con el siguiente.';
    case 'mfa_challenge_expired':
      return 'El código ha caducado. Escribe el que muestra ahora la app.';
    case 'insufficient_aal':
      return 'Ya tienes la verificación activada. Escribe primero el código de tu app.';
    case 'mfa_totp_enroll_not_enabled':
    case 'mfa_totp_verify_not_enabled':
      return 'La verificación en dos pasos no está disponible ahora mismo. Escríbenos.';
    default:
      return 'No se ha podido completar. Vuelve a intentarlo.';
  }
}

export default function PantallaVerificarAcceso() {
  const { user, signOut } = useAuth();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [enrolando, setEnrolando] = useState<Enrolando | null>(null);
  const [codigo, setCodigo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exigida, setExigida] = useState(false);
  const [recordar, setRecordar] = useState(false);

  const volver = useCallback(() => {
    // Recarga completa: el panel vuelve a pedir los datos con el token ya en `aal2`.
    window.location.assign(destinoTrasVerificar(new URLSearchParams(window.location.search).get('volver')));
  }, []);

  const leerEstado = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setEstado({ tipo: 'sin-sesion' }); return; }
    const [aal, factores, porEstudio] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
      // Solo para el texto: ¿la pide su estudio? La decisión es del servidor.
      fetch('/api/auth/doble-factor', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ estudioLoExige?: boolean } | null>,
    ]);
    setExigida(porEstudio?.estudioLoExige === true);
    if (aal.error || factores.error) {
      setError(mensajeDeError(aal.error ?? factores.error));
      setEstado({ tipo: 'paso', paso: 'enrolar', nivel: 'aal1', factorVerificadoId: null, verificados: 0 });
      return;
    }
    const nivel: NivelAal = aal.data.currentLevel === 'aal2' ? 'aal2' : 'aal1';
    const verificados = factores.data.totp;
    // Navegador recordado: entra sin código (salvo que se pida a propósito).
    if (nivel === 'aal1' && verificados.length > 0 && new URLSearchParams(window.location.search).get('codigo') !== '1') {
      const confianza = await confiarEnEsteDispositivo(session.access_token);
      if (confianza !== 'no') { volver(); return; }
    }
    setEstado({
      tipo: 'paso', paso: pasoMfa(verificados.length, nivel), nivel,
      factorVerificadoId: verificados[0]?.id ?? null, verificados: verificados.length,
    });
  }, [volver]);

  // setState tras await, no en cascada — mismo falso positivo que la pantalla interna.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void leerEstado(); }, [leerEstado]);

  const empezarActivacion = async () => {
    if (estado.tipo !== 'paso' || !puedeEnrolarFactor(estado.verificados, estado.nivel)) return;
    setTrabajando(true); setError(null);
    try {
      // Un intento anterior a medias deja un factor sin verificar; Supabase
      // rechazaría el nuevo. Quitar uno SIN verificar no exige aal2.
      const { data: lista } = await supabase.auth.mfa.listFactors();
      for (const f of lista?.all ?? []) {
        if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Tentare', issuer: 'Tentare' });
      if (e || !data) { setError(mensajeDeError(e)); return; }
      setEnrolando({ factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret });
    } finally {
      setTrabajando(false);
    }
  };

  const confirmarCodigo = async () => {
    const factorId = enrolando?.factorId ?? (estado.tipo === 'paso' ? estado.factorVerificadoId : null);
    if (!factorId || codigo.length !== 6 || trabajando) return;
    setTrabajando(true); setError(null);
    try {
      const reto = await supabase.auth.mfa.challenge({ factorId });
      if (reto.error) { setError(mensajeDeError(reto.error)); return; }
      const ok = await supabase.auth.mfa.verify({ factorId, challengeId: reto.data.id, code: codigo });
      if (ok.error) { setError(mensajeDeError(ok.error)); setCodigo(''); return; }
      // `verify` ya guarda la sesión nueva; refrescar deja el token en `aal2`
      // antes de que el panel vuelva a pedir datos.
      await supabase.auth.refreshSession();
      // Con el token ya en `aal2`. Si falla, solo la próxima vez lo volverá a pedir.
      if (recordar) await recordarEsteDispositivo();
      volver();
    } finally {
      setTrabajando(false);
    }
  };

  const tarjeta = 'w-full max-w-sm rounded-2xl border border-border bg-card px-5 py-5 flex flex-col gap-3';
  const botonPrincipal = 'px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5';

  const cabecera = (
    <div className="flex items-center gap-2.5">
      <span className="w-9 h-9 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0">
        <ShieldCheck size={18} aria-hidden />
      </span>
      <div>
        <h1 className="text-[16px] font-bold text-foreground leading-tight">Verificación en dos pasos</h1>
        <p className="text-[12px] text-muted-foreground">Tu acceso al panel del estudio</p>
      </div>
    </div>
  );

  const campoCodigo = (
    <form className="flex flex-col gap-2" onSubmit={e => { e.preventDefault(); void confirmarCodigo(); }}>
      <label htmlFor="codigo-2fa" className="text-[12.5px] font-semibold text-foreground">Código de 6 dígitos</label>
      {/* text-base (16px): por debajo, iOS amplía la página al enfocar y no vuelve. */}
      <input
        id="codigo-2fa" name="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
        value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="rounded-xl border border-border bg-background px-3 py-2 text-base tracking-[0.3em] tabular-nums text-foreground"
        autoFocus
      />
      <label className="flex items-start gap-2 text-[12.5px] text-foreground cursor-pointer select-none">
        <input
          type="checkbox" checked={recordar} onChange={e => setRecordar(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        />
        <span>
          No volver a pedir el código en este dispositivo
          <span className="block text-[11.5px] text-muted-foreground">
            Durante {DIAS_DISPOSITIVO_CONFIANZA} días desde la última vez que entres. Márcalo solo en un dispositivo que uses únicamente tú.
          </span>
        </span>
      </label>
      <button type="submit" disabled={trabajando || codigo.length !== 6} className={botonPrincipal}>
        {trabajando && <Loader2 size={14} className="animate-spin" aria-hidden />}
        Verificar
      </button>
    </form>
  );

  let cuerpo: React.ReactNode;
  if (estado.tipo === 'cargando') {
    cuerpo = <p className="text-[13px] text-muted-foreground">Comprobando tu sesión…</p>;
  } else if (estado.tipo === 'sin-sesion') {
    cuerpo = (
      <>
        <p className="text-[13.5px] text-muted-foreground">Entra con tu cuenta para continuar.</p>
        <Link href="/login" className={botonPrincipal}>Iniciar sesión</Link>
      </>
    );
  } else if (estado.paso === 'listo') {
    cuerpo = (
      <>
        <p className="text-[13.5px] text-muted-foreground">Tienes la verificación en dos pasos activada y esta sesión ya la ha pasado.</p>
        <button type="button" onClick={volver} className={botonPrincipal}>Volver al panel</button>
      </>
    );
  } else if (estado.paso === 'verificar') {
    cuerpo = (
      <>
        <p className="text-[13.5px] text-muted-foreground">
          Abre tu app de autenticación y escribe el código de <strong className="text-foreground">Tentare</strong>.
        </p>
        {campoCodigo}
      </>
    );
  } else if (!enrolando) {
    cuerpo = (
      <>
        <p className="text-[13.5px] text-muted-foreground">
          {exigida
            ? 'Tu estudio pide verificación en dos pasos a todo el equipo. Además de la contraseña, al entrar te pediremos un código de una app de autenticación (Google Authenticator, 1Password, Authy…).'
            : 'Además de la contraseña, al entrar te pediremos un código de una app de autenticación (Google Authenticator, 1Password, Authy…). Así nadie entra solo con tu contraseña.'}
        </p>
        <button type="button" onClick={() => void empezarActivacion()} disabled={trabajando} className={botonPrincipal}>
          {trabajando && <Loader2 size={14} className="animate-spin" aria-hidden />}
          Activar ahora
        </button>
      </>
    );
  } else {
    cuerpo = (
      <>
        <p className="text-[13.5px] text-muted-foreground">
          Escanea el código con tu app de autenticación y escribe el número que te muestre.
        </p>
        <div className="self-center rounded-xl bg-white p-2 border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR SVG en data: que devuelve Supabase */}
          <img src={enrolando.qr} alt="Código QR para la app de autenticación" width={176} height={176} />
        </div>
        <details className="text-[12px] text-muted-foreground">
          <summary className="cursor-pointer font-semibold">¿No puedes escanearlo?</summary>
          <p className="mt-1">Escribe esta clave en la app:</p>
          <code className="mt-1 block break-all rounded-lg bg-muted px-2 py-1.5 font-mono text-[12px] text-foreground select-all">
            {enrolando.secreto}
          </code>
        </details>
        {campoCodigo}
      </>
    );
  }

  return (
    <main className="min-h-dvh grid place-items-center bg-background px-4 py-10">
      <div className={tarjeta}>
        {cabecera}
        {cuerpo}
        {error && <p role="alert" className="text-[12.5px] font-semibold text-destructive">{error}</p>}
        {user && (
          <p className="text-[11.5px] text-muted-foreground border-t border-border/60 pt-2.5">
            Con la cuenta <strong className="text-foreground">{user.email}</strong>.{' '}
            <button
              type="button"
              onClick={() => {
                void signOut().then(() => {
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga dura a propósito: al cambiar de cuenta no puede quedar en memoria nada de la anterior.
                  window.location.href = '/login';
                });
              }}
              className="font-semibold underline"
            >
              Cambiar de cuenta
            </button>
          </p>
        )}
      </div>
    </main>
  );
}
