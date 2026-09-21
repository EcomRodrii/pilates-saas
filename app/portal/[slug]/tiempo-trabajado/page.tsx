'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/db/supabase-client';
import { registrarEntrada, registrarSalida, type WorkSessionState } from '@/lib/instructor-time-entries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface OpenSession {
  id: string;
  check_in_at: string;
  check_in_method: string;
  duracion_minutos: number;
  requiere_revision: boolean;
}

interface NextSession {
  id: string;
  tipo_clase: string;
  inicio: string;
  duracion: number;
  minutos_hasta_inicio: number;
}

export default function TiempoTrabajadoPage() {
  const [openSession, setOpenSession] = useState<OpenSession | null>(null);
  const [nextSession, setNextSession] = useState<NextSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Memoizar client para evitar re-renders
  const supabase = useMemo(() => createClient(), []);

  // Cargar estado actual
  useEffect(() => {
    const cargarEstado = async () => {
      try {
        // Obtener jornada abierta (RPC ya filtra por instructor actual)
        const { data: openData, error: openError } = await supabase.rpc(
          'get_instructor_open_session'
        );

        if (openError) throw openError;

        if (openData && Array.isArray(openData) && openData.length > 0) {
          setOpenSession(openData[0]);
        } else {
          setOpenSession(null);
        }

        // Obtener próxima sesión (RLS filtra por estudio)
        const { data: sessionData, error: sessionError } = await supabase
          .from('sesiones')
          .select('id, tipo_clase_id, inicio, fin, tipos_clase(nombre)')
          .gte('inicio', new Date().toISOString())
          .eq('cancelada', false)
          .limit(1)
          .order('inicio', { ascending: true });

        if (sessionError) throw sessionError;

        if (sessionData && sessionData.length > 0) {
          const s = sessionData[0];
          const ahora = new Date();
          const inicio = new Date(s.inicio);
          const minutos_hasta = Math.max(0, Math.round((inicio.getTime() - ahora.getTime()) / 60000));

          setNextSession({
            id: s.id,
            tipo_clase: (s.tipos_clase as any)?.nombre || 'Clase',
            inicio: s.inicio,
            duracion: Math.round((new Date(s.fin).getTime() - inicio.getTime()) / 60000),
            minutos_hasta_inicio: minutos_hasta,
          });
        } else {
          setNextSession(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar estado');
      } finally {
        setLoading(false);
      }
    };

    cargarEstado();

    // Polling cada 10 segundos
    const interval = setInterval(cargarEstado, 10000);
    return () => clearInterval(interval);
  }, [supabase]);

  // Actualizar tiempo transcurrido
  useEffect(() => {
    if (!openSession) return;

    const timer = setInterval(() => {
      const checkIn = new Date(openSession.check_in_at);
      const ahora = new Date();
      const minutos = Math.round((ahora.getTime() - checkIn.getTime()) / 60000);
      setElapsed(minutos);
    }, 1000);

    return () => clearInterval(timer);
  }, [openSession]);

  const handleRegistrarEntrada = async () => {
    setCargando(true);
    setError(null);

    const result = await registrarEntrada('MOBILE');

    if (result.success) {
      // Si fue idempotente (ya existía), mostrar estado existente
      if (result.existingWorkSessionId) {
        setOpenSession({
          id: result.existingWorkSessionId,
          check_in_at: result.checkInAt || new Date().toISOString(),
          check_in_method: 'MOBILE',
          duracion_minutos: 0,
          requiere_revision: false,
        });
        setError('Ya tenías una jornada abierta (la hemos recuperado)');
      } else {
        setOpenSession({
          id: result.workSessionId!,
          check_in_at: result.checkInAt || new Date().toISOString(),
          check_in_method: 'MOBILE',
          duracion_minutos: 0,
          requiere_revision: false,
        });
      }
    } else {
      setError(result.error || 'Error al registrar entrada');
    }

    setCargando(false);
  };

  const handleRegistrarSalida = async () => {
    if (!openSession) return;

    setCargando(true);
    setError(null);

    const result = await registrarSalida(openSession.id, 'MOBILE');

    if (result.success) {
      setOpenSession(null);
      setElapsed(0);
    } else {
      setError(result.error || 'Error al registrar salida');
    }

    setCargando(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Control Horario</h1>

      {/* ESTADO ACTUAL */}
      <div className="mb-6">
        {openSession ? (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="text-green-900">✅ Fichada</CardTitle>
              <CardDescription className="text-green-700">
                Entrada a las {new Date(openSession.check_in_at).toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Timer */}
              <div className="text-center py-4">
                <div className="text-5xl font-bold text-green-900">
                  {Math.floor(elapsed / 60)}h {elapsed % 60}m
                </div>
                <p className="text-sm text-green-700 mt-2">Tiempo transcurrido</p>
              </div>

              {/* Aviso si requiere revisión */}
              {openSession.requiere_revision && (
                <div className="bg-yellow-100 border border-yellow-400 rounded p-3 text-sm text-yellow-800">
                  ⚠️ Esta jornada ha superado el límite de duración. Revísalo cuando salgas.
                </div>
              )}

              {/* Botón salida */}
              <Button
                onClick={handleRegistrarSalida}
                disabled={cargando}
                size="lg"
                className="w-full bg-red-600 hover:bg-red-700"
              >
                {cargando ? 'Registrando...' : '🔴 Registrar Salida'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-900">Registrar Entrada</CardTitle>
              <CardDescription>No estás fichada actualmente</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleRegistrarEntrada}
                disabled={cargando}
                size="lg"
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {cargando ? 'Registrando...' : '🟢 Registrar Entrada'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* PRÓXIMA SESIÓN */}
      {nextSession && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Próxima sesión</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold">{nextSession.tipo_clase}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(nextSession.inicio).toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-blue-600">
                  En {nextSession.minutos_hasta_inicio} min
                </p>
                <p className="text-xs text-muted-foreground">{nextSession.duracion} min</p>
              </div>
            </div>

            {/* Hint: si está cerca de la clase y no tiene entrada, recordar fichar */}
            {nextSession.minutos_hasta_inicio <= 10 && !openSession && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800 mt-3">
                💡 Estás dentro de la ventana de fichaje. Registra entrada cuando estés lista.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ERRORES */}
      {error && (
        <Card className="border-red-200 bg-red-50 mb-6">
          <CardContent className="pt-6">
            <p className="text-red-800 text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* HISTORIAL (simplificado) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sesiones de hoy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground text-center py-4">
            Historial de jornadas (próxima versión)
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
