'use client';

import { useCallback, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getTablon, LIMITE_TABLON } from '@/lib/student/comunidad';
import type { Post } from '@/lib/student/tipos';
import { PostCard } from '@/components/student/domain/PostCard';
import { Button } from '@/components/student/ui/Button';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// El tablón del estudio: lo que publica desde Comunidad en el panel (texto,
// fotos y eventos con plazas). El paquete de diseño no tiene esta pantalla;
// se construye con el idioma de Notificaciones. El servidor ya decide qué ve
// cada socia (audiencia del post) — aquí no se filtra nada.

export default function ComunidadPage() {
  const { estudio } = useEstudio();
  const [mas, setMas] = useState<Post[]>([]);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayMas, setHayMas] = useState(true);

  const cargar = useCallback(async () => {
    const posts = await getTablon(estudio.id);
    if (!posts) throw new Error('tablón');
    return posts;
  }, [estudio.id]);
  const { data, estado, reintentar } = useAsync(cargar);

  const posts = [...(data ?? []), ...mas];
  const puedeCargarMas = hayMas && (data?.length ?? 0) >= LIMITE_TABLON;

  const cargarMas = async () => {
    const ultimo = posts[posts.length - 1];
    if (!ultimo || cargandoMas) return;
    setCargandoMas(true);
    const siguientes = await getTablon(estudio.id, ultimo.creadoEn);
    setCargandoMas(false);
    if (!siguientes) return;
    setMas((m) => [...m, ...siguientes]);
    if (siguientes.length < LIMITE_TABLON) setHayMas(false);
  };

  return (
    <StudentShell>
      <PageHeader titulo="Comunidad" back />
      <div className="px" style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
        {estado === 'loading' && <ListSkeleton n={3} h={120} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && <OfflineState cuerpo="Necesitas conexión para ver el tablón." />}
        {estado === 'empty' && (
          <EmptyState icono="📣" titulo="Aún no hay publicaciones" cuerpo="Cuando el estudio publique algo, lo verás aquí." />
        )}
        {estado === 'ready' && posts.map((p, i) => <PostCard key={p.id} post={p} studioId={estudio.id} delay={Math.min(i, 8) * 50} />)}
        {estado === 'ready' && puedeCargarMas && (
          <Button variant="ghost" full onClick={() => void cargarMas()} disabled={cargandoMas}>
            {cargandoMas ? 'Cargando…' : 'Ver más'}
          </Button>
        )}
      </div>
    </StudentShell>
  );
}
