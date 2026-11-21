use std::{
    collections::{BTreeMap, BTreeSet},
    convert::Infallible,
    env,
    path::{Path as FsPath, PathBuf},
    sync::{Arc, Mutex, RwLock},
    time::{Duration, Instant},
};

use axum::{
    extract::{
        rejection::{JsonRejection, QueryRejection},
        Path, Query, State,
    },
    http::{header, HeaderMap, HeaderValue, Request, StatusCode},
    middleware::{self, Next},
    response::sse::{Event, KeepAlive, Sse},
    response::{IntoResponse, Response},
    routing::{get, patch, post},
    Json, Router,
};
use futures_util::stream::{self, Stream};
use irco_ai::{compose_answer, current_colab_runtime};
use irco_alerts::{
    create_alert, init_db as init_alerts_db, list_alerts, record_followup_measurement,
    transition_alert,
};
use irco_core::{
    Alert, AlertState, DataClass, IrcoError, Observation, RuleStatus, RulesDocument, VigilanceLevel,
};
use irco_data::{
    export::{export_observations, ExportFormat},
    ingest::ingest_batch,
    query::{query_observations, QueryParams},
    store::init_db,
};
use irco_decisions::{
    engine::{
        evaluate, evaluate_composite_rules, evaluate_missing_data_rules, evaluate_temporal_rules,
    },
    vigilance::compute_vigilance,
};
use irco_health::baseline::compute_personal_baseline;
use irco_health::temporal::{analyze_history, TrendDirection};
use irco_knowledge::{KnowledgeBase, SearchFilters, SearchHit};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tower_http::cors::CorsLayer;
use uuid::Uuid;

pub mod demo;
pub mod sim;

#[derive(Clone)]
pub struct AppState {
    database: Arc<Mutex<Connection>>,
    rules: Arc<RwLock<RulesDocument>>,
    rules_path: Option<Arc<PathBuf>>,
    indicators: Arc<Option<IndicatorRegistry>>,
    knowledge: Arc<Option<KnowledgeBase>>,
    started_at: Arc<Instant>,
    api_token: Option<String>,
    colab_admin_token: Option<String>,
    colab_ttl: Duration,
    colab_session: Arc<Mutex<Option<ColabSession>>>,
    colab_registry_url: Option<String>,
    colab_registry_token: Option<String>,
    observation_updates: tokio::sync::broadcast::Sender<Value>,
}

impl AppState {
    pub fn new(database: Connection, rules: RulesDocument, api_token: Option<String>) -> Self {
        let (observation_updates, _) = tokio::sync::broadcast::channel(256);
        Self {
            database: Arc::new(Mutex::new(database)),
            rules: Arc::new(RwLock::new(rules)),
            rules_path: None,
            indicators: Arc::new(None),
            knowledge: Arc::new(None),
            started_at: Arc::new(Instant::now()),
            api_token,
            colab_admin_token: None,
            colab_ttl: Duration::from_secs(180),
            colab_session: Arc::new(Mutex::new(None)),
            colab_registry_url: None,
            colab_registry_token: None,
            observation_updates,
        }
    }

    pub fn from_paths(
        database_path: &str,
        rules_path: &str,
        api_token: Option<String>,
    ) -> Result<Self, IrcoError> {
        if let Some(parent) = FsPath::new(database_path).parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .map_err(|error| IrcoError::Database(error.to_string()))?;
            }
        }
        let database = Connection::open(database_path)
            .map_err(|error| IrcoError::Database(error.to_string()))?;
        init_db(&database)?;
        init_alerts_db(&database)?;
        let rules = irco_decisions::rules::load_rules(rules_path)?;
        let colab_ttl = env::var("IRCO_COLAB_TTL_SECONDS")
            .map(|value| {
                value.parse::<u64>().map_err(|error| {
                    IrcoError::Config(format!("Invalid IRCO_COLAB_TTL_SECONDS: {error}"))
                })
            })
            .unwrap_or(Ok(600))?;
        if !(30..=3600).contains(&colab_ttl) {
            return Err(IrcoError::Config(
                "IRCO_COLAB_TTL_SECONDS must be between 30 and 3600".to_owned(),
            ));
        }
        let registry_path = env::var("IRCO_INDICATOR_REGISTRY")
            .unwrap_or_else(|_| "config/indicators/registry.toml".to_owned());
        let registry_content = std::fs::read_to_string(&registry_path).map_err(|error| {
            IrcoError::Config(format!(
                "Could not read indicator registry {registry_path}: {error}"
            ))
        })?;
        let registry: IndicatorRegistry = toml::from_str(&registry_content)
            .map_err(|error| IrcoError::Config(format!("Invalid indicator registry: {error}")))?;
        if registry.indicators.is_empty() {
            return Err(IrcoError::Config(
                "indicator registry must contain at least one indicator".to_owned(),
            ));
        }
        let corpus_path =
            env::var("IRCO_CORPUS_PATH").unwrap_or_else(|_| "data/corpus.jsonl".to_owned());
        let mut state = Self::new(database, rules, api_token);
        state.colab_admin_token = env::var("IRCO_COLAB_ADMIN_TOKEN").ok();
        state.colab_ttl = Duration::from_secs(colab_ttl);
        state.colab_registry_token = env::var("IRCO_COLAB_REGISTRY_TOKEN")
            .or_else(|_| env::var("HB_SECRET"))
            .ok();
        if state.colab_registry_token.is_some() {
            state.colab_registry_url = Some(
                env::var("IRCO_COLAB_REGISTRY_URL")
                    .unwrap_or_else(|_| "http://127.0.0.1:8765/api/backends/internal".to_owned()),
            );
        }
        state.rules_path = Some(Arc::new(PathBuf::from(rules_path)));
        state.indicators = Arc::new(Some(registry));
        if FsPath::new(&corpus_path).is_file() {
            state.knowledge = Arc::new(Some(KnowledgeBase::load_jsonl(corpus_path)?));
        }
        Ok(state)
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ColabCapabilities {
    chat: bool,
    #[serde(default)]
    asr: bool,
    #[serde(default)]
    tts: bool,
    #[serde(default)]
    vision: bool,
    #[serde(default)]
    vlm: bool,
    #[serde(default)]
    image: bool,
    #[serde(default)]
    multi: bool,
    #[serde(default)]
    streaming: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ColabRegistrationRequest {
    api_base: String,
    api_key: String,
    model: String,
    capabilities: ColabCapabilities,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ColabHeartbeatRequest {
    session_id: String,
    api_base: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    capabilities: Option<ColabCapabilities>,
}

#[derive(Debug)]
struct ColabSession {
    session_id: String,
    heartbeat_token: String,
    api_base: String,
    api_key: String,
    model: String,
    capabilities: ColabCapabilities,
    last_heartbeat: Instant,
}

#[derive(Debug, Serialize)]
struct ColabRegistrationResponse {
    session_id: String,
    heartbeat_token: String,
    ttl_seconds: u64,
}

#[derive(Debug, Serialize)]
struct ColabStatusResponse {
    available: bool,
    session_id: Option<String>,
    model: Option<String>,
    capabilities: Option<ColabCapabilities>,
    expires_in_seconds: Option<u64>,
}

impl AppState {
    async fn read_registry_runtime(&self) -> Option<irco_ai::ColabRuntime> {
        let registry_url = self.colab_registry_url.as_deref()?;
        let registry_token = self.colab_registry_token.as_deref()?;
        current_colab_runtime(registry_url, registry_token, self.colab_ttl).await
    }

    async fn colab_status(&self) -> ColabStatusResponse {
        if self.colab_registry_url.is_some() {
            let runtime = self.read_registry_runtime().await;
            return runtime.map_or_else(
                || ColabStatusResponse {
                    available: false,
                    session_id: None,
                    model: None,
                    capabilities: None,
                    expires_in_seconds: None,
                },
                |runtime| {
                    let remaining = self
                        .colab_ttl
                        .as_secs()
                        .saturating_sub(runtime.age_seconds());
                    ColabStatusResponse {
                        available: true,
                        session_id: runtime.session_id().map(str::to_owned),
                        model: Some(runtime.model().to_owned()),
                        capabilities: Some(ColabCapabilities {
                            chat: true,
                            asr: false,
                            tts: false,
                            vision: false,
                            vlm: false,
                            image: false,
                            multi: false,
                            streaming: false,
                        }),
                        expires_in_seconds: Some(remaining),
                    }
                },
            );
        }

        let Ok(mut session) = self.colab_session.lock() else {
            return ColabStatusResponse {
                available: false,
                session_id: None,
                model: None,
                capabilities: None,
                expires_in_seconds: None,
            };
        };
        let Some(current) = session.as_ref() else {
            return ColabStatusResponse {
                available: false,
                session_id: None,
                model: None,
                capabilities: None,
                expires_in_seconds: None,
            };
        };
        let elapsed = current.last_heartbeat.elapsed();
        if elapsed >= self.colab_ttl {
            *session = None;
            return ColabStatusResponse {
                available: false,
                session_id: None,
                model: None,
                capabilities: None,
                expires_in_seconds: None,
            };
        }
        ColabStatusResponse {
            available: !current.api_base.is_empty() && !current.api_key.is_empty(),
            session_id: Some(current.session_id.clone()),
            model: Some(current.model.clone()),
            capabilities: Some(current.capabilities.clone()),
            expires_in_seconds: Some((self.colab_ttl - elapsed).as_secs()),
        }
    }

    fn authorize_colab_admin(&self, headers: &HeaderMap) -> Result<(), ApiError> {
        let Some(expected) = &self.colab_admin_token else {
            return Err(api_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "colab_admin_not_configured",
                "Colab registration is disabled",
                "Configure IRCO_COLAB_ADMIN_TOKEN and restart the API.",
            ));
        };
        let supplied = headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "));
        if supplied != Some(expected.as_str()) {
            return Err(api_error(
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "A valid Colab administrator token is required",
                "Set Authorization: Bearer <IRCO_COLAB_ADMIN_TOKEN>.",
            ));
        }
        Ok(())
    }

    async fn active_colab_endpoint(&self) -> Result<Option<(String, String, String)>, ApiError> {
        if self.colab_registry_url.is_some() {
            return Ok(self.read_registry_runtime().await.map(|runtime| {
                (
                    runtime.api_base().to_owned(),
                    runtime.api_key().to_owned(),
                    runtime.model().to_owned(),
                )
            }));
        }

        let mut session = self.colab_session.lock().map_err(|_| {
            api_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "colab_registry_unavailable",
                "The Colab registry is unavailable",
                "Retry the assistant request.",
            )
        })?;
        let Some(current) = session.as_ref() else {
            return Ok(None);
        };
        if current.last_heartbeat.elapsed() >= self.colab_ttl {
            *session = None;
            return Ok(None);
        }
        if !current.capabilities.chat {
            return Ok(None);
        }
        Ok(Some((
            current.api_base.clone(),
            current.api_key.clone(),
            current.model.clone(),
        )))
    }
}

impl AppState {
    fn rules_snapshot(&self) -> Result<RulesDocument, IrcoError> {
        self.rules
            .read()
            .map(|rules| rules.clone())
            .map_err(|_| IrcoError::Config("Rules lock is unavailable".to_owned()))
    }

    fn reload_rules(&self) -> Result<RulesDocument, IrcoError> {
        let path = self
            .rules_path
            .as_deref()
            .ok_or_else(|| IrcoError::Config("No rules file is configured".to_owned()))?;
        let path = path
            .to_str()
            .ok_or_else(|| IrcoError::Config("Rules path is not valid UTF-8".to_owned()))?;
        let rules = irco_decisions::rules::load_rules(path)?;
        let mut current = self
            .rules
            .write()
            .map_err(|_| IrcoError::Config("Rules lock is unavailable".to_owned()))?;
        *current = rules.clone();
        Ok(rules)
    }

    #[cfg(test)]
    fn with_knowledge(mut self, knowledge: KnowledgeBase) -> Self {
        self.knowledge = Arc::new(Some(knowledge));
        self
    }

    #[cfg(test)]
    fn with_registry(mut self, registry: IndicatorRegistry) -> Self {
        self.indicators = Arc::new(Some(registry));
        self
    }
}

#[derive(Debug, Serialize)]
struct ErrorEnvelope {
    error: String,
    code: String,
    hint: String,
}

struct ApiError {
    status: StatusCode,
    body: ErrorEnvelope,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self.body)).into_response()
    }
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
    version: &'static str,
    uptime_seconds: u64,
    database: &'static str,
    rules_loaded: usize,
    indicators_loaded: usize,
    ai_available: bool,
    colab_available: bool,
    knowledge_available: bool,
}

#[derive(Debug, Serialize)]
struct RulesReloadResponse {
    version: String,
    rules_loaded: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct IndicatorRegistry {
    indicators: Vec<IndicatorEntry>,
}

impl IndicatorRegistry {
    fn get(&self, id: &str) -> Option<&IndicatorEntry> {
        self.indicators.iter().find(|indicator| indicator.id == id)
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct IndicatorEntry {
    id: String,
    name: String,
    family: String,
    unit: String,
    collection_method: String,
    expected_frequency: String,
    sources: Vec<String>,
    #[serde(default)]
    reference_min: Option<f64>,
    #[serde(default)]
    reference_max: Option<f64>,
    #[serde(default)]
    reference_source: Option<String>,
    #[serde(default)]
    reference_status: Option<String>,
    #[serde(default)]
    scientific_refs: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct ObservationQuery {
    subject_id: Option<String>,
    indicator: Option<String>,
    source: Option<String>,
    data_class: Option<String>,
    from: Option<String>,
    to: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
    order: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ExportQuery {
    format: Option<String>,
    subject_id: Option<String>,
    indicator: Option<String>,
    source: Option<String>,
    data_class: Option<String>,
    from: Option<String>,
    to: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
}

#[derive(Debug, Serialize)]
struct ObservationPage {
    total_returned: usize,
    limit: usize,
    offset: usize,
    observations: Vec<Observation>,
}

#[derive(Debug, Deserialize)]
pub struct IngestRequest {
    observations: Vec<Observation>,
}

#[derive(Debug, Deserialize)]
pub struct AlertsQuery {
    subject_id: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
}

#[derive(Debug, Serialize)]
struct AlertPage {
    alerts: Vec<Alert>,
    limit: usize,
    offset: usize,
}

#[derive(Debug, Deserialize)]
struct AlertTransitionRequest {
    state: AlertState,
    detail: String,
}

#[derive(Debug, Deserialize)]
struct AlertFollowupRequest {
    observation_id: String,
}

#[derive(Debug, Serialize)]
struct AlertFollowupResponse {
    alert_id: String,
    followup_measurements: usize,
}

#[derive(Debug, Serialize)]
struct IngestResponse {
    accepted: usize,
    rejected: usize,
    errors: Vec<String>,
    duplicates_skipped: usize,
    alerts_created: usize,
}

#[derive(Debug, Deserialize)]
struct DemoQuery {
    scenario: Option<String>,
    name: Option<String>,
    day: Option<u32>,
}

#[derive(Debug, Serialize)]
struct DemoScenarioSummary {
    id: &'static str,
    data_class: &'static str,
    days: u32,
    description: &'static str,
}

#[derive(Debug, Deserialize)]
struct SearchQuery {
    q: Option<String>,
    hazard: Option<String>,
    indicator: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Serialize)]
struct SearchResponse {
    available: bool,
    source_not_found: bool,
    hits: Vec<SearchHit>,
}

#[derive(Debug, Deserialize)]
struct StateQuery {
    data_class: Option<String>,
    as_of: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Serialize)]
struct IndicatorState {
    latest: f64,
    unit: String,
    last_updated: chrono::DateTime<chrono::Utc>,
    trend: TrendDirection,
    slope_per_day: Option<f64>,
    quality: String,
    source: String,
    data_status: &'static str,
}

#[derive(Debug, Serialize)]
struct HealthStateResponse {
    subject_id: String,
    data_class: DataClass,
    as_of: chrono::DateTime<chrono::Utc>,
    vigilance: VigilanceLevel,
    supported_vigilance: VigilanceLevel,
    indicators: BTreeMap<String, IndicatorState>,
    missing_indicators: Vec<String>,
    triggered_rules: Vec<String>,
    alerts: Vec<Alert>,
    last_updated: Option<chrono::DateTime<chrono::Utc>>,
    thresholds_status: &'static str,
    skipped_rules: Vec<irco_decisions::engine::SkippedRule>,
    history_truncated: bool,
}

#[derive(Debug, Serialize)]
struct HealthOverviewResponse {
    data_class: DataClass,
    subjects: Vec<HealthStateResponse>,
}

#[derive(Debug, Deserialize)]
struct DashboardQuery {
    subject: Option<String>,
    subject_id: Option<String>,
    mode: Option<String>,
    data_class: Option<String>,
    scenario: Option<String>,
    day: Option<u32>,
    as_of: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
struct DashboardEventsQuery {
    subject_id: String,
    data_class: String,
}

#[derive(Debug, Deserialize)]
struct AssistantRequest {
    question: String,
    hazard: Option<String>,
    indicator: Option<String>,
    subject_id: Option<String>,
    data_class: Option<String>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/version", get(version))
        .route("/openapi.json", get(openapi_json))
        .route("/api/v1/health", get(health))
        .route("/api/v1/rules", get(rules))
        .route("/api/v1/admin/rules/reload", post(reload_rules))
        .route(
            "/api/v1/admin/colab/register",
            post(register_colab).delete(revoke_colab),
        )
        .route("/api/v1/admin/colab/heartbeat", post(colab_heartbeat))
        .route("/api/v1/colab/status", get(colab_status))
        .route("/api/v1/colab/capabilities", get(colab_capabilities))
        .route("/api/v1/indicators", get(indicators))
        .route("/api/v1/indicators/:indicator_id", get(indicator))
        .route(
            "/api/v1/indicators/:indicator_id/history",
            get(indicator_history),
        )
        .route("/api/v1/state", get(health_overview))
        .route("/api/v1/state/:subject_id", get(health_state))
        .route("/api/v1/dashboard", get(dashboard))
        .route("/api/v1/dashboard/events", get(dashboard_events))
        .route("/api/v1/mission", get(mission))
        .route("/api/v1/routine", get(routine))
        .route("/api/v1/routine/done", post(routine_done))
        .route("/api/v1/checkin", post(checkin))
        .route("/api/v1/observations", get(observations))
        .route("/api/v1/observations/export", get(export))
        .route("/api/v1/ingest", post(ingest))
        .route("/api/v1/alerts", get(alerts))
        .route("/api/v1/alerts/:alert_id", patch(transition))
        .route("/api/v1/alerts/:alert_id/followup", post(record_followup))
        .route("/api/v1/knowledge/search", get(search))
        .route("/api/v1/assistant/chat", post(assistant))
        .route("/api/v1/knowledge/health", get(knowledge_health))
        .route("/api/v1/knowledge/hazards", get(knowledge_hazards))
        .route("/api/v1/knowledge/sources", get(knowledge_sources))
        .route(
            "/api/v1/knowledge/indicator/:indicator_id",
            get(knowledge_indicator),
        )
        .route("/api/v1/demo/scenarios", get(demo_scenarios))
        .route("/api/v1/demo/replay", get(demo_replay))
        .route("/api/v1/demo/scenario", get(demo_replay))
        .route("/api/v1/demo/reset", post(demo_reset))
        .route_layer(middleware::from_fn_with_state(state.clone(), authenticate))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn authenticate(
    State(state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    if request.method() == axum::http::Method::OPTIONS
        || matches!(
            request.uri().path(),
            "/health" | "/version" | "/openapi.json"
        )
        || matches!(
            request.uri().path(),
            "/api/v1/admin/colab/register" | "/api/v1/admin/colab/heartbeat"
        )
    {
        return next.run(request).await;
    }

    if let Some(expected) = &state.api_token {
        let supplied = request
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "));
        if supplied != Some(expected.as_str()) {
            return api_error(
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "A valid bearer token is required",
                "Set Authorization: Bearer <token> or configure IRCO_API_TOKEN.",
            )
            .into_response();
        }
    }
    next.run(request).await
}

async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    let database_ok = state.database.lock().is_ok();
    let (rules_ok, rules_loaded) = {
        let rules = state.rules.read();
        (
            rules.is_ok(),
            rules.as_ref().map_or(0, |rules| rules.rules.len()),
        )
    };
    let colab_available = state.colab_status().await.available;
    Json(HealthResponse {
        status: if database_ok && rules_ok {
            "ok"
        } else {
            "degraded"
        },
        version: env!("CARGO_PKG_VERSION"),
        uptime_seconds: state.started_at.elapsed().as_secs(),
        database: if database_ok {
            "connected"
        } else {
            "unavailable"
        },
        rules_loaded,
        indicators_loaded: state
            .indicators
            .as_ref()
            .as_ref()
            .map_or(0, |registry| registry.indicators.len()),
        ai_available: colab_available,
        colab_available,
        knowledge_available: state.knowledge.is_some(),
    })
}

async fn colab_status(State(state): State<AppState>) -> Json<ColabStatusResponse> {
    Json(state.colab_status().await)
}

async fn colab_capabilities(State(state): State<AppState>) -> Json<ColabStatusResponse> {
    Json(state.colab_status().await)
}

async fn register_colab(
    State(state): State<AppState>,
    headers: HeaderMap,
    request: Result<Json<ColabRegistrationRequest>, JsonRejection>,
) -> Result<Json<ColabRegistrationResponse>, ApiError> {
    state.authorize_colab_admin(&headers)?;
    let Json(request) = request.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_json",
            &error.body_text(),
            "Send api_base, api_key, model, and the enabled capabilities.",
        )
    })?;
    let api_base = validate_colab_api_base(&request.api_base)?;
    validate_colab_identity(&request.api_key, &request.model)?;
    if !request.capabilities.chat {
        return Err(api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "colab_chat_required",
            "The registered Colab runtime must expose chat",
            "Set capabilities.chat to true for an OpenAI-compatible runtime.",
        ));
    }

    let session_id = Uuid::new_v4().to_string();
    let heartbeat_token = Uuid::new_v4().to_string();
    let session = ColabSession {
        session_id: session_id.clone(),
        heartbeat_token: heartbeat_token.clone(),
        api_base,
        api_key: request.api_key,
        model: request.model,
        capabilities: request.capabilities,
        last_heartbeat: Instant::now(),
    };
    let mut current = state.colab_session.lock().map_err(|_| {
        api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "colab_registry_unavailable",
            "The Colab registry is unavailable",
            "Retry the registration request.",
        )
    })?;
    *current = Some(session);

    Ok(Json(ColabRegistrationResponse {
        session_id,
        heartbeat_token,
        ttl_seconds: state.colab_ttl.as_secs(),
    }))
}

async fn colab_heartbeat(
    State(state): State<AppState>,
    headers: HeaderMap,
    request: Result<Json<ColabHeartbeatRequest>, JsonRejection>,
) -> Result<Json<ColabStatusResponse>, ApiError> {
    let supplied_token = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    let Json(request) = request.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_json",
            &error.body_text(),
            "Send the session_id and optional updated runtime configuration.",
        )
    })?;
    let updated_api_base = request
        .api_base
        .as_deref()
        .map(validate_colab_api_base)
        .transpose()?;
    if let Some(api_key) = request.api_key.as_deref() {
        validate_colab_identity(api_key, request.model.as_deref().unwrap_or("local"))?;
    }
    if let Some(model) = request.model.as_deref() {
        validate_colab_identity("not-needed", model)?;
    }
    if request
        .capabilities
        .as_ref()
        .is_some_and(|capabilities| !capabilities.chat)
    {
        return Err(api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "colab_chat_required",
            "The registered Colab runtime must expose chat",
            "Set capabilities.chat to true.",
        ));
    }

    {
        let mut current = state.colab_session.lock().map_err(|_| {
            api_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "colab_registry_unavailable",
                "The Colab registry is unavailable",
                "Retry the heartbeat request.",
            )
        })?;
        if current
            .as_ref()
            .is_none_or(|session| session.last_heartbeat.elapsed() >= state.colab_ttl)
        {
            *current = None;
            return Err(api_error(
                StatusCode::UNAUTHORIZED,
                "colab_session_expired",
                "The Colab session is missing or expired",
                "Register a new Colab session with the administrator token.",
            ));
        }
        let Some(session) = current.as_mut() else {
            return Err(api_error(
                StatusCode::UNAUTHORIZED,
                "colab_session_expired",
                "The Colab session is missing or expired",
                "Register a new Colab session with the administrator token.",
            ));
        };
        if supplied_token != Some(session.heartbeat_token.as_str())
            || request.session_id != session.session_id
        {
            return Err(api_error(
                StatusCode::UNAUTHORIZED,
                "invalid_colab_session",
                "The Colab session credentials are invalid",
                "Use the session ID and heartbeat token returned by registration.",
            ));
        }
        if let Some(api_base) = updated_api_base {
            session.api_base = api_base;
        }
        if let Some(api_key) = request.api_key {
            session.api_key = api_key;
        }
        if let Some(model) = request.model {
            session.model = model;
        }
        if let Some(capabilities) = request.capabilities {
            session.capabilities = capabilities;
        }
        session.last_heartbeat = Instant::now();
    }
    Ok(Json(state.colab_status().await))
}

async fn revoke_colab(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    state.authorize_colab_admin(&headers)?;
    let mut current = state.colab_session.lock().map_err(|_| {
        api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "colab_registry_unavailable",
            "The Colab registry is unavailable",
            "Retry the revocation request.",
        )
    })?;
    *current = None;
    Ok(Json(json!({"revoked": true})))
}

fn validate_colab_api_base(api_base: &str) -> Result<String, ApiError> {
    let mut url = url::Url::parse(api_base).map_err(|_| {
        api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "invalid_colab_api_base",
            "The Colab API URL is invalid",
            "Provide an HTTPS URL without credentials, query, or fragment.",
        )
    })?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "invalid_colab_api_base",
            "The Colab API URL is not an allowed HTTPS endpoint",
            "Provide an HTTPS URL without credentials, query, or fragment.",
        ));
    }
    let path = url.path().trim_end_matches('/');
    if path.contains("/v1/") || path.ends_with("/chat/completions") {
        return Err(api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "invalid_colab_api_base",
            "The Colab URL must be an API base, not a chat completion endpoint",
            "Provide the HTTPS API base URL, optionally ending in /v1.",
        ));
    }
    if path.is_empty() {
        url.set_path("/v1");
    } else if !path.ends_with("/v1") {
        url.set_path(&format!("{path}/v1"));
    }
    Ok(url.to_string().trim_end_matches('/').to_owned())
}

fn validate_colab_identity(api_key: &str, model: &str) -> Result<(), ApiError> {
    if api_key.is_empty() || api_key.len() > 512 || model.trim().is_empty() || model.len() > 200 {
        return Err(api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "invalid_colab_runtime",
            "The Colab API key or model name is invalid",
            "Use a non-empty API key of at most 512 bytes and model name of at most 200 bytes.",
        ));
    }
    Ok(())
}

async fn version() -> Json<Value> {
    Json(json!({ "version": env!("CARGO_PKG_VERSION"), "api_version": "v1" }))
}

async fn openapi_json() -> Json<Value> {
    Json(
        serde_json::from_str(include_str!("../../../docs/api/openapi.json"))
            .expect("bundled OpenAPI JSON must be valid"),
    )
}

async fn rules(State(state): State<AppState>) -> Result<Json<RulesDocument>, ApiError> {
    state.rules_snapshot().map(Json).map_err(|error| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "rules_unavailable",
            &error.to_string(),
            "Check the loaded rule configuration.",
        )
    })
}

async fn reload_rules(
    State(state): State<AppState>,
) -> Result<Json<RulesReloadResponse>, ApiError> {
    let rules = state.reload_rules().map_err(|error| {
        api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "rules_reload_failed",
            &error.to_string(),
            "The active rules were not changed; correct the configured rules file and retry.",
        )
    })?;
    Ok(Json(RulesReloadResponse {
        version: rules.version,
        rules_loaded: rules.rules.len(),
    }))
}

async fn indicators(State(state): State<AppState>) -> Result<Json<Vec<IndicatorEntry>>, ApiError> {
    state
        .indicators
        .as_ref()
        .as_ref()
        .map(|registry| Json(registry.indicators.clone()))
        .ok_or_else(|| {
            api_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "indicator_registry_unavailable",
                "The indicator registry is not loaded",
                "Configure IRCO_INDICATOR_REGISTRY and restart the API.",
            )
        })
}

async fn indicator(
    State(state): State<AppState>,
    Path(indicator_id): Path<String>,
) -> Result<Json<IndicatorEntry>, ApiError> {
    let Some(registry) = state.indicators.as_ref().as_ref() else {
        return Err(api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "indicator_registry_unavailable",
            "The indicator registry is not loaded",
            "Configure IRCO_INDICATOR_REGISTRY and restart the API.",
        ));
    };
    registry
        .indicators
        .iter()
        .find(|entry| entry.id == indicator_id)
        .cloned()
        .map(Json)
        .ok_or_else(|| {
            api_error(
                StatusCode::NOT_FOUND,
                "indicator_not_found",
                "The requested indicator is not registered",
                "List registered indicators and retry.",
            )
        })
}

#[derive(Debug, Deserialize)]
struct HistoryQuery {
    subject: Option<String>,
    subject_id: Option<String>,
    mode: Option<String>,
    data_class: Option<String>,
    days: Option<u32>,
    day: Option<u32>,
    scenario: Option<String>,
    as_of: Option<chrono::DateTime<chrono::Utc>>,
}

async fn indicator_history(
    State(state): State<AppState>,
    Path(indicator_id): Path<String>,
    query: Result<Query<HistoryQuery>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let Query(query) = query.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_query",
            &error.body_text(),
            "Use subject, data_class, days, and optionally day or as_of.",
        )
    })?;

    let Some(registry) = state.indicators.as_ref().as_ref() else {
        return Err(api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "indicator_registry_unavailable",
            "The indicator registry is not loaded",
            "Configure IRCO_INDICATOR_REGISTRY and restart the API.",
        ));
    };

    let Some(entry) = registry.indicators.iter().find(|e| e.id == indicator_id) else {
        return Err(api_error(
            StatusCode::NOT_FOUND,
            "indicator_not_found",
            &format!("Indicator '{indicator_id}' not found in registry"),
            "List registered indicators and retry.",
        ));
    };

    let subject_id = query
        .subject
        .or(query.subject_id)
        .or_else(|| {
            query
                .scenario
                .as_deref()
                .and_then(|scenario| match scenario {
                    "a01" => Some("A-01".to_owned()),
                    "nominal" => Some("N-01".to_owned()),
                    "dropout" => Some("D-01".to_owned()),
                    _ => None,
                })
        })
        .unwrap_or_else(|| "A-01".to_owned());

    let mode = query.mode.as_deref().unwrap_or_else(|| {
        if query.scenario.is_some() || query.day.is_some() {
            "demo"
        } else {
            "real"
        }
    });
    if !matches!(mode, "real" | "demo") {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "invalid_history_mode",
            "mode must be real or demo",
            "Choose mode=real for stored observations or mode=demo for a deterministic simulation.",
        ));
    }
    let data_class_name = query.data_class.as_deref().unwrap_or(match mode {
        "demo" => "synthetic",
        _ => "measured_real",
    });

    let data_class = match data_class_name {
        "measured_real" => DataClass::MeasuredReal,
        "analog" => DataClass::Analog,
        "synthetic" => DataClass::Synthetic,
        _ => {
            return Err(api_error(
                StatusCode::BAD_REQUEST,
                "data_class_required",
                "A valid data_class is required for indicator history",
                "Choose measured_real, analog, or synthetic.",
            ));
        }
    };

    let days = query.days.unwrap_or(30).clamp(1, 365);
    if mode == "real" && (query.day.is_some() || query.scenario.is_some()) {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "invalid_real_time_filter",
            "scenario and day are only supported in demo mode",
            "Use mode=demo to select a simulated mission day.",
        ));
    }
    if mode == "demo" && query.as_of.is_some() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "invalid_demo_time_filter",
            "as_of is not supported in demo mode",
            "Use day to select a simulated mission day.",
        ));
    }
    let end_time = query.as_of.unwrap_or_else(chrono::Utc::now);
    let start_time = end_time - chrono::Duration::days(i64::from(days));

    let params = QueryParams {
        indicator: Some(indicator_id.clone()),
        subject_id: Some(subject_id.clone()),
        source: None,
        from: Some(start_time.to_rfc3339()),
        to: Some(end_time.to_rfc3339()),
        data_class: Some(data_class.as_str().to_owned()),
        limit: 10_000,
        offset: 0,
        descending: false,
    };

    let mut observations = {
        let database = state.database.lock().map_err(|_| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "database_unavailable",
                "The local database is unavailable",
                "Check database health and retry.",
            )
        })?;
        query_observations(&database, &params).map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "history_query_failed",
                &error.to_string(),
                "Check the observation store and retry.",
            )
        })?
    };

    if observations.is_empty() && mode == "demo" && data_class == DataClass::Synthetic {
        let name = query
            .scenario
            .as_deref()
            .unwrap_or(match subject_id.as_str() {
                "N-01" => "nominal",
                "D-01" => "dropout",
                _ => "a01",
            });
        let scenario = demo::DemoScenario::parse(name).ok_or_else(|| {
            api_error(
                StatusCode::BAD_REQUEST,
                "unknown_demo_scenario",
                "Unknown demonstration scenario",
                "Choose a01, nominal, or dropout.",
            )
        })?;
        let end_day = query.day.unwrap_or(days).min(demo::SCENARIO_DAYS);
        let start_day = end_day.saturating_sub(days - 1).max(1);
        for d in start_day..=end_day {
            if let Ok(rep) = demo::replay(scenario, d) {
                for obs in rep.observations {
                    if obs.indicator == indicator_id {
                        observations.push(obs);
                    }
                }
            }
        }
    }

    let baseline_calc =
        compute_personal_baseline(&observations, &subject_id, &indicator_id, &data_class);
    let trend_calc = analyze_history(&observations, &subject_id, &indicator_id, &data_class);

    let period_from = observations.first().map(|o| o.timestamp);
    let period_to = observations.last().map(|o| o.timestamp);

    let mut valid_count = 0;
    let mut suspect_count = 0;
    for o in &observations {
        match o.quality.as_ref().map(|q| q.status.as_str()) {
            Some("valid") => valid_count += 1,
            Some("suspect") => suspect_count += 1,
            _ => (),
        }
    }

    let measurements: Vec<Value> = observations
        .iter()
        .map(|o| {
            json!({
                "timestamp": o.timestamp,
                "value": o.value,
                "quality": o.quality.as_ref().map_or("unknown", |q| q.status.as_str()),
                "source": o.source,
            })
        })
        .collect();

    let baseline = baseline_calc.map(|b| {
        json!({
            "mean": b.mean,
            "median": b.median,
            "standard_deviation": b.standard_deviation,
            "sample_count": b.sample_count,
        })
    });

    let trend = trend_calc.map(|t| {
        json!({
            "direction": t.trend,
            "slope_per_day": t.slope_per_day,
            "minimum": t.minimum,
            "maximum": t.maximum,
            "mean": t.mean,
        })
    });

    let thresholds = json!({
        "reference_min": entry.reference_min,
        "reference_max": entry.reference_max,
        "reference_source": entry.reference_source,
        "status": entry.reference_status.as_deref().unwrap_or("provisional"),
    });

    let data_quality = json!({
        "valid": valid_count,
        "suspect": suspect_count,
        "total": observations.len(),
    });

    Ok(Json(json!({
        "subject_id": subject_id,
        "indicator": indicator_id,
        "unit": entry.unit,
        "data_class": data_class,
        "period": {
            "from": period_from,
            "to": period_to,
        },
        "measurements": measurements,
        "baseline": baseline,
        "trend": trend,
        "thresholds": thresholds,
        "data_quality": data_quality,
    })))
}

async fn mission(State(_state): State<AppState>) -> Json<Value> {
    Json(json!({
        "mission_id": "IRCO-DEMO",
        "name": "Integrated Risk and Countermeasure Observatory Demo Mission",
        "start_date": "2026-01-01T00:00:00Z",
        "duration_days": 124,
        "crew_size": 1,
        "subject_id": "A-01",
        "environment": "deep_space",
        "earth_delay_min": 12,
        "simulated": true,
    }))
}

#[derive(Debug, Deserialize)]
struct RoutineQuery {
    subject_id: Option<String>,
    date: Option<String>,
}

async fn routine(
    State(state): State<AppState>,
    query: Result<Query<RoutineQuery>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let Query(query) = query.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_query",
            &error.body_text(),
            "Use subject_id and optional date (YYYY-MM-DD).",
        )
    })?;
    let subject_id = query.subject_id.unwrap_or_else(|| "A-01".to_owned());
    let date = query
        .date
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());
    chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d").map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_routine_date",
            &error.to_string(),
            "Use date=YYYY-MM-DD.",
        )
    })?;
    let completed_tasks = {
        let database = state.database.lock().map_err(|_| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "database_unavailable",
                "The local database is unavailable",
                "Check database health and retry.",
            )
        })?;
        let mut statement = database
            .prepare(
                "SELECT task_id FROM routine_completions \
                 WHERE subject_id = ?1 AND completion_date = ?2",
            )
            .map_err(|error| {
                api_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "routine_query_failed",
                    &error.to_string(),
                    "Check the routine completion store.",
                )
            })?;
        let rows = statement
            .query_map((&subject_id, &date), |row| row.get::<_, String>(0))
            .map_err(|error| {
                api_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "routine_query_failed",
                    &error.to_string(),
                    "Check the routine completion store.",
                )
            })?;
        rows.collect::<Result<BTreeSet<_>, _>>().map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "routine_query_failed",
                &error.to_string(),
                "Check the routine completion store.",
            )
        })?
    };

    let mut tasks = vec![
        json!({
            "id": "morning-vitals",
            "name": "Morning Vitals Check",
            "category": "health",
            "due_time": "08:00",
            "completed": false,
            "priority": "high"
        }),
        json!({
            "id": "exercise-cardio",
            "name": "Cardiovascular Exercise",
            "category": "exercise",
            "duration_min": 30,
            "due_time": "10:00",
            "completed": false,
            "priority": "high"
        }),
        json!({
            "id": "meal-log",
            "name": "Meal Log",
            "category": "nutrition",
            "due_time": "12:00",
            "completed": false,
            "priority": "medium"
        }),
        json!({
            "id": "mood-checkin",
            "name": "Mood Check-in",
            "category": "behavioral",
            "due_time": "18:00",
            "completed": false,
            "priority": "medium"
        }),
    ];
    for task in &mut tasks {
        if let Some(task_id) = task["id"].as_str() {
            task["completed"] = json!(completed_tasks.contains(task_id));
        }
    }
    let completed = completed_tasks.len().min(tasks.len());
    let total = tasks.len();
    Ok(Json(json!({
        "subject_id": subject_id,
        "date": date,
        "tasks": tasks,
        "progress": {
            "completed": completed,
            "total": total,
            "percentage": completed * 100 / total
        }
    })))
}

#[derive(Debug, Deserialize)]
struct RoutineDoneRequest {
    subject_id: String,
    task_id: String,
    completed_at: Option<String>,
}

async fn routine_done(
    State(state): State<AppState>,
    request: Result<Json<RoutineDoneRequest>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let Json(payload) = request.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_json",
            &error.body_text(),
            "Send subject_id, task_id, and optional completed_at.",
        )
    })?;
    if !matches!(
        payload.task_id.as_str(),
        "morning-vitals" | "exercise-cardio" | "meal-log" | "mood-checkin"
    ) {
        return Err(api_error(
            StatusCode::NOT_FOUND,
            "routine_task_not_found",
            "The requested routine task is not configured",
            "Fetch /api/v1/routine and use one of its task IDs.",
        ));
    }
    let completed_at = match payload.completed_at {
        Some(value) => chrono::DateTime::parse_from_rfc3339(&value)
            .map(|timestamp| timestamp.to_utc())
            .map_err(|error| {
                api_error(
                    StatusCode::BAD_REQUEST,
                    "invalid_completed_at",
                    &error.to_string(),
                    "Provide completed_at as an RFC 3339 timestamp.",
                )
            })?,
        None => chrono::Utc::now(),
    };
    let completion_date = completed_at.format("%Y-%m-%d").to_string();
    let database = state.database.lock().map_err(|_| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "database_unavailable",
            "The local database is unavailable",
            "Check database health and retry.",
        )
    })?;
    database
        .execute(
            "INSERT INTO routine_completions \
             (subject_id, task_id, completion_date, completed_at) \
             VALUES (?1, ?2, ?3, ?4) \
             ON CONFLICT(subject_id, task_id, completion_date) \
             DO UPDATE SET completed_at = excluded.completed_at",
            (
                &payload.subject_id,
                &payload.task_id,
                &completion_date,
                completed_at.to_rfc3339(),
            ),
        )
        .map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "routine_persistence_failed",
                &error.to_string(),
                "Check the routine completion store and retry.",
            )
        })?;
    Ok(Json(json!({
        "subject_id": payload.subject_id,
        "task_id": payload.task_id,
        "completed_at": completed_at,
        "date": completion_date,
        "status": "completed"
    })))
}

#[derive(Debug, Deserialize)]
struct CheckinRequest {
    subject_id: String,
    indicator: String,
    value: f64,
    unit: String,
    timestamp: Option<String>,
}

async fn checkin(
    State(state): State<AppState>,
    request: Result<Json<CheckinRequest>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let Json(payload) = request.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_json",
            &error.body_text(),
            "Send subject_id, indicator, value, unit, and an optional RFC 3339 timestamp.",
        )
    })?;
    let Some(registry) = state.indicators.as_ref().as_ref() else {
        return Err(api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "indicator_registry_unavailable",
            "The indicator registry is not loaded",
            "Configure IRCO_INDICATOR_REGISTRY and restart the API.",
        ));
    };

    let indicator_entry = registry
        .indicators
        .iter()
        .find(|e| e.id == payload.indicator);
    if let Some(entry) = indicator_entry {
        if entry.unit != payload.unit {
            return Err(api_error(
                StatusCode::BAD_REQUEST,
                "unit_mismatch",
                &format!(
                    "Indicator '{}' expects unit '{}', received '{}'",
                    payload.indicator, entry.unit, payload.unit
                ),
                "Use the correct unit from the indicator registry.",
            ));
        }
    } else {
        return Err(api_error(
            StatusCode::NOT_FOUND,
            "indicator_not_found",
            &format!("Indicator '{}' not found in registry", payload.indicator),
            "List registered indicators and retry.",
        ));
    }

    let timestamp = match payload.timestamp {
        Some(value) => chrono::DateTime::parse_from_rfc3339(&value)
            .map(|timestamp| timestamp.to_utc())
            .map_err(|error| {
                api_error(
                    StatusCode::BAD_REQUEST,
                    "invalid_timestamp",
                    &error.to_string(),
                    "Provide timestamp as an RFC 3339 timestamp.",
                )
            })?,
        None => chrono::Utc::now(),
    };
    let observation = Observation {
        id: format!("checkin-{}", Uuid::new_v4().simple()),
        timestamp,
        subject_id: Some(payload.subject_id.clone()),
        indicator: payload.indicator.clone(),
        value: payload.value,
        unit: payload.unit.clone(),
        source: "CREW_MANUAL".to_owned(),
        data_class: DataClass::MeasuredReal,
        context: Default::default(),
        provenance: Default::default(),
        quality: Some(irco_core::ObservationQuality {
            status: "valid".to_owned(),
            flags: Vec::new(),
            original_resolution: Some("manual".to_owned()),
            additional: Default::default(),
        }),
        metadata: Default::default(),
    };
    let (_, Json(ingest_response)) = ingest(
        State(state),
        Ok(Json(IngestRequest {
            observations: vec![observation.clone()],
        })),
    )
    .await?;
    Ok(Json(json!({
        "measurement_id": observation.id,
        "subject_id": payload.subject_id,
        "indicator": payload.indicator,
        "value": payload.value,
        "unit": payload.unit,
        "timestamp": observation.timestamp,
        "data_class": observation.data_class,
        "quality": observation.quality,
        "status": "accepted",
        "persisted": ingest_response.accepted == 1 || ingest_response.duplicates_skipped == 1,
        "alerts_created": ingest_response.alerts_created,
        "notice": "Decision support only; this observation does not establish a diagnosis.",
    })))
}

async fn observations(
    State(state): State<AppState>,
    query: Result<Query<ObservationQuery>, QueryRejection>,
) -> Result<Json<ObservationPage>, ApiError> {
    let Query(query) = query.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_query",
            &error.body_text(),
            "Check query parameter names and types.",
        )
    })?;
    let limit = query.limit.unwrap_or(100).min(10_000);
    if query
        .order
        .as_deref()
        .is_some_and(|order| order != "asc" && order != "desc")
    {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "invalid_order",
            "order must be asc or desc",
            "Use order=asc or order=desc.",
        ));
    }
    let params = QueryParams {
        indicator: query.indicator,
        subject_id: query.subject_id,
        source: query.source,
        from: query.from,
        to: query.to,
        data_class: query.data_class,
        limit,
        offset: query.offset.unwrap_or(0),
        descending: query.order.as_deref() == Some("desc"),
    };
    let database = state.database.lock().map_err(|_| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "database_unavailable",
            "The local database is unavailable",
            "Check database health and retry.",
        )
    })?;
    let results = query_observations(&database, &params).map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "query_failed",
            &error.to_string(),
            "Check filters and pagination values.",
        )
    })?;
    Ok(Json(ObservationPage {
        total_returned: results.len(),
        limit,
        offset: params.offset,
        observations: results,
    }))
}

async fn health_state(
    State(state): State<AppState>,
    Path(subject_id): Path<String>,
    query: Result<Query<StateQuery>, QueryRejection>,
) -> Result<Json<HealthStateResponse>, ApiError> {
    let Query(query) = query.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_query",
            &error.body_text(),
            "Specify data_class=measured_real, analog, or synthetic.",
        )
    })?;
    let data_class = match query.data_class.as_deref() {
        Some("measured_real") => DataClass::MeasuredReal,
        Some("analog") => DataClass::Analog,
        Some("synthetic") => DataClass::Synthetic,
        _ => {
            return Err(api_error(
                StatusCode::BAD_REQUEST,
                "data_class_required",
                "A valid data_class is required for a health state",
                "Choose measured_real, analog, or synthetic; classes are never combined.",
            ))
        }
    };
    let as_of = query.as_of.unwrap_or_else(chrono::Utc::now);
    let database = state.database.lock().map_err(|_| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "database_unavailable",
            "The local database is unavailable",
            "Check database health and retry.",
        )
    })?;
    let rules = state.rules_snapshot().map_err(|error| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "rules_unavailable",
            &error.to_string(),
            "Check the loaded rule configuration.",
        )
    })?;
    let observations = query_observations(
        &database,
        &QueryParams {
            subject_id: Some(subject_id.clone()),
            data_class: Some(data_class.as_str().to_owned()),
            to: Some(as_of.to_rfc3339()),
            limit: 10_000,
            descending: true,
            ..QueryParams::default()
        },
    )
    .map_err(|error| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "state_query_failed",
            &error.to_string(),
            "Check the local observation store.",
        )
    })?;

    let mut latest_by_indicator = BTreeMap::new();
    for observation in &observations {
        latest_by_indicator
            .entry(observation.indicator.clone())
            .or_insert(observation);
    }

    let mut supported_triggers = Vec::new();
    let mut skipped_rules = Vec::new();
    for latest in latest_by_indicator.values() {
        let result = evaluate(&rules.rules, latest).map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "rule_evaluation_failed",
                &error.to_string(),
                "Check the loaded deterministic rule configuration.",
            )
        })?;
        supported_triggers.extend(result.triggered);
        skipped_rules.extend(result.skipped);
        let trend_result =
            evaluate_temporal_rules(&rules.rules, &observations, latest).map_err(|error| {
                api_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "rule_evaluation_failed",
                    &error.to_string(),
                    "Check the deterministic temporal rule configuration.",
                )
            })?;
        supported_triggers.extend(trend_result.triggered);
        skipped_rules.extend(trend_result.skipped);
    }
    let missing_data_result =
        evaluate_missing_data_rules(&rules.rules, &observations, &subject_id, &data_class, as_of)
            .map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "rule_evaluation_failed",
                &error.to_string(),
                "Check the deterministic missing-data rule configuration.",
            )
        })?;
    let missing_rule_indicators: BTreeMap<_, _> = rules
        .rules
        .iter()
        .filter(|rule| {
            rule.enabled
                && rule.condition.kind == "missing_data"
                && (rule.data_class_filter.is_empty()
                    || rule.data_class_filter.contains(&data_class))
        })
        .map(|rule| (rule.rule_id.as_str(), rule.indicator.as_str()))
        .collect();
    let stale_indicators: Vec<_> = missing_data_result
        .triggered
        .iter()
        .filter_map(|rule_id| missing_rule_indicators.get(rule_id.as_str()).copied())
        .map(str::to_owned)
        .collect();
    let mut missing_indicators = stale_indicators.clone();
    missing_indicators.extend(
        missing_data_result
            .skipped
            .iter()
            .filter(|skipped| skipped.reason == "no_prior_valid_observation")
            .filter_map(|skipped| {
                missing_rule_indicators
                    .get(skipped.rule_id.as_str())
                    .copied()
            })
            .map(str::to_owned),
    );
    supported_triggers.extend(missing_data_result.triggered.iter().cloned());
    skipped_rules.extend(missing_data_result.skipped.iter().cloned());
    let composite_result = evaluate_composite_rules(&rules.rules, &supported_triggers, &data_class)
        .map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "rule_evaluation_failed",
                &error.to_string(),
                "Check composite sub-rule configuration.",
            )
        })?;
    supported_triggers.extend(composite_result.triggered);
    skipped_rules.extend(composite_result.skipped);
    supported_triggers.sort();
    supported_triggers.dedup();
    skipped_rules.sort_by(|left, right| left.rule_id.cmp(&right.rule_id));
    skipped_rules
        .dedup_by(|left, right| left.rule_id == right.rule_id && left.reason == right.reason);
    let supported_vigilance =
        compute_vigilance(&rules.rules, &supported_triggers).map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "vigilance_computation_failed",
                &error.to_string(),
                "Check the rule IDs and vigilance levels.",
            )
        })?;
    let has_valid_current_measurement = latest_by_indicator.values().any(|observation| {
        observation.value.is_finite()
            && observation
                .quality
                .as_ref()
                .is_some_and(|quality| quality.status == "valid")
    });
    let vigilance = if !has_valid_current_measurement {
        VigilanceLevel::NoData
    } else {
        supported_vigilance.clone()
    };

    missing_indicators.sort();
    missing_indicators.dedup();
    let mut indicator_states = BTreeMap::new();
    for (indicator_id, latest) in &latest_by_indicator {
        let history = analyze_history(&observations, &subject_id, indicator_id, &data_class);
        indicator_states.insert(
            indicator_id.clone(),
            IndicatorState {
                latest: latest.value,
                unit: latest.unit.clone(),
                last_updated: latest.timestamp,
                trend: history
                    .as_ref()
                    .map_or(TrendDirection::InsufficientData, |analysis| analysis.trend),
                slope_per_day: history.and_then(|analysis| analysis.slope_per_day),
                quality: latest
                    .quality
                    .as_ref()
                    .map_or_else(|| "unknown".to_owned(), |quality| quality.status.clone()),
                source: latest.source.clone(),
                data_status: if !latest
                    .quality
                    .as_ref()
                    .is_some_and(|quality| quality.status == "valid")
                    || !latest.value.is_finite()
                {
                    "invalid"
                } else if stale_indicators.contains(indicator_id) {
                    "stale"
                } else {
                    "fresh"
                },
            },
        );
    }
    let latest_timestamp = latest_by_indicator
        .values()
        .map(|observation| observation.timestamp)
        .max();
    let applicable_rules: Vec<_> = rules
        .rules
        .iter()
        .filter(|rule| {
            latest_by_indicator.contains_key(&rule.indicator)
                || (rule.enabled
                    && rule.condition.kind == "missing_data"
                    && (rule.data_class_filter.is_empty()
                        || rule.data_class_filter.contains(&data_class)))
                || (rule.enabled
                    && rule.condition.kind == "composite"
                    && rule
                        .condition
                        .params
                        .get("sub_rules")
                        .and_then(Value::as_array)
                        .is_some_and(|sub_rules| {
                            sub_rules.iter().any(|sub_rule| {
                                sub_rule
                                    .as_str()
                                    .and_then(|id| {
                                        rules.rules.iter().find(|candidate| candidate.rule_id == id)
                                    })
                                    .is_some_and(|candidate| {
                                        latest_by_indicator.contains_key(&candidate.indicator)
                                    })
                            })
                        }))
        })
        .collect();
    let thresholds_status = if applicable_rules.is_empty() {
        "not_applicable"
    } else if applicable_rules
        .iter()
        .all(|rule| rule.status == irco_core::RuleStatus::Validated)
    {
        "validated"
    } else if applicable_rules
        .iter()
        .any(|rule| rule.status == irco_core::RuleStatus::Illustrative)
    {
        "illustrative"
    } else {
        "provisional"
    };
    let alerts: Vec<Alert> = list_alerts(&database, Some(&subject_id), 100, 0)
        .map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "alert_query_failed",
                &error.to_string(),
                "Check the persisted alert store.",
            )
        })?
        .into_iter()
        .filter(|alert| alert.data_quality == data_class)
        .collect();
    Ok(Json(HealthStateResponse {
        subject_id,
        data_class,
        as_of,
        vigilance,
        supported_vigilance,
        indicators: indicator_states,
        missing_indicators,
        triggered_rules: supported_triggers,
        alerts,
        last_updated: latest_timestamp,
        thresholds_status,
        skipped_rules,
        history_truncated: observations.len() == 10_000,
    }))
}

async fn health_overview(
    State(state): State<AppState>,
    query: Result<Query<StateQuery>, QueryRejection>,
) -> Result<Json<HealthOverviewResponse>, ApiError> {
    let Query(query) = query.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_query",
            &error.body_text(),
            "Specify data_class=measured_real, analog, or synthetic.",
        )
    })?;
    let data_class = match query.data_class.as_deref() {
        Some("measured_real") => DataClass::MeasuredReal,
        Some("analog") => DataClass::Analog,
        Some("synthetic") => DataClass::Synthetic,
        _ => {
            return Err(api_error(
                StatusCode::BAD_REQUEST,
                "data_class_required",
                "A valid data_class is required for a health overview",
                "Choose measured_real, analog, or synthetic; classes are never combined.",
            ))
        }
    };
    let as_of = query.as_of;
    let subject_ids = {
        let database = state.database.lock().map_err(|_| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "database_unavailable",
                "The local database is unavailable",
                "Check database health and retry.",
            )
        })?;
        let mut statement = database
            .prepare(
                "SELECT DISTINCT subject_id FROM observations \
                 WHERE subject_id IS NOT NULL AND data_class = ? ORDER BY subject_id",
            )
            .map_err(|error| {
                api_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "state_query_failed",
                    &error.to_string(),
                    "Check the local observation store.",
                )
            })?;
        let rows = statement
            .query_map([data_class.as_str()], |row| row.get::<_, String>(0))
            .map_err(|error| {
                api_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "state_query_failed",
                    &error.to_string(),
                    "Check the local observation store.",
                )
            })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "state_query_failed",
                &error.to_string(),
                "Check the local observation store.",
            )
        })?
    };

    let mut subjects = Vec::with_capacity(subject_ids.len());
    for subject_id in subject_ids {
        let subject_state = health_state(
            State(state.clone()),
            Path(subject_id),
            Ok(Query(StateQuery {
                data_class: Some(data_class.as_str().to_owned()),
                as_of,
            })),
        )
        .await?;
        subjects.push(subject_state.0);
    }

    Ok(Json(HealthOverviewResponse {
        data_class,
        subjects,
    }))
}

async fn dashboard(
    State(state): State<AppState>,
    query: Result<Query<DashboardQuery>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let Query(query) = query.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_query",
            &error.body_text(),
            "Use subject, data_class, and optionally scenario/day or as_of.",
        )
    })?;
    if query.as_of.is_some() && (query.day.is_some() || query.scenario.is_some()) {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "conflicting_time_filters",
            "day and as_of cannot be used together",
            "Choose a demo mission day or an explicit UTC as_of timestamp.",
        ));
    }

    let subject_id = query
        .subject
        .or(query.subject_id)
        .or_else(|| {
            query
                .scenario
                .as_deref()
                .and_then(|scenario| match scenario {
                    "a01" => Some("A-01".to_owned()),
                    "nominal" => Some("N-01".to_owned()),
                    "dropout" => Some("D-01".to_owned()),
                    _ => None,
                })
        })
        .unwrap_or_else(|| "A-01".to_owned());
    let mode = query.mode.as_deref().unwrap_or_else(|| {
        if query.scenario.is_some() || query.day.is_some() {
            "demo"
        } else {
            "real"
        }
    });
    let data_class_name = query.data_class.as_deref().unwrap_or(match mode {
        "demo" => "synthetic",
        "real" => "measured_real",
        _ => "",
    });
    let data_class = match data_class_name {
        "measured_real" => DataClass::MeasuredReal,
        "analog" => DataClass::Analog,
        "synthetic" => DataClass::Synthetic,
        _ => {
            return Err(api_error(
                StatusCode::BAD_REQUEST,
                "data_class_required",
                "A valid data_class is required for a non-demo dashboard",
                "Choose measured_real, analog, or synthetic.",
            ))
        }
    };

    let demo_scenario = if mode == "demo" {
        if query.as_of.is_some() {
            return Err(api_error(
                StatusCode::BAD_REQUEST,
                "invalid_demo_time_filter",
                "as_of is not supported in demo mode",
                "Use day to select a simulated mission day.",
            ));
        }
        let name = query
            .scenario
            .as_deref()
            .unwrap_or(match subject_id.as_str() {
                "A-01" => "a01",
                "N-01" => "nominal",
                "D-01" => "dropout",
                _ => "",
            });
        if data_class != DataClass::Synthetic {
            return Err(api_error(
                StatusCode::BAD_REQUEST,
                "demo_requires_synthetic_class",
                "Demo replays are synthetic",
                "Use data_class=synthetic for a demo scenario.",
            ));
        }
        Some(demo::DemoScenario::parse(name).ok_or_else(|| {
            api_error(
                StatusCode::BAD_REQUEST,
                "unknown_demo_scenario",
                "Unknown demonstration scenario",
                "Choose a01, nominal, or dropout.",
            )
        })?)
    } else if mode == "real" {
        if query.scenario.is_some() || query.day.is_some() {
            return Err(api_error(
                StatusCode::BAD_REQUEST,
                "invalid_real_time_filter",
                "scenario and day are only supported in demo mode",
                "Use mode=demo for a simulated mission day.",
            ));
        }
        None
    } else {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "invalid_dashboard_mode",
            "mode must be real or demo",
            "Choose mode=real for stored observations or mode=demo for a deterministic simulation.",
        ));
    };

    let (as_of, vigilance, triggered_rules, mut measurements, persisted_alerts, mission) =
        if let Some(scenario) = demo_scenario {
            let rules = state.rules_snapshot().map_err(|error| {
                api_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "rules_unavailable",
                    &error.to_string(),
                    "Check the loaded rule configuration.",
                )
            })?;
            let day = query.day.unwrap_or(1);
            let replay = demo::replay_with_rules(scenario, day, &rules.rules).map_err(|error| {
                api_error(
                    StatusCode::BAD_REQUEST,
                    "invalid_demo_day",
                    &error,
                    "Choose a mission day from 1 through 124.",
                )
            })?;
            let scenario_subject = replay
                .replay
                .observations
                .first()
                .and_then(|observation| observation.subject_id.as_deref())
                .unwrap_or("");
            if subject_id != scenario_subject {
                return Err(api_error(
                    StatusCode::BAD_REQUEST,
                    "demo_subject_mismatch",
                    "The subject does not match the selected demo scenario",
                    "Use A-01 for a01, N-01 for nominal, or D-01 for dropout.",
                ));
            }
            let first_day = day.saturating_sub(13).max(1);
            let mut history_by_indicator: BTreeMap<String, Vec<Observation>> = BTreeMap::new();
            for history_day in first_day..=day {
                let history_replay = demo::replay(scenario, history_day).map_err(|error| {
                    api_error(
                        StatusCode::BAD_REQUEST,
                        "invalid_demo_day",
                        &error,
                        "Choose a mission day from 1 through 124.",
                    )
                })?;
                for observation in history_replay.observations {
                    history_by_indicator
                        .entry(observation.indicator.clone())
                        .or_default()
                        .push(observation);
                }
            }
            let mut measurements = BTreeMap::new();
            for (indicator, history) in history_by_indicator {
                let Some(latest) = history.last() else {
                    continue;
                };
                let values: Vec<_> = history.iter().map(|item| item.value).collect();
                let baseline = compute_personal_baseline(
                    &history,
                    &subject_id,
                    &indicator,
                    &DataClass::Synthetic,
                )
                .map(|baseline| {
                    json!({
                        "mean": baseline.mean,
                        "median": baseline.median,
                        "standard_deviation": baseline.standard_deviation,
                        "sample_count": baseline.sample_count,
                    })
                });
                let trend =
                    analyze_history(&history, &subject_id, &indicator, &DataClass::Synthetic)
                        .map(|analysis| analysis.trend);
                let points: Vec<_> = history
                    .iter()
                    .map(|item| json!({
                        "timestamp": item.timestamp,
                        "value": item.value,
                        "quality": item.quality.as_ref().map_or("unknown", |quality| quality.status.as_str()),
                    }))
                    .collect();
                measurements.insert(
                    indicator,
                    json!({
                        "value": latest.value,
                        "unit": latest.unit,
                        "last_updated": latest.timestamp,
                        "trend": trend.unwrap_or(TrendDirection::InsufficientData),
                        "quality": latest.quality.as_ref().map_or("unknown", |quality| quality.status.as_str()),
                        "source": latest.source,
                        "data_status": "fresh",
                        "spark": values,
                        "history": points,
                        "baseline": baseline,
                    }),
                );
            }
            let active_alerts = if replay.triggered_rules.is_empty() {
                Vec::new()
            } else {
                let actions: Vec<_> = rules
                    .rules
                    .iter()
                    .filter(|rule| replay.triggered_rules.contains(&rule.rule_id))
                    .map(|rule| rule.action.clone())
                    .collect();
                vec![json!({
                    "id": format!("demo-{}-day-{}", scenario.name(), day),
                    "state": "simulated",
                    "vigilance": replay.vigilance.clone(),
                    "triggered_rules": replay.triggered_rules.clone(),
                    "actions": actions,
                    "persistence": "not_persisted",
                    "data_class": "synthetic",
                })]
            };
            let mission = json!({
                "mission_id": "IRCO-DEMO",
                "mission_day": day,
                "environment": "deep_space",
                "earth_delay_min": 12,
                "mode": "autonomous",
                "simulated": true,
            });
            (
                replay.replay.timestamp,
                replay.vigilance.clone(),
                replay.triggered_rules.clone(),
                measurements,
                active_alerts,
                mission,
            )
        } else {
            let subject_state = health_state(
                State(state.clone()),
                Path(subject_id.clone()),
                Ok(Query(StateQuery {
                    data_class: Some(data_class.as_str().to_owned()),
                    as_of: query.as_of,
                })),
            )
            .await?
            .0;
            let mut measurements = BTreeMap::new();
            for (id, value) in &subject_state.indicators {
                let history = {
                    let database = state.database.lock().map_err(|_| {
                        api_error(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "database_unavailable",
                            "The local database is unavailable",
                            "Check database health and retry.",
                        )
                    })?;
                    query_observations(
                        &database,
                        &QueryParams {
                            indicator: Some(id.clone()),
                            subject_id: Some(subject_id.clone()),
                            data_class: Some(data_class.as_str().to_owned()),
                            to: query.as_of.map(|timestamp| timestamp.to_rfc3339()),
                            limit: 14,
                            descending: true,
                            ..QueryParams::default()
                        },
                    )
                    .map_err(|error| {
                        api_error(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "history_query_failed",
                            &error.to_string(),
                            "Check the observation store and retry.",
                        )
                    })?
                };
                let history: Vec<_> = history.into_iter().rev().collect();
                let baseline = compute_personal_baseline(&history, &subject_id, id, &data_class)
                    .map(|baseline| {
                        json!({
                            "mean": baseline.mean,
                            "median": baseline.median,
                            "standard_deviation": baseline.standard_deviation,
                            "sample_count": baseline.sample_count,
                        })
                    });
                let points: Vec<_> = history
                    .iter()
                    .map(|item| json!({
                        "timestamp": item.timestamp,
                        "value": item.value,
                        "quality": item.quality.as_ref().map_or("unknown", |quality| quality.status.as_str()),
                    }))
                    .collect();
                measurements.insert(
                    id.clone(),
                    json!({
                        "value": value.latest,
                        "unit": value.unit,
                        "last_updated": value.last_updated,
                        "trend": value.trend,
                        "quality": value.quality,
                        "source": value.source,
                        "data_status": value.data_status,
                        "spark": history.iter().map(|item| item.value).collect::<Vec<_>>(),
                        "history": points,
                        "baseline": baseline,
                    }),
                );
            }
            let active_alerts: Vec<_> = subject_state
                .alerts
                .iter()
                .filter(|alert| alert.state != AlertState::Closed)
                .map(|alert| {
                    json!({
                        "id": alert.id,
                        "created_at": alert.created_at,
                        "subject_id": alert.subject_id,
                        "vigilance": alert.vigilance,
                        "state": alert.state,
                        "triggered_rules": alert.rules_triggered,
                        "data_class": alert.data_quality,
                        "justification": alert.justification,
                        "suggested_action": alert.suggested_action,
                        "history": alert.history,
                    })
                })
                .collect();
            (
                subject_state.as_of,
                subject_state.vigilance,
                subject_state.triggered_rules,
                measurements,
                active_alerts,
                json!({
                    "mission_id": null,
                    "mission_day": null,
                    "environment": null,
                    "earth_delay_min": null,
                    "mode": "no_data",
                    "simulated": false,
                }),
            )
        };

    let indicators = dashboard_indicators(
        state.indicators.as_ref().as_ref(),
        &mut measurements,
        &data_class,
        as_of,
    );
    let routine = routine(
        State(state.clone()),
        Ok(Query(RoutineQuery {
            subject_id: Some(subject_id.clone()),
            date: Some(as_of.format("%Y-%m-%d").to_string()),
        })),
    )
    .await?
    .0;
    let services_engine = state.database.lock().is_ok() && state.rules.read().is_ok();
    let ai_online = state.colab_status().await.available;
    let knowledge_online = state.knowledge.is_some();
    let rule_document = state.rules_snapshot().map_err(|error| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "rules_unavailable",
            &error.to_string(),
            "Check the loaded rule configuration.",
        )
    })?;
    let validated_rules_available = rule_document.rules.iter().any(|rule| {
        rule.enabled
            && (rule.data_class_filter.is_empty() || rule.data_class_filter.contains(&data_class))
            && rule.status == RuleStatus::Validated
    });
    let vigilance_name = if data_class != DataClass::Synthetic && !validated_rules_available {
        "no_data"
    } else {
        match vigilance {
            VigilanceLevel::Green => "green",
            VigilanceLevel::Amber => "amber",
            VigilanceLevel::Red => "red",
            VigilanceLevel::NoData => "no_data",
        }
    };
    let valid_count = indicators
        .iter()
        .filter(|indicator| indicator["measurement_quality"] == "valid")
        .count();
    let suspect_count = indicators
        .iter()
        .filter(|indicator| indicator["measurement_quality"] == "suspect")
        .count();
    let no_data_count = indicators
        .iter()
        .filter(|indicator| indicator["status"] == "no_data")
        .count();
    Ok(Json(json!({
        "mode": mode,
        "subject_id": subject_id,
        "data_class": data_class,
        "mission": mission,
        "global": {
            "level": vigilance_name,
            "confidence": if data_class == DataClass::Synthetic { "low_synthetic" } else if validated_rules_available { "rule_supported" } else { "not_assessed" },
            "badges": if data_class == DataClass::Synthetic { vec!["simulated"] } else { Vec::<&str>::new() },
        },
        "indicators": indicators,
        "active_alerts": persisted_alerts,
        "triggered_rules": triggered_rules,
        "anomalies": {
            "available": false,
            "items": [],
            "reason": "No validated anomaly detector is configured.",
        },
        "clinical_assessment": {
            "available": false,
            "diagnoses": [],
            "reason": "IRCO does not diagnose diseases.",
        },
        "hazards": [
            {"id": "radiation", "level": "no_data", "indicators": []},
            {"id": "isolation", "level": "no_data", "indicators": []},
            {"id": "hostile_environment", "level": "no_data", "indicators": []},
            {"id": "distance_from_earth", "level": "no_data", "indicators": []},
            {"id": "altered_gravity", "level": "no_data", "indicators": []},
        ],
        "routine": routine,
        "data_quality": {
            "data_class": data_class,
            "valid": valid_count,
            "suspect": suspect_count,
            "no_data": no_data_count,
        },
        "services": {
            "engine": if services_engine { "ok" } else { "unavailable" },
            "ai": if ai_online { "online" } else { "offline" },
            "knowledge": if knowledge_online { "ok" } else { "unavailable" },
        },
        "last_updated": as_of,
        "medical_notice": "This service provides traceable decision support, not a medical diagnosis or disease determination.",
    })))
}

async fn dashboard_events(
    State(state): State<AppState>,
    query: Result<Query<DashboardEventsQuery>, QueryRejection>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, ApiError> {
    let Query(query) = query.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_query",
            &error.body_text(),
            "Provide subject_id and data_class=measured_real, analog, or synthetic.",
        )
    })?;
    if !matches!(
        query.data_class.as_str(),
        "measured_real" | "analog" | "synthetic"
    ) {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "invalid_data_class",
            "A valid data_class is required for dashboard events",
            "Choose measured_real, analog, or synthetic.",
        ));
    }

    let receiver = state.observation_updates.subscribe();
    let subject_id = query.subject_id;
    let data_class = query.data_class;
    let stream = stream::unfold(receiver, move |mut receiver| {
        let subject_id = subject_id.clone();
        let data_class = data_class.clone();
        async move {
            loop {
                match receiver.recv().await {
                    Ok(update)
                        if update["subject_id"] == subject_id
                            && update["data_class"] == data_class =>
                    {
                        let event = Event::default()
                            .event("observations_updated")
                            .data(update.to_string());
                        return Some((Ok(event), receiver));
                    }
                    Ok(_) => continue,
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                        let event = Event::default()
                            .event("resync_required")
                            .data("Refresh the dashboard to retrieve the latest state.");
                        return Some((Ok(event), receiver));
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => return None,
                }
            }
        }
    });
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

type RegistryEntry = (String, String, Option<f64>, Option<f64>, String, String);

fn dashboard_indicators(
    registry: Option<&IndicatorRegistry>,
    measurements: &mut BTreeMap<String, Value>,
    data_class: &DataClass,
    as_of: chrono::DateTime<chrono::Utc>,
) -> Vec<Value> {
    let entries: Vec<RegistryEntry> = registry
        .map(|registry| {
            registry
                .indicators
                .iter()
                .map(|indicator| {
                    (
                        indicator.id.clone(),
                        indicator.unit.clone(),
                        indicator.reference_min,
                        indicator.reference_max,
                        indicator.expected_frequency.clone(),
                        indicator
                            .reference_status
                            .clone()
                            .unwrap_or_else(|| "provisional".to_owned()),
                    )
                })
                .collect()
        })
        .unwrap_or_else(|| {
            measurements
                .iter()
                .map(|(id, measurement)| {
                    (
                        id.clone(),
                        measurement["unit"].as_str().unwrap_or("").to_owned(),
                        None,
                        None,
                        "unknown".to_owned(),
                        "provisional".to_owned(),
                    )
                })
                .collect()
        });
    entries
        .into_iter()
        .map(|(id, unit, reference_min, reference_max, expected_frequency, threshold_status)| {
            let measurement = measurements.remove(&id);
            let has_measurement = measurement.is_some();
            let mut indicator = measurement.unwrap_or_else(|| {
                json!({
                    "value": null,
                    "unit": unit,
                    "last_updated": null,
                    "trend": "no_data",
                    "quality": if data_class == &DataClass::Synthetic { "synthetic" } else { "unknown" },
                    "source": null,
                    "data_status": "no_data",
                    "spark": [],
                    "history": [],
                    "baseline": null,
                })
            });
            let measurement_quality = if has_measurement {
                indicator["quality"]
                    .as_str()
                    .unwrap_or("unknown")
                    .to_owned()
            } else {
                "no_data".to_owned()
            };
            indicator["id"] = json!(id);
            let last_updated = indicator["last_updated"]
                .as_str()
                .and_then(|timestamp| timestamp.parse::<chrono::DateTime<chrono::Utc>>().ok());
            let freshness = if !has_measurement || measurement_quality != "valid" {
                if has_measurement { "invalid" } else { "no_data" }
            } else if last_updated.is_some_and(|timestamp| {
                as_of.signed_duration_since(timestamp).num_seconds()
                    > freshness_limit_seconds(&expected_frequency)
            }) {
                "stale"
            } else {
                "fresh"
            };
            indicator["status"] = json!(freshness);
            indicator["data_status"] = json!(freshness);
            indicator["data_class"] = json!(data_class);
            indicator["quality"] = json!(if data_class == &DataClass::Synthetic {
                "synthetic"
            } else {
                indicator["quality"].as_str().unwrap_or("unknown")
            });
            indicator["measurement_quality"] = json!(measurement_quality);
            indicator["threshold_status"] = json!(threshold_status);
            indicator["expected_frequency"] = json!(expected_frequency);
            indicator["age_seconds"] = json!(last_updated.map(|timestamp| {
                as_of
                    .signed_duration_since(timestamp)
                    .num_seconds()
                    .max(0)
            }));
            indicator["thresholds"] = json!({
                "reference_min": reference_min,
                "reference_max": reference_max,
            });
            indicator
        })
        .collect()
}

fn freshness_limit_seconds(expected_frequency: &str) -> i64 {
    if expected_frequency.contains("min") || expected_frequency == "continuous" {
        5 * 60
    } else {
        36 * 60 * 60
    }
}

async fn export(
    State(state): State<AppState>,
    query: Result<Query<ExportQuery>, QueryRejection>,
) -> Result<Response, ApiError> {
    let Query(query) = query.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_query",
            &error.body_text(),
            "Use format=json, jsonl, or csv with optional observation filters.",
        )
    })?;
    let format_name = query.format.as_deref().ok_or_else(|| {
        api_error(
            StatusCode::BAD_REQUEST,
            "missing_format",
            "An export format is required",
            "Choose format=json, jsonl, or csv.",
        )
    })?;
    let format = ExportFormat::parse(format_name).map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_format",
            &error.to_string(),
            "Choose format=json, jsonl, or csv.",
        )
    })?;
    let params = QueryParams {
        indicator: query.indicator,
        subject_id: query.subject_id,
        source: query.source,
        from: query.from,
        to: query.to,
        data_class: query.data_class,
        limit: query.limit.unwrap_or(1000),
        offset: query.offset.unwrap_or(0),
        descending: false,
    };
    let database = state.database.lock().map_err(|_| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "database_unavailable",
            "The local database is unavailable",
            "Check database health and retry.",
        )
    })?;
    let observations = query_observations(&database, &params).map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "query_failed",
            &error.to_string(),
            "Check filters and pagination values.",
        )
    })?;
    let body = export_observations(&observations, format).map_err(|error| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "export_failed",
            &error.to_string(),
            "Retry the export or use JSONL.",
        )
    })?;
    let content_type = match format {
        ExportFormat::Json => "application/json",
        ExportFormat::Csv => "text/csv; charset=utf-8",
        ExportFormat::JsonLines => "application/x-ndjson",
    };
    let mut response = (StatusCode::OK, body).into_response();
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    Ok(response)
}

async fn ingest(
    State(state): State<AppState>,
    request: Result<Json<IngestRequest>, JsonRejection>,
) -> Result<(StatusCode, Json<IngestResponse>), ApiError> {
    let Json(request) = request.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_json",
            &error.body_text(),
            "Send a JSON object with an observations array.",
        )
    })?;
    let rules = state.rules_snapshot().map_err(|error| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "rules_unavailable",
            &error.to_string(),
            "Check the loaded rule configuration.",
        )
    })?;
    if let Some(registry) = state.indicators.as_ref().as_ref() {
        for observation in &request.observations {
            let Some(indicator) = registry.get(&observation.indicator) else {
                return Err(api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "unknown_indicator",
                    &format!("Indicator {} is not registered", observation.indicator),
                    "Register the indicator before ingesting observations.",
                ));
            };
            if !indicator.sources.is_empty() && !indicator.sources.contains(&observation.source) {
                return Err(api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "unsupported_indicator_source",
                    &format!(
                        "Source {} is not configured for indicator {}",
                        observation.source, observation.indicator
                    ),
                    "Add the source to the indicator registry before ingestion.",
                ));
            }
        }
    }
    let mut alerts = Vec::new();
    for observation in &request.observations {
        if !observation
            .quality
            .as_ref()
            .is_some_and(|quality| quality.status == "valid")
        {
            continue;
        }
        let evaluation = evaluate(&rules.rules, observation).map_err(|error| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "rule_evaluation_failed",
                &error.to_string(),
                "Check the deterministic rules and observation context.",
            )
        })?;
        if evaluation.triggered.is_empty() {
            continue;
        }
        let evidence = evaluation
            .evidence
            .iter()
            .map(|item| item.detail.as_str())
            .collect::<Vec<_>>()
            .join("; ");
        let vigilance =
            compute_vigilance(&rules.rules, &evaluation.triggered).map_err(|error| {
                api_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "vigilance_computation_failed",
                    &error.to_string(),
                    "Check the rule IDs and vigilance levels.",
                )
            })?;
        let triggered_rules: Vec<_> = rules
            .rules
            .iter()
            .filter(|rule| evaluation.triggered.contains(&rule.rule_id))
            .collect();
        let primary_rule = triggered_rules
            .iter()
            .max_by_key(|rule| rule.priority)
            .ok_or_else(|| {
                api_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "triggered_rule_missing",
                    "A triggered rule could not be resolved",
                    "Check the loaded rules document.",
                )
            })?;
        let validation = triggered_rules
            .iter()
            .map(|rule| format!("{}:{}", rule.rule_id, rule_status_name(&rule.status)))
            .collect::<Vec<_>>()
            .join(", ");
        let subject_id = observation.subject_id.clone().unwrap_or_else(|| {
            let environment = observation
                .context
                .get("environment")
                .and_then(Value::as_str)
                .unwrap_or("ambient");
            format!("environment:{environment}")
        });
        alerts.push(Alert {
            id: format!("alert-{}", observation.id),
            created_at: observation.timestamp,
            subject_id,
            vigilance,
            state: AlertState::Created,
            rules_triggered: evaluation.triggered,
            data_quality: observation.data_class.clone(),
            justification: format!(
                "Rule(s) {validation} triggered for {}={} {}; evidence: {evidence}; source={}, data_class={}. Decision support, not a diagnosis.",
                observation.indicator,
                observation.value,
                observation.unit,
                observation.source,
                observation.data_class.as_str()
            ),
            suggested_action: primary_rule.action.clone(),
            history: Vec::new(),
        });
    }
    let mut database = state.database.lock().map_err(|_| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "database_unavailable",
            "The local database is unavailable",
            "Check database health and retry.",
        )
    })?;
    let summary = ingest_batch(&mut database, &request.observations).map_err(|error| {
        api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "ingestion_rejected",
            &error.to_string(),
            "Correct the invalid observation or resolve its conflicting ID.",
        )
    })?;
    let mut latest_by_subject_indicator = BTreeMap::new();
    for observation in &request.observations {
        let Some(subject_id) = observation.subject_id.as_deref() else {
            continue;
        };
        if !observation
            .quality
            .as_ref()
            .is_some_and(|quality| quality.status == "valid")
        {
            continue;
        }
        let key = (
            subject_id.to_owned(),
            observation.indicator.clone(),
            observation.data_class.as_str().to_owned(),
        );
        match latest_by_subject_indicator.entry(key) {
            std::collections::btree_map::Entry::Vacant(entry) => {
                entry.insert(observation);
            }
            std::collections::btree_map::Entry::Occupied(mut entry)
                if entry.get().timestamp < observation.timestamp =>
            {
                entry.insert(observation);
            }
            _ => {}
        }
    }
    for current in latest_by_subject_indicator.values() {
        let Some(subject_id) = current.subject_id.as_deref() else {
            continue;
        };
        let newest = query_observations(
            &database,
            &QueryParams {
                indicator: Some(current.indicator.clone()),
                subject_id: Some(subject_id.to_owned()),
                data_class: Some(current.data_class.as_str().to_owned()),
                limit: 1,
                descending: true,
                ..QueryParams::default()
            },
        )
        .map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "temporal_history_unavailable",
                &error.to_string(),
                "The observation batch was stored; inspect history retrieval before retrying.",
            )
        })?;
        if newest
            .first()
            .is_some_and(|latest| latest.timestamp > current.timestamp)
        {
            continue;
        }
        let history = query_observations(
            &database,
            &QueryParams {
                indicator: Some(current.indicator.clone()),
                subject_id: Some(subject_id.to_owned()),
                data_class: Some(current.data_class.as_str().to_owned()),
                to: Some(current.timestamp.to_rfc3339()),
                limit: 10_000,
                descending: true,
                ..QueryParams::default()
            },
        )
        .map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "temporal_history_unavailable",
                &error.to_string(),
                "The observation batch was stored; inspect history retrieval before retrying.",
            )
        })?;
        let evaluation =
            evaluate_temporal_rules(&rules.rules, &history, current).map_err(|error| {
                api_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "rule_evaluation_failed",
                    &error.to_string(),
                    "The observation batch was stored; check temporal rule parameters.",
                )
            })?;
        if evaluation.triggered.is_empty() {
            continue;
        }
        let triggered_rules: Vec<_> = rules
            .rules
            .iter()
            .filter(|rule| evaluation.triggered.contains(&rule.rule_id))
            .collect();
        let primary_rule = triggered_rules
            .iter()
            .max_by_key(|rule| rule.priority)
            .ok_or_else(|| {
                api_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "triggered_rule_missing",
                    "A temporal rule trigger could not be resolved",
                    "Check the loaded rules document.",
                )
            })?;
        let validation = triggered_rules
            .iter()
            .map(|rule| format!("{}:{}", rule.rule_id, rule_status_name(&rule.status)))
            .collect::<Vec<_>>()
            .join(", ");
        let evidence = evaluation
            .evidence
            .iter()
            .map(|item| item.detail.as_str())
            .collect::<Vec<_>>()
            .join("; ");
        let alert_id = format!("alert-{}", current.id);
        let subject_id = subject_id.to_owned();
        if let Some(existing) = alerts.iter_mut().find(|alert| alert.id == alert_id) {
            for rule_id in &evaluation.triggered {
                if !existing.rules_triggered.contains(rule_id) {
                    existing.rules_triggered.push(rule_id.clone());
                }
            }
            existing.vigilance = compute_vigilance(&rules.rules, &existing.rules_triggered)
                .map_err(|error| {
                    api_error(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "vigilance_computation_failed",
                        &error.to_string(),
                        "Check the rule IDs and vigilance levels.",
                    )
                })?;
            existing.suggested_action = primary_rule.action.clone();
            existing.justification.push_str(&format!(
                " Temporal rule(s) {validation} triggered; evidence: {evidence}."
            ));
        } else {
            alerts.push(Alert {
                id: alert_id,
                created_at: current.timestamp,
                subject_id,
                vigilance: compute_vigilance(&rules.rules, &evaluation.triggered)
                    .map_err(|error| {
                        api_error(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "vigilance_computation_failed",
                            &error.to_string(),
                            "Check the rule IDs and vigilance levels.",
                        )
                    })?,
                state: AlertState::Created,
                rules_triggered: evaluation.triggered,
                data_quality: current.data_class.clone(),
                justification: format!(
                    "Temporal rule(s) {validation} triggered for {} at {}; evidence: {evidence}; source={}, data_class={}. Decision support, not a diagnosis.",
                    current.indicator,
                    current.timestamp.to_rfc3339(),
                    current.source,
                    current.data_class.as_str()
                ),
                suggested_action: primary_rule.action.clone(),
                history: Vec::new(),
            });
        }
    }
    let mut alerts_created = 0;
    for alert in &alerts {
        if create_alert(&database, alert).map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "alert_persistence_failed",
                &error.to_string(),
                "The observations were stored; inspect alert storage before replaying this batch.",
            )
        })? {
            alerts_created += 1;
        }
    }
    if summary.accepted > 0 {
        let mut updates: BTreeMap<
            (String, String),
            (chrono::DateTime<chrono::Utc>, BTreeSet<String>),
        > = BTreeMap::new();
        for observation in &request.observations {
            let Some(subject_id) = observation.subject_id.as_deref() else {
                continue;
            };
            let key = (
                subject_id.to_owned(),
                observation.data_class.as_str().to_owned(),
            );
            let entry = updates
                .entry(key)
                .or_insert_with(|| (observation.timestamp, BTreeSet::new()));
            entry.0 = entry.0.max(observation.timestamp);
            entry.1.insert(observation.indicator.clone());
        }
        for ((subject_id, data_class), (observed_at, indicators)) in updates {
            let _ = state.observation_updates.send(json!({
                "subject_id": subject_id,
                "data_class": data_class,
                "observed_at": observed_at,
                "indicators": indicators,
            }));
        }
    }
    Ok((
        StatusCode::OK,
        Json(IngestResponse {
            accepted: summary.accepted,
            rejected: 0,
            errors: Vec::new(),
            duplicates_skipped: summary.duplicates_skipped,
            alerts_created,
        }),
    ))
}

fn rule_status_name(status: &RuleStatus) -> &'static str {
    match status {
        RuleStatus::Validated => "validated",
        RuleStatus::Provisional => "provisional",
        RuleStatus::Illustrative => "illustrative",
    }
}

async fn alerts(
    State(state): State<AppState>,
    query: Result<Query<AlertsQuery>, QueryRejection>,
) -> Result<Json<AlertPage>, ApiError> {
    let Query(query) = query.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_query",
            &error.body_text(),
            "Check alert filter and pagination values.",
        )
    })?;
    let limit = query.limit.unwrap_or(100);
    let offset = query.offset.unwrap_or(0);
    let database = state.database.lock().map_err(|_| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "database_unavailable",
            "The local database is unavailable",
            "Check database health and retry.",
        )
    })?;
    let results =
        list_alerts(&database, query.subject_id.as_deref(), limit, offset).map_err(|error| {
            api_error(
                StatusCode::BAD_REQUEST,
                "alert_query_failed",
                &error.to_string(),
                "Check alert filters and pagination values.",
            )
        })?;
    Ok(Json(AlertPage {
        alerts: results,
        limit,
        offset,
    }))
}

async fn transition(
    State(state): State<AppState>,
    Path(alert_id): Path<String>,
    request: Result<Json<AlertTransitionRequest>, JsonRejection>,
) -> Result<Json<Alert>, ApiError> {
    let Json(request) = request.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_json",
            &error.body_text(),
            "Send a JSON body with state and detail.",
        )
    })?;
    let database = state.database.lock().map_err(|_| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "database_unavailable",
            "The local database is unavailable",
            "Check database health and retry.",
        )
    })?;
    transition_alert(&database, &alert_id, request.state, &request.detail)
        .map(Json)
        .map_err(|error| {
            let status = if matches!(error, IrcoError::NotFound(_)) {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::UNPROCESSABLE_ENTITY
            };
            api_error(
                status,
                "alert_transition_rejected",
                &error.to_string(),
                "Check the alert exists and the requested state transition is allowed.",
            )
        })
}

async fn record_followup(
    State(state): State<AppState>,
    Path(alert_id): Path<String>,
    request: Result<Json<AlertFollowupRequest>, JsonRejection>,
) -> Result<Json<AlertFollowupResponse>, ApiError> {
    let Json(request) = request.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_json",
            &error.body_text(),
            "Send an observation_id in the JSON body.",
        )
    })?;
    let database = state.database.lock().map_err(|_| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "database_unavailable",
            "The local database is unavailable",
            "Check database health and retry.",
        )
    })?;
    let payload: Option<String> = database
        .query_row(
            "SELECT payload_json FROM observations WHERE id = ?1",
            [&request.observation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "database_query_failed",
                &error.to_string(),
                "Check database health and retry.",
            )
        })?;
    let Some(payload) = payload else {
        return Err(api_error(
            StatusCode::NOT_FOUND,
            "observation_not_found",
            "The requested observation does not exist",
            "Ingest the observation before linking it to a follow-up.",
        ));
    };
    let observation: Observation = serde_json::from_str(&payload).map_err(|error| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "stored_observation_invalid",
            &error.to_string(),
            "Inspect the persisted observation record.",
        )
    })?;
    let count =
        record_followup_measurement(&database, &alert_id, &observation).map_err(|error| {
            let status = if matches!(error, IrcoError::NotFound(_)) {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::UNPROCESSABLE_ENTITY
            };
            api_error(
                status,
                "followup_rejected",
                &error.to_string(),
                "Confirm the alert is open and the observation matches its subject and data class.",
            )
        })?;
    Ok(Json(AlertFollowupResponse {
        alert_id,
        followup_measurements: count,
    }))
}

async fn demo_scenarios() -> Json<Vec<DemoScenarioSummary>> {
    Json(vec![
        DemoScenarioSummary {
            id: "a01",
            data_class: "synthetic",
            days: demo::SCENARIO_DAYS,
            description:
                "Progressive synthetic physiological drift; day 124 ends at the specified values.",
        },
        DemoScenarioSummary {
            id: "nominal",
            data_class: "synthetic",
            days: demo::SCENARIO_DAYS,
            description: "Stable synthetic observations for nominal-path integration testing.",
        },
        DemoScenarioSummary {
            id: "dropout",
            data_class: "synthetic",
            days: demo::SCENARIO_DAYS,
            description: "Stable synthetic data with explicitly missing sensor observations.",
        },
    ])
}

async fn demo_replay(
    State(state): State<AppState>,
    query: Result<Query<DemoQuery>, QueryRejection>,
) -> Result<Json<demo::EvaluatedDemoReplay>, ApiError> {
    let Query(query) = query.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_query",
            &error.body_text(),
            "Use scenario=a01|nominal|dropout and day=1..124.",
        )
    })?;
    let name = query
        .name
        .as_deref()
        .or(query.scenario.as_deref())
        .unwrap_or("a01");
    let scenario = demo::DemoScenario::parse(name).ok_or_else(|| {
        api_error(
            StatusCode::BAD_REQUEST,
            "unknown_demo_scenario",
            "Unknown demonstration scenario",
            "Choose a01, nominal, or dropout.",
        )
    })?;
    let day = query.day.unwrap_or(1);
    let rules = state.rules_snapshot().map_err(|error| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "rules_unavailable",
            &error.to_string(),
            "Check the loaded rule configuration.",
        )
    })?;
    demo::replay_with_rules(scenario, day, &rules.rules)
        .map(Json)
        .map_err(|error| {
            api_error(
                StatusCode::BAD_REQUEST,
                "invalid_demo_day",
                &error,
                "Choose a mission day from 1 through 124.",
            )
        })
}

async fn demo_reset(
    State(state): State<AppState>,
    query: Result<Query<DemoQuery>, QueryRejection>,
) -> Result<Json<demo::EvaluatedDemoReplay>, ApiError> {
    let Query(query) = query.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_query",
            &error.body_text(),
            "Use scenario=a01|nominal|dropout.",
        )
    })?;
    let name = query
        .name
        .as_deref()
        .or(query.scenario.as_deref())
        .unwrap_or("a01");
    let scenario = demo::DemoScenario::parse(name).ok_or_else(|| {
        api_error(
            StatusCode::BAD_REQUEST,
            "unknown_demo_scenario",
            "Unknown demonstration scenario",
            "Choose a01, nominal, or dropout.",
        )
    })?;
    let rules = state.rules_snapshot().map_err(|error| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "rules_unavailable",
            &error.to_string(),
            "Check the loaded rule configuration.",
        )
    })?;
    demo::replay_with_rules(scenario, 1, &rules.rules)
        .map(Json)
        .map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "demo_reset_failed",
                &error,
                "Report this error; the deterministic scenario should be available offline.",
            )
        })
}

async fn search(
    State(state): State<AppState>,
    query: Result<Query<SearchQuery>, QueryRejection>,
) -> Result<Json<SearchResponse>, ApiError> {
    let Query(query) = query.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_query",
            &error.body_text(),
            "Provide q and optional hazard, indicator, and limit filters.",
        )
    })?;
    let Some(knowledge) = state.knowledge.as_ref() else {
        return Err(api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "knowledge_unavailable",
            "The offline scientific corpus is not installed",
            "Configure IRCO_CORPUS_PATH with a validated JSONL corpus.",
        ));
    };
    let Some(query_text) = query.q.as_deref().filter(|query| !query.trim().is_empty()) else {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "empty_query",
            "A non-empty q parameter is required",
            "Search for a scientific topic or indicator.",
        ));
    };
    let limit = query.limit.unwrap_or(5);
    if limit == 0 || limit > 20 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "invalid_limit",
            "limit must be between 1 and 20",
            "Choose a smaller result page.",
        ));
    }
    let hits = knowledge.search(
        query_text,
        SearchFilters {
            hazard: query.hazard.as_deref(),
            indicator: query.indicator.as_deref(),
        },
        limit,
    );
    Ok(Json(SearchResponse {
        available: true,
        source_not_found: hits.is_empty(),
        hits,
    }))
}

async fn assistant(
    State(state): State<AppState>,
    request: Result<Json<AssistantRequest>, JsonRejection>,
) -> Result<Json<irco_ai::AssistantAnswer>, ApiError> {
    let Json(request) = request.map_err(|error| {
        api_error(
            StatusCode::BAD_REQUEST,
            "invalid_json",
            &error.body_text(),
            "Send a JSON body containing a question.",
        )
    })?;
    if request.question.trim().is_empty() || request.question.len() > 2000 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "invalid_question",
            "question must contain 1 to 2000 bytes",
            "Shorten the question and retry.",
        ));
    }
    if request.subject_id.is_some() != request.data_class.is_some()
        || request
            .subject_id
            .as_deref()
            .is_some_and(|subject_id| subject_id.trim().is_empty() || subject_id.len() > 200)
    {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "invalid_health_context",
            "subject_id and data_class must be provided together",
            "Provide a non-empty subject_id and data_class=measured_real, analog, or synthetic.",
        ));
    }
    if request
        .data_class
        .as_deref()
        .is_some_and(|data_class| !matches!(data_class, "measured_real" | "analog" | "synthetic"))
    {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "invalid_data_class",
            "data_class must be measured_real, analog, or synthetic",
            "Choose one of the three supported data classes.",
        ));
    }
    let hits = state
        .knowledge
        .as_ref()
        .as_ref()
        .map_or_else(Vec::new, |base| {
            base.search(
                &request.question,
                SearchFilters {
                    hazard: request.hazard.as_deref(),
                    indicator: request.indicator.as_deref(),
                },
                5,
            )
        });
    let hits = irco_ai::relevant_hits(&hits);
    if hits.is_empty() {
        return Ok(Json(compose_answer(&hits)));
    }
    let answer = if let Some((api_base, api_key, model)) = state.active_colab_endpoint().await? {
        let health_context = if let (Some(subject_id), Some(data_class)) =
            (request.subject_id.as_deref(), request.data_class.as_deref())
        {
            let Json(snapshot) = health_state(
                State(state.clone()),
                Path(subject_id.to_owned()),
                Ok(Query(StateQuery {
                    data_class: Some(data_class.to_owned()),
                    as_of: None,
                })),
            )
            .await?;
            Some(
                json!({
                    "subject_id": snapshot.subject_id,
                    "data_class": snapshot.data_class,
                    "as_of": snapshot.as_of,
                    "vigilance": snapshot.vigilance,
                    "supported_vigilance": snapshot.supported_vigilance,
                    "indicators": snapshot.indicators,
                    "missing_indicators": snapshot.missing_indicators,
                    "triggered_rules": snapshot.triggered_rules,
                })
                .to_string(),
            )
        } else {
            None
        };
        irco_ai::answer_with_colab(
            &api_base,
            &api_key,
            &model,
            &request.question,
            health_context.as_deref(),
            &hits,
        )
        .await
        .unwrap_or_else(|| compose_answer(&hits))
    } else {
        compose_answer(&hits)
    };
    Ok(Json(answer))
}

async fn knowledge_health(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "available": state.knowledge.is_some(),
        "documents": state
            .knowledge
            .as_ref()
            .as_ref()
            .map_or(0, |knowledge| knowledge.document_count()),
        "retrieval": "bm25",
    }))
}

async fn knowledge_hazards(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    if state.knowledge.is_none() {
        return Err(api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "knowledge_unavailable",
            "The offline scientific corpus is not installed",
            "Configure IRCO_CORPUS_PATH with a validated JSONL corpus.",
        ));
    }
    Ok(Json(json!({
        "hazards": [
            "radiation",
            "isolation",
            "hostile_environment",
            "distance_from_earth",
            "altered_gravity"
        ]
    })))
}

async fn knowledge_sources(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let Some(knowledge) = state.knowledge.as_ref() else {
        return Err(api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "knowledge_unavailable",
            "The offline scientific corpus is not installed",
            "Configure IRCO_CORPUS_PATH with a validated JSONL corpus.",
        ));
    };
    let sources: Vec<Value> = knowledge
        .documents()
        .iter()
        .map(|document| {
            json!({
                "id": document.id,
                "title": document.title,
                "publisher": document.source,
                "section": document.section,
                "url": document.url,
                "hazard": document.hazard,
                "indicators_related": document.indicators_related,
            })
        })
        .collect();
    Ok(Json(json!({
        "available": true,
        "documents": sources.len(),
        "sources": sources,
    })))
}

async fn knowledge_indicator(
    State(state): State<AppState>,
    Path(indicator_id): Path<String>,
) -> Result<Json<SearchResponse>, ApiError> {
    let Some(knowledge) = state.knowledge.as_ref() else {
        return Err(api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "knowledge_unavailable",
            "The offline scientific corpus is not installed",
            "Configure IRCO_CORPUS_PATH with a validated JSONL corpus.",
        ));
    };
    let hits = knowledge.search(
        &indicator_id.replace('_', " "),
        SearchFilters {
            hazard: None,
            indicator: Some(&indicator_id),
        },
        5,
    );
    Ok(Json(SearchResponse {
        available: true,
        source_not_found: hits.is_empty(),
        hits,
    }))
}

fn api_error(status: StatusCode, code: &str, error: &str, hint: &str) -> ApiError {
    ApiError {
        status,
        body: ErrorEnvelope {
            error: error.to_owned(),
            code: code.to_owned(),
            hint: hint.to_owned(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{
        router, AppState, ColabCapabilities, ColabSession, IndicatorEntry, IndicatorRegistry,
        Observation,
    };
    use axum::{
        body::Body,
        http::{header, Request, StatusCode},
    };
    use chrono::Utc;
    use futures_util::StreamExt;
    use irco_core::{
        Alert, AlertState, DataClass, DecisionRule, RuleCondition, RuleStatus, RulesDocument,
        VigilanceLevel,
    };
    use irco_knowledge::{CorpusEntry, EvidenceKind, KnowledgeBase};
    use rusqlite::Connection;
    use serde_json::Value;
    use std::time::{Duration, Instant};
    use tower::ServiceExt;

    fn test_app(token: Option<String>) -> axum::Router {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let rules = RulesDocument {
            version: "0.1.0".to_owned(),
            rules: Vec::new(),
        };
        router(AppState::new(database, rules, token))
    }

    fn test_app_with_registry() -> (axum::Router, tokio::sync::broadcast::Sender<Value>) {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let registry_path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../config/indicators/registry.toml"
        );
        let registry: IndicatorRegistry =
            toml::from_str(&std::fs::read_to_string(registry_path).unwrap()).unwrap();
        let mut state = AppState::new(
            database,
            RulesDocument {
                version: "test".to_owned(),
                rules: Vec::new(),
            },
            None,
        );
        state.indicators = std::sync::Arc::new(Some(registry));
        let updates = state.observation_updates.clone();
        (router(state), updates)
    }

    fn test_colab_app(ttl: Duration) -> axum::Router {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let mut state = AppState::new(
            database,
            RulesDocument {
                version: "test".to_owned(),
                rules: Vec::new(),
            },
            None,
        );
        state.colab_admin_token = Some("admin-test-token".to_owned());
        state.colab_ttl = ttl;
        router(state)
    }

    fn colab_registration_body(api_base: &str) -> Value {
        serde_json::json!({
            "api_base": api_base,
            "api_key": "test-colab-api-key",
            "model": "qwen-test",
            "capabilities": {
                "chat": true,
                "asr": false,
                "tts": false,
                "vision": false,
                "vlm": false,
                "image": false,
                "multi": false,
                "streaming": true
            }
        })
    }

    fn test_app_with_alert_rule() -> axum::Router {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let rule = DecisionRule {
            rule_id: "illustrative-high-hr".to_owned(),
            indicator: "heart_rate".to_owned(),
            condition: RuleCondition {
                kind: "absolute_threshold".to_owned(),
                params: serde_json::from_value(serde_json::json!({"max": 100.0})).unwrap(),
            },
            context_required: Vec::new(),
            data_class_filter: vec![DataClass::Synthetic],
            vigilance_level: Some(VigilanceLevel::Amber),
            action: "request_reassessment".to_owned(),
            justification_template: None,
            scientific_reference: None,
            status: RuleStatus::Illustrative,
            enabled: true,
            priority: 10,
        };
        router(AppState::new(
            database,
            RulesDocument {
                version: "test".to_owned(),
                rules: vec![rule],
            },
            None,
        ))
    }

    fn test_app_with_missing_data_rule() -> axum::Router {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let rule = DecisionRule {
            rule_id: "synthetic-heart-rate-stale".to_owned(),
            indicator: "heart_rate".to_owned(),
            condition: RuleCondition {
                kind: "missing_data".to_owned(),
                params: serde_json::from_value(serde_json::json!({"max_gap_hours": 36})).unwrap(),
            },
            context_required: Vec::new(),
            data_class_filter: vec![DataClass::Synthetic],
            vigilance_level: Some(VigilanceLevel::Amber),
            action: "request_new_measurement".to_owned(),
            justification_template: None,
            scientific_reference: None,
            status: RuleStatus::Illustrative,
            enabled: true,
            priority: 10,
        };
        router(AppState::new(
            database,
            RulesDocument {
                version: "test".to_owned(),
                rules: vec![rule],
            },
            None,
        ))
    }

    fn test_app_with_composite_rules() -> axum::Router {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let make_threshold = |id: &str, indicator: &str, max: f64| DecisionRule {
            rule_id: id.to_owned(),
            indicator: indicator.to_owned(),
            condition: RuleCondition {
                kind: "absolute_threshold".to_owned(),
                params: serde_json::from_value(serde_json::json!({"max": max})).unwrap(),
            },
            context_required: Vec::new(),
            data_class_filter: vec![DataClass::Synthetic],
            vigilance_level: Some(VigilanceLevel::Amber),
            action: "request_reassessment".to_owned(),
            justification_template: None,
            scientific_reference: None,
            status: RuleStatus::Illustrative,
            enabled: true,
            priority: 10,
        };
        let mut composite = make_threshold("SLEEP_COMPOSITE_001", "fatigue_score", 10.0);
        composite.condition.kind = "composite".to_owned();
        composite.condition.params = serde_json::from_value(serde_json::json!({
            "sub_rules": ["HR_THRESHOLD_001", "SLEEP_THRESHOLD_001"],
            "composite_operator": "and"
        }))
        .unwrap();
        composite.vigilance_level = Some(VigilanceLevel::Red);
        let mut sleep_rule = make_threshold("SLEEP_THRESHOLD_001", "sleep_duration", 5.0);
        sleep_rule
            .condition
            .params
            .insert("max".to_owned(), serde_json::json!(10.0));
        sleep_rule
            .condition
            .params
            .insert("min".to_owned(), serde_json::json!(5.0));
        router(AppState::new(
            database,
            RulesDocument {
                version: "test".to_owned(),
                rules: vec![
                    make_threshold("HR_THRESHOLD_001", "heart_rate", 90.0),
                    sleep_rule,
                    composite,
                ],
            },
            None,
        ))
    }

    async fn ingest_test_observation(app: &axum::Router, quality: Option<&str>) -> Value {
        let mut observation = serde_json::json!({
            "id": format!("test-alert-{}", quality.unwrap_or("absent")),
            "timestamp": "2026-01-01T06:00:00Z",
            "subject_id": "A-01",
            "indicator": "heart_rate",
            "value": 108.0,
            "unit": "bpm",
            "source": "SYNTHETIC_A01",
            "data_class": "synthetic",
            "context": { "mission_day": 124 }
        });
        if let Some(quality) = quality {
            observation["quality"] = serde_json::json!({ "status": quality, "flags": [] });
        }
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/ingest")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({ "observations": [observation] }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    #[tokio::test]
    async fn valid_rule_trigger_creates_persistent_idempotent_alert() {
        let app = test_app_with_alert_rule();
        let first = ingest_test_observation(&app, Some("valid")).await;
        assert_eq!(first["alerts_created"], 1);
        assert_eq!(first["accepted"], 1);

        let replay = ingest_test_observation(&app, Some("valid")).await;
        assert_eq!(replay["alerts_created"], 0);
        assert_eq!(replay["duplicates_skipped"], 1);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/alerts?subject_id=A-01")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let alerts: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(alerts["alerts"].as_array().unwrap().len(), 1);
        assert_eq!(alerts["alerts"][0]["vigilance"], "amber");
        assert_eq!(alerts["alerts"][0]["data_quality"], "synthetic");
        assert!(alerts["alerts"][0]["justification"]
            .as_str()
            .unwrap()
            .contains("illustrative-high-hr:illustrative"));
    }

    #[tokio::test]
    async fn non_valid_or_missing_quality_never_creates_rule_alerts() {
        let app = test_app_with_alert_rule();
        let invalid = ingest_test_observation(&app, Some("suspect")).await;
        assert_eq!(invalid["alerts_created"], 0);
        let missing = ingest_test_observation(&app, None).await;
        assert_eq!(missing["alerts_created"], 0);
    }

    #[tokio::test]
    async fn health_state_reports_no_data_for_suspect_measurements() {
        let app = test_app_with_alert_rule();
        ingest_test_observation(&app, Some("suspect")).await;
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/state/A-01?data_class=synthetic")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let state: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(state["vigilance"], "no_data");
        assert_eq!(
            state["skipped_rules"][0]["reason"],
            "observation_quality_not_valid"
        );
    }

    #[tokio::test]
    async fn health_state_reports_stale_measurements_at_an_explicit_evaluation_time() {
        let app = test_app_with_missing_data_rule();
        ingest_test_observation(&app, Some("valid")).await;
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/state/A-01?data_class=synthetic&as_of=2026-01-03T00:00:00Z")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let state: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(state["vigilance"], "amber");
        assert_eq!(state["as_of"], "2026-01-03T00:00:00Z");
        assert_eq!(state["indicators"]["heart_rate"]["data_status"], "stale");
        assert_eq!(
            state["missing_indicators"],
            serde_json::json!(["heart_rate"])
        );
        assert_eq!(
            state["triggered_rules"],
            serde_json::json!(["synthetic-heart-rate-stale"])
        );
    }

    #[tokio::test]
    async fn health_state_evaluates_composites_from_same_subject_and_data_class() {
        let app = test_app_with_composite_rules();
        for observation in [
            serde_json::json!({
                "id": "composite-hr",
                "timestamp": "2026-01-01T06:00:00Z",
                "subject_id": "A-01",
                "indicator": "heart_rate",
                "value": 108.0,
                "unit": "bpm",
                "source": "SYNTHETIC_A01",
                "data_class": "synthetic",
                "quality": { "status": "valid", "flags": [] }
            }),
            serde_json::json!({
                "id": "composite-sleep",
                "timestamp": "2026-01-01T06:00:00Z",
                "subject_id": "A-01",
                "indicator": "sleep_duration",
                "value": 4.0,
                "unit": "h",
                "source": "SYNTHETIC_A01",
                "data_class": "synthetic",
                "quality": { "status": "valid", "flags": [] }
            }),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/v1/ingest")
                        .header("content-type", "application/json")
                        .body(Body::from(
                            serde_json::json!({ "observations": [observation] }).to_string(),
                        ))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), axum::http::StatusCode::OK);
        }

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/state/A-01?data_class=synthetic")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let state: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            state["triggered_rules"],
            serde_json::json!([
                "HR_THRESHOLD_001",
                "SLEEP_COMPOSITE_001",
                "SLEEP_THRESHOLD_001"
            ])
        );
        assert_eq!(state["supported_vigilance"], "red");
    }

    #[tokio::test]
    async fn colab_registration_replaces_sessions_and_rotates_the_tunnel() {
        let app = test_colab_app(Duration::from_secs(60));
        let unauthorized = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/admin/colab/register")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, "Bearer wrong-token")
                    .body(Body::from(
                        colab_registration_body("https://colab-one.example.test/v1").to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

        let invalid_url = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/admin/colab/register")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, "Bearer admin-test-token")
                    .body(Body::from(
                        colab_registration_body("http://insecure.example.test/v1").to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(invalid_url.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let first = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/admin/colab/register")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, "Bearer admin-test-token")
                    .body(Body::from(
                        colab_registration_body("https://colab-one.example.test/v1").to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(first.status(), StatusCode::OK);
        let first_body: Value = serde_json::from_slice(
            &axum::body::to_bytes(first.into_body(), usize::MAX)
                .await
                .unwrap(),
        )
        .unwrap();
        let first_session = first_body["session_id"].as_str().unwrap().to_owned();
        let first_token = first_body["heartbeat_token"].as_str().unwrap().to_owned();

        let heartbeat = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/admin/colab/heartbeat")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, format!("Bearer {first_token}"))
                    .body(Body::from(
                        serde_json::json!({
                            "session_id": first_session,
                            "api_base": "https://colab-two.example.test",
                            "model": "qwen-updated"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(heartbeat.status(), StatusCode::OK);

        let status = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/colab/status")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let status_body: Value = serde_json::from_slice(
            &axum::body::to_bytes(status.into_body(), usize::MAX)
                .await
                .unwrap(),
        )
        .unwrap();
        assert_eq!(status_body["available"], true);
        assert_eq!(status_body["model"], "qwen-updated");
        assert!(status_body.get("api_key").is_none());
        assert!(status_body.get("api_base").is_none());

        let capabilities = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/colab/capabilities")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let capabilities_body: Value = serde_json::from_slice(
            &axum::body::to_bytes(capabilities.into_body(), usize::MAX)
                .await
                .unwrap(),
        )
        .unwrap();
        assert_eq!(capabilities_body["capabilities"]["chat"], true);
        assert_eq!(capabilities_body["capabilities"]["vision"], false);

        let health = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let health_body: Value = serde_json::from_slice(
            &axum::body::to_bytes(health.into_body(), usize::MAX)
                .await
                .unwrap(),
        )
        .unwrap();
        assert_eq!(health_body["ai_available"], true);
        assert_eq!(health_body["colab_available"], true);

        let replacement = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/admin/colab/register")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, "Bearer admin-test-token")
                    .body(Body::from(
                        colab_registration_body("https://colab-three.example.test/v1").to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let replacement_body: Value = serde_json::from_slice(
            &axum::body::to_bytes(replacement.into_body(), usize::MAX)
                .await
                .unwrap(),
        )
        .unwrap();
        assert_ne!(replacement_body["session_id"], first_session);

        let stale_heartbeat = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/admin/colab/heartbeat")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, format!("Bearer {first_token}"))
                    .body(Body::from(
                        serde_json::json!({"session_id": first_session}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(stale_heartbeat.status(), StatusCode::UNAUTHORIZED);

        let revoked = app
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri("/api/v1/admin/colab/register")
                    .header(header::AUTHORIZATION, "Bearer admin-test-token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(revoked.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn expired_colab_session_cannot_be_revived_by_its_old_heartbeat() {
        let app = test_colab_app(Duration::from_millis(1));
        let registered = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/admin/colab/register")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, "Bearer admin-test-token")
                    .body(Body::from(
                        colab_registration_body("https://colab.example.test/v1").to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let registered_body: Value = serde_json::from_slice(
            &axum::body::to_bytes(registered.into_body(), usize::MAX)
                .await
                .unwrap(),
        )
        .unwrap();
        let session_id = registered_body["session_id"].as_str().unwrap();
        let heartbeat_token = registered_body["heartbeat_token"].as_str().unwrap();
        std::thread::sleep(Duration::from_millis(5));

        let status = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/colab/status")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let status_body: Value = serde_json::from_slice(
            &axum::body::to_bytes(status.into_body(), usize::MAX)
                .await
                .unwrap(),
        )
        .unwrap();
        assert_eq!(status_body["available"], false);

        let heartbeat = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/admin/colab/heartbeat")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, format!("Bearer {heartbeat_token}"))
                    .body(Body::from(
                        serde_json::json!({"session_id": session_id}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(heartbeat.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn colab_credentials_are_separate_from_the_general_api_token() {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let mut state = AppState::new(
            database,
            RulesDocument {
                version: "test".to_owned(),
                rules: Vec::new(),
            },
            Some("general-api-token".to_owned()),
        );
        state.colab_admin_token = Some("separate-admin-token".to_owned());
        let app = router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/admin/colab/register")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, "Bearer separate-admin-token")
                    .body(Body::from(
                        colab_registration_body("https://colab.example.test/v1").to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn colab_status_reads_the_active_heartbeat_registry() {
        use std::{
            io::{Read, Write},
            net::TcpListener,
            thread,
        };

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let registry = serde_json::json!({
            "active": "crew-a",
            "backends": {
                "crew-a": {
                    "api_base": "https://colab.example.test/v1",
                    "api_key": "test-key",
                    "model": "qwen-test",
                    "session_id": "session-01",
                    "age_sec": 12
                }
            }
        })
        .to_string();
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            registry.len(),
            registry
        );
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 1024];
            let _ = stream.read(&mut request).unwrap();
            stream.write_all(response.as_bytes()).unwrap();
        });

        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let mut state = AppState::new(
            database,
            RulesDocument {
                version: "test".to_owned(),
                rules: Vec::new(),
            },
            None,
        );
        state.colab_ttl = Duration::from_secs(600);
        state.colab_registry_url = Some(format!("http://{address}/api/backends"));
        state.colab_registry_token = Some("mock-registry-token".to_owned());
        let response = router(state)
            .oneshot(
                Request::builder()
                    .uri("/api/v1/colab/status")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body: Value = serde_json::from_slice(
            &axum::body::to_bytes(response.into_body(), usize::MAX)
                .await
                .unwrap(),
        )
        .unwrap();
        assert_eq!(body["available"], true);
        assert_eq!(body["model"], "qwen-test");
        assert_eq!(body["expires_in_seconds"], 588);
        assert!(body.get("api_key").is_none());
        server.join().unwrap();
    }

    #[tokio::test]
    async fn health_reports_optional_services_as_unavailable() {
        let response = test_app(None)
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["ai_available"], false);
        assert_eq!(json["colab_available"], false);
        assert_eq!(json["knowledge_available"], false);
    }

    #[tokio::test]
    async fn openapi_json_is_served_and_describes_the_dashboard_routes() {
        let response = test_app(Some("test-token".to_owned()))
            .oneshot(
                Request::builder()
                    .uri("/openapi.json")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let spec: Value = serde_json::from_slice(&body).unwrap();
        assert!(spec["paths"]["/api/v1/alerts"].is_object());
        assert!(spec["paths"]["/api/v1/admin/rules/reload"].is_object());
        assert!(spec["paths"]["/api/v1/state"].is_object());
        assert!(spec["paths"]["/api/v1/demo/replay"].is_object());
    }

    #[tokio::test]
    async fn token_protects_api_routes_but_not_health() {
        let app = test_app(Some("test-token".to_owned()));
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/observations")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::UNAUTHORIZED);

        let demo_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/demo/scenarios")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(demo_response.status(), axum::http::StatusCode::UNAUTHORIZED);

        let health_response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(health_response.status(), axum::http::StatusCode::OK);
    }

    #[tokio::test]
    async fn rules_reload_is_atomic_and_rejects_invalid_files() {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let path = std::env::temp_dir().join(format!(
            "irco-rules-reload-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::write(&path, "invalid json").unwrap();
        let mut state = AppState::new(
            database,
            RulesDocument {
                version: "0.1.0".to_owned(),
                rules: Vec::new(),
            },
            None,
        );
        state.rules_path = Some(std::sync::Arc::new(path.clone()));
        let app = router(state);

        let invalid = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/admin/rules/reload")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            invalid.status(),
            axum::http::StatusCode::UNPROCESSABLE_ENTITY
        );
        let body = axum::body::to_bytes(invalid.into_body(), usize::MAX)
            .await
            .unwrap();
        let error: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(error["code"], "rules_reload_failed");
        let unchanged = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/rules")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(unchanged.into_body(), usize::MAX)
            .await
            .unwrap();
        let unchanged: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(unchanged["rules"].as_array().unwrap().len(), 0);

        std::fs::write(
            &path,
            r#"{
                "version": "0.1.0",
                "rules": [{
                    "rule_id": "HR_THRESHOLD_001",
                    "indicator": "heart_rate",
                    "condition": {"type": "absolute_threshold", "params": {"max": 100}},
                    "action": "log_only",
                    "status": "illustrative"
                }]
            }"#,
        )
        .unwrap();
        let loaded = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/admin/rules/reload")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(loaded.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(loaded.into_body(), usize::MAX)
            .await
            .unwrap();
        let loaded: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(loaded["rules_loaded"], 1);

        let current = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/rules")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(current.into_body(), usize::MAX)
            .await
            .unwrap();
        let current: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(current["rules"].as_array().unwrap().len(), 1);
        std::fs::remove_file(path).unwrap();
    }

    #[tokio::test]
    async fn ingested_observations_are_retrievable_with_their_data_class() {
        let app = test_app(None);
        let observation = serde_json::json!({
            "id": "a01-000001",
            "timestamp": "2026-01-01T06:00:00Z",
            "subject_id": "A-01",
            "indicator": "heart_rate",
            "value": 62.0,
            "unit": "bpm",
            "source": "SYNTHETIC_A01",
            "data_class": "synthetic",
            "context": { "mission_day": 1 },
            "quality": { "status": "valid", "flags": [] }
        });
        let ingest = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/ingest")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({ "observations": [observation] }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(ingest.status(), axum::http::StatusCode::OK);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/observations?data_class=synthetic")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["total_returned"], 1);
        assert_eq!(json["observations"][0]["data_class"], "synthetic");
        assert_eq!(json["observations"][0]["context"]["mission_day"], 1);
    }

    #[tokio::test]
    async fn csv_export_sets_content_type_and_preserves_observation_id() {
        let app = test_app(None);
        let observation = serde_json::json!({
            "id": "test-0001",
            "timestamp": "2026-01-01T06:00:00Z",
            "indicator": "heart_rate",
            "value": 62,
            "unit": "bpm",
            "source": "TEST_SOURCE",
            "data_class": "synthetic"
        });
        app.clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/ingest")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({ "observations": [observation] }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/observations/export?format=csv")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        assert_eq!(
            response.headers()[axum::http::header::CONTENT_TYPE],
            "text/csv; charset=utf-8"
        );
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        assert!(String::from_utf8(body.to_vec())
            .unwrap()
            .contains("\"test-0001\""));
    }

    #[tokio::test]
    async fn malformed_requests_return_the_standard_json_error_envelope() {
        let response = test_app(None)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/ingest")
                    .header("content-type", "application/json")
                    .body(Body::from("{"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::BAD_REQUEST);
        assert_eq!(response.headers()["content-type"], "application/json");
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let error: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(error["code"], "invalid_json");
        assert!(error["hint"].is_string());
    }

    #[tokio::test]
    async fn alert_lifecycle_is_available_to_the_dashboard() {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        irco_alerts::create_alert(
            &database,
            &Alert {
                id: "alert-0001".to_owned(),
                created_at: Utc::now(),
                subject_id: "A-01".to_owned(),
                vigilance: VigilanceLevel::Amber,
                state: AlertState::Created,
                rules_triggered: vec!["HR_THRESHOLD_001".to_owned()],
                data_quality: DataClass::Synthetic,
                justification: "Illustrative threshold".to_owned(),
                suggested_action: "Request reassessment".to_owned(),
                history: Vec::new(),
            },
        )
        .unwrap();
        let app = router(AppState::new(
            database,
            RulesDocument {
                version: "0.1.0".to_owned(),
                rules: Vec::new(),
            },
            None,
        ));
        let response = app
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri("/api/v1/alerts/alert-0001")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({
                            "state": "acknowledged",
                            "detail": "Crew acknowledged"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let alert: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(alert["state"], "acknowledged");
        assert_eq!(alert["history"][0]["detail"], "Crew acknowledged");
    }

    #[tokio::test]
    async fn mission_checkin_and_routine_are_persisted_and_observable() {
        let (app, _) = test_app_with_registry();

        let mission_resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/v1/mission")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(mission_resp.status(), axum::http::StatusCode::OK);
        let mission_body = axum::body::to_bytes(mission_resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let mission: Value = serde_json::from_slice(&mission_body).unwrap();
        assert_eq!(mission["mission_id"], "IRCO-DEMO");
        assert_eq!(mission["duration_days"], 124);
        assert_eq!(mission["crew_size"], 1);

        let routine_resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/v1/routine?subject_id=A-01&date=2026-11-15")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(routine_resp.status(), axum::http::StatusCode::OK);
        let routine_body = axum::body::to_bytes(routine_resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let routine: Value = serde_json::from_slice(&routine_body).unwrap();
        assert_eq!(routine["subject_id"], "A-01");
        assert_eq!(routine["tasks"].as_array().unwrap().len(), 4);

        let completion_resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/routine/done")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({
                            "subject_id": "A-01",
                            "task_id": "morning-vitals",
                            "completed_at": "2026-11-15T08:05:00Z"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(completion_resp.status(), StatusCode::OK);

        let routine_resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/routine?subject_id=A-01&date=2026-11-15")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let routine_body = axum::body::to_bytes(routine_resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let routine: Value = serde_json::from_slice(&routine_body).unwrap();
        assert_eq!(routine["progress"]["completed"], 1);
        assert_eq!(routine["progress"]["percentage"], 25);
        assert_eq!(routine["tasks"][0]["completed"], true);

        let events_resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/dashboard/events?subject_id=A-01&data_class=measured_real")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(events_resp.status(), StatusCode::OK);
        let mut events = events_resp.into_body().into_data_stream();

        let timestamp = Utc::now().to_rfc3339();
        let checkin_resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/checkin")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({
                            "subject_id": "A-01",
                            "indicator": "heart_rate",
                            "value": 72.0,
                            "unit": "bpm",
                            "timestamp": timestamp
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(checkin_resp.status(), StatusCode::OK);
        let checkin_body = axum::body::to_bytes(checkin_resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let checkin: Value = serde_json::from_slice(&checkin_body).unwrap();
        assert_eq!(checkin["persisted"], true);
        assert_eq!(checkin["data_class"], "measured_real");
        let event = events.next().await.unwrap().unwrap();
        let event = String::from_utf8(event.to_vec()).unwrap();
        assert!(event.contains("event: observations_updated"));
        assert!(event.contains("\"heart_rate\""));

        let observations_resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/observations?subject_id=A-01&indicator=heart_rate&data_class=measured_real")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let observations_body = axum::body::to_bytes(observations_resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let observations: Value = serde_json::from_slice(&observations_body).unwrap();
        assert_eq!(observations["total_returned"], 1);
        assert_eq!(observations["observations"][0]["value"], 72.0);
        assert_eq!(
            observations["observations"][0]["data_class"],
            "measured_real"
        );

        let dashboard_resp = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/dashboard?subject=A-01")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let dashboard_body = axum::body::to_bytes(dashboard_resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let dashboard: Value = serde_json::from_slice(&dashboard_body).unwrap();
        assert_eq!(dashboard["mode"], "real");
        assert_eq!(dashboard["data_class"], "measured_real");
        let heart_rate = dashboard["indicators"]
            .as_array()
            .unwrap()
            .iter()
            .find(|indicator| indicator["id"] == "heart_rate")
            .unwrap();
        assert_eq!(heart_rate["value"], 72.0);
        assert_eq!(heart_rate["quality"], "valid");
        assert_eq!(heart_rate["spark"], serde_json::json!([72.0]));
    }

    #[tokio::test]
    async fn empty_real_dashboard_is_unassessed_not_green_or_simulated() {
        let (app, _) = test_app_with_registry();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/dashboard?subject=A-01")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let dashboard: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(dashboard["mode"], "real");
        assert_eq!(dashboard["data_class"], "measured_real");
        assert_eq!(dashboard["global"]["level"], "no_data");
        assert_eq!(dashboard["global"]["confidence"], "not_assessed");
        assert_eq!(dashboard["data_quality"]["valid"], 0);
        assert!(dashboard["indicators"]
            .as_array()
            .unwrap()
            .iter()
            .all(|indicator| indicator["status"] == "no_data"));
        assert_eq!(
            dashboard["clinical_assessment"]["diagnoses"]
                .as_array()
                .unwrap()
                .len(),
            0
        );
    }

    #[tokio::test]
    async fn demo_replay_is_deterministic_and_labels_synthetic_data() {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let rules_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../rules/rules.json");
        let app = router(AppState::new(
            database,
            irco_decisions::rules::load_rules(rules_path).unwrap(),
            None,
        ));
        let mut responses = Vec::new();
        for day in [1, 97, 117, 124] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/api/v1/demo/replay?scenario=a01&day={day}"))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), axum::http::StatusCode::OK);
            let body = axum::body::to_bytes(response.into_body(), usize::MAX)
                .await
                .unwrap();
            responses.push(serde_json::from_slice::<Value>(&body).unwrap());
        }
        assert_eq!(responses[0]["vigilance"], "green");
        assert_eq!(responses[1]["vigilance"], "amber");
        assert_eq!(responses[2]["vigilance"], "red");
        assert_eq!(responses[3]["data_class"], "synthetic");
        assert_eq!(responses[3]["observations"][0]["value"], 108.0);
        assert_eq!(
            responses[3]["observations"]
                .as_array()
                .unwrap()
                .iter()
                .find(|observation| observation["indicator"] == "sleep_duration")
                .unwrap()["value"],
            4.2
        );
        assert!(responses[3]["disclaimer"]
            .as_str()
            .unwrap()
            .contains("Synthetic"));
    }

    #[tokio::test]
    async fn dashboard_returns_complete_a01_demo_days_without_persisting_alerts() {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let rules_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../rules/rules.json");
        let registry_path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../config/indicators/registry.toml"
        );
        let registry: IndicatorRegistry =
            toml::from_str(&std::fs::read_to_string(registry_path).unwrap()).unwrap();
        let mut state = AppState::new(
            database,
            irco_decisions::rules::load_rules(rules_path).unwrap(),
            None,
        );
        state.indicators = std::sync::Arc::new(Some(registry));
        let app = router(state);
        for (day, expected_level) in [(1, "green"), (97, "amber"), (117, "red"), (124, "red")] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/api/v1/dashboard?subject=A-01&day={day}"))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let body = axum::body::to_bytes(response.into_body(), usize::MAX)
                .await
                .unwrap();
            let dashboard: Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(dashboard["mission"]["mission_day"], day);
            assert_eq!(dashboard["global"]["level"], expected_level);
            assert_eq!(dashboard["global"]["confidence"], "low_synthetic");
            assert_eq!(dashboard["indicators"].as_array().unwrap().len(), 18);
            let active_count = dashboard["indicators"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|indicator| indicator["status"] != "no_data")
                .count();
            // The demo fills all 18 registry indicators: the UI must never
            // show a NO DATA card in demo mode.
            assert_eq!(active_count, 18);
            let heart_rate = dashboard["indicators"]
                .as_array()
                .unwrap()
                .iter()
                .find(|indicator| indicator["id"] == "heart_rate")
                .unwrap();
            assert_eq!(heart_rate["quality"], "synthetic");
            assert_eq!(heart_rate["measurement_quality"], "valid");
            assert_eq!(heart_rate["threshold_status"], "illustrative");
            let co2 = dashboard["indicators"]
                .as_array()
                .unwrap()
                .iter()
                .find(|indicator| indicator["id"] == "co2_cabin")
                .unwrap();
            // co2_cabin now carries synthetic values in the demo (420 → 850 ppm,
            // inside the 0–5000 ppm rule) — assert the real series, not absence.
            assert_eq!(co2["status"], "fresh");
            let co2_value = co2["value"].as_f64().unwrap();
            assert!((420.0..=850.0).contains(&co2_value));
            let xray = dashboard["indicators"]
                .as_array()
                .unwrap()
                .iter()
                .find(|indicator| indicator["id"] == "xray_flux_short")
                .unwrap();
            assert_eq!(xray["status"], "fresh");
            let xray_value = xray["value"].as_f64().unwrap();
            assert!((0.0..=1.0e-4).contains(&xray_value));
            assert!(dashboard["hazards"]
                .as_array()
                .unwrap()
                .iter()
                .all(|hazard| hazard["level"] == "no_data"));
            assert_eq!(dashboard["routine"]["progress"]["completed"], 0);
            assert_eq!(dashboard["routine"]["tasks"].as_array().unwrap().len(), 4);
            assert_eq!(dashboard["clinical_assessment"]["available"], false);
            assert_eq!(dashboard["services"]["engine"], "ok");
        }
    }

    #[tokio::test]
    async fn indicator_history_returns_baseline_and_thresholds() {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let rules_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../rules/rules.json");
        let registry_path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../config/indicators/registry.toml"
        );
        let registry: IndicatorRegistry =
            toml::from_str(&std::fs::read_to_string(registry_path).unwrap()).unwrap();
        let mut state = AppState::new(
            database,
            irco_decisions::rules::load_rules(rules_path).unwrap(),
            None,
        );
        state.indicators = std::sync::Arc::new(Some(registry));
        let app = router(state);

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/indicators/heart_rate/history?subject=A-01&days=30&day=30")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let history: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(history["subject_id"], "A-01");
        assert_eq!(history["indicator"], "heart_rate");
        assert_eq!(history["unit"], "bpm");
        assert_eq!(history["data_class"], "synthetic");
        assert_eq!(history["measurements"].as_array().unwrap().len(), 30);
        assert!(history["baseline"].is_object());
        assert_eq!(history["baseline"]["sample_count"], 30);
        assert!(history["thresholds"]["reference_min"].as_f64().unwrap() <= 50.0);
        assert!(history["thresholds"]["reference_max"].as_f64().unwrap() >= 100.0);
        assert_eq!(history["data_quality"]["valid"], 30);
    }

    #[tokio::test]
    async fn scientific_search_returns_source_citations() {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let state = AppState::new(
            database,
            RulesDocument {
                version: "0.1.0".to_owned(),
                rules: Vec::new(),
            },
            None,
        )
        .with_knowledge(KnowledgeBase::from_entries(vec![CorpusEntry {
            id: "nasa-radiation-01".to_owned(),
            title: "Radiation risks".to_owned(),
            source: "NASA HRP".to_owned(),
            section: "Exposure".to_owned(),
            url: "https://example.test/nasa/radiation".to_owned(),
            content: "Radiation dose monitoring supports risk assessment.".to_owned(),
            evidence_kind: EvidenceKind::CuratedSummary,
            hazard: Some("radiation".to_owned()),
            indicators_related: vec!["radiation_dose_daily".to_owned()],
            organ_systems: Vec::new(),
            document_date: Some("2025-01-01".to_owned()),
            extraction_date: Some("2026-01-01T00:00:00Z".to_owned()),
            page_numbers: Some("4".to_owned()),
            confidence: Some("supported".to_owned()),
        }]));
        let response = router(state)
            .oneshot(
                Request::builder()
                    .uri("/api/v1/knowledge/search?q=radiation&indicator=radiation_dose_daily")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let result: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            result["hits"][0]["citation"]["document_id"],
            "nasa-radiation-01"
        );
        assert_eq!(
            result["hits"][0]["citation"]["url"],
            "https://example.test/nasa/radiation"
        );
        assert_eq!(result["hits"][0]["citation"]["document_date"], "2025-01-01");
        assert_eq!(result["hits"][0]["evidence_kind"], "curated_summary");
    }

    #[tokio::test]
    async fn knowledge_sources_lists_every_citable_document() {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let entry = |id: &str, url: &str| CorpusEntry {
            id: id.to_owned(),
            title: format!("Title {id}"),
            source: "NASA HRP".to_owned(),
            section: "Exposure".to_owned(),
            url: url.to_owned(),
            content: "Curated summary.".to_owned(),
            evidence_kind: EvidenceKind::CuratedSummary,
            hazard: Some("radiation".to_owned()),
            indicators_related: vec!["radiation_dose_daily".to_owned()],
            organ_systems: Vec::new(),
            document_date: None,
            extraction_date: None,
            page_numbers: None,
            confidence: None,
        };
        let state = AppState::new(
            database,
            RulesDocument {
                version: "0.1.0".to_owned(),
                rules: Vec::new(),
            },
            None,
        )
        .with_knowledge(KnowledgeBase::from_entries(vec![
            entry("nasa-radiation-01", "https://example.test/nasa/radiation"),
            entry("csa-radiation-02", "https://example.test/csa/radiation"),
        ]));
        let response = router(state)
            .oneshot(
                Request::builder()
                    .uri("/api/v1/knowledge/sources")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let result: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(result["documents"], 2);
        let sources = result["sources"].as_array().unwrap();
        assert_eq!(sources.len(), 2);
        assert_eq!(sources[0]["id"], "nasa-radiation-01");
        assert_eq!(sources[0]["publisher"], "NASA HRP");
        assert_eq!(sources[0]["url"], "https://example.test/nasa/radiation");
        assert_eq!(sources[1]["id"], "csa-radiation-02");
    }

    #[tokio::test]
    async fn assistant_fallback_always_discloses_missing_sources_and_limits() {
        let response = test_app(None)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/assistant/chat")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({"question": "Why is sleep relevant?"}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let answer: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(answer["source_not_found"], true);
        assert_eq!(answer["disclaimer"], "Decision support, not a diagnosis.");
        assert!(answer["answer"]
            .as_str()
            .unwrap()
            .contains("Source not found"));
    }

    #[tokio::test]
    async fn assistant_requires_health_context_fields_as_a_pair() {
        let response = test_app(None)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/assistant/chat")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({
                            "question": "Explain the evidence",
                            "subject_id": "crew-01"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let error: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(error["code"], "invalid_health_context");
    }

    #[tokio::test]
    async fn assistant_uses_only_an_unexpired_registered_chat_session() {
        let database = Connection::open_in_memory().unwrap();
        let mut state = AppState::new(
            database,
            RulesDocument {
                version: "test".to_owned(),
                rules: Vec::new(),
            },
            None,
        );
        *state.colab_session.lock().unwrap() = Some(ColabSession {
            session_id: "session-01".to_owned(),
            heartbeat_token: "private-token".to_owned(),
            api_base: "https://colab.example.test/v1".to_owned(),
            api_key: "private-key".to_owned(),
            model: "qwen-test".to_owned(),
            capabilities: ColabCapabilities {
                chat: true,
                asr: false,
                tts: false,
                vision: false,
                vlm: false,
                image: false,
                multi: false,
                streaming: false,
            },
            last_heartbeat: Instant::now(),
        });
        assert_eq!(
            state.active_colab_endpoint().await.map_err(|_| ()).unwrap(),
            Some((
                "https://colab.example.test/v1".to_owned(),
                "private-key".to_owned(),
                "qwen-test".to_owned(),
            ))
        );
        state.colab_ttl = Duration::ZERO;
        assert_eq!(
            state.active_colab_endpoint().await.map_err(|_| ()).unwrap(),
            None
        );
        assert!(state.colab_session.lock().unwrap().is_none());
    }

    #[tokio::test]
    async fn ingestion_rejects_indicators_outside_the_loaded_registry() {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let app = router(
            AppState::new(
                database,
                RulesDocument {
                    version: "0.1.0".to_owned(),
                    rules: Vec::new(),
                },
                None,
            )
            .with_registry(IndicatorRegistry {
                indicators: vec![IndicatorEntry {
                    id: "heart_rate".to_owned(),
                    name: "Heart rate".to_owned(),
                    family: "cardiovascular".to_owned(),
                    unit: "bpm".to_owned(),
                    collection_method: "wearable_sensor".to_owned(),
                    expected_frequency: "daily".to_owned(),
                    sources: vec!["SYNTHETIC_A01".to_owned()],
                    reference_min: None,
                    reference_max: None,
                    reference_source: None,
                    reference_status: Some("illustrative".to_owned()),
                    scientific_refs: Vec::new(),
                }],
            }),
        );
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/ingest")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({
                            "observations": [{
                                "id": "test-0001",
                                "timestamp": "2026-01-01T06:00:00Z",
                                "indicator": "unknown_metric",
                                "value": 1,
                                "unit": "score",
                                "source": "TEST_SOURCE",
                                "data_class": "synthetic"
                            }]
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            axum::http::StatusCode::UNPROCESSABLE_ENTITY
        );
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let error: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(error["code"], "unknown_indicator");
    }

    #[tokio::test]
    async fn health_state_returns_temporal_trend_for_one_data_class() {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let make_observation = |id: &str, timestamp: &str, value: f64, class: &str| {
            serde_json::json!({
                "id": id,
                "timestamp": timestamp,
                "subject_id": "A-01",
                "indicator": "heart_rate",
                "value": value,
                "unit": "bpm",
                "source": "SYNTHETIC_A01",
                "data_class": class,
                "quality": { "status": "valid", "flags": [] }
            })
        };
        let observations = [
            make_observation("a01-000001", "2026-01-01T06:00:00Z", 60.0, "synthetic"),
            make_observation("a01-000002", "2026-01-02T06:00:00Z", 62.0, "synthetic"),
            make_observation("analog-0001", "2026-01-01T06:00:00Z", 100.0, "analog"),
        ];
        let rows: Vec<Observation> = observations
            .iter()
            .map(|value| serde_json::from_value(value.clone()).unwrap())
            .collect();
        let mut connection = database;
        irco_data::ingest::ingest_batch(&mut connection, &rows).unwrap();
        let app = router(AppState::new(
            connection,
            RulesDocument {
                version: "0.1.0".to_owned(),
                rules: Vec::new(),
            },
            None,
        ));
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/state/A-01?data_class=synthetic")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let state: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(state["indicators"]["heart_rate"]["latest"], 62.0);
        assert_eq!(state["indicators"]["heart_rate"]["trend"], "rising");
        assert_eq!(state["data_class"], "synthetic");

        let overview = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/state?data_class=analog")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(overview.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(overview.into_body(), usize::MAX)
            .await
            .unwrap();
        let overview: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(overview["data_class"], "analog");
        assert_eq!(overview["subjects"].as_array().unwrap().len(), 1);
        assert_eq!(
            overview["subjects"][0]["indicators"]["heart_rate"]["latest"],
            100.0
        );

        let missing_class = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/state")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(missing_class.status(), axum::http::StatusCode::BAD_REQUEST);
        let body = axum::body::to_bytes(missing_class.into_body(), usize::MAX)
            .await
            .unwrap();
        let error: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(error["code"], "data_class_required");
    }

    #[tokio::test]
    async fn persistent_deviation_creates_alert_after_consecutive_measurements() {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let rule = DecisionRule {
            rule_id: "HR_PERSISTENT_001".to_owned(),
            indicator: "heart_rate".to_owned(),
            condition: RuleCondition {
                kind: "persistent_deviation".to_owned(),
                params: serde_json::from_value(serde_json::json!({
                    "window_days": 7,
                    "persistence_count": 3,
                    "deviation_percent": 20,
                    "deviation_direction": "above"
                }))
                .unwrap(),
            },
            context_required: vec!["individual_baseline".to_owned()],
            data_class_filter: vec![DataClass::Synthetic],
            vigilance_level: Some(VigilanceLevel::Red),
            action: "request_reassessment".to_owned(),
            justification_template: None,
            scientific_reference: Some("Illustrative synthetic test rule".to_owned()),
            status: RuleStatus::Illustrative,
            enabled: true,
            priority: 80,
        };
        let prior_rows: Vec<Observation> = (1_u32..=2)
            .map(|day| {
                serde_json::from_value(serde_json::json!({
                    "id": format!("a01-00000{day}"),
                    "timestamp": format!("2026-01-0{day}T00:00:00Z"),
                    "subject_id": "A-01",
                    "indicator": "heart_rate",
                    "value": 72.0 + f64::from(day),
                    "unit": "bpm",
                    "source": "SYNTHETIC_A01",
                    "data_class": "synthetic",
                    "context": { "individual_baseline": 60.0 },
                    "quality": { "status": "valid", "flags": [] }
                }))
                .unwrap()
            })
            .collect();
        let mut database = database;
        irco_data::ingest::ingest_batch(&mut database, &prior_rows).unwrap();
        let app = router(AppState::new(
            database,
            RulesDocument {
                version: "0.1.0".to_owned(),
                rules: vec![rule],
            },
            None,
        ));
        let current = serde_json::json!({
            "id": "a01-000003",
            "timestamp": "2026-01-03T00:00:00Z",
            "subject_id": "A-01",
            "indicator": "heart_rate",
            "value": 78.0,
            "unit": "bpm",
            "source": "SYNTHETIC_A01",
            "data_class": "synthetic",
            "context": { "individual_baseline": 60.0 },
            "quality": { "status": "valid", "flags": [] }
        });
        let ingest = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/ingest")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({ "observations": [current] }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(ingest.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(ingest.into_body(), usize::MAX)
            .await
            .unwrap();
        let response: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(response["alerts_created"], 1);
        let alerts = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/alerts?subject_id=A-01")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(alerts.into_body(), usize::MAX)
            .await
            .unwrap();
        let alerts: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            alerts["alerts"][0]["rules_triggered"][0],
            "HR_PERSISTENT_001"
        );
        assert!(alerts["alerts"][0]["justification"]
            .as_str()
            .unwrap()
            .contains("consecutive_deviations=3"));
    }

    #[tokio::test]
    async fn trend_rule_creates_evidence_backed_persistent_alert() {
        let database = Connection::open_in_memory().unwrap();
        irco_data::store::init_db(&database).unwrap();
        irco_alerts::init_db(&database).unwrap();
        let rule = DecisionRule {
            rule_id: "HR_TREND_001".to_owned(),
            indicator: "heart_rate".to_owned(),
            condition: RuleCondition {
                kind: "trend_slope".to_owned(),
                params: serde_json::from_value(serde_json::json!({
                    "window_days": 7,
                    "min_samples": 3,
                    "slope_threshold": 2.0
                }))
                .unwrap(),
            },
            context_required: Vec::new(),
            data_class_filter: vec![DataClass::Synthetic],
            vigilance_level: Some(VigilanceLevel::Amber),
            action: "request_reassessment".to_owned(),
            justification_template: None,
            scientific_reference: Some("Illustrative synthetic test rule".to_owned()),
            status: RuleStatus::Illustrative,
            enabled: true,
            priority: 55,
        };
        let prior_rows: Vec<Observation> = (1_u32..=2)
            .map(|day| {
                serde_json::from_value(serde_json::json!({
                    "id": format!("a01-00000{day}"),
                    "timestamp": format!("2026-01-0{day}T00:00:00Z"),
                    "subject_id": "A-01",
                    "indicator": "heart_rate",
                    "value": 60.0 + 2.0 * f64::from(day - 1),
                    "unit": "bpm",
                    "source": "SYNTHETIC_A01",
                    "data_class": "synthetic",
                    "context": { "activity": "rest" },
                    "quality": { "status": "valid", "flags": [] }
                }))
                .unwrap()
            })
            .collect();
        let mut database = database;
        irco_data::ingest::ingest_batch(&mut database, &prior_rows).unwrap();
        let app = router(AppState::new(
            database,
            RulesDocument {
                version: "0.1.0".to_owned(),
                rules: vec![rule],
            },
            None,
        ));
        let current = serde_json::json!({
            "id": "a01-000003",
            "timestamp": "2026-01-03T00:00:00Z",
            "subject_id": "A-01",
            "indicator": "heart_rate",
            "value": 64.0,
            "unit": "bpm",
            "source": "SYNTHETIC_A01",
            "data_class": "synthetic",
            "context": { "activity": "rest" },
            "quality": { "status": "valid", "flags": [] }
        });
        let ingest = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/ingest")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({ "observations": [current.clone()] }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(ingest.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(ingest.into_body(), usize::MAX)
            .await
            .unwrap();
        let response: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(response["alerts_created"], 1);

        let retry = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/ingest")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({ "observations": [current] }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(retry.into_body(), usize::MAX)
            .await
            .unwrap();
        let retry: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(retry["duplicates_skipped"], 1);
        assert_eq!(retry["alerts_created"], 0);

        let alerts = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/alerts?subject_id=A-01")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(alerts.into_body(), usize::MAX)
            .await
            .unwrap();
        let alerts: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(alerts["alerts"][0]["rules_triggered"][0], "HR_TREND_001");
        assert!(alerts["alerts"][0]["justification"]
            .as_str()
            .unwrap()
            .contains("slope=2.0000"));

        let state = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/state/A-01?data_class=synthetic")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(state.into_body(), usize::MAX)
            .await
            .unwrap();
        let state: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(state["supported_vigilance"], "amber");
        assert_eq!(state["alerts"][0]["rules_triggered"][0], "HR_TREND_001");
    }
}
