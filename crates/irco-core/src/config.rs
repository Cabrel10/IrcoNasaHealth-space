use serde::Deserialize;

/// Application configuration loaded from config/app.toml
#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub limits: LimitsConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub log_level: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LimitsConfig {
    pub max_observations_per_query: usize,
    pub max_export_rows: usize,
}

impl AppConfig {
    /// Load configuration from a TOML file
    pub fn load(path: &str) -> Result<Self, crate::IrcoError> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| crate::IrcoError::Config(format!("Failed to read {path}: {e}")))?;
        toml::from_str(&content)
            .map_err(|e| crate::IrcoError::Config(format!("Failed to parse {path}: {e}")))
    }
}
