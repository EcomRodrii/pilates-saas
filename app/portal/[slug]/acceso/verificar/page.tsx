'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/student/ui/Input';
import { Button } from '@/components/student/ui/Button';
import { useAuthStudent } from '@/lib/student/auth';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { leerFirma, olvidarFirma } from '@/lib/student/consentimiento';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { invalidarCatalogo } from '@/lib/student/catalogo';

/**
 * DESIGN CONFLICT #2 — código de 4 dígitos frente a enlace por correo.
 *
 *  · Pide el diseño: `app/(auth)/verificar-email/page.tsx`, cuatro casillas de
 *    un dígito con foco automático y un botón «Confirmar».
 *  · Impone el backend: la autenticación es Supabase gotrue, y este proyecto
 *    manda ENLACES, no códigos. Las plantillas de correo no viven en el repo
 *    (`supabase/templates/*` no es lo que se envía: se editan en el panel de
 *    Supabase), así que cambiarlas para emitir un OTP de 4 dígitos sería tocar
 *    infraestructura compartida por todos los productos, no esta app.
 *  · Solución: se conserva la RANURA y su tratamiento visual, y cambia su
 *    trabajo. Esta pantalla es donde ATERRIZA el enlace del correo, y hace las
 *    dos cosas que sí hacen falta y que hoy no existen en ninguna parte del
 *    producto: elegir contraseña y firmar el alta en el estudio.
 *
 * Es también la pantalla que cierra el callejón que dejó el borrado del portal:
 * `/reservar` enlazaba a `/portal/<slug>/login` y `/portal/<slug>/acceso` para
 * «crear tu contraseña», y las dos redirigían a la misma página de la que se
 * venía.
 */
function Verificar() {
  const sp = useSearchParams();
  const r = useRouter();
  const { estudio, slug } = useEstudio();
  const href = usePortalHref();
  const { fijarPassword } = useAuthStudent(slug);
  const { socia, usuarioEmail, autenticado, isLoading, refrescar } = useSesionStudent(slug);

  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [global, setGlobal] = useState('');
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);

  const emailMostrado = usuarioEmail ?? sp.get('email') ?? 'tu email';
  // `?crear=1` lo pone el enlace de recuperación: quien viene de ahí SIEMPRE
  // tiene que elegir contraseña, aunque ya tuviera una.
  const forzarPassword = sp.get('crear') === '1';

  /**
   * Con sesión ya válida, crea la ficha de socia con la firma recogida en el
   * registro.
   *
   * ⚠️ TRAZA LEGAL. Sin firma no se crea la ficha: `socios.aceptacion_origen`
   * tiene un CHECK puesto citando el art. 7.1 del RGPD, y un alta sin
   * consentimiento persistido es justo lo que esa columna existe para impedir.
   * El `origen` NO se manda desde aquí — lo fija el servidor.
   */
  const firmarAlta = async () => {
    const firma = leerFirma(slug);
    if (!firma) return { ok: false as const, motivo: 'sin-firma' as const };

    const { data: { session } } = await supabasePortal.auth.getSession();
    if (!session?.access_token) return { ok: false as const, motivo: 'sin-sesion' as const };

    const res = await fetch('/api/public/socio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        accion: 'registrar',
        studioId: estudio.id,
        id: crypto.randomUUID(),
        nombre: firma.firma,
        telefono: firma.telefono ?? '',
        aceptacion: { fecha: firma.fecha, firma: firma.firma, versionTexto: firma.versionTexto },
      }),
    });
    if (!res.ok) return { ok: false as const, motivo: 'servidor' as const };

    olvidarFirma(slug);
    invalidarCatalogo(slug);
    await refrescar();
    return { ok: true as const };
  };

  // Si el enlace ya dejó sesión Y la alumna ya es socia y no viene a cambiar
  // contraseña, no hay nada que hacer aquí: adentro.
  useEffect(() => {
    if (isLoading || !autenticado || forzarPassword) return;
    if (socia) { r.replace(href()); return; }
    // Autenticada pero sin ficha en este estudio: se intenta firmar el alta.
    void firmarAlta().then((res) => { if (res.ok) r.replace(href()); });
    // `firmarAlta` se recrea en cada render y meterlo en las dependencias
    // volvería a lanzarlo en bucle; lo que decide es el estado de sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, autenticado, socia, forzarPassword]);

  const guardar = async () => {
    if (pass.length < 8) { setErr('Mínimo 8 caracteres'); return; }
    setErr(''); setGlobal(''); setCargando(true);

    const res = await fijarPassword(pass);
    if ('error' in res) { setCargando(false); setGlobal(res.error); return; }

    // Con contraseña puesta, se intenta también el alta si estaba pendiente.
    const alta = await firmarAlta();
    setCargando(false);

    if (!alta.ok && alta.motivo === 'servidor') {
      setGlobal('Tu contraseña se ha guardado, pero no hemos podido completar el alta. Inténtalo de nuevo.');
      return;
    }
    setListo(true);
    setTimeout(() => r.replace(href()), 900);
  };

  // Sin sesión: el enlace no se ha abierto todavía (o caducó).
  if (!isLoading && !autenticado) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h2 className="t-h1" style={{ fontSize: 22 }}>Verifica tu email</h2>
          <p className="t-meta" style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.5 }}>
            Te hemos enviado un enlace a <b>{emailMostrado}</b>. Ábrelo en este mismo móvil y entras directa.
          </p>
        </div>
        <p className="t-meta" style={{ fontSize: 12, lineHeight: 1.5 }}>
          El enlace dura una hora. Si ya ha caducado, pide otro desde la pantalla de acceso.
        </p>
        <Button variant="secondary" full onClick={() => r.push(href('/acceso/login'))}>Volver a acceso</Button>
      </div>
    );
  }

  if (listo) {
    return (
      <div className="a-pop" style={{ textAlign: 'center' }}>
        <span aria-hidden style={{ width: 64, height: 64, margin: '0 auto', borderRadius: 999, background: '#4F8A5B', color: '#fff', fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'apCheck .55s var(--ease-spring) both' }}>✓</span>
        <h2 className="t-h1" style={{ fontSize: 22, marginTop: 16 }}>Todo listo</h2>
        <p className="t-meta" style={{ marginTop: 6, fontSize: 13 }}>Te llevamos a tu estudio…</p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void guardar(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
      <div>
        <h2 className="t-h1" style={{ fontSize: 22 }}>Elige tu contraseña</h2>
        <p className="t-meta" style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.5 }}>
          Ya has verificado <b>{emailMostrado}</b>. Con una contraseña entras sin esperar al correo.
        </p>
      </div>

      {global && (
        <p role="alert" style={{ margin: 0, background: 'var(--destructive-soft)', color: 'var(--destructive-foreground)', borderRadius: 12, padding: '10px 13px', fontSize: 12.5, fontWeight: 700 }}>
          {global}
        </p>
      )}

      <Input
        label="Contraseña" type="password" autoComplete="new-password"
        value={pass} onChange={(e) => setPass(e.target.value)} error={err}
        hint="Al menos 8 caracteres."
      />
      <Button type="submit" full loading={cargando}>Guardar y entrar</Button>
    </form>
  );
}

export default function Page() {
  // `useSearchParams` exige Suspense en App Router.
  return <Suspense fallback={null}><Verificar /></Suspense>;
}
