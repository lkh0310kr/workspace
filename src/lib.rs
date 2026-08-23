use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use base64::{Engine, engine::general_purpose::STANDARD};
use browser_host::BrowserHost;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use workspace_core::Workspace;

mod browser_host;

pub struct AppState {
    pub workspace: Mutex<Workspace>,
    watcher: Mutex<Option<RecommendedWatcher>>,
    watch_tx: Mutex<Option<WatchSender>>,
}

#[derive(Default, Serialize, Deserialize)]
struct AppConfig {
    root_path: Option<String>,
}

// Not going through `app.path().app_config_dir()`: that needs a running
// `AppHandle`, only available inside `.setup()` — by which point
// `Workspace::new()` (and the first tab/terminal it spawns) has already
// run with whatever default root_path we gave it. Resolving this by hand
// lets the persisted path be loaded *before* constructing the Workspace
// at all, so the very first terminal already opens in the right place
// instead of needing a second, later correction.
fn config_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("workspace-app")
            .join("config.json"),
    )
}

fn load_config() -> AppConfig {
    config_path()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path().ok_or("no HOME set")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let contents = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(path, contents).map_err(|e| e.to_string())
}

/// Sibling of `config_path()` — persists tabs/layout/per-tab root paths
/// (not just the single default root `AppConfig` holds) so a relaunch (an
/// app update/rebuild included) restores the same tabs with the same
/// terminal ids, which is what lets each terminal's tmux session (see
/// `TerminalSession::new`) reattach to its own previous session instead
/// of starting fresh.
fn workspace_snapshot_path() -> Option<PathBuf> {
    config_path()?
        .parent()
        .map(|dir| dir.join("workspace.json"))
}

fn load_workspace_snapshot() -> Option<workspace_core::WorkspaceState> {
    let path = workspace_snapshot_path()?;
    let contents = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

fn save_workspace_snapshot(snapshot: &workspace_core::WorkspaceState) {
    let Some(path) = workspace_snapshot_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(contents) = serde_json::to_string_pretty(snapshot) {
        let _ = std::fs::write(path, contents);
    }
}

/// Registers every tab's root_path with the asset-protocol scope so
/// `convertFileSrc` can load local images referenced from Markdown —
/// the scope defaults to empty (`tauri.conf.json`'s `assetProtocol.scope`
/// is `[]`) since tab roots are arbitrary, user-chosen directories picked
/// at runtime, not something knowable at build time. `allow_directory` is
/// purely additive and safe to call repeatedly with the same path, so
/// this is just re-run on every workspace-state change rather than
/// tracked against which roots are already scoped.
fn allow_asset_scope(app: &AppHandle, state: &workspace_core::WorkspaceState) {
    let scope = app.asset_protocol_scope();
    for tab in &state.tabs {
        let _ = scope.allow_directory(&tab.root_path, true);
    }
}

#[derive(Clone, Serialize)]
struct PtyOutputPayload {
    id: u32,
    data_b64: String,
}

#[tauri::command]
fn get_workspace_state(state: State<'_, Arc<AppState>>) -> workspace_core::WorkspaceState {
    state.workspace.lock().state()
}

// `scutil --get ComputerName` is macOS's own display name (what tmux's
// status bar used to show, e.g. "Kanghyunui-MacBookPro") — falls back to
// the POSIX hostname (`hostname -s`, drops the .local suffix) since
// ComputerName can be empty/unset on a machine that never had it
// customized in System Settings.
#[tauri::command]
fn hostname() -> String {
    let run = |cmd: &str, args: &[&str]| -> Option<String> {
        let out = std::process::Command::new(cmd).args(args).output().ok()?;
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        (!s.is_empty()).then_some(s)
    };
    run("scutil", &["--get", "ComputerName"])
        .or_else(|| run("hostname", &["-s"]))
        .unwrap_or_else(|| "localhost".to_string())
}

fn app_support_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("workspace-app"),
    )
}

/// Claude Code (≥2.1.80) pipes a JSON payload containing `rate_limits` to
/// whatever command `statusLine.command` names in `~/.claude/settings.json`,
/// once per turn — the only way to get the CLI's own real usage-window
/// percentages (not derivable from the local transcripts the way token/cost
/// is). Only one statusLine command can exist at a time, and this user's
/// was already pointed at ref-proj/orca's own statusline hook (confirmed by
/// reading `~/.claude/settings.json` directly, not assumed) — overwriting
/// it outright would silently break Orca's own usage tracking if they use
/// it. So this installs a wrapper that tees the payload to our own file
/// *and* forwards it unchanged to whatever command was already configured,
/// preserving that behavior exactly. Idempotent: if `statusLine.command`
/// already invokes our wrapper (i.e. this already ran once), does nothing
/// — otherwise a second run would capture our own wrapper as the "original"
/// command and wrap it around itself.
fn install_claude_statusline_hook() {
    let Some(dir) = app_support_dir() else { return };
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let wrapper_path = dir.join("claude-statusline.sh");
    let orig_cmd_path = dir.join("claude-statusline-orig-command.sh");
    let wrapper_path_str = wrapper_path.to_string_lossy().to_string();

    let Some(home) = std::env::var_os("HOME") else { return };
    let settings_path = PathBuf::from(&home).join(".claude").join("settings.json");
    let Ok(contents) = std::fs::read_to_string(&settings_path) else { return };
    let Ok(mut settings) = serde_json::from_str::<serde_json::Value>(&contents) else { return };

    let existing_command = settings
        .get("statusLine")
        .and_then(|s| s.get("command"))
        .and_then(|c| c.as_str())
        .unwrap_or("");
    if existing_command.contains(&wrapper_path_str) {
        return;
    }

    // Preserve whatever was already configured (Orca's hook, a user's own
    // script, or nothing) so the wrapper can chain to it unchanged.
    let _ = std::fs::write(&orig_cmd_path, existing_command);

    let json_path = dir.join("claude-statusline.json");
    let wrapper_script = format!(
        "#!/bin/sh\npayload=$(cat)\ncase \"$payload\" in\n  *'\"rate_limits\"'*)\n    printf '%s' \"$payload\" > {json:?}\n    ;;\nesac\nif [ -s {orig:?} ]; then\n  printf '%s' \"$payload\" | sh -c \"$(cat {orig:?})\"\nfi\n",
        json = json_path.to_string_lossy(),
        orig = orig_cmd_path.to_string_lossy(),
    );
    if std::fs::write(&wrapper_path, wrapper_script).is_err() {
        return;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&wrapper_path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o755);
            let _ = std::fs::set_permissions(&wrapper_path, perms);
        }
    }

    let new_command = format!("sh {wrapper_path_str:?}");
    let Some(obj) = settings.as_object_mut() else { return };
    obj.insert(
        "statusLine".to_string(),
        serde_json::json!({ "type": "command", "command": new_command }),
    );
    if let Ok(pretty) = serde_json::to_string_pretty(&settings) {
        let _ = std::fs::write(&settings_path, pretty);
    }
}

#[derive(Serialize, Default)]
struct ClaudeUsage {
    input_tokens: u64,
    output_tokens: u64,
    cache_read_tokens: u64,
    cache_creation_tokens: u64,
    total_tokens: u64,
    cost_usd: f64,
}

struct ModelPricing {
    input: f64,
    output: f64,
    cache_read: f64,
    cache_write: f64,
    /// Sonnet bills a higher rate past 200K input tokens in a single
    /// request; `None` for models that bill their whole context flat.
    long_context_above_200k: Option<(f64, f64, f64, f64)>,
}

// Ported from ref-proj/orca's `claude-model-pricing.ts` (`MODEL_PRICING` +
// `normalizeModelForPricing`) rather than hand-rolled — that implementation
// is already shipped/validated against real Claude Code transcripts,
// including the model-id normalization (dotted/dashed, "-thinking" suffix
// variants) and Sonnet's >200K-token tiered rate. Standard (non-intro)
// per-1M-token USD pricing.
fn model_pricing(model: &str) -> Option<ModelPricing> {
    let m = model.to_lowercase();
    let m = m.strip_prefix("anthropic/").unwrap_or(&m);
    let m = m.strip_prefix("anthropic:").unwrap_or(m);
    let has_version = |family: &str, version: &str| {
        let needle = format!("{family}-{version}");
        m.contains(&needle) && {
            let rest = &m[m.find(&needle).unwrap() + needle.len()..];
            rest.is_empty() || !rest.starts_with(|c: char| c.is_ascii_digit())
        }
    };
    let sonnet_long_context = Some((6.0, 22.5, 0.6, 7.5));

    if has_version("fable", "5") || has_version("mythos", "5") {
        return Some(ModelPricing { input: 10.0, output: 50.0, cache_read: 1.0, cache_write: 12.5, long_context_above_200k: None });
    }
    if has_version("opus", "5")
        || has_version("opus", "4-8")
        || has_version("opus", "4-7")
        || has_version("opus", "4-6")
        || has_version("opus", "4-5")
        || m.contains("opus-4")
    {
        return Some(ModelPricing { input: 5.0, output: 25.0, cache_read: 0.5, cache_write: 6.25, long_context_above_200k: None });
    }
    if has_version("sonnet", "5")
        || has_version("sonnet", "4-6")
        || has_version("sonnet", "4-5")
        || m.contains("sonnet-4")
        || m.contains("sonnet-3-7")
        || m.contains("sonnet-3.7")
    {
        return Some(ModelPricing { input: 3.0, output: 15.0, cache_read: 0.3, cache_write: 3.75, long_context_above_200k: sonnet_long_context });
    }
    if m.contains("sonnet-3-5") || m.contains("sonnet-3.5") || m.contains("3-5-sonnet") || m.contains("3.5-sonnet") {
        return Some(ModelPricing { input: 3.0, output: 15.0, cache_read: 0.3, cache_write: 3.75, long_context_above_200k: None });
    }
    if m.contains("haiku-4-5") {
        return Some(ModelPricing { input: 1.0, output: 5.0, cache_read: 0.1, cache_write: 1.25, long_context_above_200k: None });
    }
    if m.contains("haiku-3-5") || m.contains("haiku-3.5") || m.contains("3-5-haiku") || m.contains("3.5-haiku") {
        return Some(ModelPricing { input: 0.8, output: 4.0, cache_read: 0.08, cache_write: 1.0, long_context_above_200k: None });
    }
    if m.contains("haiku-3") {
        return Some(ModelPricing { input: 0.25, output: 1.25, cache_read: 0.03, cache_write: 0.3, long_context_above_200k: None });
    }
    None
}

fn tiered_cost(tokens: u64, base_price: f64, above: Option<f64>, threshold: u64) -> f64 {
    match above {
        Some(above_price) => {
            let below = tokens.min(threshold) as f64;
            let above_tokens = tokens.saturating_sub(threshold) as f64;
            below * base_price + above_tokens * above_price
        }
        None => tokens as f64 * base_price,
    }
}

fn estimate_cost_usd(model: &str, input: u64, output: u64, cache_read: u64, cache_write: u64) -> f64 {
    let Some(p) = model_pricing(model) else {
        return 0.0;
    };
    const THRESHOLD: u64 = 200_000;
    let (in_above, out_above, read_above, write_above) = match p.long_context_above_200k {
        Some((i, o, r, w)) => (Some(i), Some(o), Some(r), Some(w)),
        None => (None, None, None, None),
    };
    (tiered_cost(input, p.input, in_above, THRESHOLD)
        + tiered_cost(output, p.output, out_above, THRESHOLD)
        + tiered_cost(cache_read, p.cache_read, read_above, THRESHOLD)
        + tiered_cost(cache_write, p.cache_write, write_above, THRESHOLD))
        / 1_000_000.0
}

#[derive(Default, Clone)]
struct ClaudeUsageTurn {
    input_tokens: u64,
    output_tokens: u64,
    cache_read_tokens: u64,
    cache_write_tokens: u64,
    model: String,
}

// Claude Code writes one JSONL transcript per session under
// `~/.claude/projects/<project>/<session>.jsonl`; each `type: "assistant"`
// line carries a `message.usage` object with real per-request token counts
// — confirmed by reading actual transcript files on this machine, not
// assumed. Ported dedupe logic from ref-proj/orca's
// `transcript-record-parser.ts`: Claude Code streams repeated assistant
// rows sharing the same `message.id`+`requestId` (or `uuid` if those are
// missing) as a turn's usage is refined — summing every line here would
// double/triple-count the same turn's tokens, so keep only the max seen
// per dedupe key, matching their comment on why it must be max not sum.
//
// Scans the last 24h rather than "today" specifically to avoid needing a
// timezone-aware calendar-date crate for what's meant to be an
// approximate local figure, not a billing-accurate one.
#[tauri::command]
fn claude_code_usage_recent() -> ClaudeUsage {
    let mut usage = ClaudeUsage::default();
    let Some(home) = std::env::var_os("HOME") else {
        return usage;
    };
    let projects_dir = PathBuf::from(home).join(".claude").join("projects");
    let Ok(project_entries) = std::fs::read_dir(&projects_dir) else {
        return usage;
    };

    // ISO8601 UTC ("...Z") sorts lexicographically in chronological
    // order — a plain string compare against the transcripts' own
    // timestamp format is enough, no date/time crate needed.
    let Ok(cutoff_out) = std::process::Command::new("date")
        .args(["-u", "-v-24H", "+%Y-%m-%dT%H:%M:%SZ"])
        .output()
    else {
        return usage;
    };
    let cutoff = String::from_utf8_lossy(&cutoff_out.stdout).trim().to_string();
    if cutoff.is_empty() {
        return usage;
    }
    let mtime_cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(48 * 60 * 60);

    let mut turns_by_key: std::collections::HashMap<String, ClaudeUsageTurn> =
        std::collections::HashMap::new();
    let mut unkeyed_turns: Vec<ClaudeUsageTurn> = Vec::new();

    for project_entry in project_entries.flatten() {
        let project_path = project_entry.path();
        if !project_path.is_dir() {
            continue;
        }
        let Ok(files) = std::fs::read_dir(&project_path) else {
            continue;
        };
        for file_entry in files.flatten() {
            let file_path = file_entry.path();
            if file_path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            // Cheap pre-filter before opening/parsing: a file untouched
            // in 48h can't contain anything from the last 24h.
            if let Ok(modified) = file_entry.metadata().and_then(|m| m.modified()) {
                if modified < mtime_cutoff {
                    continue;
                }
            }
            let Ok(content) = std::fs::read_to_string(&file_path) else {
                continue;
            };
            for line in content.lines() {
                let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
                    continue;
                };
                if v.get("type").and_then(|t| t.as_str()) != Some("assistant") {
                    continue;
                }
                let is_recent = v
                    .get("timestamp")
                    .and_then(|t| t.as_str())
                    .is_some_and(|ts| ts >= cutoff.as_str());
                if !is_recent {
                    continue;
                }
                let message = v.get("message");
                let Some(u) = message.and_then(|m| m.get("usage")) else {
                    continue;
                };
                let get = |key: &str| u.get(key).and_then(|x| x.as_u64()).unwrap_or(0);
                let turn = ClaudeUsageTurn {
                    input_tokens: get("input_tokens"),
                    output_tokens: get("output_tokens"),
                    cache_read_tokens: get("cache_read_input_tokens"),
                    cache_write_tokens: get("cache_creation_input_tokens"),
                    model: message
                        .and_then(|m| m.get("model"))
                        .and_then(|m| m.as_str())
                        .unwrap_or("")
                        .to_string(),
                };
                if turn.input_tokens + turn.output_tokens + turn.cache_read_tokens + turn.cache_write_tokens == 0 {
                    continue;
                }

                let message_id = message.and_then(|m| m.get("id")).and_then(|x| x.as_str());
                let request_id = v.get("requestId").and_then(|x| x.as_str());
                let uuid = v.get("uuid").and_then(|x| x.as_str());
                let dedupe_key = match (message_id, request_id, uuid) {
                    (Some(mid), Some(rid), _) => Some(format!("{mid}:{rid}")),
                    (Some(mid), None, _) => Some(format!("msg:{mid}")),
                    (None, _, Some(u)) => Some(format!("uuid:{u}")),
                    _ => None,
                };

                match dedupe_key {
                    Some(key) => {
                        let entry = turns_by_key.entry(key).or_default();
                        entry.input_tokens = entry.input_tokens.max(turn.input_tokens);
                        entry.output_tokens = entry.output_tokens.max(turn.output_tokens);
                        entry.cache_read_tokens = entry.cache_read_tokens.max(turn.cache_read_tokens);
                        entry.cache_write_tokens = entry.cache_write_tokens.max(turn.cache_write_tokens);
                        entry.model = turn.model;
                    }
                    None => unkeyed_turns.push(turn),
                }
            }
        }
    }

    for turn in turns_by_key.into_values().chain(unkeyed_turns) {
        usage.input_tokens += turn.input_tokens;
        usage.output_tokens += turn.output_tokens;
        usage.cache_read_tokens += turn.cache_read_tokens;
        usage.cache_creation_tokens += turn.cache_write_tokens;
        usage.total_tokens +=
            turn.input_tokens + turn.output_tokens + turn.cache_read_tokens + turn.cache_write_tokens;
        usage.cost_usd += estimate_cost_usd(
            &turn.model,
            turn.input_tokens,
            turn.output_tokens,
            turn.cache_read_tokens,
            turn.cache_write_tokens,
        );
    }
    usage
}

#[derive(Serialize, Default)]
struct ClaudeRateLimitWindow {
    used_percent: f64,
    resets_at: Option<i64>,
}

#[derive(Serialize, Default)]
struct ClaudeRateLimitStatus {
    five_hour: Option<ClaudeRateLimitWindow>,
    seven_day: Option<ClaudeRateLimitWindow>,
}

fn parse_rate_limit_window(v: &serde_json::Value) -> Option<ClaudeRateLimitWindow> {
    let used_percent = v
        .get("used_percentage")
        .and_then(|x| x.as_f64())
        .or_else(|| v.get("utilization").and_then(|x| x.as_f64()))?;
    let resets_at = v.get("resets_at").and_then(|x| x.as_i64());
    Some(ClaudeRateLimitWindow { used_percent, resets_at })
}

// Reads the file `install_claude_statusline_hook`'s wrapper script writes
// on every Claude Code turn. Stale (no `claude` session run recently, or
// the hook never fired yet this launch) simply reads as "no data" — the
// frontend already handles a null/absent status the same way as the
// token/cost estimate having nothing to show yet.
#[tauri::command]
fn claude_rate_limit_status() -> ClaudeRateLimitStatus {
    let mut status = ClaudeRateLimitStatus::default();
    let Some(dir) = app_support_dir() else {
        return status;
    };
    let Ok(contents) = std::fs::read_to_string(dir.join("claude-statusline.json")) else {
        return status;
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&contents) else {
        return status;
    };
    let Some(rate_limits) = v.get("rate_limits") else {
        return status;
    };
    status.five_hour = rate_limits.get("five_hour").and_then(parse_rate_limit_window);
    status.seven_day = rate_limits.get("seven_day").and_then(parse_rate_limit_window);
    status
}

#[derive(Serialize, Default)]
struct CursorUsageStatus {
    auto_percent_used: Option<f64>,
    api_percent_used: Option<f64>,
    total_percent_used: Option<f64>,
    billing_cycle_end_ms: Option<i64>,
}

fn cursor_state_db_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    #[cfg(target_os = "macos")]
    {
        return Some(
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("Cursor")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb"),
        );
    }
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var_os("APPDATA")?;
        return Some(
            PathBuf::from(appdata)
                .join("Cursor")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb"),
        );
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Some(
            PathBuf::from(home)
                .join(".config")
                .join("Cursor")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb"),
        )
    }
}

fn cursor_access_token() -> Option<String> {
    let db_path = cursor_state_db_path()?;
    let output = std::process::Command::new("sqlite3")
        .arg(&db_path)
        .arg("SELECT value FROM ItemTable WHERE key='cursorAuth/accessToken' LIMIT 1;")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if token.is_empty() {
        None
    } else {
        Some(token)
    }
}

// Reads Cursor's billing-cycle usage from the same DashboardService RPC the
// Cursor IDE dashboard calls, authenticated with the access token Cursor
// already stored in its local state.vscdb — no API key needed.
#[tauri::command]
fn cursor_usage_status() -> CursorUsageStatus {
    let mut status = CursorUsageStatus::default();
    let Some(token) = cursor_access_token() else {
        return status;
    };
    let output = std::process::Command::new("curl")
        .args([
            "-sS",
            "--max-time",
            "10",
            "-X",
            "POST",
            "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage",
            "-H",
            &format!("Authorization: Bearer {token}"),
            "-H",
            "Content-Type: application/json",
            "-d",
            "{}",
        ])
        .output();
    let Ok(output) = output else {
        return status;
    };
    if !output.status.success() {
        return status;
    }
    let Ok(body) = serde_json::from_slice::<serde_json::Value>(&output.stdout) else {
        return status;
    };
    let plan_usage = body.get("planUsage");
    status.auto_percent_used = plan_usage
        .and_then(|v| v.get("autoPercentUsed"))
        .and_then(|v| v.as_f64());
    status.api_percent_used = plan_usage
        .and_then(|v| v.get("apiPercentUsed"))
        .and_then(|v| v.as_f64());
    status.total_percent_used = plan_usage
        .and_then(|v| v.get("totalPercentUsed"))
        .and_then(|v| v.as_f64());
    status.billing_cycle_end_ms = body
        .get("billingCycleEnd")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<i64>().ok())
        .or_else(|| body.get("billingCycleEnd").and_then(|v| v.as_i64()));
    status
}

// WKWebView doesn't forward frontend console output to this process's own
// stderr, so debugOverlay.ts had no way to hand its log lines back other
// than an on-screen overlay the user had to copy/paste. This gives it a
// file on disk instead, so logs can be read directly during debugging.
#[tauri::command]
fn debug_log(line: String) -> Result<(), String> {
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("/tmp/workspace-app-debug.log")
        .map_err(|e| e.to_string())?;
    writeln!(f, "{line}").map_err(|e| e.to_string())
}

#[tauri::command]
fn pty_write(state: State<'_, Arc<AppState>>, id: u32, data_b64: String) -> Result<(), String> {
    let bytes = STANDARD.decode(data_b64).map_err(|e| e.to_string())?;
    state.workspace.lock().terminal_write(id, &bytes);
    Ok(())
}

#[tauri::command]
fn pty_resize(
    state: State<'_, Arc<AppState>>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.workspace.lock().terminal_resize(id, cols, rows);
    Ok(())
}

#[tauri::command]
fn spawn_terminal(state: State<'_, Arc<AppState>>, cols: u16, rows: u16) -> Result<u32, String> {
    Ok(state.workspace.lock().spawn_terminal(cols, rows))
}

#[tauri::command]
fn add_tab(state: State<'_, Arc<AppState>>, app: AppHandle) -> Result<u32, String> {
    let tab_id = state.workspace.lock().add_tab();
    let new_state = state.workspace.lock().state();
    let _ = app.emit("workspace-updated", new_state.clone());
    save_workspace_snapshot(&new_state);
    allow_asset_scope(&app, &new_state);
    rewatch_active(&state);
    Ok(tab_id)
}

#[tauri::command]
fn close_tab(state: State<'_, Arc<AppState>>, app: AppHandle, tab_id: u32) -> Result<(), String> {
    state.workspace.lock().close_tab(tab_id)?;
    let new_state = state.workspace.lock().state();
    let _ = app.emit("workspace-updated", new_state.clone());
    save_workspace_snapshot(&new_state);
    allow_asset_scope(&app, &new_state);
    rewatch_active(&state);
    Ok(())
}

#[tauri::command]
fn select_tab(state: State<'_, Arc<AppState>>, app: AppHandle, tab_id: u32) -> Result<(), String> {
    state.workspace.lock().select_tab(tab_id);
    let new_state = state.workspace.lock().state();
    let _ = app.emit("workspace-updated", new_state.clone());
    save_workspace_snapshot(&new_state);
    allow_asset_scope(&app, &new_state);
    rewatch_active(&state);
    Ok(())
}

#[tauri::command]
fn set_tab_layout(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
    tab_id: u32,
    layout_json: String,
) -> Result<(), String> {
    state.workspace.lock().set_tab_layout(tab_id, layout_json);
    let new_state = state.workspace.lock().state();
    let _ = app.emit("workspace-updated", new_state.clone());
    save_workspace_snapshot(&new_state);
    allow_asset_scope(&app, &new_state);
    Ok(())
}

#[tauri::command]
fn set_tab_root_path(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
    tab_id: u32,
    path: String,
) -> Result<workspace_core::WorkspaceState, String> {
    let root = PathBuf::from(&path);
    {
        let mut ws = state.workspace.lock();
        ws.set_tab_root_path(tab_id, root.clone())?;
        // Newly created tabs are seeded from whatever root was last set —
        // and it's what gets persisted below, so the app reopens wherever
        // you last pointed it.
        ws.default_root_path = root.clone();
    }
    save_config(&AppConfig {
        root_path: Some(path),
    })?;

    let new_state = state.workspace.lock().state();
    let _ = app.emit("workspace-updated", new_state.clone());
    save_workspace_snapshot(&new_state);
    allow_asset_scope(&app, &new_state);
    rewatch_active(&state);
    Ok(new_state)
}

#[tauri::command]
fn list_dir(
    state: State<'_, Arc<AppState>>,
    tab_id: u32,
    path: String,
) -> Result<Vec<workspace_core::files::DirEntry>, String> {
    state.workspace.lock().list_dir(tab_id, &path)
}

#[tauri::command]
fn read_file(state: State<'_, Arc<AppState>>, tab_id: u32, path: String) -> Result<String, String> {
    state.workspace.lock().read_file(tab_id, &path)
}

#[tauri::command]
fn write_file(
    state: State<'_, Arc<AppState>>,
    tab_id: u32,
    path: String,
    content: String,
) -> Result<(), String> {
    state.workspace.lock().write_file(tab_id, &path, &content)
}

#[tauri::command]
fn create_dir(state: State<'_, Arc<AppState>>, tab_id: u32, path: String) -> Result<(), String> {
    state.workspace.lock().create_dir(tab_id, &path)
}

#[tauri::command]
fn delete_path(state: State<'_, Arc<AppState>>, tab_id: u32, path: String) -> Result<(), String> {
    state.workspace.lock().delete_path(tab_id, &path)
}

#[tauri::command]
fn rename_path(
    state: State<'_, Arc<AppState>>,
    tab_id: u32,
    from: String,
    to: String,
) -> Result<(), String> {
    state.workspace.lock().rename_path(tab_id, &from, &to)
}

fn spawn_pty_poll(app: AppHandle, state: Arc<AppState>) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_millis(8));
            let outputs = state.workspace.lock().poll_all_terminals();
            for (id, chunk) in outputs {
                let payload = PtyOutputPayload {
                    id,
                    data_b64: STANDARD.encode(&chunk),
                };
                let _ = app.emit("pty-output", payload);
            }
        }
    });
}

type WatchSender = std::sync::mpsc::Sender<notify::Result<notify::Event>>;

/// Runs for the app's whole lifetime, relaying whichever `RecommendedWatcher`
/// is currently installed in `AppState.watcher` — kept separate from the
/// watcher itself so `set_workspace_root` can swap the watcher (stop
/// watching the old root, start watching the new one) without needing to
/// also restart this relay.
fn spawn_watch_relay(app: AppHandle) -> WatchSender {
    let (tx, rx): (WatchSender, _) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        while let Ok(Ok(event)) = rx.recv() {
            if matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
            ) {
                let _ = app.emit("file-changed", ());
            }
        }
    });
    tx
}

/// Dropping the previous `RecommendedWatcher` (by assigning over it in
/// `AppState.watcher`) stops it from watching its old root.
fn watch_root(root: &std::path::Path, tx: WatchSender) -> Option<RecommendedWatcher> {
    let mut watcher = RecommendedWatcher::new(
        move |res| {
            let _ = tx.send(res);
        },
        notify::Config::default(),
    )
    .ok()?;
    let _ = watcher.watch(root, RecursiveMode::Recursive);
    Some(watcher)
}

/// Each tab can have its own root_path now, so the single filesystem
/// watcher (and the `file-changed` events it drives, e.g. for TreeView
/// refresh) always follows whichever tab is currently active rather than
/// a single app-wide root.
fn rewatch_active(state: &Arc<AppState>) {
    let active_id = state.workspace.lock().state().active_tab_id;
    let Some(root) = state.workspace.lock().tab_root_path(active_id) else {
        return;
    };
    if let Some(tx) = state.watch_tx.lock().clone() {
        *state.watcher.lock() = watch_root(&root, tx);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = load_config();
    let default_root = match config.root_path.as_deref().map(PathBuf::from) {
        Some(path) if path.is_dir() => path,
        _ => std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
    };
    // Restoring from `workspace.json` (tabs, layout, per-tab root paths,
    // and — critically — each tab's original terminal ids) is what makes
    // a relaunch (app update/rebuild included) pick back up instead of
    // starting over with one fresh tab; see `Workspace::from_snapshot`
    // and `TerminalSession::new`'s tmux session-key-by-id reattachment.
    let workspace = match load_workspace_snapshot() {
        Some(snapshot) => Workspace::from_snapshot(default_root.clone(), snapshot),
        None => Workspace::with_root(default_root),
    };

    let state = Arc::new(AppState {
        workspace: Mutex::new(workspace),
        watcher: Mutex::new(None),
        watch_tx: Mutex::new(None),
    });

    let browser_host = Mutex::new(BrowserHost::new());

    let poll_state = Arc::clone(&state);
    let setup_state = Arc::clone(&state);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .manage(browser_host)
        .setup(move |app| {
            let handle = app.handle().clone();
            install_claude_statusline_hook();
            browser_host::cleanup_browser_webviews(&handle);
            browser_host::attach_window_events(&handle);
            spawn_pty_poll(handle.clone(), poll_state);

            let tx = spawn_watch_relay(handle.clone());
            *setup_state.watch_tx.lock() = Some(tx);
            rewatch_active(&setup_state);
            // First launch (no workspace.json yet) would otherwise never
            // persist anything until the user creates/closes/renames a
            // tab — meaning a never-touched default single tab's
            // terminal id (and thus its tmux session) would be lost on
            // the very next relaunch. Save the just-constructed state
            // immediately so that can't happen.
            let initial_state = setup_state.workspace.lock().state();
            save_workspace_snapshot(&initial_state);
            allow_asset_scope(&handle, &initial_state);

            let _ = handle.emit("app-ready", ());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_workspace_state,
            debug_log,
            hostname,
            claude_code_usage_recent,
            claude_rate_limit_status,
            cursor_usage_status,

            pty_write,
            pty_resize,
            spawn_terminal,
            add_tab,
            close_tab,
            select_tab,
            set_tab_layout,
            set_tab_root_path,
            list_dir,
            read_file,
            write_file,
            create_dir,
            delete_path,
            rename_path,
            browser_host::browser_report_frame,
            browser_host::browser_navigate,
            browser_host::browser_back,
            browser_host::browser_forward,
            browser_host::browser_reload,
            browser_host::browser_toggle_devtools,
            browser_host::browser_hide_all,
            browser_host::browser_detach,
            browser_host::browser_cleanup_all,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}
