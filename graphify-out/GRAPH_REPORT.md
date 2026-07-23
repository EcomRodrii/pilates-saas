# Graph Report - .  (2026-07-23)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 3527 nodes · 9642 edges · 170 communities (155 shown, 15 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 156 edges (avg confidence: 0.6)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `969087e2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- supabase-data.ts
- studio-context.tsx
- cn
- theme-editor.tsx
- types.ts
- fetchExterno
- page.tsx
- director.ts
- page.tsx
- tipos.ts
- fetchCriticalStudioData
- ui.tsx
- permisos.ts
- api-client.ts
- Reserva
- getSupabaseAdmin
- ficha-clinica.ts
- useModo
- QrCode
- dependencies
- route.ts
- entitlements.ts
- auth-server.ts
- page.tsx
- types.ts
- senales.ts
- page.tsx
- db.ts
- useStudio
- errorInterno
- page.tsx
- csv.ts
- uid
- page.tsx
- page.tsx
- page.tsx
- automatizaciones.ts
- bloqueoPorFeature
- decision.ts
- page.tsx
- page.tsx
- cierre-engine.ts
- use-team-chat-store.ts
- page.tsx
- profile-avatar.tsx
- layout.tsx
- backup-engine.ts
- supabase-admin.ts
- contacto.ts
- route.ts
- page.tsx
- route.ts
- page.tsx
- components.json
- ingresos.ts
- agenda.test.ts
- page.frozen.tsx
- redaccion.ts
- compilerOptions
- auth-context.tsx
- page.frozen.tsx
- reserva-calendario.tsx
- MemoriaEstudio
- route.ts
- Recomendacion
- page.tsx
- email.ts
- valoraciones.ts
- tipos-muertos.test.ts
- verifactu.test.ts
- analytics.ts
- custom-charts.tsx
- confirmacion-riesgo.ts
- booking-logic.test.ts
- reward-engine.ts
- route.ts
- route.ts
- page.tsx
- page.tsx
- home-editor.tsx
- dunning-server.ts
- personalizacion.test.ts
- achievement-engine.ts
- route.ts
- page.tsx
- tab-integraciones.tsx
- help-widget.tsx
- route.ts
- page-header.tsx
- memoria.test.ts
- escenarios-reales.test.ts
- ingresos.test.ts
- retencion.test.ts
- instructor-dependency.ts
- page.tsx
- page.tsx
- page.tsx
- ReservaCalendario
- email.ts
- Plataforma
- serializeCsv
- motor.test.ts
- page.tsx
- tab-servicios-cita.tsx
- profile-menu.tsx
- nuevos-especialistas.test.ts
- seed-dependency-risk.mjs
- page.tsx
- page.frozen.tsx
- page.frozen.tsx
- citas-publica.tsx
- global-search.tsx
- calendar-logic.test.ts
- use-content-store.ts
- cobertura-dialog.tsx
- onboarding-checklist.tsx
- bono-logic.test.ts
- outcomes.ts
- use-discount-codes-store.ts
- route.ts
- Tentare Brand Icon Mark (logo-mark.png)
- baja-form.tsx
- portal-notifications.ts
- page.tsx
- page.tsx
- catalogo-estudio.ts
- context7
- CI Pipeline
- generarRecordatoriosRevision
- booking.spec.ts
- valoracion-template.tsx
- ocupacion.ts
- register
- Next.js Breaking Changes Notice (AGENTS.md)
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- vercel.json
- file.svg (Next.js boilerplate file icon)
- Globe Icon (Next.js Boilerplate)
- Tentare Logo (Horizontal)
- Tentare Brand Icon Mark (Logo Icon PNG)
- Tentare Logo (Stacked)
- Tentare Wordmark Logo
- Vercel Logo (vercel.svg)
- window.svg (Next.js boilerplate icon)
- tab-clases.tsx

## God Nodes (most connected - your core abstractions)
1. `cn()` - 248 edges
2. `getSupabaseAdmin()` - 171 edges
3. `useStudio()` - 148 edges
4. `reportDbError()` - 141 edges
5. `verificarSesionStaff()` - 133 edges
6. `errorInterno()` - 103 edges
7. `authHeader()` - 63 edges
8. `StudioContextValue` - 60 edges
9. `uid()` - 55 edges
10. `Reserva` - 50 edges

## Surprising Connections (you probably didn't know these)
- `MiPlanPage()` --indirect_call--> `factura()`  [INFERRED]
  app/portal/[slug]/mi-plan/page.tsx → lib/fiscal/cierre-engine.test.ts
- `Tentare Brand Icon Mark (logo-mark.png)` --source_of--> `Tentare Brand Icon Mark (Favicon 256x256)`  [INFERRED]
  public/logo-mark.png → app/icon1.png
- `Tentare Brand Icon Mark (logo-mark.png)` --source_of--> `Tentare Brand Icon (48x48 Favicon)`  [INFERRED]
  public/logo-mark.png → app/icon2.png
- `Tentare Brand Icon Mark (logo-mark.png)` --source_of--> `Tentare Brand Icon (32x32 Favicon)`  [INFERRED]
  public/logo-mark.png → app/icon3.png
- `Tentare Brand Icon Mark (logo-mark.png)` --source_of--> `Tentare Brand Icon (16x16 Favicon)`  [INFERRED]
  public/logo-mark.png → app/icon4.png

## Import Cycles
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-citas.tsx -> components/configuracion/tab-horario-citas.tsx -> app/(dashboard)/configuracion/page.tsx`
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-citas.tsx -> components/configuracion/tab-servicios-cita.tsx -> app/(dashboard)/configuracion/page.tsx`
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-gamificacion.tsx -> components/configuracion/tab-recompensas.tsx -> app/(dashboard)/configuracion/page.tsx`
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-clases-salas.tsx -> components/configuracion/tab-salas.tsx -> app/(dashboard)/configuracion/page.tsx`
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-gamificacion.tsx -> components/configuracion/tab-logros.tsx -> app/(dashboard)/configuracion/page.tsx`
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-gamificacion.tsx -> components/configuracion/tab-niveles.tsx -> app/(dashboard)/configuracion/page.tsx`
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-gamificacion.tsx -> components/configuracion/tab-retos.tsx -> app/(dashboard)/configuracion/page.tsx`
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-clases-salas.tsx -> components/configuracion/tab-clases.tsx -> app/(dashboard)/configuracion/page.tsx`

## Communities (170 total, 15 thin omitted)

### Community 0 - "supabase-data.ts"
Cohesion: 0.03
Nodes (109): RowAchievementDefinitions, RowAchievementHistory, RowAchievementProgress, RowActividadReciente, RowAutomationLogs, RowAutomationRules, RowAutomatizaciones, RowBackups (+101 more)

### Community 1 - "studio-context.tsx"
Cohesion: 0.04
Nodes (108): useContentStore(), defaultStudioConfig, StudioConfig, StudioContext, StudioProvider(), condicionSaludToDb(), dbAddComentarioComunidad(), dbAjustarCreditos() (+100 more)

### Community 2 - "cn"
Cohesion: 0.04
Nodes (69): Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup(), AvatarGroupCount(), AvatarImage(), Badge(), badgeVariants (+61 more)

### Community 3 - "theme-editor.tsx"
Cohesion: 0.05
Nodes (66): POST(), GET(), PUT(), metadata, PortalLayout(), viewport, generateMetadata(), ReservarSlugLayout() (+58 more)

### Community 4 - "types.ts"
Cohesion: 0.04
Nodes (77): CitasPublicaProps, calcularNivel(), NivelInfo, niveles, DIAS_SEMANA, disponibilidadVacia(), DURACIONES, FRANJAS (+69 more)

### Community 5 - "fetchExterno"
Cohesion: 0.06
Nodes (57): GET(), GET(), POST(), POST(), GET(), POST(), POST(), GET() (+49 more)

### Community 6 - "page.tsx"
Cohesion: 0.05
Nodes (51): CentroDeControlPage(), accion(), EspecialistaCartera(), ESTADO, eur(), porque(), TarjetaDetalle(), ActivityList() (+43 more)

### Community 7 - "director.ts"
Cohesion: 0.07
Nodes (55): GET(), A, B, NOW, rechazadaA, dbGetResumenDiarioReciente(), calcularEstadoEspecialista(), calcularEstadoGeneral() (+47 more)

### Community 8 - "page.tsx"
Cohesion: 0.10
Nodes (28): ConfiguracionPage(), ConfirmDialog(), SUB_CITAS, SUB_CLASES_SALAS, SUB_GAMIFICACION, TabId, TABS, TipoPlanBadge() (+20 more)

### Community 9 - "tipos.ts"
Cohesion: 0.07
Nodes (47): AUTONOMIA_DECLARADA_POR_TIPO, autonomiaDeNivel(), confianzaCargaEquipo(), confianzaContactarLead(), confianzaConvertirPrueba(), confianzaMoverHorario(), confianzaOcupacionBajaEstructural(), confianzaPrepararCampana() (+39 more)

### Community 10 - "fetchCriticalStudioData"
Cohesion: 0.06
Nodes (58): calcularProgresoReto(), asignarSpotReserva(), cargarContextoGamificacion(), cargarPoliticaEstudio(), checkinPublico(), consumirBonoServidor(), crearReservaPublica(), datosClaseParaEmail() (+50 more)

### Community 11 - "ui.tsx"
Cohesion: 0.08
Nodes (40): BibliotecaPage(), PostChip(), CarruselesPage(), Borrador, CampoEdit(), GuionesPage(), IconBtn(), COLUMNAS (+32 more)

### Community 12 - "permisos.ts"
Cohesion: 0.07
Nodes (42): DashboardLayout(), btnPrimary, BULLETS, SuscripcionPage(), AppearancePanel(), BottomNavItem(), MasDrawer(), NavItem() (+34 more)

### Community 13 - "api-client.ts"
Cohesion: 0.10
Nodes (50): AutonomiaConfig, PilotoAutomatico(), TIPO_LABEL, actualizarConfirmacionRiesgo(), aprobarCobroAutonomo(), authHeader(), avisarSustituta(), cancelarClase() (+42 more)

### Community 14 - "Reserva"
Cohesion: 0.10
Nodes (44): EntradaMientrasDormias, IndicesSenal, SnapshotEstudio, MetricaContexto, AutomationCandidato, AutomationEngineInput, computeAutomationCandidatos(), diasAntes() (+36 more)

### Community 15 - "getSupabaseAdmin"
Cohesion: 0.10
Nodes (36): POST(), POST(), GET(), mapRow(), POST(), appUrl(), DELETE(), PATCH() (+28 more)

### Community 16 - "ficha-clinica.ts"
Cohesion: 0.08
Nodes (46): CATEGORIA_LABEL, CATEGORIAS, CondicionCard(), CondicionDialog(), fechaCorta(), FichaSalud(), FormState, formVacio() (+38 more)

### Community 17 - "useModo"
Cohesion: 0.10
Nodes (34): NIVEL_LABEL, getInitials(), InstructoresPage(), Filtro, PreferenciasPage(), EMPTY_COPY, ESTADO_BADGE, MisReservasPage() (+26 more)

### Community 18 - "QrCode"
Cohesion: 0.09
Nodes (11): qrSvgMarkup(), appendBits(), assert(), bit, byte, Ecc, getBit(), int (+3 more)

### Community 19 - "dependencies"
Cohesion: 0.04
Nodes (48): dependencies, @anthropic-ai/sdk, aws4fetch, @base-ui/react, class-variance-authority, clsx, date-fns, @dnd-kit/core (+40 more)

### Community 20 - "route.ts"
Cohesion: 0.10
Nodes (32): AceptarForm(), Resultado, AceptarPage(), cuandoTexto(), EN_JUEGO, cargarClases(), GET(), POST() (+24 more)

### Community 21 - "entitlements.ts"
Cohesion: 0.11
Nodes (34): POST(), GET(), POST(), POST(), FilaEntrada, POST(), PlanGate(), bloqueoPorLimiteSocias() (+26 more)

### Community 22 - "auth-server.ts"
Cohesion: 0.11
Nodes (34): POST(), POST(), GET(), POST(), POST(), POST(), POST(), POST() (+26 more)

### Community 23 - "page.tsx"
Cohesion: 0.07
Nodes (37): Cobros(), esTab(), TabId, TABS, Bucket, CohortRow, ExportState, fmtEur() (+29 more)

### Community 24 - "types.ts"
Cohesion: 0.12
Nodes (35): Borrador, SlidePreview(), aplicarFondo(), dibujarBloque(), exportarSlidePNG(), wrap(), addDays(), atHour() (+27 more)

### Community 25 - "senales.ts"
Cohesion: 0.13
Nodes (33): confianzaCongelarMembresia(), confianzaEnviarReactivacion(), confianzaRecuperarSocia(), confianzaRecuperarSociaPorNoShow(), confianzaRecuperarSociaVencida(), frecuenciaUltimas4Semanas(), redondear1(), redondear2() (+25 more)

### Community 26 - "page.tsx"
Cohesion: 0.09
Nodes (30): ESTADO, EstadoMeta, fmtClase(), fmtHora(), fmtMomento(), HorarioActualizadoCard(), nombreCorto(), NuevaBajaDialog() (+22 more)

### Community 27 - "db.ts"
Cohesion: 0.13
Nodes (36): POST(), POST(), db(), dbActualizarOutcome(), dbCountAutonomasHoy(), dbFinalizarDecisionSession(), dbGetFeatureFlags(), dbGetOutcomePorRecomendacion() (+28 more)

### Community 28 - "useStudio"
Cohesion: 0.11
Nodes (27): ValoracionesDialog(), PortalAcceso(), ClasesPage(), OCUPA_PLAZA, RESERVA_ACTIVA, Tab, ClaseDetallePage(), PortalClaveNueva() (+19 more)

### Community 29 - "errorInterno"
Cohesion: 0.11
Nodes (27): POST(), GET(), GET(), DELETE(), GET(), PATCH(), POST(), saneaEntrada() (+19 more)

### Community 30 - "page.tsx"
Cohesion: 0.07
Nodes (28): accionDesc, ConversionFunnelCard(), CopyButton(), destinatariosLabel, EstadoBadge(), formatDateEs(), FUNNEL_STAGES, KpiTrendCard() (+20 more)

### Community 31 - "csv.ts"
Cohesion: 0.08
Nodes (33): RFC-4180, autoMapear(), autoMapearCita(), autoMapearMembresia(), autoMapearReserva(), CampoCita, CampoMeta, CampoMeta2 (+25 more)

### Community 32 - "uid"
Cohesion: 0.12
Nodes (29): ACTIVAS, norm(), POST(), COLORES, Cuerpo, dowDe(), norm(), POST() (+21 more)

### Community 33 - "page.tsx"
Cohesion: 0.08
Nodes (31): FormField(), CitaCard(), CitaCardProps, CitasPage(), DURACIONES, duracionMin(), ESTADO_BADGE, FF() (+23 more)

### Community 34 - "page.tsx"
Cohesion: 0.08
Nodes (30): Field(), ESTADO_STYLE, EstadoTarjeta, ProgresoPage(), RecompensasTab(), RetosTab(), Tab, TABS (+22 more)

### Community 35 - "page.tsx"
Cohesion: 0.11
Nodes (25): actividadConfig, ClaseHoyCard(), Dashboard(), formatHora(), KpiCard(), limpiarActividad(), localDate(), MONTH_LABELS (+17 more)

### Community 36 - "automatizaciones.ts"
Cohesion: 0.10
Nodes (22): CODIGOS_TRANSITORIOS, conReintentoResend(), esErrorTransitorioResend(), ResendEnvioResultado, AutomatizacionMktCandidato, computeAutomatizacionMktCandidatos(), DEDUP_DIAS, personalizar() (+14 more)

### Community 37 - "bloqueoPorFeature"
Cohesion: 0.13
Nodes (21): client, POST(), client, POST(), client, POST(), client, PLATAFORMAS_VALIDAS (+13 more)

### Community 38 - "decision.ts"
Cohesion: 0.13
Nodes (25): POST(), GET(), guard(), PUT(), requireSupabaseAdmin(), construirRecomendacion(), Datos, enlaceWhatsApp() (+17 more)

### Community 39 - "page.tsx"
Cohesion: 0.10
Nodes (27): addDays(), Calendario(), DIA_PILLS, DiaPill(), DIAS_CORTOS, formatHora(), FormData, hexToRgba() (+19 more)

### Community 40 - "page.tsx"
Cohesion: 0.09
Nodes (22): AUTONOMY_MODES, BeforeAfter(), CENTRO_CARDS, DAY_MOMENTS, DISCIPLINA_GRADIENTS, DISCIPLINAS, FAQ_ITEMS, FLOW_STEPS (+14 more)

### Community 41 - "cierre-engine.ts"
Cohesion: 0.12
Nodes (24): CierreDeAnoPage(), emptyForm(), eur(), FormState, MESES, MonthlyBars(), ConfirmDialog(), RowFacturas (+16 more)

### Community 42 - "use-team-chat-store.ts"
Cohesion: 0.12
Nodes (24): AVATAR_COLORS, avatarColor(), ChatEquipoPage(), etiquetaDia(), formatHora(), mismaFechaLocal(), EstadoCarga, EstadoEnvio (+16 more)

### Community 43 - "page.tsx"
Cohesion: 0.09
Nodes (22): AccProps, ActividadTab(), Asis, COLORES, emptyForm(), EnlaceScope, EquipoPage(), FiltroEstado (+14 more)

### Community 44 - "profile-avatar.tsx"
Cohesion: 0.21
Nodes (13): ROL_LABEL, TabPerfil(), AvatarDef, AvatarGenero, AvatarPicker(), initialsOf(), memojiIdFor(), memojiSeedOf() (+5 more)

### Community 45 - "layout.tsx"
Cohesion: 0.13
Nodes (16): Props, Props, Props, enviarEmailInvitacionEquipo(), InvitacionEquipoEmail(), Props, ROL_LABEL, EmailButton() (+8 more)

### Community 46 - "backup-engine.ts"
Cohesion: 0.19
Nodes (20): POST(), POST(), GET(), BACKUP_TABLES, BackupRow, BackupSnapshot, cargarSnapshot(), crearSnapshot() (+12 more)

### Community 47 - "supabase-admin.ts"
Cohesion: 0.16
Nodes (14): POST(), STATUS_POR_ERROR, POST(), POST(), POST(), bloqueoPorSuscripcion(), elegirMetodoCobro(), MetodoCobroElegido (+6 more)

### Community 48 - "contacto.ts"
Cohesion: 0.16
Nodes (21): crearBaja(), emitirEscalado(), OrigenBaja, ResultadoBaja, alertarPropietaria(), appUrl(), contactarCandidata(), contactarDesde() (+13 more)

### Community 49 - "route.ts"
Cohesion: 0.14
Nodes (16): { GET, POST, PUT }, automatizacionesDispatcher, procesarEstudioAutomatizaciones, EVENTS, inngest, confirmacionRiesgoAskDispatcher, confirmacionRiesgoCorteDispatcher, procesarConfirmacionAskEstudio (+8 more)

### Community 50 - "page.tsx"
Cohesion: 0.11
Nodes (17): AVATAR_COLORS, BADGE_RECIBO, BADGE_RESERVA, Card(), DetalleSocio(), LABEL_RECIBO, localDate(), Tab (+9 more)

### Community 51 - "route.ts"
Cohesion: 0.21
Nodes (20): POST(), BienvenidaEmail(), CancelacionClaseEmail(), esTipoEditable(), interpolar(), MarcaEstudio, PlantillaOverride, resolverMarcaEstudio() (+12 more)

### Community 52 - "page.tsx"
Cohesion: 0.13
Nodes (19): downloadICS(), FECHA_PLACEHOLDER_SSR, fmtLong(), fmtTime(), localDate(), makeGoogleCalUrl(), NIVEL_COLOR, NIVEL_LABEL (+11 more)

### Community 53 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 54 - "ingresos.ts"
Cohesion: 0.17
Nodes (20): confianzaAbrirSesion(), confianzaCobrarPendienteManual(), confianzaRecuperarPagos(), confianzaRevisarPrecio(), resolverNivelAutonomia(), resolverNivelAutonomiaPorTipo(), hayCapacidadFisica(), precioMedioSesion() (+12 more)

### Community 55 - "agenda.test.ts"
Cohesion: 0.12
Nodes (11): NOW, agenda, diasAntes(), NOW, reserva(), sesion(), slot(), slotFuturo() (+3 more)

### Community 56 - "page.frozen.tsx"
Cohesion: 0.11
Nodes (16): ContenidoLayout(), SUBNAV, categoriaBadge, categoriaBg, CATEGORIAS, nivelBadge, NIVELES, nivelLabel (+8 more)

### Community 57 - "redaccion.ts"
Cohesion: 0.16
Nodes (17): aResultadoSerializable(), construirFallback(), construirSystemPrompt(), construirUserPrompt(), ContextoValidacion, ItemARedactar, ItemRedactado, ItemRedactadoConId (+9 more)

### Community 58 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+12 more)

### Community 59 - "auth-context.tsx"
Cohesion: 0.16
Nodes (14): CrearEstudioPage(), OwnerForm, StudioForm, StudioTipo, TIPOS, jakarta, metadata, LoginPage() (+6 more)

### Community 60 - "page.frozen.tsx"
Cohesion: 0.16
Nodes (19): CartItem, CAT_STYLE, catStyle(), CerrarCajaModal(), CerrarCajaModalProps, formatDateLabel(), formatTimeOrDate(), isSameDay() (+11 more)

### Community 61 - "reserva-calendario.tsx"
Cohesion: 0.15
Nodes (14): BookingSheet(), capitaliza(), DOW_CORTO, fmtDiaLargo(), fmtHora(), navBtn(), NIVEL_COLOR, NIVEL_LABEL (+6 more)

### Community 62 - "MemoriaEstudio"
Cohesion: 0.14
Nodes (15): captacion, diasAntes(), NOW, socio(), suscripcion(), aplicarMemoria(), canalPreferido(), degradarReactivacionAContacto() (+7 more)

### Community 63 - "route.ts"
Cohesion: 0.25
Nodes (13): actualizarSuscripcion(), POST(), AdminClient, POST(), studioDeCuentaConnect(), capturar(), enviar(), analyticsHabilitado() (+5 more)

### Community 64 - "Recomendacion"
Cohesion: 0.22
Nodes (15): GET(), guard(), PUT(), AUTONOMIA_CONFIG_DEFAULT, AutonomiaConfig, elegibleParaAutonomia(), sanitizarConfig(), seleccionarAutonomas() (+7 more)

### Community 65 - "page.tsx"
Cohesion: 0.13
Nodes (14): avatarColor(), emptyForm(), FormSocia, relativeTime(), SmartFilter, Socios(), SortDir, SortKey (+6 more)

### Community 66 - "email.ts"
Cohesion: 0.20
Nodes (16): AlertaPropietariaEmail(), AlertaProps, AlumnaClaseCanceladaEmail(), AlumnaClaseCubiertaEmail(), AlumnaProps, ContactoProps, ContactoSustitutaEmail(), avisarAlumnas() (+8 more)

### Community 67 - "valoraciones.ts"
Cohesion: 0.18
Nodes (10): cuandoTexto(), ValorarPage(), Estado, ValorarForm(), procesarValoracionesEstudio, valoracionesDispatcher, firmar(), firmarTokenValoracion() (+2 more)

### Community 68 - "tipos-muertos.test.ts"
Cohesion: 0.14
Nodes (12): asistida(), conAsistencias(), diasAntes(), franjaLlena, franjaVacia, M, NOW, recibo() (+4 more)

### Community 69 - "verifactu.test.ts"
Cohesion: 0.22
Nodes (15): calcularHuellaAlta(), calcularHuellaAnulacion(), construirCadenaAlta(), construirCadenaAnulacion(), formatImporte(), DatosQrVerifactu, fechaExpedicionDesdeISO(), fechaHoraHusoMadrid() (+7 more)

### Community 70 - "analytics.ts"
Cohesion: 0.22
Nodes (16): MetricasPage(), calcularResumen(), ComparativaRed, comparativaRedes(), CRECIMIENTO_DIA, delta(), DeltaMetrica, pubsEnRango() (+8 more)

### Community 71 - "custom-charts.tsx"
Cohesion: 0.19
Nodes (13): ChartCard(), COLORES, CustomChartsSection(), AGRUPACIONES_GRAFICO, computeSerieGrafico(), etiquetaPeriodo(), inicioPeriodo(), METRICAS_GRAFICO (+5 more)

### Community 72 - "confirmacion-riesgo.ts"
Cohesion: 0.22
Nodes (11): enVentanaDeAviso(), horasHasta(), pasoElCorte(), AHORA, horasDespues(), tocaRecordar(), firmar(), firmarTokenConfirmacion() (+3 more)

### Community 73 - "booking-logic.test.ts"
Cohesion: 0.23
Nodes (11): contarReferidosPremiadosMes(), contarReservasActivasFuturas(), debeDevolverBono(), decidirPremioReferido(), decidirReservaNueva(), esCancelacionTardia(), esPrimeraAsistencia(), plazasOcupadas() (+3 more)

### Community 74 - "reward-engine.ts"
Cohesion: 0.23
Nodes (12): aplicarCanjeCreditos(), aplicarGananciaCreditos(), decidirOtorgarCreditos(), reglaActivaPara(), validarCanje(), yaOtorgado(), MemberCredits, RewardAction (+4 more)

### Community 75 - "route.ts"
Cohesion: 0.26
Nodes (13): FilaEntrada, normPlan(), POST(), detectarDelimitador(), emailValido(), ESTADOS_MEMBRESIA, fechaValidaISO(), normalizarEstadoMembresia() (+5 more)

### Community 76 - "route.ts"
Cohesion: 0.28
Nodes (11): diagnosticarEquipo(), emitirEscalado(), PATCH(), ESTADOS_EN_JUEGO, RankingItem, ESTADOS_RECALCULABLES, estadoTrasRecalcular(), filtrarYaRechazadas() (+3 more)

### Community 77 - "page.tsx"
Cohesion: 0.18
Nodes (12): descargar(), ImportarHorarioPage(), MAPEO_VACIO, Paso, PLANTILLA_EJEMPLO, PLANTILLA_HEADERS, ResultadoImportClases, autoMapearClase() (+4 more)

### Community 78 - "page.tsx"
Cohesion: 0.17
Nodes (12): descargar(), ImportarReservasPage(), MAPEO_VACIO, Paso, PLANTILLA_EJEMPLO, PLANTILLA_HEADERS, ResultadoImportReservas, CampoReserva (+4 more)

### Community 79 - "home-editor.tsx"
Cohesion: 0.20
Nodes (9): SECCIONES_EDITABLES, esMensajeTecnico(), HUELLAS_TECNICAS, PARA_PERSONAS, TECNICOS, HOME_FIJAS_PRIMERO, HOME_SECCIONES, HomeSeccion (+1 more)

### Community 80 - "dunning-server.ts"
Cohesion: 0.26
Nodes (10): OFFSETS_REINTENTO_DIAS, planificarTrasFallo(), PlanReintento, primerReintentoISO(), notificarFalloCobro(), registrarFalloCobro(), sumarDiasISO(), enviarEmailImpago() (+2 more)

### Community 81 - "personalizacion.test.ts"
Cohesion: 0.21
Nodes (12): MensajeSocia, construirUserPrompt(), ContextoPersonalizacion, numerosPermitidosMensaje(), personalizarMensajeSocia(), base, conCodigo, datos (+4 more)

### Community 82 - "achievement-engine.ts"
Cohesion: 0.20
Nodes (12): asistenciaMensualCompleta(), asistioEnCumpleanos(), calcularMetrica(), metricaDef(), calcularRacha(), claveSemana(), lunesDe(), RachaInfo (+4 more)

### Community 83 - "route.ts"
Cohesion: 0.23
Nodes (10): POST(), POST(), abrirPuertaKisi(), headers(), KisiCredenciales, probarKisi(), dbGetIntegracionConfig(), enviarWhatsAppTexto() (+2 more)

### Community 84 - "page.tsx"
Cohesion: 0.27
Nodes (13): CalendarioContenidoPage(), dateKey(), DiaCelda(), DIAS_SEMANA, Leyenda(), MESES, sameDay(), startOfWeek() (+5 more)

### Community 85 - "tab-integraciones.tsx"
Cohesion: 0.23
Nodes (12): CampoIntegracion, CATALOGO_INTEGRACIONES, CatalogoIntegracion, descargarCsv(), TabIntegraciones(), toCsv(), GoogleCalendarIcon(), IconProps (+4 more)

### Community 86 - "help-widget.tsx"
Cohesion: 0.23
Nodes (9): CATEGORIAS, FaqItem, FAQS, HelpWidget(), DashboardDrawer(), DashboardSheet(), PublicSheet(), useDialogA11y() (+1 more)

### Community 87 - "route.ts"
Cohesion: 0.23
Nodes (8): cuandoTexto(), GET(), POST(), ConfirmarReservaForm(), Estado, ConfirmarReservaPage(), cuandoTexto(), verificarTokenConfirmacion()

### Community 88 - "page-header.tsx"
Cohesion: 0.21
Nodes (7): metadata, Mensajeria(), Tab, timeAgo(), TIPO_ICON, AparienciaTabs(), PageHeader()

### Community 89 - "memoria.test.ts"
Cohesion: 0.19
Nodes (8): construirMapaMemoria(), diasAntes(), diasDespues(), hecho(), log(), NOW, rec(), HechoMemoria

### Community 90 - "escenarios-reales.test.ts"
Cohesion: 0.33
Nodes (12): asistencias(), construirSnapshot(), diasAntes(), lunes10(), NOW, plan(), recibo(), reserva() (+4 more)

### Community 91 - "ingresos.test.ts"
Cohesion: 0.19
Nodes (6): diasAntes(), NOW, recibo(), reserva(), sesion(), slot()

### Community 92 - "retencion.test.ts"
Cohesion: 0.22
Nodes (8): retencion, asistenciasHabituales(), diasAntes(), NOW, plan(), reserva(), snapshot(), suscripcion()

### Community 93 - "instructor-dependency.ts"
Cohesion: 0.30
Nodes (9): GET(), POST(), Admin, calcularDependenciaEstudio(), calcularDependenciaTodosLosEstudios(), nivelRiesgo(), TransicionRiesgo, AlumnaCautiva (+1 more)

### Community 94 - "page.tsx"
Cohesion: 0.18
Nodes (9): descargar(), ImportarMembresiasPage(), MAPEO_VACIO, Paso, PLANTILLA_EJEMPLO, PLANTILLA_HEADERS, CampoMembresia, CAMPOS_MEMBRESIA (+1 more)

### Community 95 - "page.tsx"
Cohesion: 0.18
Nodes (9): descargar(), ImportarSociasPage(), Paso, PLANTILLA_EJEMPLO, PLANTILLA_HEADERS, ResultadoImport, CAMPOS_SOCIA, CampoSocia (+1 more)

### Community 96 - "page.tsx"
Cohesion: 0.18
Nodes (9): CAT_COLOR, CAT_LABEL, fmt(), PlanFormData, PosFormData, Productos(), Tab, TIPO_COLOR (+1 more)

### Community 97 - "ReservaCalendario"
Cohesion: 0.48
Nodes (9): ReservaCalendario(), addDays(), agruparPorDia(), contarSlotsPorDia(), diasSemana(), etiquetaDia(), inicioSemanaLunes(), localDayKey() (+1 more)

### Community 98 - "email.ts"
Cohesion: 0.30
Nodes (10): enviar(), enviarEmailPedirConfirmacion(), enviarEmailPlazaLiberada(), enviarEmailRecordatorioConfirmacion(), EnvioResultado, Marca, PedirConfirmacionEmail(), PlazaLiberadaEmail() (+2 more)

### Community 99 - "Plataforma"
Cohesion: 0.32
Nodes (10): generarCarrusel(), generarGuion(), ResultadoIA, generarCarruselLocal(), generarGuionLocal(), GuionGenerado, SlideGenerada, slug() (+2 more)

### Community 100 - "serializeCsv"
Cohesion: 0.24
Nodes (10): serializeCsv(), enviarCierreAGestoria(), CierreGestoriaEmail(), CierreGestoriaEmailProps, eur(), td, tdR, th (+2 more)

### Community 101 - "motor.test.ts"
Cohesion: 0.24
Nodes (7): asistencias(), diasAntes(), NOW, recibo(), reserva(), sesion(), slot()

### Community 102 - "page.tsx"
Cohesion: 0.20
Nodes (10): accionConfig, AutomatizacionesPage(), ETIQUETA_APROBAR, horasRestantes(), LogItem(), MorningBriefing(), REGLAS_SUGERIDAS, resultadoConfig (+2 more)

### Community 103 - "tab-servicios-cita.tsx"
Cohesion: 0.12
Nodes (20): ColorInput(), ColorSwatch(), Sub, SUBS, TabCitas(), Draft, draftFromDisponibilidad(), Franja (+12 more)

### Community 104 - "profile-menu.tsx"
Cohesion: 0.25
Nodes (6): ProfileMenu(), IconButton(), InfoTip(), Tooltip(), fetchMisEstudios(), SedeSeleccionable

### Community 105 - "nuevos-especialistas.test.ts"
Cohesion: 0.20
Nodes (4): diasAntes(), M, NOW, sus()

### Community 106 - "seed-dependency-risk.mjs"
Cohesion: 0.25
Nodes (10): CAUTIVAS, clean(), cleanOnly, dateOnly(), daysAgo(), db, FLOTANTES, insertAll() (+2 more)

### Community 107 - "page.tsx"
Cohesion: 0.22
Nodes (9): descargar(), ImportarCitasPage(), MAPEO_VACIO, Paso, PLANTILLA_EJEMPLO, PLANTILLA_HEADERS, ResultadoImportCitas, CAMPOS_CITA (+1 more)

### Community 108 - "page.frozen.tsx"
Cohesion: 0.31
Nodes (9): Avatar(), AVATAR_COLORS, Comment, CommentThread(), ComunidadPage(), getInitials(), NewPostModal(), PostCard() (+1 more)

### Community 109 - "page.frozen.tsx"
Cohesion: 0.36
Nodes (9): avatarColor(), DIAS, initials(), isDark(), KioskPage(), localDate(), MESES, pad2() (+1 more)

### Community 110 - "citas-publica.tsx"
Cohesion: 0.31
Nodes (9): addDays(), CitasPublica(), DOW_CORTO, fmtDiaLargo(), fmtHora(), Hueco, localDate(), MiCita (+1 more)

### Community 111 - "global-search.tsx"
Cohesion: 0.44
Nodes (7): GlobalSearch(), buscarTareas(), normalizar(), rutaBase(), Tarea, TAREAS, ids()

### Community 112 - "calendar-logic.test.ts"
Cohesion: 0.39
Nodes (6): detectarConflictos(), hayConflicto(), plazasSobrantesTrasAforo(), SlotSesion, solapan(), cand

### Community 113 - "use-content-store.ts"
Cohesion: 0.22
Nodes (8): dbInsertPostComunidad(), dbInsertVideoOnDemand(), dbToggleLikePost(), dbUpdateVideoOnDemand(), postComunidadToDb(), videoOnDemandToDb(), PostComunidad, VideoOnDemand

### Community 114 - "cobertura-dialog.tsx"
Cohesion: 0.36
Nodes (5): CoberturaDialog(), CoberturaDialogProps, CandidatoCobertura, candidatosCobertura(), instructores

### Community 115 - "onboarding-checklist.tsx"
Cohesion: 0.39
Nodes (5): OnboardingChecklist(), calcularPasosOnboarding(), DatosOnboarding, PasoOnboarding, VACIO

### Community 116 - "bono-logic.test.ts"
Cohesion: 0.39
Nodes (4): bonoConsumible(), calcularConsumoBono(), calcularDevolucionBono(), tieneEntitlementActivo()

### Community 117 - "outcomes.ts"
Cohesion: 0.39
Nodes (6): medirOutcome(), ResultadoMedicion, SenalMedicion, ventanaDiasDe(), ResultadoOutcome, SenalObservada

### Community 118 - "use-discount-codes-store.ts"
Cohesion: 0.25
Nodes (7): useDiscountCodesStore(), codigoDescuentoToDb(), dbConsumirCodigoDescuento(), dbDeleteCodigoDescuento(), dbInsertCodigoDescuento(), dbUpdateCodigoDescuento(), CodigoDescuento

### Community 119 - "route.ts"
Cohesion: 0.43
Nodes (5): FacturaEntrante, POST(), mapSalida(), ResultadoSellado, sellarFacturaDeRecibo()

### Community 120 - "Tentare Brand Icon Mark (logo-mark.png)"
Cohesion: 0.29
Nodes (7): Tentare Brand Icon Mark (Favicon 256x256), Tentare Brand Icon (48x48 Favicon), Tentare Brand Icon (32x32 Favicon), Tentare Brand Icon (16x16 Favicon), Tentare PWA Icon 192x192, Tentare PWA Icon 512x512, Tentare Brand Icon Mark (logo-mark.png)

### Community 121 - "baja-form.tsx"
Cohesion: 0.33
Nodes (4): BajaForm(), Clase, cuando(), Datos

### Community 122 - "portal-notifications.ts"
Cohesion: 0.38
Nodes (5): markPortalNotifsRead(), PortalNotifItem, PortalNotifTipo, READ_KEY(), usePortalNotifUnreadCount()

### Community 123 - "page.tsx"
Cohesion: 0.40
Nodes (4): ActividadIcon(), NotificacionesPage(), NotiIconBg(), timeAgo()

### Community 124 - "page.tsx"
Cohesion: 0.33
Nodes (4): CATEGORIAS, GRADIENTS, NIVEL_COLOR, NIVEL_LABEL

### Community 125 - "catalogo-estudio.ts"
Cohesion: 0.47
Nodes (4): cache, conCacheCatalogo(), Entrada, invalidarCacheCatalogo()

### Community 126 - "context7"
Cohesion: 0.40
Nodes (5): npx, context7, playwright, @playwright/mcp, @upstash/context7-mcp

### Community 127 - "CI Pipeline"
Cohesion: 0.40
Nodes (5): CI Pipeline, E2E Playwright Step (registro, reserva, pago), Dummy Supabase Env Vars for CI, Typecheck Step (tsc --noEmit), Unit Tests Step (dinero, reservas, aforo, fiscal)

### Community 128 - "generarRecordatoriosRevision"
Cohesion: 0.50
Nodes (4): GET(), textoRecordatorioRevision(), generarRecordatoriosRevision(), mapCondicionSalud()

### Community 130 - "valoracion-template.tsx"
Cohesion: 0.60
Nodes (3): PedirValoracionEmail(), Props, enviarEmailPedirValoracion()

### Community 134 - "Next.js Breaking Changes Notice (AGENTS.md)"
Cohesion: 0.67
Nodes (3): Next.js Breaking Changes Notice (AGENTS.md), CLAUDE.md (project instructions entrypoint), README - Next.js project bootstrap

### Community 169 - "tab-clases.tsx"
Cohesion: 0.12
Nodes (20): NivelBadge(), PerfilPage(), ClaseForm, claseToForm(), emptyClaseForm(), NIVEL_LABELS, Sub, SUBS (+12 more)

## Knowledge Gaps
- **668 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+663 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `page.tsx`, `page.tsx`, `ui.tsx`, `permisos.ts`, `ficha-clinica.ts`, `page.tsx`, `types.ts`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `tab-clases.tsx`, `use-team-chat-store.ts`, `profile-avatar.tsx`, `page.tsx`, `page.frozen.tsx`, `page.frozen.tsx`, `page.tsx`, `analytics.ts`, `custom-charts.tsx`, `page.tsx`, `tab-integraciones.tsx`, `help-widget.tsx`, `page-header.tsx`, `page.tsx`, `tab-servicios-cita.tsx`, `profile-menu.tsx`, `page.frozen.tsx`, `global-search.tsx`, `cobertura-dialog.tsx`, `page.tsx`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `getSupabaseAdmin()` connect `getSupabaseAdmin` to `supabase-data.ts`, `studio-context.tsx`, `generarRecordatoriosRevision`, `theme-editor.tsx`, `fetchExterno`, `fetchCriticalStudioData`, `route.ts`, `entitlements.ts`, `auth-server.ts`, `errorInterno`, `uid`, `page.tsx`, `decision.ts`, `backup-engine.ts`, `supabase-admin.ts`, `route.ts`, `route.ts`, `route.ts`, `valoraciones.ts`, `route.ts`, `route.ts`, `route.ts`, `route.ts`, `instructor-dependency.ts`, `route.ts`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `useStudio()` connect `useStudio` to `studio-context.tsx`, `theme-editor.tsx`, `page.tsx`, `page.tsx`, `permisos.ts`, `ficha-clinica.ts`, `useModo`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `cierre-engine.ts`, `use-team-chat-store.ts`, `page.tsx`, `tab-clases.tsx`, `profile-avatar.tsx`, `page.tsx`, `page.tsx`, `page.frozen.tsx`, `auth-context.tsx`, `page.frozen.tsx`, `page.tsx`, `custom-charts.tsx`, `tab-integraciones.tsx`, `help-widget.tsx`, `page-header.tsx`, `page.tsx`, `page.tsx`, `tab-servicios-cita.tsx`, `profile-menu.tsx`, `page.frozen.tsx`, `page.frozen.tsx`, `global-search.tsx`, `onboarding-checklist.tsx`, `page.tsx`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _669 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `supabase-data.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.028153153153153154 - nodes in this community are weakly interconnected._
- **Should `studio-context.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.03569641367806505 - nodes in this community are weakly interconnected._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.03813646670789528 - nodes in this community are weakly interconnected._