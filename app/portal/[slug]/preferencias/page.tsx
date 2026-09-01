'use client';

import { useStudio } from '@/lib/studio-context';
import type { ModoTokens } from '@/lib/portal-modo';
import { AvisosSocia } from '@/components/portal/portal-avisos-socia';

// Valores literales del kit "Tentare Studio App" (portal-app.css), mismo
// criterio que `app/portal/[slug]/ajustes/page.tsx` — que ya embebe el MISMO
// `<AvisosSocia>`. `AvisosSocia` (compartido, fuera de alcance) exige un
// `ModoTokens` completo por firma: se le pasa esta constante con los mismos
// hex de `--ap-*` en vez de tocar ese componente compartido.
const AP_TOKENS: ModoTokens = {
  bg: '#FAF9F5', surface: '#FFFFFF', surface2: '#EFEDE4', line: '#E5E3DA',
  ink: '#1A1A1A', muted: '#5A5A52', muted2: '#5A5A52', micro: '#98A093',
  accentInk: '#FFFFFF', tabbar: 'rgba(250,249,245,.72)', bar: '#EFEDE4',
  hero: '#FAF9F5', heroLine: '#E5E3DA', heroText: '#1A1A1A', heroSub: '#5A5A52', heroAccent: '#3E6B4A',
  velo: 'rgba(255,255,255,.55)', veloFuerte: 'rgba(255,255,255,.7)', veloSuave: 'rgba(255,255,255,.5)',
};

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

  if (!studio?.id) return null;

  return (
    <div style={{ minHeight: '100%', background: '#FAF9F5' }}>
      <div style={{ padding: '24px 20px 20px' }}>
        <h1 className="ap-h2" style={{ color: '#1A1A1A' }}>Avisos</h1>
        <p style={{ fontFamily: 'inherit', color: '#5A5A52', fontSize: 12.5, marginTop: 4 }}>Elige qué quieres saber y por dónde</p>
      </div>

      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <AvisosSocia t={AP_TOKENS} studioId={studio.id} />
      </div>
    </div>
  );
}
