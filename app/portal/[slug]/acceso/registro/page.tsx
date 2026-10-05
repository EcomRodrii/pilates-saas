'use client';

import { useEffect, useState } from 'react';
import { guardarReferidor } from '@/lib/student/referido-sesion';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/student/ui/Input';
import { Button } from '@/components/student/ui/Button';
import { Sheet } from '@/components/student/ui/Sheet';
import { useAuthStudent } from '@/lib/student/auth';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useOnline } from '@/lib/student/useOnline';
import { guardarFirma, leerFirma } from '@/lib/student/consentimiento';
import { catalogo } from '@/lib/student/catalogo';
import { textoConsentimientoMarketing, textoLegalCompleto } from '@/lib/legal-textos';
import { useSesionStudent } from '@/lib/student/sesion';
import { Icono } from '@/components/student/ui/Icono';
import { PuertaDeEntrada } from '@/components/student/acceso/PuertaDeEntrada';

/**
 * Darse de alta en el estudio (P08, 5-oct-2026). Dos cosas que de verdad son
 * distintas, como siempre:
 *
 *  1. La IDENTIDAD (gotrue). Ya no lleva contraseña: es la misma puerta que
 *     entrar —correo y código— y el código crea la cuenta si no existe. Sin
 *     sesión, esta pantalla ES esa puerta (`PuertaDeEntrada`).
 *  2. La FICHA DE SOCIA de este estudio, que necesita un JWT verificado. Con
 *     sesión y sin ficha, esta pantalla es «Tus datos»: nombre, teléfono y el
 *     consentimiento del ESTUDIO. Aquí llega desde `/acceso/verificar` (rama
 *     sin-firma, `?firma=1`) tras el código, Google o Apple, o desde la app
 *     Tentare cuando eliges un estudio en el que aún no estás.
 *
 * ⚠️ Lo que no cambia, y es lo que importa del alta: la firma se guarda en
 * `sessionStorage` (`guardarFirma`) con el texto legal COMPLETO del estudio que
 * se ha leído y aceptado, y la persiste `/acceso/verificar` (`firmarAlta`) en
 * cuanto hay sesión. `socios.aceptacion_origen` lo fija el servidor, nunca el
 * cliente. Sin firma no hay ficha.
 *
 * La contraseña deja de pedirse aquí. Quien la quiera la crea con «¿Has
 * olvidado la contraseña?» (el enlace de recuperación lleva a «Elige tu
 * contraseña», `?crear=1`, que vale también para quien nunca tuvo una) y la
 * cambia en Perfil → Seguridad, que hoy pide la actual.
 *
 * ── `?firma=1` sin sesión ───────────────────────────────────────────────────
 * Recoge la firma ANTES de ir a Google. Ya no lo usa ningún camino del producto
 * (el consentimiento se pide a la vuelta, ver `acceso/verificar`), pero un
 * enlace viejo puede traerlo y sigue funcionando.
 */
export default function RegistroPage() {
  const r = useRouter();
  const sp = useSearchParams();
  const { estudio, slug } = useEstudio();
  const href = usePortalHref();
  const { online } = useOnline();
  const { entrarConGoogle } = useAuthStudent(slug);
  const { autenticado, isLoading, socia } = useSesionStudent(slug);

  // ⚠️ Quien invita viaja en el enlace y hay que guardarlo: entre esta pantalla
  // y la que crea la ficha hay un correo o una vuelta por Google, y la query no
  // sobrevive a eso. En un EFECTO: escribir en `sessionStorage` no es render.
  const refDelEnlace = sp.get('ref');
  useEffect(() => {
    if (refDelEnlace) guardarReferidor(slug, refDelEnlace);
  }, [slug, refDelEnlace]);

  // Ya es alumna de este estudio (abrió un enlace de invitación con la sesión
  // puesta): no hay datos que pedirle. `/acceso/verificar` sabe a dónde va.
  useEffect(() => {
    if (!isLoading && autenticado && socia) r.replace(href('/acceso/verificar'));
  }, [isLoading, autenticado, socia, r, href]);

  // «Tus datos» en cuanto hay sesión, aunque no venga `?firma=1` (la app Tentare
  // manda aquí a quien ya ha entrado): pedirle otra vez correo sería pedirle
  // una cuenta que ya tiene.
  const tusDatos = sp.get('firma') === '1' || autenticado;

  if (!tusDatos) {
    // Mientras se sabe si hay sesión, nada: la puerta asomaría un instante a
    // quien ya ha entrado y viene a darse de alta en otro estudio.
    if (isLoading) return <p className="t-meta" role="status" aria-busy>Un momento…</p>;
    return (
      <PuertaDeEntrada
        titulo={`Únete a ${estudio.nombre}`}
        subtitulo="Te mandamos un código a tu correo. Después solo te pedimos tu nombre."
        destino={href()}
      />
    );
  }
  return <TusDatos viaCodigo={sp.get('via') === 'codigo'} autenticado={autenticado} online={online} entrarConGoogle={entrarConGoogle} alTerminar={() => r.replace(href('/acceso/verificar'))} />;
}

const PASOS = ['Correo', 'Código', 'Tus datos'] as const;

function TusDatos({ viaCodigo, autenticado, online, entrarConGoogle, alTerminar }: {
  /** Viene del código del correo: se pinta la tira «Correo · Código · Tus datos». */
  viaCodigo: boolean;
  autenticado: boolean;
  online: boolean;
  entrarConGoogle: () => Promise<{ ok: true } | { error: string }>;
  alTerminar: () => void;
}) {
  const { estudio, slug } = useEstudio();
  const href = usePortalHref();

  // `marketing` empieza en false y así debe quedarse: el RGPD no admite la casilla premarcada.
  const [f, setF] = useState({ nombre: '', telefono: '', acepto: false, marketing: false });
  const [err, setErr] = useState<Record<string, string>>({});
  const [global, setGlobal] = useState('');
  const [cargando, setCargando] = useState(false);
  const [verLegal, setVerLegal] = useState(false);

  // Los dos documentos DEL ESTUDIO, que es lo que se firma. Salen del payload
  // público (`studioPublico` ya los compone con los de por defecto si el estudio
  // no los ha reescrito), no de una constante: cada estudio tiene los suyos y lo
  // que se guarda es el texto vigente hoy.
  const [legal, setLegal] = useState<{ privacidad: string; terminos: string } | null>(null);
  useEffect(() => {
    let vivo = true;
    void catalogo(slug).then((d) => {
      if (!vivo || !d?.studio) return;
      const s = d.studio as { politicaPrivacidad?: string; terminosServicio?: string };
      setLegal({ privacidad: s.politicaPrivacidad ?? '', terminos: s.terminosServicio ?? '' });
    });
    return () => { vivo = false; };
  }, [slug]);
  const textoLegal = legal ? textoLegalCompleto({ politicaPrivacidad: legal.privacidad, terminosServicio: legal.terminos }) : '';

  /**
   * Guardar el consentimiento y seguir. Sin captcha a propósito: aquí no se
   * crea ninguna credencial.
   *
   * Se exige `textoLegal` cargado: sin él la firma iría con `versionTexto`
   * vacío, `firmaCompleta()` la rechazaría y el alta moriría al volver.
   */
  const firmarYSeguir = async () => {
    const e: Record<string, string> = {};
    if (!f.nombre.trim()) e.nombre = 'Escribe tu nombre';
    if (!f.acepto) e.acepto = 'Necesitamos tu consentimiento';
    setErr(e); setGlobal('');
    if (Object.keys(e).length) return;
    if (!textoLegal) { setGlobal('Estamos cargando las condiciones. Inténtalo en un segundo.'); return; }

    setCargando(true);
    guardarFirma(slug, {
      fecha: new Date().toISOString(),
      firma: f.nombre.trim(),
      versionTexto: textoLegal,
      telefono: f.telefono.trim() || undefined,
      marketing: f.marketing || undefined,
    });

    // `guardarFirma` se traga sus fallos (modo privado, almacenamiento lleno):
    // sin comprobarla, `verificar` volvería a mandarnos aquí y las dos
    // pantallas se rebotarían en bucle.
    if (!leerFirma(slug)) {
      setCargando(false);
      setGlobal('Tu navegador no nos deja guardar el consentimiento. Prueba a salir del modo privado y vuelve a intentarlo.');
      return;
    }

    // Con sesión: a la pantalla que persiste el alta y la deja dentro.
    if (autenticado) { alTerminar(); return; }

    const res = await entrarConGoogle();
    // Solo se llega aquí si gotrue rechazó ANTES de redirigir.
    if ('error' in res) { setCargando(false); setGlobal(res.error); }
  };

  const casilla = (marcada: boolean) => ({
    width: 20, height: 20, flexShrink: 0, marginTop: 1, borderRadius: 6, border: 'none',
    background: marcada ? 'var(--accent)' : 'var(--card)', boxShadow: marcada ? 'none' : 'inset 0 0 0 1.5px var(--border-strong)',
    color: 'var(--accent-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'all .2s',
  }) as const;

  return (
    <form onSubmit={(e) => { e.preventDefault(); void firmarYSeguir(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
      {viaCodigo && (
        <ol aria-label="Pasos para entrar" style={{ display: 'flex', gap: 6, listStyle: 'none', margin: '0 0 4px', padding: 0 }}>
          {PASOS.map((p, i) => {
            const actual = i === PASOS.length - 1;
            return (
              <li key={p} aria-current={actual ? 'step' : undefined} style={{ flex: 1, minWidth: 0 }}>
                <span aria-hidden style={{ display: 'block', height: 3, borderRadius: 99, background: 'var(--accent)' }} />
                <span className="t-meta" style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 5, fontWeight: actual ? 800 : 600, color: actual ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                  {!actual && <Icono nombre="hecho" tamano={13} grosor={2} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                  {p}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div>
        <h2 className="t-h1">Tus datos</h2>
        <p className="t-meta" style={{ marginTop: 4, lineHeight: 1.5 }}>
          {/* Con sesión ya resuelta NO se dice «si aún no lo estás»: aquí solo se
              llega después de comprobar que no hay ficha en este estudio. */}
          {autenticado
            ? `Es tu primera vez en ${estudio.nombre}: solo nos falta tu nombre.`
            : `Tu nombre y tu consentimiento, para darte de alta en ${estudio.nombre} si aún no lo estás.`}
        </p>
      </div>

      {global && (
        <p role="alert" style={{ margin: 0, background: 'var(--destructive-soft)', color: 'var(--destructive-foreground)', borderRadius: 12, padding: '10px 13px', fontSize: 'var(--t-small)', fontWeight: 700 }}>
          {global}
        </p>
      )}

      <Input label="Nombre" autoComplete="name" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} error={err.nombre} />
      {/* Opcional: ningún estudio puede hoy exigir el teléfono en el alta. Si lo
          necesita, lo pide en sus preguntas, que se contestan al entrar. */}
      <Input label="Teléfono" type="tel" autoComplete="tel" inputMode="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} hint="Para avisarte si se libera una plaza. Opcional." />

      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
        <button
          type="button" role="checkbox" aria-checked={f.acepto}
          aria-label={`Acepto las condiciones y la política de privacidad de ${estudio.nombre}`}
          onClick={() => setF({ ...f, acepto: !f.acepto })}
          style={casilla(f.acepto)}
        >
          {f.acepto && <Icono nombre="hecho" tamano={16} grosor={2} />}
        </button>
        <span style={{ fontSize: 'var(--t-small)', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
          He leído y acepto{' '}
          {/* El texto del ESTUDIO, el mismo que se firma, en una hoja: antes este
              enlace llevaba a la política de Tentare, que no es lo que acepta. */}
          <button
            type="button" onClick={() => setVerLegal(true)} disabled={!legal}
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--foreground)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}
          >
            las condiciones y la política de privacidad
          </button>{' '}
          de {estudio.nombre}.
        </span>
      </label>
      {err.acepto && <p role="alert" className="field-error" style={{ marginTop: -6 }}>{err.acepto}</p>}

      {/* Consentimiento de marketing: APARTE del contrato, desmarcado y opcional.
          No marcarlo no cambia nada del alta (RGPD art. 7.4). */}
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
        <button
          type="button" role="checkbox" aria-checked={f.marketing}
          aria-label={`Quiero recibir novedades y ofertas de ${estudio.nombre} por email`}
          onClick={() => setF({ ...f, marketing: !f.marketing })}
          style={casilla(f.marketing)}
        >
          {f.marketing && <Icono nombre="hecho" tamano={16} grosor={2} />}
        </button>
        <span style={{ fontSize: 'var(--t-small)', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
          Quiero recibir novedades y ofertas de {estudio.nombre} por email (opcional).
        </span>
      </label>
      {/* Fuera de la <label>: dentro, abrir «Qué acepto» marcaría la casilla. */}
      <details style={{ marginTop: -6, marginLeft: 30, fontSize: 'var(--t-small)', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--foreground)', fontWeight: 700 }}>Qué acepto</summary>
        {textoConsentimientoMarketing({ nombre: estudio.nombre })}
      </details>

      <Button type="submit" full loading={cargando} disabled={!online} style={{ marginTop: 4 }}>
        {!online ? 'Sin conexión' : autenticado ? 'Entrar' : 'Aceptar y continuar con Google'}
      </Button>

      <p className="t-meta" style={{ textAlign: 'center' }}>
        <Link href={href('/acceso/login')} style={{ fontWeight: 800, color: 'var(--foreground)' }}>Volver a acceso</Link>
      </p>

      <Sheet open={verLegal} onClose={() => setVerLegal(false)} label={`Condiciones y privacidad de ${estudio.nombre}`}>
        <div className="px" style={{ paddingBottom: 16 }}>
          <h2 className="t-title">Condiciones y privacidad de {estudio.nombre}</h2>
          <div data-testid="texto-legal-estudio" style={{ maxHeight: '60vh', overflowY: 'auto', marginTop: 10 }}>
            <h3 className="t-card-title" style={{ marginTop: 6 }}>Política de privacidad</h3>
            <p className="t-small" style={{ whiteSpace: 'pre-wrap', marginTop: 6, color: 'var(--muted-foreground)' }}>{legal?.privacidad}</p>
            <h3 className="t-card-title" style={{ marginTop: 14 }}>Condiciones del servicio</h3>
            <p className="t-small" style={{ whiteSpace: 'pre-wrap', marginTop: 6, color: 'var(--muted-foreground)' }}>{legal?.terminos}</p>
          </div>
          <Button variant="secondary" full onClick={() => setVerLegal(false)} style={{ marginTop: 14 }}>Cerrar</Button>
        </div>
      </Sheet>
    </form>
  );
}
