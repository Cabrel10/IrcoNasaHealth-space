use irco_api::AppState;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let db_path = std::env::var("IRCO_DATABASE_PATH").unwrap_or_else(|_| "data/irco.db".to_owned());
    let rules_path =
        std::env::var("IRCO_RULES_PATH").unwrap_or_else(|_| "rules/rules.json".to_owned());
    let token = std::env::var("IRCO_API_TOKEN").ok();
    let state = match AppState::from_paths(&db_path, &rules_path, token) {
        Ok(state) => state,
        Err(error) => {
            eprintln!("IRCO startup failed: {error}");
            std::process::exit(1);
        }
    };
    let host = std::env::var("IRCO_HOST").unwrap_or_else(|_| "127.0.0.1".to_owned());
    let port = std::env::var("IRCO_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(3080);
    let address = format!("{host}:{port}");
    let listener = match tokio::net::TcpListener::bind(&address).await {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("IRCO could not bind to {address}: {error}");
            std::process::exit(1);
        }
    };
    tracing::info!(%address, "IRCO API listening");
    if let Err(error) = axum::serve(listener, irco_api::router(state)).await {
        eprintln!("IRCO API stopped unexpectedly: {error}");
        std::process::exit(1);
    }
}
