'use client';

// "Deja tu reseña" — última pieza de F3. Mismo patrón de composición que
// BotonFavoritoAlumna (components/network/boton-favorito-alumna.tsx): un
// fragmento cliente pequeño montado dentro de las fichas Server Component de
// app/network/estudios/[slug]/page.tsx y app/network/instructoras/[slug]/page.tsx.
//
// Se monta SIEMPRE para cualquier sesión iniciada (igual que
// BotonFavoritoAlumna) y es el servidor quien decide si hay algo que
// mostrar: sin sesión, o sin elegibilidad, no pinta nada. Nunca confía en
// que la propia comprobación de aquí sea la última palabra — el POST vuelve
// a comprobar el gate server-side (app/api/network/alumna/resenas/route.ts).
//
// Ambos tipos ('estudio' e 'instructora') guardan de verdad desde la
// migración 20260825004019 (red_resenas.perfil_id nullable). Este
// componente no distingue los dos casos con lógica propia: simplemente no
// pinta nada si `disponible` o `elegible` vienen a false.
import { useEffect, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { elegibilidadResenaAlumnaNetwork, enviarResenaAlumnaNetwork } from '@/lib/api-client';
import { NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_SAND, NW_ESTRELLA } from '@/components/network-v2/tokens';

interface FormularioResenaAlumnaProps {
  tipo: 'estudio' | 'instructora';
  id: string;
  nombre: string;
}

export function FormularioResenaAlumna({ tipo, id, nombre }: FormularioResenaAlumnaProps) {
  const { user, loading } = useAuth();
  const [elegible, setElegible] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [puntuacion, setPuntuacion] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    elegibilidadResenaAlumnaNetwork(tipo, id).then(res => {
      if (!vivo) return;
      setElegible(res.disponible && res.elegible);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [user, tipo, id]);

  if (loading || !user || cargando || !elegible || enviado) {
    // El mensaje de éxito sustituye al formulario en vez de desmontarse del
    // todo — igual que BotonContactar, confirma que la acción surtió efecto
    // sin obligar a recargar la página.
    if (enviado) {
      return (
        <div className="mt-14 rounded-[22px] p-6" style={{ background: NW_SAND, border: `1px solid ${NW_BORDE}` }}>
          <p className="text-[13.5px] font-semibold" style={{ color: NW_TINTA }}>Gracias por tu reseña.</p>
        </div>
      );
    }
    return null;
  }

  async function enviar() {
    if (puntuacion < 1) { setError('Elige una puntuación.'); return; }
    setEnviando(true);
    setError('');
    const res = await enviarResenaAlumnaNetwork(tipo, id, puntuacion, comentario.trim() || null);
    setEnviando(false);
    if (!res.ok) { setError(res.error ?? 'No se ha podido enviar.'); return; }
    setEnviado(true);
  }

  return (
    <div className="mt-14 rounded-[22px] p-6" style={{ background: NW_SAND, border: `1px solid ${NW_BORDE}` }}>
      <p className="text-[15px] font-extrabold" style={{ color: NW_TINTA }}>Deja tu reseña de {nombre}</p>
      <p className="mt-1 text-[12.5px]" style={{ color: NW_MUTED_2 }}>Ya has completado una clase, así que puedes contar tu experiencia.</p>

      <div className="mt-4 flex items-center gap-1">
        {Array.from({ length: 5 }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            type="button"
            onClick={() => setPuntuacion(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={`${n} de 5 estrellas`}
            className="p-0.5"
          >
            <Star size={22} style={{ color: n <= (hover || puntuacion) ? NW_ESTRELLA : NW_BORDE }} fill="currentColor" />
          </button>
        ))}
      </div>

      <textarea
        value={comentario}
        onChange={e => setComentario(e.target.value)}
        placeholder="Cuenta tu experiencia (opcional)…"
        className="w-full mt-3 min-h-24 px-3.5 py-2.5 rounded-xl text-[13.5px] resize-y focus:outline-none"
        style={{ border: `1px solid ${NW_BORDE}`, background: '#fff', color: NW_TINTA }}
      />

      {error && <p className="mt-2 text-[12.5px] text-destructive">{error}</p>}

      <button
        onClick={enviar}
        disabled={enviando}
        className="mt-3 px-5 py-2.5 rounded-full text-[13.5px] font-semibold disabled:opacity-60 flex items-center justify-center gap-1.5"
        style={{ background: NW_TINTA, color: '#fff' }}
      >
        {enviando && <Loader2 size={14} className="animate-spin" />}
        {enviando ? 'Enviando…' : 'Enviar reseña'}
      </button>
      <p className="mt-2 text-[11px]" style={{ color: NW_MUTED }}>Se revisa antes de publicarse.</p>
    </div>
  );
}
