'use client';

// Verificación en dos pasos del panel interno (A-3/A1).
//
// Dos trabajos en una pantalla:
//   - enrolar el primer autenticador (QR TOTP) de un admin que aún no tiene,
//   - pedir el código a quien ya lo tiene y ha entrado solo con contraseña.
// Al verificar, Supabase sube la sesión a `aal2` y se vuelve a donde se estaba.
//
// Las reglas (qué paso toca, cuándo se puede enrolar, a dónde volver) están en
// `lib/interno/mfa.ts`. Aquí solo se llama a `supabase.auth.mfa`.
//
// ⚠️ Verificar un factor nuevo cierra las DEMÁS sesiones de esa cuenta (así lo
// hace Supabase): si el admin tenía el panel abierto en otro dispositivo, le
// pedirá entrar otra vez.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/db/supabase';
import { useAuth } from '@/lib/auth-context';
import { destinoTrasMfa, pasoMfa, puedeEnrolarFactor, type NivelAal, type PasoMfa } from '@/lib/interno/mfa';

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
      return 'Ya tienes un autenticador. Verifica con él antes de añadir otro.';
    case 'mfa_totp_enroll_not_enabled':
    case 'mfa_totp_verify_not_enabled':
      return 'La verificación con app no está activada en este proyecto de Supabase.';
    default:
      return 'No se ha podido completar. Vuelve a intentarlo.';
  }
}

export default function PantallaMfaInterno() {
  const { user, signOut } = useAuth();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [enrolando, setEnrolando] = useState<Enrolando | null>(null);
  const [codigo, setCodigo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const volver = useCallback(() => {
    // Recarga completa, no navegación de cliente: el layout vuelve a pedir la
    // sesión con el token ya en `aal2`.
    window.location.assign(destinoTrasMfa(new URLSearchParams(window.location.search).get('volver')));
  }, []);

  const leerEstado = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setEstado({ tipo: 'sin-sesion' }); return; }
    const [aal, factores] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    if (aal.error || factores.error) {
      setError(mensajeDeError(aal.error ?? factores.error));
      setEstado({ tipo: 'paso', paso: 'enrolar', nivel: 'aal1', factorVerificadoId: null, verificados: 0 });
      return;
    }
    const nivel: NivelAal = aal.data.currentLevel === 'aal2' ? 'aal2' : 'aal1';
    const verificados = factores.data.totp;
    setEstado({
      tipo: 'paso', paso: pasoMfa(verificados.length, nivel), nivel,
      factorVerificadoId: verificados[0]?.id ?? null, verificados: verificados.length,
    });
  }, []);

  // setState tras await, no en cascada — mismo falso positivo que el layout.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void leerEstado(); }, [leerEstado]);

  const empezarEnrolamiento = async () => {
    if (estado.tipo !== 'paso' || !puedeEnrolarFactor(estado.verificados, estado.nivel)) return;
    setTrabajando(true); setError(null);
    try {
      // Un intento anterior a medias deja un factor sin verificar con el mismo
      // nombre, y Supabase rechazaría el nuevo. Se limpian antes (quitar uno
      // SIN verificar no exige aal2).
      const { data: lista } = await supabase.auth.mfa.listFactors();
      for (const f of lista?.all ?? []) {
        if (f.factor_type === 'totp' && f.status === 'unverified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error: e } = await supabase.auth.mfa.enroll({
        factorType: 'totp', friendlyName: 'Tentare Internal', issuer: 'Tentare Internal',
      });
      if (e || !data) { setError(mensajeDeError(e)); return; }
      setEnrolando({ factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret });
    } finally {
      setTrabajando(false);
    }
  };

  const confirmarCodigo = async () => {
    const factorId = enrolando?.factorId ?? (estado.tipo === 'paso' ? estado.factorVerificadoId : null);
    if (!factorId || codigo.length !== 6) return;
    setTrabajando(true); setError(null);
    try {
      const reto = await supabase.auth.mfa.challenge({ factorId });
      if (reto.error) { setError(mensajeDeError(reto.error)); return; }
      const ok = await supabase.auth.mfa.verify({ factorId, challengeId: reto.data.id, code: codigo });
      if (ok.error) { setError(mensajeDeError(ok.error)); setCodigo(''); return; }
      // `verify` ya guarda la sesión nueva; refrescar deja el token en `aal2`
      // antes de que el layout vuelva a llamar a la API.
      await supabase.auth.refreshSession();
      volver();
    } finally {
      setTrabajando(false);
    }
  };

  const tarjeta = 'w-full max-w-sm rounded-2xl border border-border bg-card px-5 py-5 flex flex-col gap-3';
  const botonPrincipal = 'px-3.5 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5';

  const cabecera = (
    <div className="flex items-center gap-2.5">
      <span className="w-9 h-9 rounded-full bg-brand/10 text-brand grid place-items-center shrink-0">
        <ShieldCheck size={18} />
      </span>
      <div>
        <h1 className="text-[16px] font-bold text-foreground leading-tight">Verificación en dos pasos</h1>
        <p className="text-[12px] text-muted-foreground">Zona interna de Tentare</p>
      </div>
    </div>
  );

  const campoCodigo = (
    <form
      className="flex flex-col gap-2"
      onSubmit={e => { e.preventDefault(); void confirmarCodigo(); }}
    >
      <label htmlFor="codigo-mfa" className="text-[12.5px] font-semibold text-foreground">Código de 6 dígitos</label>
      {/* text-base (16px): por debajo, iOS amplía la página al enfocar y no vuelve. */}
      <input
        id="codigo-mfa" name="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
        value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="rounded-xl border border-border bg-background px-3 py-2 text-base tracking-[0.3em] tabular-nums text-foreground"
        autoFocus
      />
      <button type="submit" disabled={trabajando || codigo.length !== 6} className={botonPrincipal}>
        {trabajando && <Loader2 size={14} className="animate-spin" />}
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
        <p className="text-[13.5px] text-muted-foreground">Entra con tu cuenta del equipo para continuar.</p>
        <Link href="/login?destino=/interno" className={botonPrincipal}>Iniciar sesión</Link>
      </>
    );
  } else if (estado.paso === 'listo') {
    cuerpo = (
      <>
        <p className="text-[13.5px] text-muted-foreground">Esta sesión ya ha pasado la verificación en dos pasos.</p>
        <button type="button" onClick={volver} className={botonPrincipal}>Volver al panel</button>
      </>
    );
  } else if (estado.paso === 'verificar') {
    cuerpo = (
      <>
        <p className="text-[13.5px] text-muted-foreground">
          Abre tu app de autenticación y escribe el código de <strong className="text-foreground">Tentare Internal</strong>.
        </p>
        {campoCodigo}
      </>
    );
  } else if (!enrolando) {
    cuerpo = (
      <>
        <p className="text-[13.5px] text-muted-foreground">
          Desde aquí se ven los datos de todos los estudios, así que además de la contraseña te pediremos un código
          de una app de autenticación (Google Authenticator, 1Password, Authy…).
        </p>
        <button type="button" onClick={() => void empezarEnrolamiento()} disabled={trabajando} className={botonPrincipal}>
          {trabajando && <Loader2 size={14} className="animate-spin" />}
          Configurar ahora
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
    <div className="min-h-[70vh] grid place-items-center">
      <div className={tarjeta}>
        {cabecera}
        {cuerpo}
        {error && <p role="alert" className="text-[12.5px] font-semibold text-destructive">{error}</p>}
        {user && (
          <p className="text-[11.5px] text-muted-foreground border-t border-border/60 pt-2.5">
            Con la cuenta <strong className="text-foreground">{user.email}</strong>.{' '}
            <button
              type="button"
              onClick={() => { void signOut().then(() => { window.location.href = '/login?destino=/interno'; }); }}
              className="font-semibold underline"
            >
              Cambiar de cuenta
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
