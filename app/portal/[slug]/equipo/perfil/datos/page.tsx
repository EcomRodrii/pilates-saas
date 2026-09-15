'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import {
  getFichaInstructora, guardarFichaInstructora, quitarFotoInstructora, subirFotoInstructora,
} from '@/lib/student/ficha-instructora';
import { MAX_BIO } from '@/lib/portal-instructora/editar-perfil';
import { invalidarCatalogo } from '@/lib/student/catalogo';
import { iniciales } from '@/lib/mensajeria/presentacion';
import { FotoPerfil } from '@/components/student/domain/FotoPerfil';
import { Input } from '@/components/student/ui/Input';
import { Button } from '@/components/student/ui/Button';
import { ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Sus datos, desde la app del estudio: foto, nombre, descripción y teléfono.
//
// Solo cambia su ficha de ESTE estudio (una por sede, P2-14). El correo se
// enseña pero no se cambia aquí: es con lo que entra en la app, en todos sus
// estudios y también como alumna, y cambiarlo tiene su propia fase con
// confirmación (decisión del 15-sep-2026). No se promete lo que no hay.
//
// Nada se da por guardado sin la respuesta del servidor: el aviso sale después
// de que conteste, y si dice que no, se señala el campo.

/** 16 px: por debajo, iOS amplía la página al enfocar y no vuelve. */
const SIN_ZOOM = { fontSize: 16 };

export default function DatosInstructoraPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { online } = useOnline();
  const { toast } = useToast();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const esInstructora = Boolean(instructora);
  const slug = estudio.slug;

  // Monta antes que su guardia (es su padre): sin confirmar, no se pide nada.
  const cargar = useCallback(
    () => (esInstructora ? getFichaInstructora(slug) : new Promise<never>(() => {})),
    [esInstructora, slug],
  );
  const { data: ficha, estado, reintentar } = useAsync(cargar, () => false);

  const [f, setF] = useState({ nombre: '', bio: '', telefono: '' });
  const [rellenada, setRellenada] = useState(false);
  const [error, setError] = useState<{ campo: string; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  // La foto que se ve AHORA: `undefined` = la de la ficha; un valor (o `null`) =
  // lo que acaba de hacer, para que se vea sin esperar a recargar.
  const [fotoLocal, setFotoLocal] = useState<string | null | undefined>(undefined);

  // El formulario se rellena cuando llega la ficha, DURANTE EL RENDER (patrón
  // de estado derivado; el efecto equivalente lo rechaza el lint de este repo).
  // Una sola vez: después manda lo que ella escriba.
  if (ficha && !rellenada) {
    setRellenada(true);
    setF({ nombre: ficha.nombre, bio: ficha.bio ?? '', telefono: ficha.telefono ?? '' });
  }

  const guardar = async () => {
    // Sin la ficha cargada, el formulario está vacío: guardar borraría lo que tiene.
    if (!ficha || guardando) return;
    if (!f.nombre.trim()) { setError({ campo: 'nombre', texto: 'Escribe tu nombre.' }); return; }
    // El estado de carga ANTES del await: que no se pueda pulsar dos veces.
    setGuardando(true);
    setError(null);
    const r = await guardarFichaInstructora(slug, f);
    setGuardando(false);
    if (!r.ok) {
      if (r.sesionCaducada) { router.push(href('/acceso/login')); return; }
      setError({ campo: r.campo ?? 'general', texto: r.error });
      return;
    }
    setF({ nombre: r.ficha.nombre, bio: r.ficha.bio ?? '', telefono: r.ficha.telefono ?? '' });
    // Su nombre y su foto salen en el catálogo que ven las alumnas (y que esta
    // app tiene en caché): sin invalidarlo, se seguiría viendo lo de antes.
    invalidarCatalogo(slug);
    toast('Datos guardados ✓');
  };

  const errorDe = (campo: string) => (error?.campo === campo ? error.texto : undefined);

  return (
    <StudentShell modo="instructora">
      <PageHeader back titulo="Tus datos" />
      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-3)', marginTop: 14, paddingBottom: 24, maxWidth: 520 }}>
        {estado === 'loading' && <ListSkeleton n={3} h={56} />}
        {estado === 'error' && <ErrorState cuerpo="No hemos podido cargar tus datos." onRetry={reintentar} />}
        {estado === 'offline' && <OfflineState cuerpo="Para ver y cambiar tus datos necesitas conexión." />}

        {ficha && (
          <>
            <FotoPerfil
              studioId={estudio.id}
              url={fotoLocal !== undefined ? fotoLocal : ficha.fotoUrl}
              iniciales={iniciales(f.nombre || ficha.nombre)}
              onCambio={(u) => { setFotoLocal(u); invalidarCatalogo(slug); }}
              subir={(file) => subirFotoInstructora(slug, file)}
              quitar={() => quitarFotoInstructora(slug)}
            />
            <p className="t-meta" style={{ textAlign: 'center', margin: 0 }}>
              Tu foto, tu nombre y tu descripción los ven las alumnas de {estudio.nombre}.
            </p>

            <Input
              label="Nombre" value={f.nombre} autoComplete="name" style={SIN_ZOOM}
              onChange={(e) => { setF({ ...f, nombre: e.target.value }); setError(null); }}
              error={errorDe('nombre')}
            />

            <div>
              <label htmlFor="bio-instructora" className="t-meta" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, margin: '0 0 var(--s-1) 2px' }}>
                Descripción
              </label>
              <textarea
                id="bio-instructora"
                value={f.bio}
                onChange={(e) => { setF({ ...f, bio: e.target.value }); setError(null); }}
                rows={4}
                maxLength={MAX_BIO}
                placeholder="Cómo son tus clases, tu formación, qué te gusta trabajar…"
                aria-invalid={error?.campo === 'bio' || undefined}
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 14, background: 'var(--card)', fontFamily: 'inherit', fontSize: 16, color: 'var(--foreground)', resize: 'vertical' }}
              />
              {errorDe('bio')
                ? <p role="alert" className="field-error">{errorDe('bio')}</p>
                : <p className="t-meta" style={{ margin: 'var(--s-1) 0 0 2px' }}>{f.bio.length} / {MAX_BIO}</p>}
            </div>

            <Input
              label="Teléfono" type="tel" value={f.telefono} autoComplete="tel" style={SIN_ZOOM}
              onChange={(e) => { setF({ ...f, telefono: e.target.value }); setError(null); }}
              hint="Para que el estudio pueda localizarte."
              error={errorDe('telefono')}
            />

            <Input
              label="Correo" type="email" value={ficha.email ?? ''} disabled style={SIN_ZOOM}
              hint="Es el correo con el que entras en la app."
            />

            {error?.campo === 'general' && (
              <p role="alert" className="note note--warn" data-testid="error-general">{error.texto}</p>
            )}

            <Button full loading={guardando} disabled={!online} onClick={() => void guardar()} style={{ marginTop: 'var(--s-1)' }}>
              {online ? 'Guardar cambios' : 'Sin conexión'}
            </Button>
          </>
        )}
      </div>
    </StudentShell>
  );
}
