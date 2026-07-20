'use client';

import { useEffect, useState } from 'react';

// "No puedo dar esta clase" desde el móvil de la instructora, sin login.
//
// Dos toques a propósito: elegir la clase → confirmar. Marcar una baja
// desconvoca a una profesional y dispara emails a sus compañeras; un solo tap
// accidental en el bolsillo no puede provocar eso. El motivo es opcional: pedirlo
// como obligatorio hace que la gente no avise, y avisar tarde es mucho peor que
// avisar sin explicación.

type Clase = {
  id: string;
  inicio: string;
  fin: string;
  nombre: string;
  yaAvisada: boolean;
};

type Datos = {
  instructorNombre: string;
  estudioNombre: string;
  clases: Clase[];
};

export function BajaForm({ token }: { token: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);

  const [elegida, setElegida] = useState<Clase | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Clase | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/public/baja?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('carga'))))
      .then((d: Datos) => { if (vivo) { setDatos(d); setCargando(false); } })
      .catch(() => { if (vivo) { setErrorCarga(true); setCargando(false); } });
    return () => { vivo = false; };
  }, [token]);

  async function confirmar() {
    if (!elegida) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const res = await fetch('/api/public/baja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, sesionId: elegida.id, motivo: motivo.trim() || null }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErrorEnvio(j?.error ?? 'No se pudo avisar. Inténtalo otra vez.');
        setEnviando(false);
        return;
      }
      // Marca la clase como avisada en la lista local para que, si vuelve atrás,
      // vea el estado real sin tener que recargar.
      setDatos((prev) =>
        prev ? { ...prev, clases: prev.clases.map((c) => (c.id === elegida.id ? { ...c, yaAvisada: true } : c)) } : prev,
      );
      setHecho(elegida);
      setEnviando(false);
    } catch {
      setErrorEnvio('No se pudo avisar. Revisa tu conexión e inténtalo otra vez.');
      setEnviando(false);
    }
  }

  // ── Confirmación final ────────────────────────────────────────────────────
  if (hecho) {
    return (
      <Pantalla>
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mb-3 text-4xl">✅</div>
          <h1 className="text-lg font-semibold text-slate-900">Avisado</h1>
          <p className="mt-2 text-sm text-slate-500">
            {datos?.estudioNombre || 'Tu estudio'} ya sabe que no puedes dar{' '}
            <span className="font-medium text-slate-700">{hecho.nombre}</span> el {cuando(hecho.inicio)}.
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Nos encargamos de buscar quién la cubra. No tienes que llamar a nadie.
          </p>
          <button
            onClick={() => { setHecho(null); setElegida(null); setMotivo(''); }}
            className="mt-6 text-sm font-medium text-brand underline"
          >
            Avisar de otra clase
          </button>
        </div>
      </Pantalla>
    );
  }

  // ── Paso 2: confirmar la clase elegida ────────────────────────────────────
  if (elegida) {
    return (
      <Pantalla>
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">¿Avisamos de que no puedes?</h1>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-base font-semibold text-slate-900">{elegida.nombre}</p>
            <p className="mt-0.5 text-sm text-slate-500">{cuando(elegida.inicio)}</p>
          </div>

          <label htmlFor="motivo" className="mt-5 block text-sm font-medium text-slate-700">
            Motivo <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <textarea
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Estoy enferma, tengo médico…"
            className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 p-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand"
          />

          <button
            onClick={confirmar}
            disabled={enviando}
            className="mt-4 w-full rounded-xl bg-brand py-3.5 text-base font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
          >
            {enviando ? 'Avisando…' : 'Sí, no puedo dar esta clase'}
          </button>
          <button
            onClick={() => { setElegida(null); setErrorEnvio(null); }}
            disabled={enviando}
            className="mt-2 w-full rounded-xl py-3 text-base font-medium text-slate-500 disabled:opacity-60"
          >
            Volver
          </button>

          {errorEnvio && <p className="mt-2 text-center text-sm text-rose-600">{errorEnvio}</p>}
        </div>
      </Pantalla>
    );
  }

  // ── Paso 1: elegir la clase ───────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-md">
        <header className="mb-5 pt-2">
          <h1 className="text-xl font-semibold text-slate-900">
            {datos ? `Hola, ${datos.instructorNombre}` : 'Tus próximas clases'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {datos?.estudioNombre ? `${datos.estudioNombre}. ` : ''}
            Toca la clase que no puedes dar y nos encargamos de buscar sustituta.
          </p>
        </header>

        {cargando && <Nota texto="Cargando tus clases…" />}
        {errorCarga && <Nota texto="No hemos podido cargar tus clases. Revisa tu conexión e inténtalo otra vez." />}

        {datos && datos.clases.length === 0 && (
          <Nota texto="No tienes clases programadas en los próximos 30 días." />
        )}

        {datos && datos.clases.length > 0 && (
          <ul className="space-y-2">
            {datos.clases.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => !c.yaAvisada && setElegida(c)}
                  disabled={c.yaAvisada}
                  className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                    c.yaAvisada
                      ? 'cursor-default border-slate-200 bg-slate-100'
                      : 'border-slate-200 bg-white active:scale-[0.99] hover:border-brand'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`truncate text-base font-semibold ${c.yaAvisada ? 'text-slate-400' : 'text-slate-900'}`}>
                        {c.nombre}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">{cuando(c.inicio)}</p>
                    </div>
                    {c.yaAvisada && (
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
                        Ya avisada
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

// Fecha legible en hora de España — la instructora piensa en su hora local, y
// los `inicio` son timestamptz (instantes), no horas de pared.
function cuando(inicio: string): string {
  const d = new Date(inicio);
  const fecha = d.toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid',
  });
  const hora = d.toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  });
  return `${fecha} · ${hora}`;
}

function Pantalla({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-md pt-6">{children}</div>
    </main>
  );
}

function Nota({ texto }: { texto: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm">{texto}</div>
  );
}
