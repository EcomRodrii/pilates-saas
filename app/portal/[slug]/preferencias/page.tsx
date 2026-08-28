'use client';

import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { AvisosSocia } from '@/components/portal/portal-avisos-socia';
// La tipografía del tema, no tamaños sueltos: `display()` lee
// `--portal-heading-font`, así que con Tentada el título sale en Garamond y
// con Noir en su Instrument Sans. Antes esta pantalla era la única del portal
// con la tipografía a mano, y por eso no seguía a ningún tema.
import { display } from '@/lib/portal-design';

// Antes "Preferencias" (disponibilidad, instructora/tipo/duración/nivel
// favoritos): esos campos se guardaban pero no los leía nada — ni el flujo de
// reserva ni Decision OS — y el propio copy prometía "te ayuda a
// recomendarte mejores horarios" sin que nunca fuera cierto. El nav ya
// llamaba a esta pantalla "Avisos" (portal-perfil-view.tsx), así que se
// retira lo cosmético y se deja solo lo que sí funciona. `favoritos_clase`
// (el chip "Favoritas" del calendario de reserva) es un sistema DISTINTO,
// ya conectado de verdad, y no se toca aquí.
//
// `AvisosSocia` vive en components/portal/portal-avisos-socia.tsx: /ajustes
// (unificación Perfil/Preferencias/Compras) lo embebe también, mismo
// componente en los dos sitios.
export default function PreferenciasPage() {
  const { studio } = useStudio();
  const { t } = useModo();

  if (!studio?.id) return null;

  return (
    <div style={{ minHeight: '100%', background: t.bg }}>
      <div style={{ padding: '24px 20px 20px' }}>
        <h1 style={{ ...display(28), color: t.ink }}>Avisos</h1>
        <p style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>Elige qué quieres saber y por dónde</p>
      </div>

      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <AvisosSocia t={t} studioId={studio.id} />
      </div>
    </div>
  );
}
