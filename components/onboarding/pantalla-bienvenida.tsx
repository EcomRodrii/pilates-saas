'use client';

// Bienvenida a pantalla completa, mostrada hasta que se sella tras crear el
// estudio. Tres tiempos, en este orden:
//
//   1 · Tu logo          (PantallasValor, `soloLogo`): lo primero que hace suyo
//                        el estudio. Se salta con un toque.
//   2 · Tres pantallas   (AsistenteRapido): perfil, clases y sala con lo más
//                        común ya marcado, y lo opcional al final. Antes eran
//                        once preguntas — ver lib/onboarding/asistente-rapido.ts.
//   3 · «Está listo»     (EstudioListo): SU app, traer a sus alumnas, la guía
//                        rápida y su enlace con QR.
//
// El alta se SELLA (`studios.bienvenida_vista_en`) al SALIR por cualquier botón
// de la pantalla final o por «Configurar luego», no antes: es la única salida de
// esta pantalla (components/layout/dashboard-shell.tsx), y un UPDATE fallido no
// puede dejar a nadie encerrado, ni sellar a medias lo que no ha visto.
//
// Se reescribió el 7-oct-2026: el motor de tecleo, el audio y el bucle de
// requestAnimationFrame de la versión anterior se fueron con las once preguntas.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { capturarEvento } from '@/lib/posthog-cliente';
import { capturarExcepcion } from '@/lib/sentry-cliente';
import type { Studio } from '@/lib/types';
import { useStudio } from '@/lib/studio-context';
import { leerProgresoWizard, olvidarProgresoWizard, type RespuestasWizard } from '@/lib/onboarding/borrador-wizard';
import { PantallasValor } from './pantallas-valor';
import { AsistenteRapido, type ResultadoConfigurar } from './asistente-rapido';
import { EstudioListo } from './estudio-listo';

export function PantallaBienvenida({ studio }: { studio: Studio }) {
  const [valorVisto, setValorVisto] = useState(false);
  const [listo, setListo] = useState<{ ans: RespuestasWizard; creado: ResultadoConfigurar } | null>(null);
  // Tenti saluda solo la PRIMERA vez que se ven, y «primera vez» no es «cada
  // vez que se monta esto»: la bienvenida vuelve en cada arranque en frío hasta
  // que se sella. No saluda si ya hay logo, si el asistente va a medias en este
  // navegador (ya se conocieron), ni en una sede nueva de una cadena (la dueña
  // ya pasó por aquí con la primera). Congelado al montar: subir el logo no
  // puede cambiarlo a mitad.
  const [primerContacto] = useState(
    () => !studio.logoUrl && !studio.cadenaId && leerProgresoWizard(studio.id) === null,
  );
  const { updateStudio } = useStudio();
  const router = useRouter();
  const iniciadaEmitida = useRef(false);
  const sellando = useRef(false);
  useEffect(() => {
    if (iniciadaEmitida.current) return;
    iniciadaEmitida.current = true;
    capturarEvento('bienvenida_iniciada');
  }, []);
  const saltarValor = useCallback(() => setValorVisto(true), []);
  // Devuelve el resultado: PasoLogo solo enseña el logo si quedó guardado.
  const guardarLogo = useCallback(
    (url: string) => updateStudio({ logoUrl: url }),
    [updateStudio],
  );

  // Sellar y salir. Auditoría 22-ago: marcar el cerrojo ANTES de escribir y
  // descartar el resultado dejaba a la propietaria encerrada si el UPDATE
  // fallaba (RLS, JWT caducado, red). Se libera el cerrojo si no se selló.
  const sellarYSalir = useCallback(async (destino: string, evento: string): Promise<boolean> => {
    if (sellando.current) return false;
    sellando.current = true;
    const res = await updateStudio({ bienvenidaVistaEn: new Date().toISOString() });
    if (!res.ok) {
      sellando.current = false;
      capturarExcepcion(new Error(res.error ?? 'No se pudo sellar bienvenida_vista_en'), { tags: { area: 'onboarding' } });
      return false;
    }
    olvidarProgresoWizard();
    capturarEvento(evento === 'saltada' ? 'bienvenida_saltada' : 'bienvenida_completada', { destino: evento });
    router.push(destino);
    return true;
  }, [updateStudio, router]);

  // «Configurar luego»: antes no se navegaba y dejaba un panel sin salas; el
  // calendario vacío ya le pregunta lo mínimo y le propone el horario.
  const saltar = useCallback(() => sellarYSalir('/calendario', 'saltada'), [sellarYSalir]);

  if (!valorVisto) {
    return (
      <PantallasValor
        // Solo el logo: las cuatro pantallas de valor iban delante de cualquier
        // pregunta y eran cuatro clics sin ninguna acción.
        soloLogo
        onContinuar={saltarValor}
        studioId={studio.id}
        studioNombre={studio.nombre}
        logoActual={studio.logoUrl}
        onGuardarLogo={guardarLogo}
        saludar={primerContacto}
      />
    );
  }
  if (listo) {
    return <EstudioListo studio={studio} ans={listo.ans} creado={listo.creado} onSalir={sellarYSalir} />;
  }
  return (
    <AsistenteRapido
      studio={studio}
      onTerminado={(ans, creado) => setListo({ ans, creado })}
      onSaltar={saltar}
    />
  );
}
