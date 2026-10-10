const adminRoles = new Set(["Campus Security Admin", "Umbrella Super Admin"]);
const announcementLimit = 4;
let campusStream;
let toastTimeout;

if (window.lucide) {
    lucide.createIcons();
}

initializeDashboard();

function initializeDashboard() {
    initializeChart();
    connectToCampusStream();
    refreshAudienceCount();
    window.setInterval(refreshAudienceCount, 15000);
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
                    borderColor: "#c9b8a0",
                    backgroundColor: "rgba(201, 184, 160, 0.12)",
                    fill: true,
                    tension: 0.4,
                },
                {
                    label: "General Campus Data Slice",
                    data: [120, 135, 110, 150, 140, 160],
                    borderColor: "#786c5d",
                    backgroundColor: "rgba(120, 108, 93, 0.08)",
                    fill: true,
                    tension: 0.4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: "#b4aa9d", font: { size: 11 } } } },
            scales: {
                x: { grid: { color: "rgba(201, 184, 160, 0.08)" }, ticks: { color: "#857d72" } },
                y: { grid: { color: "rgba(201, 184, 160, 0.08)" }, ticks: { color: "#857d72" } },
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

    const adminPanel = document.getElementById("admin-panel");
    adminPanel.classList.toggle("hidden", !adminRoles.has(role));
    toggleModal("login-modal");
    showToast(`Signed in as ${role}.`);
    logEvent(`User signed in with role: ${role}`);
    updateCampus();
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
    logEvent(`Active network changed to ${getSelectedCampus()}.`);
}

function getSelectedCampus() {
    return document.getElementById("campus-select").value.trim();
}

function connectToCampusStream() {
    const status = document.getElementById("broadcast-connection");
    if (!window.EventSource || window.location.protocol === "file:") {
        status.textContent = "Server connection unavailable";
        status.dataset.state = "offline";
        return;
    }

    const params = new URLSearchParams({ campus: getSelectedCampus() });
    campusStream = new EventSource(`/api/broadcasts/stream?${params}`);
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
        const response = await fetch(`/api/broadcasts/audience?${params}`, {
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
    const button = document.getElementById("send-broadcast");
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

    button.disabled = true;
    status.textContent = "Sending to connected campus sessions…";
    status.dataset.state = "sending";
    try {
        const response = await fetch("/api/broadcasts", {
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
        button.disabled = false;
    }
}

function triggerScenario() {
    const scenario = document.getElementById("sim-scenario").value;
    const statusLabel = document.getElementById("metric-status");
    const latencyLabel = document.getElementById("metric-latency");
    const lossLabel = document.getElementById("metric-loss");

    if (scenario === "emergency") {
        statusLabel.textContent = "🟢 D2M Broadcast Active";
        latencyLabel.textContent = "3 ms";
        lossLabel.textContent = "0.0% (URLLC Sliced)";
        showToast("Emergency network scenario simulated. Use Campus Broadcast to send a user alert.");
        logEvent("ALERT: Emergency scenario simulated. No message was sent.");
    } else if (scenario === "outage") {
        statusLabel.textContent = "🔴 Primary Tower Down";
        latencyLabel.textContent = "42 ms";
        lossLabel.textContent = "1.8% (Failover Mesh)";
        showToast("Simulated tower failure! AI routing traffic to backup mesh.");
        logEvent("WARNING: 5G primary tower outage detected. AI failover protocol active.");
    } else if (scenario === "congestion") {
        statusLabel.textContent = "🟡 High Traffic State";
        latencyLabel.textContent = "24 ms";
        lossLabel.textContent = "0.6% (Load Balanced)";
        showToast("Campus mega event congestion simulated.");
        logEvent("INFO: Traffic surge detected across campus nodes.");
    } else {
        statusLabel.textContent = "🟢 5G/6G Core Active";
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

    showToast(`${broadcast.type.toUpperCase()} from campus administration.`);
    logEvent(`Campus ${broadcast.type} received.`);
}

function logEvent(text) {
    const logBox = document.getElementById("audit-log");
    const paragraph = document.createElement("p");
    paragraph.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    logBox.prepend(paragraph);
}