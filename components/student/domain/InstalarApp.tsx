'use client';

import { useState, useSyncExternalStore } from 'react';
import { Sheet } from '@/components/student/ui/Sheet';
import { Button } from '@/components/student/ui/Button';
import { Icono } from '@/components/student/ui/Icono';
import {
  estadoInstalacionServidor, leerEstadoInstalacion, pedirInstalacion, suscribirInstalacion,
} from '@/lib/student/instalar-prompt';
import { fraseResultado, seOfrece, textoInstalacion, type ResultadoInstalacion } from '@/lib/student/instalar-app';

// «Instalar la app» del estudio, en Perfil. Es la web app instalable de ESTE
// estudio (su nombre, su icono: `manifest.webmanifest` de cada portal).
//
// Solo se pinta si hay algo que hacer en este navegador (`seOfrece`): sin
// botón muerto en escritorio, y nada si ya la tiene abierta desde su icono o
// dentro de la app nativa. Android/Chrome: botón que lanza el aviso del
// navegador. iPhone: la guía de tres pasos, porque Safari no tiene ese aviso.
//
// ⚠️ «Listo» solo cuando el navegador dice que ACEPTÓ; un rechazo o un fallo se
// dicen tal cual. Nunca se da por instalada una app por haber tocado el botón.
export function InstalarApp({ nombreEstudio }: { nombreEstudio: string }) {
  const estado = useSyncExternalStore(suscribirInstalacion, leerEstadoInstalacion, estadoInstalacionServidor);
  const [abierta, setAbierta] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<ResultadoInstalacion | null>(null);

  // Al tocar «Instalar» el aviso del navegador se gasta y el estado pasa a «sin
  // opción»: la fila desaparece, pero la hoja SIGUE abierta para decir cómo ha ido.
  const ofrece = seOfrece(estado);
  if (!ofrece && !abierta) return null;
  const t = textoInstalacion(ofrece && estado ? estado : 'instalable', nombreEstudio);

  async function instalar() {
    setOcupado(true);
    const r = await pedirInstalacion();
    setOcupado(false);
    setResultado(r);
  }

  return (
    <>
      {ofrece && <button
        type="button"
        className="card card--tap card--pad row row--between tap"
        style={{ width: '100%', textAlign: 'left' }}
        onClick={() => { setResultado(null); setAbierta(true); }}
        data-testid="abrir-instalar-app"
        data-estado={estado}
      >
        <span className="stack" style={{ ['--gap' as string]: '2px' }}>
          <span className="t-card-title">Instala la app</span>
          <span className="t-meta">{t.resumen}</span>
        </span>
        <Icono nombre="chevron-derecha" tamano={18} stroke="var(--subtle-foreground)" className="no-shrink" />
      </button>}

      <Sheet open={abierta} onClose={() => setAbierta(false)} label="Instalar la app">
        <div className="stack" style={{ ['--gap' as string]: 'var(--s-3)', paddingBottom: 'var(--s-4)' }}>
          <h2 className="t-title">{t.titulo}</h2>
          <p className="t-small t-dim">{t.cuerpo}</p>

          {t.pasos.length > 0 && (
            <ol className="stack" data-testid="pasos-instalar" style={{ ['--gap' as string]: 'var(--s-2)', margin: 0, paddingLeft: '1.25em', listStyleType: 'decimal' }}>
              {t.pasos.map(p => <li key={p} className="t-small">{p}</li>)}
            </ol>
          )}

          {t.accion === 'instalar' && resultado !== 'aceptada' && (
            <Button full loading={ocupado} onClick={() => void instalar()} data-testid="instalar-app">
              Instalar
            </Button>
          )}

          {resultado && (
            <p role="status" data-testid="resultado-instalar" className={'note ' + (resultado === 'aceptada' ? 'note--ok' : 'note--warn')}>
              {fraseResultado(resultado, nombreEstudio)}
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}
