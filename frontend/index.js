const adminRoles = new Set(["Campus Security Admin", "Umbrella Super Admin"]);
const announcementLimit = 4;
let campusStream;
let toastTimeout;
let broadcastInProgress = false;
let weatherMonitorStatus = null;
let weatherMonitorRequestInProgress = false;

function getApiUrl(path) {
    const apiOrigin = window.location.port === "5500"
        ? "http://127.0.0.1:4173"
        : window.location.origin;
    return new URL(path, `${apiOrigin}/`).href;
}

if (window.lucide) {
    lucide.createIcons();
}

initializeDashboard();
initializePageNavigation();

const broadcastTypeLabels = {
    announcement: "Announcement",
    alert: "Important alert",
    emergency: "Emergency",
};

function initializePageNavigation() {
    window.addEventListener("hashchange", updateCurrentPage);
    document.getElementById("history-refresh").addEventListener("click", loadBroadcastHistory);
    updateCurrentPage();
}

function updateCurrentPage() {
    const requestedAdminPage = window.location.hash === "#admin-broadcast";
    const isAdmin = adminRoles.has(document.getElementById("current-role-label").textContent);
    if (requestedAdminPage && !isAdmin) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#overview`);
    }
    const isAdminPage = requestedAdminPage && isAdmin;
    const isHistoryPage = window.location.hash === "#broadcast-history";
    const dashboardView = document.getElementById("dashboard-view");
    const historyView = document.getElementById("broadcast-history-view");
    const adminBroadcastView = document.getElementById("admin-broadcast-view");
    const adminPanel = document.getElementById("admin-panel");
    const historyLink = document.getElementById("history-nav-link");
    const dashboardLink = document.getElementById("dashboard-nav-link");
    const adminBroadcastLink = document.getElementById("admin-broadcast-nav-link");

    dashboardView.hidden = isHistoryPage || isAdminPage;
    historyView.hidden = !isHistoryPage;
    adminBroadcastView.hidden = !isAdminPage;
    document.body.dataset.view = isHistoryPage ? "history" : isAdminPage ? "admin-broadcast" : "dashboard";
    document.title = isHistoryPage
        ? "Broadcast History — CognivNet"
        : isAdminPage
            ? "Admin Broadcasts — CognivNet"
            : "CognivNet — Umbrella Campus & D2M Hub";

    if (isHistoryPage) {
        historyLink.setAttribute("aria-current", "page");
        dashboardLink.removeAttribute("aria-current");
        adminBroadcastLink.removeAttribute("aria-current");
        adminPanel.hidden = true;
        loadBroadcastHistory();
    } else if (isAdminPage) {
        adminBroadcastLink.setAttribute("aria-current", "page");
        dashboardLink.removeAttribute("aria-current");
        historyLink.removeAttribute("aria-current");
        adminPanel.hidden = false;
        refreshWeatherMonitorStatus();
    } else {
        dashboardLink.setAttribute("aria-current", "page");
        historyLink.removeAttribute("aria-current");
        adminBroadcastLink.removeAttribute("aria-current");
        adminPanel.hidden = true;
    }
}

async function loadBroadcastHistory() {
    const refreshButton = document.getElementById("history-refresh");
    const historyStatus = document.getElementById("history-status");
    const historyCount = document.getElementById("history-count");
    const historyList = document.getElementById("broadcast-history");
    refreshButton.disabled = true;
    historyStatus.textContent = "Loading broadcast history…";
    historyStatus.hidden = false;

    try {
        const response = await fetch(getApiUrl("/api/broadcasts/history"), {
            headers: { Accept: "application/json" },
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `History request failed with status ${response.status}.`);
        }
        if (!Array.isArray(result.broadcasts)) {
            throw new Error("The server returned an invalid broadcast history.");
        }

        historyList.replaceChildren(...result.broadcasts.map(createBroadcastHistoryCard));
        historyCount.textContent = `${result.broadcasts.length} archived broadcast${result.broadcasts.length === 1 ? "" : "s"}`;
        historyStatus.dataset.state = "";
        historyStatus.textContent = result.broadcasts.length === 0
            ? "No broadcasts have been archived yet."
            : "";
        historyStatus.hidden = result.broadcasts.length > 0;
        if (window.lucide) {
            lucide.createIcons();
        }
    } catch (error) {
        historyList.replaceChildren();
        historyCount.textContent = "History unavailable";
        historyStatus.textContent = error instanceof Error
            ? error.message
            : "Could not load broadcast history.";
        historyStatus.dataset.state = "error";
        historyStatus.hidden = false;
    } finally {
        refreshButton.disabled = false;
    }
}

function createBroadcastHistoryCard(broadcast) {
    const item = document.createElement("li");
    item.className = "history-card";

    const header = document.createElement("div");
    header.className = "history-card-header";

    const type = document.createElement("span");
    type.className = "history-type";
    type.textContent = broadcastTypeLabels[broadcast.type] || "Broadcast";

    const time = document.createElement("time");
    const date = new Date(broadcast.createdAt);
    time.dateTime = broadcast.createdAt;
    time.textContent = Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();

    const message = document.createElement("p");
    message.className = "history-message";
    message.textContent = broadcast.message;

    const campus = document.createElement("p");
    campus.className = "history-campus";
    campus.textContent = `Campus: ${broadcast.campus}`;

    header.append(type, time);
    item.append(header, message, campus);
    return item;
}

function initializeDashboard() {
    updateBroadcastAccess();
    initializeChart();
    connectToCampusStream();
    refreshAudienceCount();
    refreshWeatherMonitorStatus();
    window.setInterval(refreshAudienceCount, 15000);
    window.setInterval(refreshWeatherMonitorStatus, 30000);
}

function initializeChart() {
    const canvas = document.getElementById("throughputChart");
    if (!canvas || !window.Chart) {
        return;
    }

    new Chart(canvas.getContext("2d"), {
        type: "line",
        data: {
            labels: ["12:01", "12:02", "12:03", "12:04", "12:05", "12:06"],
            datasets: [
                {
                    label: "D2M Emergency Broadcast Channel",
                    data: [45, 52, 48, 70, 85, 90],
                    borderColor: "#1a3c2b",
                    backgroundColor: "rgba(26, 60, 43, 0.08)",
                    fill: true,
                    tension: 0,
                },
                {
                    label: "General Campus Data Slice",
                    data: [120, 135, 110, 150, 140, 160],
                    borderColor: "#ff8c69",
                    backgroundColor: "rgba(255, 140, 105, 0.08)",
                    fill: true,
                    tension: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: "#3a3a38",
                        font: { family: "'JetBrains Mono', monospace", size: 10 },
                    },
                },
            },
            scales: {
                x: {
                    grid: { color: "rgba(58, 58, 56, 0.12)" },
                    ticks: {
                        color: "#3a3a38",
                        font: { family: "'JetBrains Mono', monospace", size: 9 },
                    },
                },
                y: {
                    grid: { color: "rgba(58, 58, 56, 0.12)" },
                    ticks: {
                        color: "#3a3a38",
                        font: { family: "'JetBrains Mono', monospace", size: 9 },
                    },
                },
            },
        },
    });
}

function toggleModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.toggle("hidden");
    }
}

function showToast(message) {
    const toast = document.getElementById("toast");
    const messageElement = document.getElementById("toast-msg");
    if (!toast || !messageElement) {
        return;
    }

    messageElement.textContent = message;
    toast.classList.remove("hidden", "translate-y-10", "opacity-0");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => {
        toast.classList.add("translate-y-10", "opacity-0");
        window.setTimeout(() => toast.classList.add("hidden"), 300);
    }, 4000);
}

function applyLogin() {
    const role = document.getElementById("modal-role").value;
    const campus = document.getElementById("modal-campus-input").value.trim();
    document.getElementById("current-role-label").textContent = role;
    const status = document.getElementById("broadcast-status");

    if (campus) {
        const select = document.getElementById("campus-select");
        let option = Array.from(select.options).find((item) => item.value === campus);
        if (!option) {
            option = document.createElement("option");
            option.value = campus;
            option.textContent = campus;
            select.appendChild(option);
        }
        select.value = campus;
    }

    updateBroadcastAccess();
    updateCurrentPage();
    status.textContent = adminRoles.has(role)
        ? "Enter the administrator key configured on the broadcast server."
        : "Sending is locked until you sign in with an administrator role.";
    status.dataset.state = "";
    toggleModal("login-modal");
    showToast(`Signed in as ${role}.`);
    logEvent(`User signed in with role: ${role}`);
}

function updateBroadcastAccess() {
    const role = document.getElementById("current-role-label").textContent;
    const isAdmin = adminRoles.has(role);
    const adminPanel = document.getElementById("admin-panel");
    const adminBroadcastLink = document.getElementById("admin-broadcast-nav-link");
    const message = document.getElementById("broadcast-access-message");
    const signInButton = document.getElementById("broadcast-sign-in");

    adminPanel.hidden = !isAdmin;
    adminBroadcastLink.hidden = !isAdmin;
    message.textContent = isAdmin
        ? "Administrator role selected. Enter the server key to authorize broadcasts and emergency alerts."
        : "Sign in with an administrator role to access broadcast and emergency controls.";
    signInButton.classList.toggle("hidden", isAdmin);
    document.querySelectorAll("#send-broadcast, .emergency-send").forEach((button) => {
        button.disabled = !isAdmin || broadcastInProgress;
    });
    if (!isAdmin) {
        adminPanel.hidden = true;
    } else {
        adminPanel.hidden = window.location.hash !== "#admin-broadcast";
    }
}

function updateTraffic(value) {
    document.getElementById("traffic-val").textContent = `${value} Mbps`;
}

function updateCampus() {
    if (campusStream) {
        campusStream.close();
    }
    connectToCampusStream();
    refreshAudienceCount();
    if (window.location.hash === "#admin-broadcast") {
        refreshWeatherMonitorStatus();
    }
    logEvent(`Active network changed to ${getSelectedCampus()}.`);
}

function getSelectedCampus() {
    return document.getElementById("campus-select").value.trim();
}

async function refreshWeatherMonitorStatus() {
    const state = document.getElementById("weather-monitor-state");
    const detail = document.getElementById("weather-monitor-detail");
    const button = document.getElementById("weather-monitor-toggle");
    if (!state || !detail || !button || window.location.hash !== "#admin-broadcast"
        || window.location.protocol === "file:") {
        return;
    }

    try {
        const response = await fetch(getApiUrl("/api/weather/monitor"), {
            headers: { Accept: "application/json" },
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `Weather status request failed with status ${response.status}.`);
        }
        weatherMonitorStatus = result;
        state.textContent = result.enabled ? "Monitoring active" : "Monitoring off";
        state.dataset.state = result.enabled ? "active" : "inactive";
        const location = result.location || "configured location";
        const activeHazards = Array.isArray(result.activeHazards)
            ? result.activeHazards.map((hazard) => hazard.description).join("; ")
            : "";
        detail.textContent = !result.configured
            ? `${location}. Set GOOGLE_WEATHER_API_KEY on the server to enable weather checks.`
            : result.lastError
                ? `Weather check failed: ${result.lastError}`
                : result.enabled
                    ? `${location}. Alerts route to ${result.campus}. ${activeHazards ? `Active hazard: ${activeHazards}` : "No threshold currently exceeded."}${result.lastCheckedAt ? ` Last checked ${new Date(result.lastCheckedAt).toLocaleTimeString()}.` : " First check in progress."}`
                    : `${location}. Monitoring runs on the server while enabled and resets when the server restarts.`;
        button.textContent = result.enabled ? "Disable weather monitoring" : "Enable weather monitoring";
        button.disabled = !result.configured || weatherMonitorRequestInProgress;
        button.title = result.configured ? "" : "Set GOOGLE_WEATHER_API_KEY on the server first.";
    } catch (error) {
        weatherMonitorStatus = null;
        state.textContent = "Status unavailable";
        state.dataset.state = "error";
        detail.textContent = error instanceof Error ? error.message : "Could not load weather monitoring status.";
        button.disabled = true;
        console.error("Could not load weather monitoring status:", error);
    }
}

async function toggleWeatherMonitor() {
    const status = document.getElementById("broadcast-status");
    const tokenInput = document.getElementById("broadcast-token");
    const button = document.getElementById("weather-monitor-toggle");
    const token = tokenInput.value.trim();
    if (!token) {
        status.textContent = "Enter the administrator key to control weather monitoring.";
        status.dataset.state = "error";
        tokenInput.focus();
        return;
    }
    if (!weatherMonitorStatus) {
        status.textContent = "Weather monitoring status is unavailable. Try again when the server is connected.";
        status.dataset.state = "error";
        return;
    }

    const enabled = !weatherMonitorStatus.enabled;
    weatherMonitorRequestInProgress = true;
    button.disabled = true;
    status.textContent = enabled ? "Enabling automatic weather alerts…" : "Disabling automatic weather alerts…";
    status.dataset.state = "sending";
    try {
        const response = await fetch(getApiUrl("/api/weather/monitor"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ enabled, campus: getSelectedCampus() }),
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `Weather monitoring request failed with status ${response.status}.`);
        }
        weatherMonitorStatus = result;
        status.textContent = enabled
            ? "Automatic weather alerts enabled for the selected campus."
            : "Automatic weather alerts disabled.";
        status.dataset.state = "success";
        tokenInput.value = "";
    } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Could not update weather monitoring.";
        status.dataset.state = "error";
        console.error("Could not update weather monitoring:", error);
    } finally {
        weatherMonitorRequestInProgress = false;
        await refreshWeatherMonitorStatus();
    }
}

function connectToCampusStream() {
    const status = document.getElementById("broadcast-connection");
    if (!window.EventSource || window.location.protocol === "file:") {
        status.textContent = "Server connection unavailable";
        status.dataset.state = "offline";
        return;
    }

    const params = new URLSearchParams({ campus: getSelectedCampus() });
    campusStream = new EventSource(getApiUrl(`/api/broadcasts/stream?${params}`));
    campusStream.addEventListener("open", () => {
        status.textContent = "Live connection";
        status.dataset.state = "connected";
        refreshAudienceCount();
    });
    campusStream.addEventListener("error", () => {
        status.textContent = "Reconnecting to server…";
        status.dataset.state = "offline";
    });
    campusStream.addEventListener("broadcast", (event) => {
        try {
            const broadcast = JSON.parse(event.data);
            receiveBroadcast(broadcast);
        } catch (error) {
            console.error("Could not read campus broadcast:", error);
            status.textContent = "Received an unreadable server message";
            status.dataset.state = "offline";
        }
    });
}

async function refreshAudienceCount() {
    const count = document.getElementById("audience-count");
    if (window.location.protocol === "file:") {
        count.textContent = "—";
        return;
    }

    const params = new URLSearchParams({ campus: getSelectedCampus() });
    try {
        const response = await fetch(getApiUrl(`/api/broadcasts/audience?${params}`), {
            headers: { Accept: "application/json" },
        });
        if (!response.ok) {
            throw new Error(`Audience request failed with status ${response.status}.`);
        }
        const audience = await response.json();
        count.textContent = String(audience.connectedSessions);
    } catch (error) {
        count.textContent = "—";
        document.getElementById("broadcast-connection").textContent = "Server unavailable";
        document.getElementById("broadcast-connection").dataset.state = "offline";
        console.error("Could not refresh campus session count:", error);
    }
}

async function sendBroadcast(messageOverride, typeOverride) {
    const status = document.getElementById("broadcast-status");
    const role = document.getElementById("current-role-label").textContent;
    const messageInput = document.getElementById("broadcast-message");
    const message = (messageOverride ?? messageInput.value).trim();
    const type = typeOverride ?? document.getElementById("broadcast-type").value;
    const tokenInput = document.getElementById("broadcast-token");
    const token = tokenInput.value.trim();
    const campus = getSelectedCampus();

    if (!adminRoles.has(role)) {
        status.textContent = "Sign in with an administrator role before sending a broadcast.";
        status.dataset.state = "error";
        return;
    }
    if (!message) {
        status.textContent = "Enter a message before sending.";
        status.dataset.state = "error";
        messageInput.focus();
        return;
    }
    if (message.length > 500) {
        status.textContent = "Messages must be 500 characters or fewer.";
        status.dataset.state = "error";
        return;
    }
    if (!token) {
        status.textContent = "Enter the administrator key configured on the broadcast server.";
        status.dataset.state = "error";
        tokenInput.focus();
        return;
    }
    if (window.location.protocol === "file:") {
        status.textContent = "Run the broadcast server and open this page over HTTP to send messages.";
        status.dataset.state = "error";
        return;
    }

    broadcastInProgress = true;
    updateBroadcastAccess();
    status.textContent = "Sending to connected campus sessions…";
    status.dataset.state = "sending";
    try {
        const response = await fetch(getApiUrl("/api/broadcasts"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ campus, type, message }),
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `Broadcast failed with status ${response.status}.`);
        }

        status.textContent = `Sent to ${result.deliveredSessions} connected session${result.deliveredSessions === 1 ? "" : "s"} in ${campus}.`;
        status.dataset.state = "success";
        messageInput.value = "";
        tokenInput.value = "";
        showToast(`Campus broadcast sent to ${result.deliveredSessions} connected session${result.deliveredSessions === 1 ? "" : "s"}.`);
        logEvent(`Campus ${type} sent to ${result.deliveredSessions} connected session(s).`);
        refreshAudienceCount();
    } catch (error) {
        status.textContent = error instanceof Error ? error.message : "The broadcast could not be sent.";
        status.dataset.state = "error";
        console.error("Campus broadcast failed:", error);
    } finally {
        broadcastInProgress = false;
        updateBroadcastAccess();
    }
}

function triggerScenario() {
    const scenario = document.getElementById("sim-scenario").value;
    
    const healthMap = { normal: "ok", congestion: "warn", emergency: "warn", outage: "bad" };
    document.body.dataset.scenario = scenario;
    document.body.dataset.health = healthMap[scenario] || "ok";

    const statusLabel = document.getElementById("metric-status");
    const latencyLabel = document.getElementById("metric-latency");
    const lossLabel = document.getElementById("metric-loss");

    if (scenario === "emergency") {
        statusLabel.textContent = "D2M / ACTIVE";
        latencyLabel.textContent = "3 ms";
        lossLabel.textContent = "0.0% (URLLC Sliced)";
        showToast("Emergency network scenario simulated. Use Campus Broadcast to send a user alert.");
        logEvent("ALERT: Emergency scenario simulated. No message was sent.");
    } else if (scenario === "outage") {
        statusLabel.textContent = "TOWER / OFFLINE";
        latencyLabel.textContent = "42 ms";
        lossLabel.textContent = "1.8% (Failover Mesh)";
        showToast("Simulated tower failure! AI routing traffic to backup mesh.");
        logEvent("WARNING: 5G primary tower outage detected. AI failover protocol active.");
    } else if (scenario === "congestion") {
        statusLabel.textContent = "TRAFFIC / HIGH";
        latencyLabel.textContent = "24 ms";
        lossLabel.textContent = "0.6% (Load Balanced)";
        showToast("Campus mega event congestion simulated.");
        logEvent("INFO: Traffic surge detected across campus nodes.");
    } else {
        statusLabel.textContent = "CORE / STABLE";
        latencyLabel.textContent = "8 ms";
        lossLabel.textContent = "0.1% (Optimal)";
        showToast("Network returned to normal stable state.");
        logEvent("INFO: Network normalized.");
    }
}

function dispatchD2M() {
    const preset = document.getElementById("emergency-type").value;
    const details = document.getElementById("broadcast-message").value.trim();
    const message = details ? `${preset}: ${details}` : preset;
    document.getElementById("broadcast-type").value = "emergency";
    sendBroadcast(message, "emergency");
}

function dismissBroadcast() {
    const banner = document.getElementById("live-broadcast-banner");
    if (banner.classList.contains("hidden")) {
        return;
    }

    banner.classList.add("hidden");
    banner.classList.remove("is-live");
    logEvent("Campus broadcast dismissed on this dashboard.");
}

function receiveBroadcast(broadcast) {
    const feed = document.getElementById("campus-announcements");
    const card = document.createElement("article");
    const heading = document.createElement("div");
    const type = document.createElement("strong");
    const time = document.createElement("time");
    const body = document.createElement("p");

    card.className = `announcement-card announcement-${broadcast.type}`;
    heading.className = "announcement-heading";
    type.textContent = broadcast.type.toUpperCase();
    time.dateTime = broadcast.createdAt;
    time.textContent = new Date(broadcast.createdAt).toLocaleString();
    body.textContent = broadcast.message;
    heading.append(type, time);
    card.append(heading, body);
    feed.prepend(card);
    feed.classList.remove("hidden");
    while (feed.children.length > announcementLimit) {
        feed.lastElementChild.remove();
    }

    showBroadcastBanner(broadcast);
    showToast(`${broadcast.type.toUpperCase()} from campus administration.`);
    logEvent(`Campus ${broadcast.type} received.`);
}

function showBroadcastBanner(broadcast) {
    const banner = document.getElementById("live-broadcast-banner");
    const label = document.getElementById("banner-label");
    const text = document.getElementById("banner-text");
    const icon = document.getElementById("banner-icon");
    const bannerType = ["announcement", "alert", "emergency"].includes(broadcast.type)
        ? broadcast.type
        : "announcement";
    const labels = {
        announcement: "Campus announcement",
        alert: "Important campus alert",
        emergency: "Emergency · campus broadcast",
    };
    const icons = {
        announcement: "bell-ring",
        alert: "triangle-alert",
        emergency: "siren",
    };

    banner.classList.remove("announcement", "alert", "emergency", "hidden");
    banner.classList.add(bannerType, "is-live");
    banner.setAttribute("role", bannerType === "emergency" ? "alert" : "status");
    banner.setAttribute("aria-live", bannerType === "emergency" ? "assertive" : "polite");
    label.textContent = labels[bannerType];
    text.textContent = broadcast.message;
    icon.setAttribute("data-lucide", icons[bannerType]);
    if (window.lucide) {
        lucide.createIcons({ attrs: { "aria-hidden": "true" } });
    }
}

function logEvent(text) {
    const logBox = document.getElementById("audit-log");
    const paragraph = document.createElement("p");
    paragraph.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    logBox.prepend(paragraph);
}