'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useStudio } from '@/lib/studio-context';
import { useAuth } from '@/lib/auth-context';
import { fetchMisEstudios, cambiarSedeActiva, type SedeSeleccionable } from '@/lib/supabase-data';
import { CLAVE_CAMBIO_SEDE } from '@/components/layout/sede-activa';
import { tieneFeature } from '@/lib/billing/entitlements';
import { TabEstudioGeneral } from './tab-estudio-general';
import { TabEstudioSedes } from './tab-estudio-sedes';
import { TabEstudioHorario } from './tab-estudio-horario';
import { TabEstudioReservas } from './tab-estudio-reservas';
import { TabEstudioCobros } from './tab-estudio-cobros';
import { TabEstudioEnlaces } from './tab-estudio-enlaces';
import { TabEstudioLegal } from './tab-estudio-legal';

// La pestaña "Estudio" era un solo scroll de 11 tarjetas apiladas — desde el
// nombre del estudio hasta los términos y condiciones, pasando por SEPA y la
// política de reservas. Ninguna propietaria se lee eso entero para cambiar un
// teléfono. Mismo patrón ya usado en "Clases y salas" y "Gamificación":
// sub-navegación interna, un tema por pestaña. Los componentes de cada tema
// no cambian de lógica, solo de dónde viven.
type Sub = 'general' | 'sedes' | 'horario' | 'reservas' | 'cobros' | 'enlaces' | 'legal';

const SUBS_BASE: { id: Sub; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'horario', label: 'Horario' },
  { id: 'reservas', label: 'Reservas y cancelaciones' },
  { id: 'cobros', label: 'Cobros' },
  { id: 'enlaces', label: 'Enlaces' },
  { id: 'legal', label: 'Legal' },
];

export function TabEstudio({ showToast, sub: subInicial }: { showToast: (m: string) => void; sub?: string }) {
  const { studio } = useStudio();
  const { user } = useAuth();

  // "Tus sedes" solo existe si hay algo que decidir ahí: más de una sede, o
  // el plan Cadena para poder añadir la segunda. Con un estudio normal (la
  // inmensa mayoría) esta sub-pestaña ni aparece — no hay una tarjeta vacía
  // que enseñar a cambio de nada.
  const puedeAnadirSedes = !!studio && tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscriptionStatus }, 'multiCentro');
  const [sedes, setSedes] = useState<SedeSeleccionable[]>([]);
  const [cambiandoASede, setCambiandoASede] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    fetchMisEstudios().then(r => { if (vivo) setSedes(r); });
    return () => { vivo = false; };
  }, [user]);

  function cambiarmeASede(id: string) {
    if (!user || id === studio?.id || cambiandoASede) return;
    setCambiandoASede(id);
    // Mismo patrón que SedeActiva.elegir() (components/layout/sede-activa.tsx):
    // hard-nav tras guardar, para que StudioProvider remonte limpio contra la
    // nueva sede.
    cambiarSedeActiva(user.id, id).then(ok => {
      if (!ok) { setCambiandoASede(null); showToast('No se ha podido cambiar de sede'); return; }
      const destino = sedes.find(s => s.id === id);
      try { sessionStorage.setItem(CLAVE_CAMBIO_SEDE, destino?.nombre ?? ''); } catch { /* modo privado */ }
      window.location.href = '/dashboard';
    });
  }

  const haySedes = sedes.length > 1 || puedeAnadirSedes;
  const subs = haySedes
    ? [SUBS_BASE[0], { id: 'sedes' as const, label: 'Sedes' }, ...SUBS_BASE.slice(1)]
    : SUBS_BASE;

  // Si el ?sub= de la URL no es válido o ya no está disponible para este
  // estudio (p. ej. "sedes" con una sola sede), se cae a "general" en vez de
  // quedarse en una pestaña que no existe.
  const [sub, setSub] = useState<Sub>(subs.some(s => s.id === subInicial) ? (subInicial as Sub) : 'general');
  // "Sedes" solo aparece en `subs` una vez que `fetchMisEstudios` resuelve
  // (un render después del montaje), así que un `?sub=sedes` en la URL puede
  // no estar disponible todavía en el primer render. Se reintenta, durante
  // el render y sin efecto, hasta que se aplique una vez — nunca vuelve a
  // pisar una pestaña que la persona ya eligió a mano después.
  const [subAplicado, setSubAplicado] = useState(false);
  if (!subAplicado && subInicial && subs.some(s => s.id === subInicial)) {
    setSubAplicado(true);
    setSub(subInicial as Sub);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-semibold text-foreground">Estudio</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Identidad, cobros, reservas y lo legal de tu estudio.
        </p>
      </div>

      <Tabs value={sub} onValueChange={(v) => setSub(v as Sub)}>
        <TabsList>
          {subs.map(s => (
            <TabsTrigger key={s.id} value={s.id}>{s.label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="general"><TabEstudioGeneral showToast={showToast} /></TabsContent>
        {haySedes && (
          <TabsContent value="sedes">
            <TabEstudioSedes
              showToast={showToast}
              sedes={sedes}
              refrescarSedes={() => { fetchMisEstudios().then(setSedes); }}
              cambiandoASede={cambiandoASede}
              cambiarmeASede={cambiarmeASede}
              puedeAnadirSedes={puedeAnadirSedes}
            />
          </TabsContent>
        )}
        <TabsContent value="horario"><TabEstudioHorario showToast={showToast} /></TabsContent>
        <TabsContent value="reservas"><TabEstudioReservas showToast={showToast} /></TabsContent>
        <TabsContent value="cobros"><TabEstudioCobros showToast={showToast} /></TabsContent>
        <TabsContent value="enlaces"><TabEstudioEnlaces showToast={showToast} /></TabsContent>
        <TabsContent value="legal"><TabEstudioLegal showToast={showToast} /></TabsContent>
      </Tabs>
    </div>
  );
}
