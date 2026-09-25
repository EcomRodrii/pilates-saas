'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { debeElegirComoEntrar, hayInvitacionParaEstaSesion, useSesionInstructora } from '@/lib/student/sesion-instructora';
import { alFaltarPreguntas, getPreguntasAlta, type EstadoPreguntasAltaRemoto } from '@/lib/student/preguntas-alta';
import { PreguntasAlta } from '@/components/student/PreguntasAlta';

/**
 * Socias (estudio:socia) que ya no tienen nada que contestar en esta carga de la
 * app. De módulo y no de estado: la guarda se monta de nuevo en cada pantalla, y
 * sin esto cada navegación volvería a preguntar al servidor.
 */
const sinPreguntasPendientes = new Set<string>();

/**
 * Deja pasar solo a quien tiene sesión; al resto lo manda a acceso conservando
 * a dónde iba.
 *
 * ⚠️ De CLIENTE, y no puede ser de otra forma: la sesión de la alumna vive en
 * `localStorage` bajo el storageKey 'sb-portal-auth' (lib/db/supabase-portal.ts),
 * no en cookie. No hay `middleware.ts` en este repo y un Server Component no
 * puede leer localStorage, así que no existe manera de decidir esto antes de
 * pintar. Es una guardia de USABILIDAD, no de seguridad — mismo criterio que
 * `app/interno/layout.tsx`, cuyo comentario dice exactamente eso.
 *
 * La cerradura de verdad está en el servidor: cada ruta de `/api/public/**`
 * verifica el JWT y resuelve la socia con `socioAutenticado(userId, studioId)`,
 * así que sin sesión no sale ni un dato aunque alguien fuerce la pantalla.
 *
 * Mientras resuelve NO se pinta el esqueleto de la app: enseñar la pantalla
 * llena y luego mandar a acceso es peor que esperar un instante.
 *
 * ⚠️ Con sesión pero SIN ficha de alumna puede ser una instructora del estudio
 * (la app es la misma para las dos, decisión del 14-sep-2026). Las pantallas de
 * alumna no le sirven —todo lo que piden exige ficha—, así que se la lleva a su
 * parte. Y si el estudio la tiene dada de alta como instructora pero aún no ha
 * entrado como tal, a elegir cómo entra (15-sep-2026). Solo se pregunta en esos
 * casos: una alumna con ficha no paga ninguna petición.
 */
export function GuardiaSesion({ children }: { children: ReactNode }) {
  const r = useRouter();
  const path = usePathname();
  const { slug, estudio } = useEstudio();
  const href = usePortalHref();
  const { socia, autenticado, isLoading } = useSesionStudent(slug);
  const sinFicha = !isLoading && autenticado && !socia;
  const { instructora, isLoading: cargandoInstructora } = useSesionInstructora(slug, sinFicha);

  const preguntarEleccion = sinFicha && !cargandoInstructora && !instructora;
  const [eleccion, setEleccion] = useState<{ slug: string; elegir: boolean } | null>(null);
  const elegir = preguntarEleccion && eleccion?.slug === slug ? eleccion.elegir : null;

  useEffect(() => {
    if (!preguntarEleccion) return;
    let vivo = true;
    void debeElegirComoEntrar(slug).then((valor) => { if (vivo) setEleccion({ slug, elegir: valor }); });
    return () => { vivo = false; };
  }, [preguntarEleccion, slug]);

  // Ya es alumna y acaba de abrir el correo de invitación del estudio: a elegir
  // cómo entra. Solo mira el almacén del dispositivo, sin petición.
  useEffect(() => {
    if (isLoading || !autenticado || !socia) return;
    let vivo = true;
    void hayInvitacionParaEstaSesion(slug).then((hay) => { if (vivo && hay) r.replace(href('/acceso/elegir')); });
    return () => { vivo = false; };
  }, [isLoading, autenticado, socia, slug, href, r]);

  useEffect(() => {
    if (isLoading) return;
    if (!autenticado) {
      // `?next=` para volver justo a donde iba después de entrar. El destino se
      // valida en la pantalla de acceso: solo se acepta una ruta de ESTE estudio.
      const destino = `${href('/acceso/login')}?next=${encodeURIComponent(path)}`;
      r.replace(destino);
      return;
    }
    if (instructora) { r.replace(href('/equipo')); return; }
    if (elegir) r.replace(href('/acceso/elegir'));
  }, [isLoading, autenticado, instructora, elegir, href, path, r]);

  // ── Las preguntas del estudio (Configuración → «Preguntar los datos extra en
  // su app»). Con el interruptor encendido y alguna sin contestar, la app le
  // pone las preguntas delante en vez de cualquier pantalla: no reserva ni
  // compra sin contestarlas. El servidor lo exige también en esas puertas
  // (`bloqueoPorPreguntasAlta`); esto es para que no llegue a chocar con él.
  //
  // `forzar` cuenta los avisos de «faltan preguntas» que llegan de reservar o
  // comprar: pasa si el estudio las encendió con la app ya abierta.
  const [forzar, setForzar] = useState(0);
  const [preguntas, setPreguntas] = useState<{ clave: string; estado: EstadoPreguntasAltaRemoto | null } | null>(null);
  const base = socia ? `${estudio.id}:${socia.socioId}` : '';
  const clave = `${base}:${forzar}`;
  const mirarPreguntas = !!socia && (estudio.pideDatosExtra === true || forzar > 0) && !sinPreguntasPendientes.has(base);

  useEffect(() => {
    if (!mirarPreguntas) return;
    let vivo = true;
    void getPreguntasAlta(estudio.id).then((e) => {
      if (!vivo) return;
      // Apagado o todo contestado: no se vuelve a preguntar en esta carga.
      // Si la petición falla (`null`) se deja pasar sin apuntarlo, y se vuelve a
      // mirar en la siguiente pantalla: la puerta de reservar y comprar sigue
      // cerrada en el servidor, así que no se cuela nada.
      if (e && (!e.activa || e.pendientes.length === 0)) sinPreguntasPendientes.add(base);
      setPreguntas({ clave, estado: e });
    });
    return () => { vivo = false; };
  }, [mirarPreguntas, estudio.id, base, clave]);

  useEffect(() => {
    if (!base) return;
    return alFaltarPreguntas(() => {
      sinPreguntasPendientes.delete(base);
      setForzar((n) => n + 1);
    });
  }, [base]);

  const estadoPreguntas = preguntas?.clave === clave ? preguntas.estado : undefined;
  const cargandoPreguntas = mirarPreguntas && estadoPreguntas === undefined;
  const conPreguntas = mirarPreguntas && estadoPreguntas?.activa === true && estadoPreguntas.pendientes.length > 0
    ? estadoPreguntas : null;

  const esperando = isLoading || !autenticado || (sinFicha && cargandoInstructora) || instructora
    || (preguntarEleccion && elegir !== false) || cargandoPreguntas;
  if (esperando) {
    return (
      <div className="shell" aria-busy="true">
        <div className="page px" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 'calc(72px + var(--safe-top))' }}>
          <span className="sr-only">Cargando…</span>
          {/* Esqueleto del kit: tres tarjetas, como cualquier lista del diseño. */}
          {[0, 1, 2].map((i) => (
            <div key={i} className="skel" style={{ height: 84, borderRadius: 'var(--radius-card)' }} />
          ))}
        </div>
      </div>
    );
  }

  if (conPreguntas) {
    return (
      <PreguntasAlta
        estado={conPreguntas}
        onCompletada={(nuevo) => {
          if (nuevo.pendientes.length === 0) sinPreguntasPendientes.add(base);
          setPreguntas({ clave, estado: nuevo });
        }}
      />
    );
  }

  return <>{children}</>;
}
