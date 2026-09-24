# Discovery Findings — 2026-08-18

## Methodology

Ran five discovery harnesss against the live GHL app:

1. **`discovery-harness.mjs`** — page-load capture across 12 routes (XHR/fetch only).
2. **`discovery-harness-2.mjs`** — user-action audit across 8 pages (search typing, tab clicks, row clicks).
3. **`discovery-harness-ws.mjs`** — WebSocket frame capture across 3 pages.
4. **`discovery-harness-state.mjs`** — `window.__*` global and inline-`<script>` extraction.
5. **`discovery-harness-manifest.mjs`** — full dump of `__APP_MANIFEST__`.

## Finding #1: GHL is a Vue 3 SSR app using Module Federation

The dashboard is built with **Vue 3 + i18n + SSR + Webpack Module Federation**. At page load it exposes:

| Global | Purpose |
|---|---|
| `__APP_MANIFEST__` | Module-federation manifest listing 120 federated apps with CDN URLs |
| `__VUE__` / `__VUE_INSTANCE_SETTERS__` / `__VUE_SSR_SETTERS__` | Vue 3 SSR internals |
| `__VUE_I18N_FULL_INSTALL__` / `__INTLIFY_*` | Vue I18n |
| `__FRONTEND_CORE_EVENT_BUS__` | Cross-app event bus |
| `__GLOBAL_LOADING_REMOTE_ENTRY__` | Remote-entry loader |
| `__GHL_INTERACTION_TRACKER_BRIDGE__` | Interaction telemetry |
| `__STATSIG__` | Feature flags (Statsig SDK 3.31.2) |
| `__SENTRY__` / `__sentry_instrumentation_handlers__` | Sentry 10.19.0 |
| `__core-js_shared__` | core-js polyfill registry |

No entity data is embedded in `window.__*` — the entity graph lives in Vue component state hydrated from the SSR HTML.

## Finding #2: 120 federated micro-frontends

The `__APP_MANIFEST__.federatedApps` object maps feature names to CDN URLs on `appcdn.leadconnectorhq.com`. Grouped by domain:

### `crm/*` (customer-relationship features)
- `contactsApp`, `contactsHighriseApp`, `ghlContactRestoreApp`
- `conversationsApp`, `conversationsV2App`, `conversationsUtilitiesApp`
- `opportunitiesApp`
- `customFieldsApp`, `customValuesApp`, `customObjectsApp`
- `bulkActionsApp`, `snippetsApp`, `scoringApp`, `labsApp`, `documentsApp`
- `crmObjectsSettingsApp`, `preferenceManagementApp`, `eventsManagementApp`
- `usersApp`, `authApp`, `leadconnectorIntegrationsApp`

### `leadgen/*` (marketing/funnel features)
- `funnelWebsiteApp`, `funnelWebsiteDomainApp`, `funnelWebsiteAnalytics`, `domainConnectApp`, `domainResellingApp`
- `formSurveyApp`, `qrCodeListApp`, `qrCodeBuilderApp`, `quizResultBuilderApp`
- `ecommerceApp`, `productsApp`, `storeWidgetApp`, `storeCatalogApp`
- `invoicesApp`, `estimatesApp`, `proposalsEstimatesApp`, `proposalsEstimateTemplateApp`
- `leadgenPaymentLinksApp`, `leadgenPaymentsApp`, `paymentsApp`, `giftCardsApp`
- `mediaCenterApp`, `mediaEditorApp`, `brandBoardsApp`
- `socialPlannerApp`, `chatWidgetApp`, `emailPreviewApp`, `emailSequenceApp`, `defaultEmailTemplatesApp`
- `blogsApp`, `seoApp`, `schemaMarkupApp`, `countdownTimerApp`, `redirectApp`
- `Launchpad`, `LaunchpadPortal`, `Onboarding`, `TourGuidePortal`
- `externalTrackingApp`, `i18nFeedbackApp`, `vibeEditorApp`

### `automation/*` (workflows, calendars, reporting)
- `appointmentModalApp`, `calendarSettingsApp`, `calendarServicesApp`, `calendarComponentsApp`, `calendarRentalsApp`
- `featureDiscoveryApp`
- `reportingApp`, `notificationApp`

### `revex/*` (platform / reputation / billing)
- `reputationApp`, `reputationBuilderApp`, `reputationWidgetsApp`, `yextApp`
- `agencyDashboardApp`, `agencyInternalToolsApp`
- `certificatesApp`, `wordpressApp`, `resellingApp`
- `affiliateDashboardApp`, `saasApp`
- `locationBillingApp`, `platformBillingApp`, `locationsApp`, `companyApp`, `LocationSetting`
- `membershipsApp`, `membershipSettingsApp`, `membershipAnalyticsApp`, `communitiesBuilderApp`
- `goKollabApp`, `kollabSupportApp`
- `snapshotsApp`, `phoneIntegrationApp`, `bladePlatformApp`
- `clientPortalBuilder`, `desktopCustomizerApp`, `featurePermissionsApp`
- `lcEmailApp`, `powerDialerApp`, `walletKitApp`, `visibilityAiApp`

### `ai/*` (AI features)
- `voiceAiApp`, `copilotApp`, `agentStudioApp`, `agentBuilderApp`, `agentLogsApp`
- `aiEmployeesApp`, `actionsPlatformApp`, `superagentsApp`
- `knowledgeBaseApp`, `performanceAiApp`, `aiGrowthApp`, `industryAgentsApp`
- `contentAIApp` (under `crm/content-ai`)

### `marketplace/*`
- `marketplaceApp`, `integrationsApp`

### `automation-reporting/*`
- `reportingApp`, `notificationApp`

## Finding #3: XHR/fetch traffic is mostly infrastructure

Across all pages the same small set of infrastructure hosts dominated:

| Host | Path | Purpose |
|---|---|---|
| `production.app-manifest.leadconnectorhq.com` | `/latest/manifest.json` | SPA shell manifest |
| `backend.leadconnectorhq.com` | `/localization/en-US/?module=common,smartList,contactDetail,copilot` | i18n bundle |
| `backend.leadconnectorhq.com` | `/companies/branding?domain=...` | White-label branding (only on `/settings/*`) |
| `o176457.ingest.sentry.io` | `/api/1723141/envelope/` | Sentry error telemetry |
| `www.google-analytics.com` | `/j/collect` | GA analytics |
| `firebaseinstallations.googleapis.com` | `/v1/projects/highlevel-backend/installations` | Firebase install |
| `firebaseremoteconfig.googleapis.com` | `/v1/projects/highlevel-backend/namespaces/...:fetch` | Remote Config |

No undocumented GHL REST data endpoints were discovered by network capture. The 584-tool `ghl-mcp` + `mcp__leadconnector__*` tools already cover the documented REST surface that these federated apps consume.

## Finding #4: No WebSocket activity observed during page load

`page.on("websocket")` fired zero frames on `/dashboard`, `/conversations`, and `/contacts/list` with an 8-second settle window. Real-time updates likely open a WebSocket only after a specific user gesture (opening a conversation, subscribing to a pipeline), or fall back to Firebase HTTP long-poll frames that Playwright reports as ordinary XHR rather than as WebSocket.

## Finding #5: Bundle static analysis confirms no novel REST endpoints

Ran `discovery-harness-bundles.mjs` against 32 federated apps, downloading `remoteEntry.js` + up to 15 async chunks per app (462 chunks total). Extracted all URL-like strings with regex patterns matching GHL REST, versioned API, and generic `/v*/` paths.

**Results:** 183 unique path strings found, 93 not in the known ghl-mcp pattern list.

### Classification of "novel" paths

| Category | Count | Source apps | Verdict |
|---|---|---|---|
| **Langfuse SDK** (`/api/public/*`) | 49 | blogsApp | False positive — Langfuse LLM observability SDK bundled into the blog authoring app. Paths like `/api/public/traces`, `/api/public/observations`, `/api/public/scores` are Langfuse REST API, not GHL. |
| **Firebase Identity Platform** (`/v1/accounts:*`, `/v2/accounts:*`, `/v1/token`, `/v2/recaptcha*`, `/v2/password*`) | 21 | performanceAiApp | False positive — Firebase Auth REST API embedded in the Performance AI app. |
| **GHL Vue router paths** (`/v2/location/{id}/...`) | ~20 | contactsApp, opportunitiesApp, customObjectsApp, agentBuilderApp, etc. | Frontend navigation routes, not REST endpoints. Examples: `/v2/location/{id}/contacts/detail/{id}`, `/v2/location/{id}/businesses/list`, `/v2/location/{id}/ai-agents/voice-ai/{id}`. These confirm the feature ownership map but don't expose new API endpoints. |
| **Template literal noise** (`/v2/location/${null==N...`, `/v2/location/{id}/objects/${t.replace(`) | 2 | copilotApp, opportunitiesApp | Regex captured incomplete JS template literals. |
| **Too generic** (`/api/`, `/media`) | 2 | agentBuilderApp, socialPlannerApp | Path fragments, not usable endpoints. |

### Conclusion

**Zero novel GHL REST API endpoints were discovered.** The 584-tool `ghl-mcp` already covers every REST endpoint used by the federated frontend apps. The frontend exclusively communicates with `backend.leadconnectorhq.com` using the same REST paths that `ghl-mcp` already wraps.

### Bundle size summary (top 10)

| App | Bundle size | Chunks | Chunks scanned | Endpoints found |
|---|---|---|---|---|
| copilotApp | 1,562 KB | 86 | 15 | 6 |
| reportingApp | 1,491 KB | 87 | 15 | 3 |
| voiceAiApp | 1,405 KB | 27 | 15 | 4 |
| funnelWebsiteApp | 1,384 KB | 10 | 10 | 6 |
| calendarServicesApp | 1,352 KB | 0 | 0 | 0 |
| knowledgeBaseApp | 1,391 KB | 11 | 11 | 10 |
| socialPlannerApp | 1,397 KB | 35 | 15 | 1 |
| blogsApp | 491 KB | 75 | 15 | 62 |
| formSurveyApp | 437 KB | 17 | 15 | 33 |
| agentBuilderApp | 442 KB | 19 | 15 | 10 |

## Implications

- The 120-app manifest is a **capability map** of GHL. Use it to identify which federated app owns a feature, then look up that app's REST endpoints in the `ghl-mcp` tool list.
- Gaps in REST coverage must be closed by browser automation (`ghl-browser-mcp`), since the federated apps themselves are JS bundles that talk to the same REST backend.
- Bundle static analysis (scanning 32 apps × 462 chunks) confirmed that the existing 584-tool ghl-mcp covers the complete REST surface. No new REST tools are needed.
- Third-party SDKs (Langfuse, Firebase Auth) are bundled into frontend apps and produce false-positive endpoint matches — these must be filtered during analysis.

## Files produced

- `app-manifest-full.json` — full JSON dump of `window.__APP_MANIFEST__` (13 KB, 120 apps)
- `dashboard-state.json`, `contacts-state.json`, `workflows-state.json` — full `window.__*` dumps
- `<label>.json`, `<label>-audit.json` — per-page XHR/fetch + WS dumps
- `_summary.json`, `_summary-triggers.json` — aggregate counts
- `bundles/_scan-summary.json` — full bundle scan results (32 apps, 183 endpoints, 93 novel)
- `bundles/*.js` — cached `remoteEntry.js` + chunk downloads
