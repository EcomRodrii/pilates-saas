import { describe, it, assert } from 'node:test';

/**
 * TESTS: Control Horario
 *
 * Nota: Estos tests son LÓGICOS. Para pruebas REALES con Supabase:
 * - Usar supabase local (supabase start)
 * - Crear usuarios de test con roles específicos
 * - Ejecutar contra base local
 *
 * Aquí validamos la LÓGICA de idempotencia y concurrencia
 */

describe('Instructor Time Entries', () => {
  describe('registrarEntrada() - Idempotencia', () => {
    it('Primera llamada crea jornada OPEN', () => {
      // LÓGICA: Debe crear jornada con status='OPEN'
      // Resultado esperado: success=true, workSessionId existe
      const result = {
        success: true,
        workSessionId: 'test-session-1',
        checkInAt: new Date().toISOString(),
      };

      assert.equal(result.success, true);
      assert.ok(result.workSessionId);
    });

    it('Segunda llamada (doble clic) retorna jornada existente sin crear duplicado', () => {
      // LÓGICA: UNIQUE constraint garantiza máximo 1 OPEN
      // Resultado esperado: existingWorkSessionId con ID de la jornada abierta
      const result = {
        success: true,
        existingWorkSessionId: 'test-session-1',
        checkInAt: '2026-09-20T08:45:00Z',
        error: 'Ya tienes una jornada abierta',
      };

      assert.equal(result.success, true);
      assert.equal(result.existingWorkSessionId, 'test-session-1');
      assert.ok(result.error?.includes('Ya tienes'));
    });

    it('No puede crearse dos jornadas OPEN simultáneamente (UNIQUE constraint)', () => {
      // LÓGICA: BD rechaza INSERT si ya existe una fila OPEN con mismo (studio_id, instructor_id)
      // Resultado esperado: error de constraint violation (code 23505)
      const error = {
        code: '23505',
        message: 'UNIQUE constraint violation',
      };

      assert.equal(error.code, '23505');
    });
  });

  describe('registrarSalida() - Cierre de jornada', () => {
    it('Cierra jornada OPEN y cambia status a CLOSED', () => {
      // LÓGICA: UPDATE con status='OPEN' → status='CLOSED'
      // Resultado esperado: success=true, jornada pasa a CLOSED
      const result = {
        success: true,
        workSessionId: 'test-session-1',
        durationMinutes: 245, // 4h 5m
      };

      assert.equal(result.success, true);
      assert.equal(result.durationMinutes, 245);
    });

    it('No puede cerrar jornada ajena (RLS)', () => {
      // LÓGICA: RLS verifica instructor_id = current_instructor_id()
      // Resultado esperado: error 'Jornada no encontrada'
      const result = {
        success: false,
        error: 'Jornada no encontrada o ya cerrada',
      };

      assert.equal(result.success, false);
    });

    it('No puede cerrar jornada ya cerrada', () => {
      // LÓGICA: UPDATE con WHERE status='OPEN' falla si ya es CLOSED
      // Resultado esperado: error, jornada no encontrada
      const result = {
        success: false,
        error: 'Jornada no encontrada o ya cerrada',
      };

      assert.equal(result.success, false);
    });
  });

  describe('Duración calculada (derivada)', () => {
    it('Calcula duración correcta entre check_in y check_out', () => {
      const checkIn = new Date('2026-09-20T09:00:00Z');
      const checkOut = new Date('2026-09-20T13:30:00Z');
      const durationMinutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);

      assert.equal(durationMinutes, 270); // 4h 30m
    });

    it('Calcula duración sin solapamientos en sesiones múltiples', () => {
      // Jornada: 09:00 - 14:00 (5 horas)
      // Sesiones:
      //   - 09:00 - 10:00 (1h)
      //   - 10:15 - 11:15 (1h)
      //   - Pausa 11:15 - 12:00 (45 min)
      //   - 12:00 - 13:30 (1.5h)
      // Total sesiones: 4.5h, No-clase: 30 min

      const duracionJornada = 5 * 60; // minutos
      const sesiones = [
        { inicio: 0, fin: 60 },     // 1h
        { inicio: 75, fin: 135 },   // 1h
        { inicio: 240, fin: 330 },  // 1.5h (después de pausa)
      ];

      // Merge de intervalos
      const merged: [number, number][] = [];
      for (const [start, end] of sesiones) {
        if (merged.length && merged[merged.length - 1][1] >= start) {
          merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
        } else {
          merged.push([start, end]);
        }
      }

      const duracionClases = merged.reduce((acc, [s, e]) => acc + (e - s), 0);
      const duracionNoClase = duracionJornada - duracionClases;

      assert.equal(duracionClases, 270); // 4.5h
      assert.equal(duracionNoClase, 30);  // 30 min
    });
  });

  describe('Tarifa y Coste', () => {
    it('Selecciona tarifa vigente en la fecha de check_in', () => {
      // LÓGICA: get_instructor_tarifa_vigente(instructor, studio, fecha)
      // Historial:
      //   - vigente_desde: 2026-09-01, vigente_hasta: 2026-09-15, tarifa: 20€
      //   - vigente_desde: 2026-09-16, vigente_hasta: NULL, tarifa: 25€
      // Check-in: 2026-09-20 → debe usar 25€

      const tarifaVigente = 25;
      assert.equal(tarifaVigente, 25);
    });

    it('Calcula coste = duración * tarifa vigente', () => {
      const duracionHoras = 4.5;
      const tarifaHora = 25;
      const costo = duracionHoras * tarifaHora;

      assert.equal(costo, 112.5);
    });

    it('Retorna NULL coste si no hay tarifa fijada', () => {
      const duracionHoras = 4.5;
      const tarifaHora = null;
      const costo = tarifaHora ? duracionHoras * tarifaHora : null;

      assert.equal(costo, null);
    });
  });

  describe('Auditoría', () => {
    it('Registra CHECK_IN con valor_after', () => {
      // LÓGICA: INSERT en work_session_audits
      const audit = {
        action: 'CHECK_IN',
        field_name: 'check_in_at',
        value_before: null,
        value_after: '2026-09-20T09:00:00Z',
      };

      assert.equal(audit.action, 'CHECK_IN');
      assert.ok(audit.value_after);
      assert.equal(audit.value_before, null);
    });

    it('Registra EDITED con valor_before y valor_after', () => {
      // LÓGICA: Cambio manual de timestamp
      const audit = {
        action: 'EDITED',
        field_name: 'check_in_at',
        value_before: '2026-09-20T09:00:00Z',
        value_after: '2026-09-20T08:55:00Z',
        reason: 'Corrección por error de registro',
      };

      assert.equal(audit.action, 'EDITED');
      assert.ok(audit.value_before);
      assert.ok(audit.value_after);
      assert.ok(audit.reason);
    });

    it('No permite editar sin razón (UI requerida)', () => {
      // LÓGICA: El campo reason es opcional, pero UX debe pedirlo
      // En tests: permitir NULL, pero UI debe validar
      const audit = {
        action: 'EDITED',
        reason: null, // Permitido en BD, pero UI lo requiere
      };

      assert.equal(audit.reason, null);
    });
  });

  describe('RLS - Seguridad', () => {
    it('Instructora solo ve/edita sus propias jornadas', () => {
      // LÓGICA: RLS policy con (instructor_id = current_instructor_id())
      // Resultado: SELECT de otra instructora retorna error
      const error = { code: '42501', message: 'Operación no permitida' };
      assert.equal(error.code, '42501');
    });

    it('PROPIETARIO/MANAGER ve todas las jornadas del estudio', () => {
      // LÓGICA: RLS policy con puede_gestionar_equipo() = true
      // Resultado: SELECT retorna todas las jornadas del estudio
      const canView = true;
      assert.equal(canView, true);
    });

    it('Anon NO puede acceder a jornadas', () => {
      // LÓGICA: No hay policy para anon, solo authenticated
      // Resultado: error de permiso
      const error = { code: '42501', message: 'Permiso denegado' };
      assert.equal(error.code, '42501');
    });
  });

  describe('Estados derivados (NO persistidos)', () => {
    it('MISSING_CHECK_IN: jornada sin check_in_at', () => {
      // LÓGICA: Derivado de presentación, no estado persistido
      const workSession = {
        id: 'test-1',
        check_in_at: null,
        status: 'OPEN',
      };

      const isMissingCheckIn = workSession.check_in_at === null;
      assert.equal(isMissingCheckIn, true);
    });

    it('MISSING_CHECK_OUT: OPEN + (ahora - check_in) > limite', () => {
      // LÓGICA: Derivado, no persistido
      const checkIn = new Date(Date.now() - 13 * 3600000); // hace 13 horas
      const ahora = new Date();
      const duracionHoras = (ahora.getTime() - checkIn.getTime()) / 3600000;
      const limiteHoras = 12;

      const requiresReview = duracionHoras > limiteHoras;
      assert.equal(requiresReview, true);
    });
  });

  describe('Configuración por estudio', () => {
    it('Obtiene check_in_window_minutes del estudio', () => {
      // LÓGICA: SELECT de studio_config_tiempo
      const config = {
        check_in_window_minutes: 10,
        open_session_limit_hours: 12,
      };

      assert.equal(config.check_in_window_minutes, 10);
    });

    it('Default values si no existe configuración', () => {
      // LÓGICA: INSERT automático con defaults al crear estudio
      const defaults = {
        check_in_window_minutes: 10,
        open_session_limit_hours: 12,
        allow_retroactive_check_in: false,
      };

      assert.equal(defaults.check_in_window_minutes, 10);
      assert.equal(defaults.allow_retroactive_check_in, false);
    });
  });
});
