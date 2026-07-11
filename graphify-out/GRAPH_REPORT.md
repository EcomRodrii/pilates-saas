# Graph Report - /Users/marcosrocarodriguez/Desktop/o/pilates-saas  (2026-07-12)

## Corpus Check
- 55 files · ~358,234 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1960 nodes · 4412 edges · 130 communities (104 shown, 26 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 115 edges (avg confidence: 0.59)
- Token cost: 136,666 input · 0 output

## Community Hubs (Navigation)
- supabase-data.ts — studio-context.tsx
- db-types.ts — supabase-data.ts
- Decision OS — Rutas API /api/decisiones + memoria (DB)
- Decision OS — Director + resumen diario (agregación)
- csv.ts — csv.ts
- google-calendar.ts — google-calendar.ts
- AUDITORIA-ESCALABILIDAD.md — Auditoría Calendario + Reservas
- supabase-data.ts — fetchCriticalStudioData()
- qrcodegen.ts — QrCode
- package.json — dependencies
- dropdown-menu.tsx — cn()
- page.tsx — page.tsx
- Decision OS — Especialista Retención (reglas R1–R4)
- page.tsx — page.tsx
- sidebar.tsx — sidebar.tsx
- page.tsx — page.tsx
- Decision OS — Centro de Control (UI: página + componentes)
- page.tsx — usePortalAuth()
- Decision OS — Motor de Confianza (niveles y autonomía)
- automation-engine.test.ts — automation-engine.test.ts
- page.tsx — page.tsx
- Decision OS — Tests de Retención
- types.ts — types.ts
- page.tsx — page.tsx
- dialog.tsx — dialog.tsx
- supabase-data.ts — getCurrentStudioId()
- send-server.ts — send-server.ts
- components.json — components.json
- dashboard-chart-engine.ts — dashboard-chart-engine.ts
- api-client.ts — api-client.ts
- page.tsx — page.tsx
- AUDITORIA-CTO.md — Auditoría Técnica CTO - Pilates SaaS
- tsconfig.json — compilerOptions
- profile-avatar.tsx — profile-avatar.tsx
- route.ts — verificarSesionStaff()
- help-widget.tsx — useStudio()
- route.ts — auth-server.ts
- page.tsx — page.tsx
- reward-engine.ts — reward-engine.ts
- Decision OS — Memoria del socio (aplicar/degradar)
- page.tsx — page.tsx
- supabase-data.ts — StudioProvider()
- booking-logic.ts — booking-logic.ts
- page.tsx — page.tsx
- Decision OS — Redacción IA (prompts y serialización)
- page.tsx — page.tsx
- page.tsx — page.tsx
- page.tsx — page.tsx
- Decision OS — Conceptos núcleo (confianza, director, fronteras)
- route.ts — route.ts
- calendar-logic.ts — Calendario()
- page.tsx — page.tsx
- page.tsx — portal-home-logic.ts
- portal-notifications.ts — portal-notifications.ts
- Decision OS — Tests de Ingresos
- page.tsx — page.tsx
- portal-preferencias.ts — page.tsx
- badge.tsx — utils.ts
- Decision OS — Tests del Motor
- page.tsx — page.tsx
- page.tsx — page.tsx
- page.tsx — page.tsx
- supabase-data.ts — crearReservaPublica()
- layout.tsx — studio-slug-gate.tsx
- page.tsx — page.tsx
- Decision OS — Modelo de datos y outcomes (feedback loop)
- Decision OS — Integración additive-only + eventos Inngest
- entitlements.ts — entitlements.ts
- page.tsx — page.tsx
- page.tsx — page.tsx
- supabase-data.ts — use-content-store.ts
- page.tsx — page.tsx
- page.tsx — page.tsx
- brand-icons.tsx — brand-icons.tsx
- types.ts — Socio
- Decision OS — Arquitectura híbrida (núcleo + pipeline)
- Decision OS — Especialistas (contrato de 4 leyes)
- bono-logic.ts — bono-logic.ts
- stripe-cobros.ts — route.ts
- page.tsx — page.tsx
- icon1.png — Tentare Brand Icon Mark (logo-mark.png)
- page.tsx — page.tsx
- Decision OS — Pipeline (dispatcher, analizar, redacción)
- level-engine.ts — LevelDefinition
- supabase-data.ts — use-discount-codes-store.ts
- route.ts — route.ts
- tabs.tsx — tabs.tsx
- Decision OS — Contratos de producto y migración 0003
- page.tsx — page.tsx
- booking.spec.ts — booking.spec.ts
- route.ts — route.ts
- Decision OS — Centro de Control (fases C/D)
- instrumentation.ts — register()
- .mcp.json — context7
- AGENTS.md — Next.js Breaking Changes Notice (AGENTS.md)
- route.ts — route.ts
- route.ts — route.ts
- route.ts — dbSetStripeAccountId()
- automatizacion-template.tsx — automatizacion-template.tsx
- bienvenida-template.tsx — bienvenida-template.tsx
- recibo-template.tsx — recibo-template.tsx
- reserva-template.tsx — reserva-template.tsx
- eslint.config.mjs — eslint.config.mjs
- next.config.ts — next.config.ts
- postcss.config.mjs — postcss.config.mjs
- vercel.json — vercel.json
- Decision OS — Adaptador de escritura (db.ts)
- Decision OS — Idempotencia end-to-end
- Decision OS — Analytics intocable (Fase 6)
- file.svg — file.svg (Next.js boilerplate file icon)
- globe.svg — Globe Icon (Next.js Boilerplate)
- logo-horizontal.png — Tentare Logo (Horizontal)
- logo-icon.png — Tentare Brand Icon Mark (Logo Icon PNG)
- logo-stacked.png — Tentare Logo (Stacked)
- logo-wordmark.png — Tentare Wordmark Logo
- vercel.svg — Vercel Logo (vercel.svg)
- window.svg — window.svg (Next.js boilerplate icon)

## God Nodes (most connected - your core abstractions)
1. `cn()` - 155 edges
2. `useStudio()` - 111 edges
3. `reportDbError()` - 96 edges
4. `StudioContextValue` - 52 edges
5. `fetchCriticalStudioData()` - 44 edges
6. `verificarSesionStaff()` - 34 edges
7. `fetchPublicStudioData()` - 28 edges
8. `QrCode` - 26 edges
9. `usePortalAuth()` - 25 edges
10. `authHeader()` - 24 edges

## Surprising Connections (you probably didn't know these)
- `C-4 Reserva sin gate de plan/bono (agujero de monetización del estudio)` --semantically_similar_to--> `M-1 Sin modelo de negocio implementado (sin billing de plataforma)`  [INFERRED] [semantically similar]
  AUDITORIA-CALENDARIO-RESERVAS.md → AUDITORIA-PRODUCTO.md
- `Unit Tests Step (dinero, reservas, aforo, fiscal)` --semantically_similar_to--> `reservar_plaza / cancelar_reserva_plaza (RPCs transaccionales Postgres)`  [INFERRED] [semantically similar]
  .github/workflows/ci.yml → AUDITORIA-CALENDARIO-RESERVAS.md
- `I-12 Spot-booking no expuesto a la socia final` --semantically_similar_to--> `Gamificación vertical (créditos, logros, retos, niveles, rachas)`  [INFERRED] [semantically similar]
  AUDITORIA-CALENDARIO-RESERVAS.md → AUDITORIA-PRODUCTO.md
- `Pipeline Inngest (lib/inngest/decision.ts)` --semantically_similar_to--> `automation-engine.ts (proto-Decision-OS existente)`  [INFERRED] [semantically similar]
  DECISION-OS-ARQUITECTURA.md → DECISION-OS-ANALISIS.md
- `MorningBriefing()` --calls--> `cn()`  [EXTRACTED]
  app/(dashboard)/automatizaciones/page.tsx → lib/utils.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Pipeline determinista del Decision Engine (ejecutarAnalisis)** — decision_os_nucleo_decision_engine, decision_os_nucleo_senales, decision_os_especialistas_contrato, decision_os_nucleo_memory_engine, decision_os_nucleo_confidence_engine, decision_os_nucleo_priority_engine, decision_os_nucleo_director_engine [EXTRACTED 1.00]
- **Los 6 especialistas implementan el contrato Especialista** — decision_os_especialistas_contrato, decision_os_especialistas_retencion, decision_os_especialistas_ingresos, decision_os_especialistas_finanzas, decision_os_especialistas_agenda, decision_os_especialistas_marketing, decision_os_especialistas_equipo [EXTRACTED 1.00]
- **Las 6 tablas de la migración 0003_decision_os** — decision_os_modelo_datos_migracion, decision_os_modelo_datos_recomendaciones, decision_os_modelo_datos_recomendacion_outcomes, decision_os_modelo_datos_memoria_socio, decision_os_modelo_datos_resumen_diario, decision_os_modelo_datos_decision_sessions, decision_os_modelo_datos_feature_flags [EXTRACTED 1.00]
- **Sistema de auditorías cruzadas del SaaS de pilates** — auditoria_calendario_reservas_auditoria_calendario_reservas, auditoria_escalabilidad_auditoria_escalabilidad, auditoria_producto_auditoria_producto, auditoria_cto_auditoria_cto [EXTRACTED 1.00]
- **Fiabilidad del core de reservas (aforo, bonos, notificaciones)** — auditoria_escalabilidad_sobreventa_aforo, auditoria_calendario_reservas_reservar_plaza_rpc, auditoria_calendario_reservas_c1_notificaciones_falsas, auditoria_calendario_reservas_c2_politica_cancelacion, auditoria_calendario_reservas_c3_no_asistio_fantasma [INFERRED 0.85]
- **Tesis de inversión: modelo de negocio + VeriFactu + aforo fiable** — auditoria_producto_m1_sin_modelo_negocio, auditoria_producto_verifactu_ticketbai, auditoria_escalabilidad_sobreventa_aforo, auditoria_producto_decision_inversion [EXTRACTED 1.00]
- **P0: bloqueantes de lanzamiento (seguridad + core roto)** — auditoria_cto_rls_anon_abierto, auditoria_cto_endpoints_sin_auth, auditoria_cto_portal_socios_auth_falsa, auditoria_cto_aforo_lista_espera_bug [EXTRACTED 1.00]
- **Módulos de producto realmente terminados (diferenciadores)** — auditoria_cto_stripe_connect_integration, auditoria_cto_checkin_kiosk, auditoria_cto_gamificacion_completa, auditoria_cto_ia_anthropic_claude_haiku [EXTRACTED 1.00]
- **Deuda técnica de infraestructura y arquitectura** — auditoria_cto_god_context_studio_context, auditoria_cto_mock_data_codigo_muerto, auditoria_cto_current_studio_id_fallback [INFERRED 0.85]

## Communities (130 total, 26 thin omitted)

### Community 0 - "supabase-data.ts — studio-context.tsx"
Cohesion: 0.04
Nodes (80): defaultStudioConfig, StudioConfig, StudioContext, automatizacionToDb(), campanaToDb(), dbAjustarCreditos(), dbCancelarReservaPlaza(), dbDeleteAutomatizacion() (+72 more)

### Community 1 - "db-types.ts — supabase-data.ts"
Cohesion: 0.06
Nodes (59): RowAchievementDefinitions, RowAchievementHistory, RowAchievementProgress, RowActividadReciente, RowAutomationLogs, RowAutomationRules, RowAutomatizaciones, RowBackups (+51 more)

### Community 2 - "Decision OS — Rutas API /api/decisiones + memoria (DB)"
Cohesion: 0.07
Nodes (47): POST(), POST(), POST(), { GET, POST, PUT }, construirMapaMemoria(), construirRecomendacion(), dbActualizarOutcome(), dbFinalizarDecisionSession() (+39 more)

### Community 3 - "Decision OS — Director + resumen diario (agregación)"
Cohesion: 0.08
Nodes (54): GET(), dbGetResumenDiario(), mapResumenDiario(), calcularEstadoEspecialista(), calcularEstadoGeneral(), calcularResumenEjecutivo(), construirMientrasDormias(), construirResumenDiario() (+46 more)

### Community 4 - "csv.ts — csv.ts"
Cohesion: 0.07
Nodes (46): POST(), POST(), GET(), FilaEntrada, POST(), descargar(), ImportarSociasPage(), Paso (+38 more)

### Community 5 - "google-calendar.ts — google-calendar.ts"
Cohesion: 0.08
Nodes (44): FacturaEntrante, mapSalida(), POST(), GET(), POST(), SesionConRelaciones, AgrupadorFact, Facturas() (+36 more)

### Community 6 - "AUDITORIA-ESCALABILIDAD.md — Auditoría Calendario + Reservas"
Cohesion: 0.07
Nodes (48): CI Pipeline, E2E Playwright Step (registro, reserva, pago), Dummy Supabase Env Vars for CI, Typecheck Step (tsc --noEmit), Unit Tests Step (dinero, reservas, aforo, fiscal), Auditoría Calendario + Reservas, C-1 Promesas de notificaciones inexistentes, C-2 Sin política de cancelación / late-cancel / no-show fee (+40 more)

### Community 7 - "supabase-data.ts — fetchCriticalStudioData()"
Cohesion: 0.07
Nodes (46): POST(), canjearRecompensaPublica(), checkinPublico(), dbClaimInstructorAccount(), fetchCriticalStudioData(), fetchPublicStudioData(), mapAchievementDefinition(), mapAchievementProgress() (+38 more)

### Community 8 - "qrcodegen.ts — QrCode"
Cohesion: 0.10
Nodes (9): appendBits(), assert(), bit, byte, getBit(), int, Mode, QrCode (+1 more)

### Community 9 - "package.json — dependencies"
Cohesion: 0.04
Nodes (45): dependencies, @anthropic-ai/sdk, aws4fetch, @base-ui/react, class-variance-authority, clsx, date-fns, inngest (+37 more)

### Community 10 - "dropdown-menu.tsx — cn()"
Cohesion: 0.08
Nodes (34): Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup(), AvatarGroupCount(), AvatarImage(), Card(), CardAction() (+26 more)

### Community 11 - "page.tsx — page.tsx"
Cohesion: 0.06
Nodes (40): CampoIntegracion, CATALOGO_INTEGRACIONES, CatalogoIntegracion, ClaseForm, claseToForm(), ColorInput(), ColorSwatch(), ConfiguracionPage() (+32 more)

### Community 12 - "Decision OS — Especialista Retención (reglas R1–R4)"
Cohesion: 0.15
Nodes (29): frecuenciaUltimas4Semanas(), redondear1(), redondear2(), reglaR1(), reglaR2(), reglaR3(), reglaR4(), agrupar() (+21 more)

### Community 13 - "page.tsx — page.tsx"
Cohesion: 0.11
Nodes (28): ESTADO_STYLE, EstadoTarjeta, ProgresoPage(), RetosTab(), Tab, TABS, emptyForm(), LOGROS_SUGERIDOS (+20 more)

### Community 14 - "sidebar.tsx — sidebar.tsx"
Cohesion: 0.10
Nodes (25): Home(), TabBackups(), AppearancePanel(), bottomNavItems, ESSENTIAL_HREFS, navSections, Sidebar(), SIDEBAR_SIZES (+17 more)

### Community 15 - "page.tsx — page.tsx"
Cohesion: 0.08
Nodes (23): weekStart(), actividadConfig, ClaseHoyCard(), Dashboard(), formatHora(), KpiCard(), localDate(), MONTH_LABELS (+15 more)

### Community 16 - "Decision OS — Centro de Control (UI: página + componentes)"
Cohesion: 0.10
Nodes (23): CentroDeControlPage(), ActivityList(), timeAgo(), EmptyState(), ESTADO_INFO, ExecutiveSummary(), ACCESOS, QuickActions() (+15 more)

### Community 17 - "page.tsx — usePortalAuth()"
Cohesion: 0.10
Nodes (19): InvitarPage(), metadata, PortalLogin(), Filtro, MiPlanPage(), ESTADO_BADGE, MisReservasPage(), Tab (+11 more)

### Community 18 - "Decision OS — Motor de Confianza (niveles y autonomía)"
Cohesion: 0.13
Nodes (25): AUTONOMIA_DECLARADA_POR_TIPO, autonomiaDeNivel(), confianzaAbrirSesion(), confianzaEnviarReactivacion(), confianzaRecuperarPagos(), confianzaRecuperarSocia(), confianzaRecuperarSociaPorNoShow(), Criterio (+17 more)

### Community 19 - "automation-engine.test.ts — automation-engine.test.ts"
Cohesion: 0.13
Nodes (25): AutomationCandidato, AutomationEngineInput, computeAutomationCandidatos(), diasAntes(), log(), NOW, reserva(), rule() (+17 more)

### Community 20 - "page.tsx — page.tsx"
Cohesion: 0.08
Nodes (22): accionDesc, ConversionFunnelCard(), CopyButton(), destinatariosLabel, EstadoBadge(), formatDateEs(), FUNNEL_STAGES, KpiTrendCard() (+14 more)

### Community 21 - "Decision OS — Tests de Retención"
Cohesion: 0.09
Nodes (23): asistenciasHabituales(), diasAntes(), NOW, plan(), reserva(), snapshot(), suscripcion(), ResultadoMedicion (+15 more)

### Community 22 - "types.ts — types.ts"
Cohesion: 0.10
Nodes (27): StudioContextValue, AceptacionContrato, AchievementHistory, AchievementProgress, AutomationStep, BackupMeta, CategoriaPOS, ChallengeHistory (+19 more)

### Community 23 - "page.tsx — page.tsx"
Cohesion: 0.12
Nodes (22): DIA_PILLS, DiaPill(), DIAS_CORTOS, formatHora(), FormData, hexToRgba(), isDark(), layoutDay() (+14 more)

### Community 24 - "dialog.tsx — dialog.tsx"
Cohesion: 0.13
Nodes (16): TIPO_LABEL, emptyForm(), NIVELES_SUGERIDOS, TabNiveles(), CREDITOS_SUGERIDOS, emptyCatalogForm(), TabRecompensas(), Button() (+8 more)

### Community 25 - "supabase-data.ts — getCurrentStudioId()"
Cohesion: 0.08
Nodes (15): dbDeleteDashboardChart(), dbInsertDashboardChart(), dbInsertMensajeEquipo(), dbInsertNotaProgreso(), dbUpsertIntegracion(), dbUpsertPreferenciasSocio(), getCurrentStudioId(), mensajeEquipoToDb() (+7 more)

### Community 26 - "send-server.ts — send-server.ts"
Cohesion: 0.16
Nodes (16): GET(), POST(), CancelacionClaseEmail(), Props, PromocionEsperaEmail(), Props, Props, RecordatorioEmail() (+8 more)

### Community 27 - "components.json — components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 28 - "dashboard-chart-engine.ts — dashboard-chart-engine.ts"
Cohesion: 0.12
Nodes (18): ChartCard(), COLORES, CustomChartsSection(), AGRUPACIONES_GRAFICO, ChartData, computeSerieGrafico(), etiquetaPeriodo(), inicioPeriodo() (+10 more)

### Community 29 - "api-client.ts — api-client.ts"
Cohesion: 0.16
Nodes (21): aprobarCobroAutonomo(), authHeader(), cargarDatosPublicos(), DatosClaseEmailCliente, enviarEmailBienvenida(), enviarEmailCampana(), enviarEmailCancelacionClase(), enviarEmailPromocion() (+13 more)

### Community 30 - "page.tsx — page.tsx"
Cohesion: 0.15
Nodes (18): addDays(), downloadICS(), FECHA_PLACEHOLDER_SSR, fmtLong(), fmtShort(), fmtTime(), localDate(), makeGoogleCalUrl() (+10 more)

### Community 31 - "AUDITORIA-CTO.md — Auditoría Técnica CTO - Pilates SaaS"
Cohesion: 0.13
Nodes (21): Auditoría Técnica CTO - Pilates SaaS, Bug de aforo/lista de espera (addReserva siempre CONFIRMADA), Campañas de marketing sin acción de enviar, Check-in / kiosk (lógica de negocio, descuento de bono, recibo de renovación), Consumo de sesiones del bono solo en check-in, no al reservar, current_studio_id() con fallback hardcodeado 'studio-1', Endpoints de API sin autenticación (charge-off-session, checkout, emails/send, ai/*), Export PDF de informes es un setTimeout falso (simulatePDF()) (+13 more)

### Community 32 - "tsconfig.json — compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+12 more)

### Community 33 - "profile-avatar.tsx — profile-avatar.tsx"
Cohesion: 0.16
Nodes (14): PerfilPage(), AvatarDef, AvatarGenero, AvatarPicker(), initialsOf(), memojiIdFor(), memojiSeedOf(), memojiUrl() (+6 more)

### Community 34 - "route.ts — verificarSesionStaff()"
Cohesion: 0.18
Nodes (13): client, POST(), client, POST(), POST(), POST(), POST(), GET() (+5 more)

### Community 35 - "help-widget.tsx — useStudio()"
Cohesion: 0.19
Nodes (13): getInitials(), InstructoresPage(), dismissKey(), OnboardingChecklist(), CATEGORIAS, FaqItem, FAQS, HelpWidget() (+5 more)

### Community 36 - "route.ts — auth-server.ts"
Cohesion: 0.24
Nodes (13): POST(), POST(), POST(), POST(), SesionStaff, verificarUsuarioSupabase(), actualizarSociaPublica(), guardarPreferenciasPublica() (+5 more)

### Community 37 - "page.tsx — page.tsx"
Cohesion: 0.15
Nodes (16): CartItem, CAT_STYLE, catStyle(), CerrarCajaModal(), CerrarCajaModalProps, formatDateLabel(), formatTimeOrDate(), isSameDay() (+8 more)

### Community 38 - "reward-engine.ts — reward-engine.ts"
Cohesion: 0.19
Nodes (14): RecompensasTab(), aplicarCanjeCreditos(), aplicarGananciaCreditos(), decidirOtorgarCreditos(), reglaActivaPara(), REWARD_TRIGGERS, item(), validarCanje() (+6 more)

### Community 39 - "Decision OS — Memoria del socio (aplicar/degradar)"
Cohesion: 0.20
Nodes (12): aplicarMemoria(), canalPreferido(), degradarReactivacionAContacto(), hechoActivo(), diasAntes(), diasDespues(), log(), NOW (+4 more)

### Community 40 - "page.tsx — page.tsx"
Cohesion: 0.22
Nodes (12): CrearEstudioPage(), OwnerForm, StudioForm, StudioTipo, TIPOS, LoginPage(), AuthContext, AuthContextType (+4 more)

### Community 41 - "supabase-data.ts — StudioProvider()"
Cohesion: 0.12
Nodes (15): jakarta, metadata, StudioProvider(), dbInsertRecibo(), fetchAllStudioData(), fetchDeferredStudioData(), mapAchievementHistory(), mapBackupMeta() (+7 more)

### Community 42 - "booking-logic.ts — booking-logic.ts"
Cohesion: 0.21
Nodes (12): contarReferidosPremiadosMes(), contarReservasActivasFuturas(), debeDevolverBono(), decidirPremioReferido(), decidirReservaNueva(), esCancelacionTardia(), esPrimeraAsistencia(), plazasOcupadas() (+4 more)

### Community 43 - "page.tsx — page.tsx"
Cohesion: 0.16
Nodes (13): CitaCard(), CitaCardProps, CitasPage(), DURACIONES, duracionMin(), ESTADO_BADGE, formatFecha(), isSameMonth() (+5 more)

### Community 44 - "Decision OS — Redacción IA (prompts y serialización)"
Cohesion: 0.19
Nodes (13): aResultadoSerializable(), construirFallback(), construirSystemPrompt(), construirUserPrompt(), ItemARedactar, ItemRedactado, ItemRedactadoConId, RedaccionInput (+5 more)

### Community 45 - "page.tsx — page.tsx"
Cohesion: 0.24
Nodes (13): Bucket, CohortRow, ExportState, fmtEur(), fmtEurFull(), getBucketKey(), getChartBuckets(), getPeriodStart() (+5 more)

### Community 46 - "page.tsx — page.tsx"
Cohesion: 0.18
Nodes (12): BADGE, fecha(), isoToYearMonth(), MainTab, monthLabel(), Pagos(), SocioPicker(), SORT_OPTIONS (+4 more)

### Community 47 - "page.tsx — page.tsx"
Cohesion: 0.18
Nodes (8): avatarColor(), emptyForm(), FormSocia, relativeTime(), SmartFilter, Socios(), SortDir, SortKey

### Community 48 - "Decision OS — Conceptos núcleo (confianza, director, fronteras)"
Cohesion: 0.15
Nodes (14): Confianza por niveles con evidencia (enmienda 12.2), Director del Estudio (especialista MVP), Fronteras entre especialistas, Tabla memoria_socio, Principio: persistir vs derivar, Signal (catálogo de código, no tabla), Autonomía máxima derivada, Confidence Engine (confianza.ts) (+6 more)

### Community 49 - "route.ts — route.ts"
Cohesion: 0.32
Nodes (9): POST(), GET(), actualizarSuscripcion(), POST(), planDePriceId(), priceEnv(), priceIdDe(), Plan (+1 more)

### Community 50 - "calendar-logic.ts — Calendario()"
Cohesion: 0.27
Nodes (10): addDays(), Calendario(), ModalClasesRecurrentes(), toISO(), detectarConflictos(), hayConflicto(), plazasSobrantesTrasAforo(), SlotSesion (+2 more)

### Community 51 - "page.tsx — page.tsx"
Cohesion: 0.17
Nodes (10): CAT_COLOR, CAT_LABEL, fmt(), PlanFormData, PosFormData, Productos(), Tab, TIPO_COLOR (+2 more)

### Community 52 - "page.tsx — portal-home-logic.ts"
Cohesion: 0.21
Nodes (10): ClasesPage(), NIVEL_COLOR, NIVEL_LABEL, Tab, ClaseDetallePage(), NIVEL_LABEL, HomeCardContext, tieneCoberturaPlan() (+2 more)

### Community 53 - "portal-notifications.ts — portal-notifications.ts"
Cohesion: 0.31
Nodes (10): PortalHome(), formatRelative(), NotificacionesPage(), getHomeCardContext(), buildPortalNotifications(), markPortalNotifsRead(), PortalNotifItem, PortalNotifTipo (+2 more)

### Community 54 - "Decision OS — Tests de Ingresos"
Cohesion: 0.19
Nodes (6): diasAntes(), NOW, recibo(), reserva(), sesion(), slot()

### Community 55 - "page.tsx — page.tsx"
Cohesion: 0.21
Nodes (10): accionConfig, AutomatizacionesPage(), formatFecha(), horasRestantes(), LogItem(), MorningBriefing(), REGLAS_SUGERIDAS, resultadoConfig (+2 more)

### Community 56 - "portal-preferencias.ts — page.tsx"
Cohesion: 0.30
Nodes (10): PreferenciasPage(), DIAS_SEMANA, disponibilidadVacia(), DURACIONES, FRANJAS, NIVELES, DiaSemana, Disponibilidad (+2 more)

### Community 57 - "badge.tsx — utils.ts"
Cohesion: 0.18
Nodes (6): Badge(), badgeVariants, Input(), Label(), Separator(), Textarea()

### Community 58 - "Decision OS — Tests del Motor"
Cohesion: 0.24
Nodes (7): asistencias(), diasAntes(), NOW, recibo(), reserva(), sesion(), slot()

### Community 59 - "page.tsx — page.tsx"
Cohesion: 0.27
Nodes (10): Avatar(), AVATAR_COLORS, Comment, CommentThread(), ComunidadPage(), getInitials(), NewPostModal(), PostCard() (+2 more)

### Community 60 - "page.tsx — page.tsx"
Cohesion: 0.24
Nodes (10): ActividadTab(), COLORES, emptyForm(), EquipoPage(), Form, formatFechaHora(), ROL_DESC, ROL_LABEL (+2 more)

### Community 61 - "page.tsx — page.tsx"
Cohesion: 0.18
Nodes (10): categoriaBadge, categoriaBg, CATEGORIAS, nivelBadge, NIVELES, nivelLabel, OnDemandPage(), UploadForm (+2 more)

### Community 62 - "supabase-data.ts — crearReservaPublica()"
Cohesion: 0.38
Nodes (9): POST(), asignarSpotReserva(), cancelarReservaPublica(), cargarPoliticaEstudio(), consumirBonoServidor(), crearReservaPublica(), devolverBonoServidor(), mapPlanTarifa() (+1 more)

### Community 63 - "layout.tsx — studio-slug-gate.tsx"
Cohesion: 0.31
Nodes (5): generateMetadata(), ReservarSlugLayout(), StudioSlugGate(), getStudioSeo, StudioSeo

### Community 64 - "page.tsx — page.tsx"
Cohesion: 0.36
Nodes (9): avatarColor(), DIAS, initials(), isDark(), KioskPage(), localDate(), MESES, pad2() (+1 more)

### Community 65 - "Decision OS — Modelo de datos y outcomes (feedback loop)"
Cohesion: 0.24
Nodes (10): Falta de atribución de resultados, Algorithm Version (semver), Ciclo de vida unificado de Recommendation, Tabla decision_sessions, Rechazo de Knowledge Graph / A/B ahora, Tabla recomendacion_outcomes (feedback loop), Tabla recomendaciones, Camino de calibración de porcentajes (+2 more)

### Community 66 - "Decision OS — Integración additive-only + eventos Inngest"
Cohesion: 0.20
Nodes (10): Reutilización del SaaS existente, Principio Additive-only, APIs /api/decisiones, ejecutarRecomendacion (F3, trigger recommendation.approved), Evento decision/recommendation.approved, Evento decision/outcome.measure, medirOutcome (F4, trigger outcome.measure), lib/stripe-cobros.ts (único refactor) (+2 more)

### Community 67 - "entitlements.ts — entitlements.ts"
Cohesion: 0.42
Nodes (8): accesoProducto(), Entitlements, entitlementsDe(), PLAN_ENTITLEMENTS, planDe(), puedeAnadirSocia(), suscripcionActiva(), tieneFeature()

### Community 68 - "page.tsx — page.tsx"
Cohesion: 0.28
Nodes (7): DashboardLayout(), btnPrimary, BULLETS, SuscripcionPage(), EstadoBilling, plan(), PLAN_INFO

### Community 69 - "page.tsx — page.tsx"
Cohesion: 0.22
Nodes (8): CATEGORIAS, GRADIENTS, NIVEL_BG, NIVEL_COLOR, NIVEL_LABEL, VideosPage(), CategoriaVideo, NivelClase

### Community 70 - "supabase-data.ts — use-content-store.ts"
Cohesion: 0.22
Nodes (7): dbInsertPostComunidad(), dbInsertVideoOnDemand(), dbUpdatePostComunidad(), dbUpdateVideoOnDemand(), postComunidadToDb(), videoOnDemandToDb(), VideoOnDemand

### Community 71 - "page.tsx — page.tsx"
Cohesion: 0.32
Nodes (5): Mensajeria(), Tab, timeAgo(), TIPO_ICON, mapLimit()

### Community 72 - "page.tsx — page.tsx"
Cohesion: 0.29
Nodes (6): ActividadIcon(), NotificacionesPage(), NotiIconBg(), timeAgo(), ActividadReciente, Notificacion

### Community 74 - "types.ts — Socio"
Cohesion: 0.39
Nodes (7): SpotMap(), SpotMapProps, MetricaContexto, Reserva, ReservaEnriquecida, Socio, Spot

### Community 75 - "Decision OS — Arquitectura híbrida (núcleo + pipeline)"
Cohesion: 0.25
Nodes (8): automation-engine.ts (proto-Decision-OS existente), Arquitectura híbrida programado + reactivo (enmienda 12.3), Principio: Núcleo puro (lib/decision), Pipeline Inngest (lib/inngest/decision.ts), Convivencia con Automatizaciones, Fase 0 — Product Validation Gate (contrato de datos), Fase A — Núcleo puro, Fase B — Pipeline + APIs

### Community 76 - "Decision OS — Especialistas (contrato de 4 leyes)"
Cohesion: 0.32
Nodes (8): Especialista Agenda (F2), Contrato de Especialista (4 leyes), Especialista Equipo (F3), Especialista Finanzas (F2), Especialista Ingresos (MVP), Especialista Marketing (F2), Especialista Retención (MVP), Fase E — Reactividad + 3 especialistas

### Community 77 - "bono-logic.ts — bono-logic.ts"
Cohesion: 0.46
Nodes (6): bonoConsumible(), calcularConsumoBono(), calcularDevolucionBono(), tieneEntitlementActivo(), PlanTarifa, Suscripcion

### Community 78 - "stripe-cobros.ts — route.ts"
Cohesion: 0.43
Nodes (5): POST(), STATUS_POR_ERROR, cobrarReciboOffSession(), CobroErrorCode, ResultadoCobro

### Community 79 - "page.tsx — page.tsx"
Cohesion: 0.48
Nodes (6): AVATAR_COLORS, avatarColor(), ChatEquipoPage(), esMismoDia(), formatFecha(), formatHora()

### Community 80 - "icon1.png — Tentare Brand Icon Mark (logo-mark.png)"
Cohesion: 0.29
Nodes (7): Tentare Brand Icon Mark (Favicon 256x256), Tentare Brand Icon (48x48 Favicon), Tentare Brand Icon (32x32 Favicon), Tentare Brand Icon (16x16 Favicon), Tentare PWA Icon 192x192, Tentare PWA Icon 512x512, Tentare Brand Icon Mark (logo-mark.png)

### Community 82 - "Decision OS — Pipeline (dispatcher, analizar, redacción)"
Cohesion: 0.33
Nodes (7): analizarEstudio (F2, trigger studio.analyze), decisionDispatcher (cron 2×/día), Evento decision/studio.analyze, Principio: la IA nunca calcula, solo redacta, redaccion.ts (adaptador IA), SnapshotEstudio (puerto de lectura), Prompts de redacción (redaccion.ts)

### Community 83 - "level-engine.ts — LevelDefinition"
Cohesion: 0.43
Nodes (4): calcularNivel(), NivelInfo, niveles, LevelDefinition

### Community 84 - "supabase-data.ts — use-discount-codes-store.ts"
Cohesion: 0.29
Nodes (5): codigoDescuentoToDb(), dbDeleteCodigoDescuento(), dbInsertCodigoDescuento(), dbUpdateCodigoDescuento(), CodigoDescuento

### Community 85 - "route.ts — route.ts"
Cohesion: 0.53
Nodes (4): client, POST(), buildRecomendacionUserPrompt(), RecomendacionInput

### Community 86 - "tabs.tsx — tabs.tsx"
Cohesion: 0.40
Nodes (5): Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger()

### Community 87 - "Decision OS — Contratos de producto y migración 0003"
Cohesion: 0.33
Nodes (6): Contratos no negociables del producto, Tentare Decision OS (categoría/producto), Contratos de dominio (lib/decision/tipos.ts), Migración 0003_decision_os.sql (6 tablas), Modo aprendizaje / silencio como resultado válido, Priority Engine (prioridad.ts)

### Community 88 - "page.tsx — page.tsx"
Cohesion: 0.60
Nodes (4): fechaCorta(), FiltroTipo, fmt(), Transacciones()

### Community 90 - "route.ts — route.ts"
Cohesion: 0.83
Nodes (3): POST(), dbDeleteGoogleCalendarCredenciales(), dbSetGoogleCalendarEmail()

### Community 91 - "Decision OS — Centro de Control (fases C/D)"
Cohesion: 0.50
Nodes (4): Centro de Control (frontend), Tabla resumen_diario, Fase C — Centro de Control (UI), Fase D — Endurecimiento y lanzamiento

### Community 93 - ".mcp.json — context7"
Cohesion: 0.50
Nodes (3): npx, context7, @upstash/context7-mcp

### Community 95 - "AGENTS.md — Next.js Breaking Changes Notice (AGENTS.md)"
Cohesion: 0.67
Nodes (3): Next.js Breaking Changes Notice (AGENTS.md), CLAUDE.md (project instructions entrypoint), README - Next.js project bootstrap

## Knowledge Gaps
- **377 isolated node(s):** `accionConfig`, `resultadoConfig`, `triggerLabels`, `REGLAS_SUGERIDAS`, `AVATAR_COLORS` (+372 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `dropdown-menu.tsx — cn()` to `google-calendar.ts — google-calendar.ts`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `sidebar.tsx — sidebar.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `dialog.tsx — dialog.tsx`, `dashboard-chart-engine.ts — dashboard-chart-engine.ts`, `profile-avatar.tsx — profile-avatar.tsx`, `help-widget.tsx — useStudio()`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `calendar-logic.ts — Calendario()`, `page.tsx — page.tsx`, `badge.tsx — utils.ts`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `types.ts — Socio`, `tabs.tsx — tabs.tsx`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `useStudio()` connect `help-widget.tsx — useStudio()` to `supabase-data.ts — studio-context.tsx`, `google-calendar.ts — google-calendar.ts`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `sidebar.tsx — sidebar.tsx`, `page.tsx — page.tsx`, `page.tsx — usePortalAuth()`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `dialog.tsx — dialog.tsx`, `dashboard-chart-engine.ts — dashboard-chart-engine.ts`, `page.tsx — page.tsx`, `profile-avatar.tsx — profile-avatar.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `calendar-logic.ts — Calendario()`, `page.tsx — page.tsx`, `page.tsx — portal-home-logic.ts`, `portal-notifications.ts — portal-notifications.ts`, `page.tsx — page.tsx`, `portal-preferencias.ts — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`, `page.tsx — page.tsx`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `inngest` connect `Decision OS — Rutas API /api/decisiones + memoria (DB)` to `automation-engine.test.ts — automation-engine.test.ts`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Are the 39 inferred relationships involving `fetchCriticalStudioData()` (e.g. with `mapAchievementDefinition()` and `mapAchievementProgress()`) actually correct?**
  _`fetchCriticalStudioData()` has 39 INFERRED edges - model-reasoned connections that need verification._
- **What connects `accionConfig`, `resultadoConfig`, `triggerLabels` to the rest of the system?**
  _390 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `supabase-data.ts — studio-context.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.04305931948208371 - nodes in this community are weakly interconnected._
- **Should `db-types.ts — supabase-data.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.058699101004759384 - nodes in this community are weakly interconnected._