'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { useAuthStudent } from '@/lib/student/auth';
import {
  debeElegirComoEntrar, recordarEleccionAlumna, unirseComoInstructora,
} from '@/lib/student/sesion-instructora';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

/**
 * «¿Cómo quieres entrar?» — instructora o alumna (decisión del fundador,
 * 15-sep-2026).
 *
 * La propietaria da de alta a una instructora en Equipo con su correo. Cuando
 * ella entra en la app del estudio con ese correo, llega aquí en vez de darse
 * de alta como alumna sin preguntar (que es lo que pasaba: aparecía como
 * clienta nueva en el panel).
 *
 *  · Como instructora → une su cuenta a esa ficha (`/api/portal/instructora/unirse`,
 *    que exige el correo verificado) y va a su parte, que empieza por sus horarios.
 *  · Como alumna → sigue el alta de alumna de siempre, con su consentimiento.
 *    No se le vuelve a preguntar en este dispositivo.
 *
 * Solo la ve quien tiene esa ficha pendiente: a cualquier otra persona la
 * devuelve a su sitio sin enseñar nada.
 */
export default function ElegirComoEntrar() {
  const r = useRouter();
  const { estudio, slug } = useEstudio();
  const href = usePortalHref();
  const { socia, usuarioEmail, autenticado, isLoading } = useSesionStudent(slug);
  const { logout } = useAuthStudent(slug);
  const [puedeElegir, setPuedeElegir] = useState(false);
  const [enviando, setEnviando] = useState<'instructora' | 'alumna' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoading) return;
    if (!autenticado) { r.replace(href('/acceso/login')); return; }
    let vivo = true;
    void debeElegirComoEntrar(slug).then((elegir) => {
      if (!vivo) return;
      // Nada que elegir: `verificar` y el inicio ya saben a dónde va cada una.
      if (!elegir) { r.replace(socia ? href() : href('/acceso/verificar')); return; }
      setPuedeElegir(true);
    });
    return () => { vivo = false; };
  }, [isLoading, autenticado, socia, slug, href, r]);

  const comoInstructora = async () => {
    setEnviando('instructora');
    setError('');
    const res = await unirseComoInstructora(slug);
    if (!res.ok) { setEnviando(null); setError(res.error); return; }
    r.replace(href('/equipo'));
  };

  const comoAlumna = async () => {
    setEnviando('alumna');
    await recordarEleccionAlumna(slug);
    // Sin ficha de alumna, `verificar` le pide el consentimiento y la da de alta.
    r.replace(socia ? href() : href('/acceso/verificar'));
  };

  const salir = async () => {
    await logout();
    r.replace(href('/acceso/login'));
  };

  if (!puedeElegir) {
    return <div aria-busy="true" style={{ minHeight: 220 }}><span className="sr-only">Cargando…</span></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 className="t-h1">¿Cómo quieres entrar?</h2>
        <p className="t-meta" style={{ marginTop: 4, lineHeight: 1.5 }}>
          {estudio.nombre} te tiene en su equipo con <b>{usuarioEmail ?? 'tu correo'}</b>.
        </p>
      </div>

      {error && (
        <p role="alert" style={{ margin: 0, background: 'var(--destructive-soft)', color: 'var(--destructive-foreground)', borderRadius: 12, padding: '10px 13px', fontSize: 'var(--t-small)', fontWeight: 700 }}>
          {error}
        </p>
      )}

      <Opcion
        testId="entrar-como-instructora"
        icono="instructoras"
        titulo="Como instructora"
        texto="Tu agenda, tus alumnas y cuándo puedes dar clase."
        ocupada={enviando === 'instructora'}
        bloqueada={enviando !== null}
        onClick={() => void comoInstructora()}
      />
      <Opcion
        testId="entrar-como-alumna"
        icono="reservar"
        titulo="Como alumna"
        texto="Reservar clases y ver tus bonos."
        ocupada={enviando === 'alumna'}
        bloqueada={enviando !== null}
        onClick={() => void comoAlumna()}
      />

      <p className="t-meta" style={{ margin: 0, lineHeight: 1.5 }}>
        Si entras como alumna, tu parte de instructora te sigue esperando: entra con el enlace del correo que te mandó el estudio.
      </p>

      <button
        type="button"
        onClick={() => void salir()}
        className="tap t-meta"
        style={{ alignSelf: 'center', border: 'none', background: 'none', fontFamily: 'inherit', padding: '8px 12px', color: 'var(--subtle-foreground)', textDecoration: 'underline' }}
      >
        ¿No eres tú? Salir
      </button>
    </div>
  );
}

function Opcion({ testId, icono, titulo, texto, ocupada, bloqueada, onClick }: {
  testId: string; icono: NombreIcono; titulo: string; texto: string;
  ocupada: boolean; bloqueada: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={bloqueada}
      aria-busy={ocupada}
      className="card tap"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 15px', textAlign: 'left',
        border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontFamily: 'inherit',
        opacity: bloqueada && !ocupada ? 0.55 : 1,
      }}
    >
      <span aria-hidden style={{ width: 42, height: 42, borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icono nombre={icono} tamano={21} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 'var(--t-body)', fontWeight: 800 }}>{titulo}</span>
        <span className="t-meta" style={{ display: 'block', marginTop: 2 }}>{ocupada ? 'Un momento…' : texto}</span>
      </span>
      <Icono nombre="chevron-derecha" tamano={18} />
    </button>
  );
}
