'use client';

// «Verificación en dos pasos» en Perfil → Seguridad de la app del estudio (4-oct-
// 2026, decisión del fundador). OPCIONAL: quien no la activa entra como
// siempre, sin ningún paso más. La usan la alumna (`/perfil/seguridad`) y la
// instructora (`/equipo/perfil/seguridad`): es la misma cuenta.
//
// Se activa con una app de autenticación (hace falta un factor de Supabase para
// que exista la regla y para poder llegar a `aal2`); después, al entrar, el
// código llega al correo si entró con contraseña, y si no, el de la app
// (lib/auth/codigo-correo-reglas.ts). Desactivarla exige el código de la app de
// verdad (GoTrue no deja quitar un factor sin `aal2`). La cerradura es el
// servidor (`pasoDeLaSesion`, lib/auth-server.ts); esto es la puerta de entrada.
//
// ⚠️ Verificar un factor nuevo cierra las DEMÁS sesiones de la cuenta (así lo
// hace Supabase): se avisa antes de activarla.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useToast } from '@/components/student/ui/Toast';
import { Button } from '@/components/student/ui/Button';
import { Input } from '@/components/student/ui/Input';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { useOnline } from '@/lib/student/useOnline';
import { mensajeErrorCodigoApp } from '@/lib/auth/codigo-app';
import { reabrirCorreo } from '@/lib/auth/doble-factor-acciones';
import { DIAS_DISPOSITIVO_CONFIANZA } from '@/lib/auth/dispositivo-confianza-reglas';
import { fechaCortaEstudio } from '@/lib/utils';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'listo'; activa: boolean; factorId: string | null; nivel: 'aal1' | 'aal2' };

interface Activando { factorId: string; qr: string; secreto: string }
interface Dispositivo { id: string; nombre: string; ip: string | null; ultimoUsoEn: string; esEste: boolean }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabasePortal.auth.getSession();
  return session?.access_token ?? null;
}

/** `volverA`: la pantalla a la que vuelve tras escribir el código para desactivarla. */
export function DosPasos({ volverA }: { volverA: string }) {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const { toast } = useToast();
  const { online } = useOnline();

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [activando, setActivando] = useState<Activando | null>(null);
  const [codigo, setCodigo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);

  const leer = useCallback(async () => {
    const [factores, aal] = await Promise.all([
      supabasePortal.auth.mfa.listFactors(),
      supabasePortal.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (factores.error || aal.error) { setEstado({ tipo: 'error' }); return; }
    const verificado = factores.data.totp.find((f) => f.status === 'verified') ?? null;
    setEstado({
      tipo: 'listo', activa: !!verificado, factorId: verificado?.id ?? null,
      nivel: aal.data.currentLevel === 'aal2' ? 'aal2' : 'aal1',
    });
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- lee el estado de auth (sistema externo) al montar.
  useEffect(() => { void leer(); }, [leer]);

  const empezar = async () => {
    setTrabajando(true); setError(null);
    try {
      // Un intento anterior a medias deja un factor sin verificar, y Supabase
      // rechazaría el nuevo. Quitar uno SIN verificar no exige `aal2`.
      const { data: lista } = await supabasePortal.auth.mfa.listFactors();
      for (const f of lista?.all ?? []) {
        if (f.factor_type === 'totp' && f.status === 'unverified') await supabasePortal.auth.mfa.unenroll({ factorId: f.id });
      }
      // La app de autenticación la enseñará con el nombre del ESTUDIO (marca blanca).
      const { data, error: e } = await supabasePortal.auth.mfa.enroll({ factorType: 'totp', friendlyName: estudio.nombre, issuer: estudio.nombre });
      if (e || !data) { setError(mensajeErrorCodigoApp(e)); return; }
      setActivando({ factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret });
    } finally {
      setTrabajando(false);
    }
  };

  const confirmarActivacion = async () => {
    if (!activando || codigo.length !== 6 || trabajando) return;
    setTrabajando(true); setError(null);
    try {
      const reto = await supabasePortal.auth.mfa.challenge({ factorId: activando.factorId });
      if (reto.error) { setError(mensajeErrorCodigoApp(reto.error)); return; }
      const ok = await supabasePortal.auth.mfa.verify({ factorId: activando.factorId, challengeId: reto.data.id, code: codigo });
      if (ok.error) { setError(mensajeErrorCodigoApp(ok.error)); setCodigo(''); return; }
      await supabasePortal.auth.refreshSession();
      // Activarla vale como «pasó la app»: el correo vuelve a servir de segundo
      // paso aunque hubiera cambiado la contraseña hace poco.
      const t = await token();
      if (t) await reabrirCorreo(t);
      setActivando(null); setCodigo('');
      toast('Verificación en dos pasos activada ✓');
      await leer();
    } finally {
      setTrabajando(false);
    }
  };

  const quitar = async () => {
    if (estado.tipo !== 'listo' || !estado.factorId) return;
    setTrabajando(true); setError(null);
    try {
      const { error: e } = await supabasePortal.auth.mfa.unenroll({ factorId: estado.factorId });
      if (e) { setError(e.code === 'insufficient_aal' ? 'Para quitarla, escribe antes el código de tu app.' : 'No se ha podido quitar. Vuelve a intentarlo.'); return; }
      await supabasePortal.auth.refreshSession();
      setConfirmarQuitar(false);
      toast('Verificación en dos pasos desactivada');
      await leer();
    } finally {
      setTrabajando(false);
    }
  };

  if (estado.tipo === 'cargando') return <div className="skel" style={{ height: 120, borderRadius: 'var(--radius-card)' }} aria-busy="true" />;
  if (estado.tipo === 'error') {
    return <p className="note note--warn">No hemos podido leer tu verificación en dos pasos. Vuelve a abrir esta pantalla.</p>;
  }

  const volverAqui = encodeURIComponent(href(volverA));

  return (
    <section className="stack" style={{ ['--gap' as string]: 'var(--s-3)' }} aria-labelledby="dos-pasos-titulo">
      <div>
        <h2 id="dos-pasos-titulo" className="t-h3">Verificación en dos pasos</h2>
        <p className="t-small t-dim" style={{ marginTop: 4, lineHeight: 1.5 }}>
          {estado.activa
            ? 'Activada. Al entrar en un dispositivo nuevo te pedimos además un código: te lo enviamos al correo si entras con tu contraseña, y si entras con un enlace, con Google o con Apple, el de tu app de autenticación.'
            : 'Opcional. Además de tu contraseña, al entrar te pediremos un código. Así nadie entra en tu cuenta solo con tu contraseña.'}
        </p>
      </div>

      {estado.activa ? (
        <>
          {estado.nivel !== 'aal2' ? (
            <p className="t-meta">
              Para desactivarla, escribe antes el código de tu app.{' '}
              <Link href={`${href('/acceso/dos-pasos')}?codigo=1&next=${volverAqui}`} style={{ fontWeight: 800, color: 'var(--accent)' }}>
                Escribir el código
              </Link>
            </p>
          ) : (
            <Button variant="secondary" full disabled={!online || trabajando} onClick={() => setConfirmarQuitar(true)}>
              Desactivar
            </Button>
          )}
          <DispositivosRecordados />
        </>
      ) : !activando ? (
        <>
          <p className="t-meta" style={{ lineHeight: 1.5 }}>
            Necesitas una app de autenticación en el móvil (Google Authenticator, Authy, 1Password…). Si un día pierdes el
            móvil y no puedes abrir tu correo, {estudio.nombre} puede quitártela. Al activarla se cerrará tu sesión en tus otros dispositivos.
          </p>
          <Button full loading={trabajando} disabled={!online} onClick={() => void empezar()}>Activar</Button>
        </>
      ) : (
        <form className="stack" style={{ ['--gap' as string]: 'var(--s-3)' }} onSubmit={(e) => { e.preventDefault(); void confirmarActivacion(); }}>
          <p className="t-small">Escanea este código con tu app de autenticación y escribe el número que te muestre.</p>
          <div style={{ alignSelf: 'center', background: '#fff', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- QR SVG en data: que devuelve Supabase */}
            <img src={activando.qr} alt="Código QR para tu app de autenticación" width={176} height={176} />
          </div>
          <details className="t-meta">
            <summary style={{ cursor: 'pointer', fontWeight: 800 }}>¿No puedes escanearlo?</summary>
            <p style={{ marginTop: 6 }}>Escribe esta clave en la app:</p>
            <code style={{ display: 'block', marginTop: 4, padding: '6px 8px', borderRadius: 8, background: 'var(--muted)', fontFamily: 'ui-monospace, monospace', overflowWrap: 'anywhere', userSelect: 'all' }}>
              {activando.secreto}
            </code>
          </details>
          <Input
            label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            value={codigo} onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
            style={{ letterSpacing: '.3em', fontVariantNumeric: 'tabular-nums' }}
          />
          <Button type="submit" full loading={trabajando} disabled={codigo.length !== 6 || !online}>Activar</Button>
          <button type="button" onClick={() => { setActivando(null); setCodigo(''); setError(null); }} style={{ border: 'none', background: 'none', padding: 0, fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--muted-foreground)' }}>
            Cancelar
          </button>
        </form>
      )}

      {error && <p role="alert" className="note note--warn">{error}</p>}

      <ConfirmationDialog
        open={confirmarQuitar} onClose={() => setConfirmarQuitar(false)}
        titulo="¿Desactivar la verificación en dos pasos?"
        cuerpo="Volverás a entrar solo con tu contraseña, y se olvidarán los dispositivos recordados."
        confirmar="Sí, desactivarla" tono="danger" loading={trabajando} onConfirm={() => void quitar()}
      />
    </section>
  );
}

/** Los dispositivos en los que no se vuelve a pedir el código. */
function DispositivosRecordados() {
  const [lista, setLista] = useState<Dispositivo[] | null | 'error'>(null);
  const [quitando, setQuitando] = useState<string | null>(null);

  const leer = useCallback(async () => {
    const t = await token();
    if (!t) return;
    try {
      const res = await fetch('/api/auth/dispositivo-confianza', { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
      if (!res.ok) { setLista('error'); return; }
      setLista((await res.json() as { dispositivos: Dispositivo[] }).dispositivos);
    } catch {
      setLista('error');
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- petición al montar.
  useEffect(() => { void leer(); }, [leer]);

  const quitar = async (d: Dispositivo) => {
    const t = await token();
    if (!t || quitando) return;
    setQuitando(d.id);
    try {
      const res = await fetch(`/api/auth/dispositivo-confianza?id=${encodeURIComponent(d.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
      // Si era este, esta misma sesión deja de contar como verificada: a recargar.
      if (res.ok && d.esEste) { window.location.reload(); return; }
      await leer();
    } finally {
      setQuitando(null);
    }
  };

  if (lista === null) return null;
  if (lista === 'error') return <p className="t-meta">No se han podido cargar tus dispositivos recordados.</p>;

  return (
    <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)', marginTop: 'var(--s-2)' }}>
      <h3 className="t-label">Dispositivos recordados</h3>
      <p className="t-meta" style={{ lineHeight: 1.5 }}>
        En estos no se vuelve a pedir el código durante {DIAS_DISPOSITIVO_CONFIANZA} días desde la última vez que entras. Si no reconoces alguno, quítalo y cambia tu contraseña.
      </p>
      {lista.length === 0 ? (
        <p className="t-meta">Ninguno. Al escribir el código, marca «No volver a pedirlo en este dispositivo».</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="stack">
          {lista.map((d) => (
            <li key={d.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="t-small" style={{ fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.nombre}{d.esEste && <span style={{ marginLeft: 6, color: 'var(--accent)' }}>· Este</span>}
                </p>
                <p className="t-meta" style={{ margin: 0 }}>Último uso: {fechaCortaEstudio(d.ultimoUsoEn)}</p>
              </div>
              <Button variant="secondary" size="sm" loading={quitando === d.id} disabled={quitando != null} onClick={() => void quitar(d)}>Quitar</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
