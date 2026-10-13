// --- 1. Global State Variables ---
let leafletMap = null;
let satelliteMap = null;
let googleMap = null;
let markerLayer = null;
let leafletMarkers = [];
let leafletCircles = [];
let mapMarkers = [];
let mapCircles = [];
let mapRotationInterval = null;
let mapIsRotating = false;
let mapIs3D = true;
let activeMapEngine = null;
let googleAuthFailed = false;
let currentMapMode = "satellite"; // "satellite" | "normal"
let leafletOsmLayer = null;
let leafletEsriLayer = null;
let leafletLabelsLayer = null;
let userLiveMarker = null;
let userLiveAccuracyCircle = null;
let activeRoutePolyline = null;
let activeRouteDestination = null;
let userCurrentCoords = { lat: 28.67335, lng: 77.49391 }; // Defaults to Hi-Tech campus center, updated on live GPS

const broadcastTypeLabels = {
    announcement: "Announcement",
    alert: "Important alert",
    emergency: "Emergency",
};
let cachedStudentLocation = null;
const adminRoles = new Set(["Campus Security Admin", "Umbrella Super Admin"]);
const announcementLimit = 4;
let campusStream;
let toastTimeout;
let broadcastInProgress = false;
let weatherMonitorStatus = null;
let weatherMonitorRequestInProgress = false;
let latestLiveWeatherAqi = null;
let latestAiDraft = null;
let copilotRequestInProgress = false;
let currentGoogleUser = null;
const GOOGLE_CLIENT_ID = "601818746857-dh3skj3lmbnpn6hpmu6dg40r9hnpodh0.apps.googleusercontent.com";

// --- 2. Campus Data Structures (Declared at top to eliminate startup ReferenceErrors) ---
const DEFAULT_CAMPUS = "Hi-Tech Institute of Engineering & Technology";

const campusLocations = {
    "Hi-Tech Institute of Engineering & Technology": {
        lat: 28.67335,
        lng: 77.49391,
        zoom: 17,
        label: "Hi-Tech Institute Main Campus (Ghaziabad)",
    },
    "Global Central Campus": {
        lat: 28.67335,
        lng: 77.49391,
        zoom: 17,
        label: "Hi-Tech Institute Main Campus (Ghaziabad)",
    },
    "IIT Tech Park Hub": {
        lat: 28.5450,
        lng: 77.1926,
        zoom: 17,
        label: "IIT Tech Park Hub",
    },
    "Metro University Smart Block": {
        lat: 28.7041,
        lng: 77.1025,
        zoom: 17,
        label: "Metro University Smart Block",
    },
};

const defaultHiTechZones = [
    {
        lat: 28.67291,
        lng: 77.50446,
        title: "Dr Ram Saran Garg Indo-German Hospital",
        type: "medical",
        desc: "Medical Emergency Centre — D2M Priority Tier 1 active, immediate ambulance dispatch & critical trauma care",
        radius: 110,
    },
    {
        lat: 28.67236,
        lng: 77.50041,
        title: "Hi-Tech Boys Hostel & Residential Area",
        type: "security",
        desc: "Student residential zone & hostels (Wave City) — AI perimeter surveillance, student safety & access control active",
        radius: 95,
    },
    {
        lat: 28.67390,
        lng: 77.49480,
        title: "Energy · Smart Microgrid Node",
        type: "energy",
        desc: "Hi-Tech Campus smart solar microgrid & sub-station — Real-time telemetry streaming and failover battery backup",
        radius: 75,
    },
    {
        lat: 28.67335,
        lng: 77.49391,
        title: "5G/6G Core Tower · Hi-Tech Main Campus",
        type: "tower",
        desc: "CognivNet Terrestrial Core Tower at Hi-Tech Institute of Engineering & Technology — URLLC slicing, <8ms latency",
        radius: 160,
    },
];

const campusZones = {
    "Hi-Tech Institute of Engineering & Technology": defaultHiTechZones,
    "Global Central Campus": defaultHiTechZones,
    "IIT Tech Park Hub": [
        { lat: 28.5458, lng: 77.1932, title: "Medical · Sector A", type: "medical", desc: "Campus health center with D2M emergency channel", radius: 75 },
        { lat: 28.5443, lng: 77.1920, title: "Security · Sector B", type: "security", desc: "Smart surveillance ring with facial recognition", radius: 65 },
        { lat: 28.5455, lng: 77.1940, title: "Energy · Sector C", type: "energy", desc: "Solar-assisted microgrid — 87% renewable uptime", radius: 55 },
        { lat: 28.5450, lng: 77.1926, title: "5G/6G Core Tower", type: "tower", desc: "mmWave 5G tower — Peak throughput 2.4 Gbps", radius: 110 },
    ],
    "Metro University Smart Block": [
        { lat: 28.7050, lng: 77.1032, title: "Medical · Sector A", type: "medical", desc: "University medical wing — D2M broadcast active", radius: 70 },
        { lat: 28.7034, lng: 77.1018, title: "Security · Sector B", type: "security", desc: "Campus entry gates — AI visitor management", radius: 60 },
        { lat: 28.7045, lng: 77.1040, title: "Energy · Sector C", type: "energy", desc: "Battery storage + solar panels — Grid-tied backup", radius: 50 },
        { lat: 28.7041, lng: 77.1025, title: "5G/6G Core Tower", type: "tower", desc: "Sub-6 GHz macro tower — Campus-wide coverage", radius: 100 },
    ],
};

const zoneColors = {
    medical: { marker: "#34d399", circle: "#34d399" },
    security: { marker: "#22d3ee", circle: "#22d3ee" },
    energy: { marker: "#fbbf24", circle: "#fbbf24" },
    tower: { marker: "#a78bfa", circle: "#a78bfa" },
};

const zoneIcons = {
    medical: "🏥",
    security: "🛡️",
    energy: "⚡",
    tower: "📡",
};

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
initGoogleSignIn();
restoreSavedSession();

function initializePageNavigation() {
    window.addEventListener("hashchange", updateCurrentPage);
    document.getElementById("history-refresh").addEventListener("click", loadBroadcastHistory);
    
    const copilotPrompt = document.getElementById("copilot-prompt");
    if (copilotPrompt) {
        copilotPrompt.addEventListener("input", () => {
            const counter = document.getElementById("copilot-input-counter");
            if (counter) {
                counter.textContent = `${copilotPrompt.value.length} chars`;
            }
        });
    }

    updateCurrentPage();
}

function updateCurrentPage() {
    const hash = window.location.hash || "#overview";
    const requestedAdminPage = hash === "#admin-broadcast";
    const isCopilotPage = hash === "#ai-copilot";
    const roleLabel = document.getElementById("current-role-label");
    const isAdmin = roleLabel ? adminRoles.has(roleLabel.textContent.trim()) : false;
    
    if ((requestedAdminPage || isCopilotPage) && !isAdmin) {
        if (window.location.hash && window.location.hash !== "#overview") {
            history.replaceState(null, "", "#overview");
        }
        showToast("Access restricted: Administrator role required for AI Copilot & Broadcast controls.");
        // Continue rendering overview instead of returning or looping
    }
    const isAdminPage = requestedAdminPage && isAdmin;
    const isHistoryPage = hash === "#broadcast-history";
    const isMedicalSosPage = hash === "#medical-sos";
    const isWeatherAqiPage = hash === "#weather-aqi";
    const dashboardView = document.getElementById("dashboard-view");
    const historyView = document.getElementById("broadcast-history-view");
    const adminBroadcastView = document.getElementById("admin-broadcast-view");
    const aiCopilotView = document.getElementById("ai-copilot-view");
    const medicalSosView = document.getElementById("medical-sos-view");
    const weatherAqiView = document.getElementById("weather-aqi-view");
    const adminPanel = document.getElementById("admin-panel");
    const historyLink = document.getElementById("history-nav-link");
    const dashboardLink = document.getElementById("dashboard-nav-link");
    const adminBroadcastLink = document.getElementById("admin-broadcast-nav-link");
    const copilotLink = document.getElementById("ai-copilot-nav-link");
    const medicalSosLink = document.getElementById("medical-sos-nav-link");
    const weatherAqiLink = document.getElementById("weather-aqi-nav-link");

    dashboardView.hidden = isHistoryPage || isAdminPage || isCopilotPage || isMedicalSosPage || isWeatherAqiPage;
    historyView.hidden = !isHistoryPage;
    adminBroadcastView.hidden = !isAdminPage;
    if (aiCopilotView) {
        aiCopilotView.hidden = !isCopilotPage;
    }
    if (medicalSosView) {
        medicalSosView.hidden = !isMedicalSosPage;
    }
    if (weatherAqiView) {
        weatherAqiView.hidden = !isWeatherAqiPage;
    }

    document.body.dataset.view = isHistoryPage 
        ? "history" 
        : isAdminPage 
            ? "admin-broadcast" 
            : isCopilotPage 
                ? "ai-copilot" 
                : isMedicalSosPage
                    ? "medical-sos"
                    : isWeatherAqiPage
                        ? "weather-aqi"
                        : "dashboard";

    document.title = isHistoryPage
        ? "Broadcast History — CognivNet"
        : isAdminPage
            ? "Admin Broadcasts — CognivNet"
            : isCopilotPage
                ? "AI Assistant Broadcast Copilot — CognivNet"
                : isMedicalSosPage
                    ? "Medical Emergency SOS — CognivNet"
                    : isWeatherAqiPage
                        ? "Campus Weather & AQI Station — CognivNet"
                        : "CognivNet — Umbrella Campus & D2M Hub";

    if (isHistoryPage) {
        historyLink?.setAttribute("aria-current", "page");
        dashboardLink?.removeAttribute("aria-current");
        adminBroadcastLink?.removeAttribute("aria-current");
        copilotLink?.removeAttribute("aria-current");
        medicalSosLink?.removeAttribute("aria-current");
        weatherAqiLink?.removeAttribute("aria-current");
        if (adminPanel) adminPanel.hidden = true;
        loadBroadcastHistory();
    } else if (isAdminPage) {
        adminBroadcastLink?.setAttribute("aria-current", "page");
        dashboardLink?.removeAttribute("aria-current");
        historyLink?.removeAttribute("aria-current");
        copilotLink?.removeAttribute("aria-current");
        medicalSosLink?.removeAttribute("aria-current");
        weatherAqiLink?.removeAttribute("aria-current");
        if (adminPanel) adminPanel.hidden = false;
        refreshWeatherMonitorStatus();
    } else if (isCopilotPage) {
        copilotLink?.setAttribute("aria-current", "page");
        dashboardLink?.removeAttribute("aria-current");
        historyLink?.removeAttribute("aria-current");
        adminBroadcastLink?.removeAttribute("aria-current");
        medicalSosLink?.removeAttribute("aria-current");
        weatherAqiLink?.removeAttribute("aria-current");
        if (adminPanel) adminPanel.hidden = true;
        if (window.lucide) {
            lucide.createIcons();
        }
    } else if (isMedicalSosPage) {
        medicalSosLink?.setAttribute("aria-current", "page");
        dashboardLink?.removeAttribute("aria-current");
        historyLink?.removeAttribute("aria-current");
        adminBroadcastLink?.removeAttribute("aria-current");
        copilotLink?.removeAttribute("aria-current");
        weatherAqiLink?.removeAttribute("aria-current");
        if (adminPanel) adminPanel.hidden = true;
        refreshStudentGps();
        if (window.lucide) {
            lucide.createIcons();
        }
    } else if (isWeatherAqiPage) {
        weatherAqiLink?.setAttribute("aria-current", "page");
        dashboardLink?.removeAttribute("aria-current");
        historyLink?.removeAttribute("aria-current");
        adminBroadcastLink?.removeAttribute("aria-current");
        copilotLink?.removeAttribute("aria-current");
        medicalSosLink?.removeAttribute("aria-current");
        if (adminPanel) adminPanel.hidden = true;
        loadLiveWeatherAqiData();
        if (window.lucide) {
            lucide.createIcons();
        }
    } else {
        dashboardLink?.setAttribute("aria-current", "page");
        historyLink?.removeAttribute("aria-current");
        adminBroadcastLink?.removeAttribute("aria-current");
        copilotLink?.removeAttribute("aria-current");
        medicalSosLink?.removeAttribute("aria-current");
        weatherAqiLink?.removeAttribute("aria-current");
        if (adminPanel) adminPanel.hidden = true;
        if (satelliteMap && window.google && google.maps) {
            google.maps.event.trigger(satelliteMap, "resize");
        } else if (leafletMap) {
            leafletMap.invalidateSize();
        }
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
    refreshStudentGps();
    window.setInterval(refreshAudienceCount, 15000);
    window.setInterval(refreshWeatherMonitorStatus, 30000);

    // Initialize map immediately: try Google Maps or load high-res Leaflet stream
    if (window.google && google.maps && !googleAuthFailed) {
        initSatelliteMap();
    } else {
        initFallbackSatelliteMap();
    }
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
        const isHidden = modal.classList.toggle("hidden");
        if (!isHidden && id === "login-modal") {
            // Re-render / refresh Google Sign-In button when modal opens
            setTimeout(initGoogleSignIn, 50);
        }
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

async function handleGoogleCredentialResponse(response) {
    const statusEl = document.getElementById("google-auth-status");
    if (statusEl) {
        statusEl.textContent = "Verifying Google credentials…";
        statusEl.className = "text-[11px] text-center font-mono text-cyan-400 min-h-[1.2rem]";
    }

    try {
        const role = document.getElementById("modal-role")?.value || "Student / Resident";
        const campus = document.getElementById("modal-campus-input")?.value.trim() || getSelectedCampus();

        const verifyRes = await fetch(getApiUrl("/api/auth/google/verify"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                credential: response.credential,
                role,
                campus,
            }),
        });

        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) {
            throw new Error(verifyData.error || `Google authentication failed with status ${verifyRes.status}`);
        }

        currentGoogleUser = verifyData.user;
        localStorage.setItem("cognivnet_google_user", JSON.stringify(currentGoogleUser));
        applyUserProfile(currentGoogleUser);

        if (statusEl) {
            statusEl.textContent = `✓ Signed in as ${currentGoogleUser.name}`;
            statusEl.className = "text-[11px] text-center font-mono text-emerald-400 min-h-[1.2rem]";
        }

        toggleModal("login-modal");
        showToast(`Signed in via Google as ${currentGoogleUser.name} (${currentGoogleUser.role})`);
        logEvent(`Google Sign-In verified: ${currentGoogleUser.email} [${currentGoogleUser.role}]`);
    } catch (err) {
        console.error("Google Sign-In error:", err);
        if (statusEl) {
            statusEl.textContent = err instanceof Error ? err.message : "Google sign-in failed.";
            statusEl.className = "text-[11px] text-center font-mono text-rose-400 min-h-[1.2rem]";
        }
        showToast("Google sign-in could not be completed.");
    }
}

function applyUserProfile(user) {
    if (!user) return;
    const roleLabel = document.getElementById("current-role-label");
    if (roleLabel) roleLabel.textContent = user.role;

    const emailLabel = document.getElementById("user-email-label");
    if (emailLabel) {
        emailLabel.textContent = `· ${user.email}`;
        emailLabel.classList.remove("hidden");
    }

    const avatarImg = document.getElementById("user-avatar-img");
    if (avatarImg) {
        if (user.picture) {
            avatarImg.src = user.picture;
            avatarImg.classList.remove("hidden");
        } else {
            avatarImg.classList.add("hidden");
        }
    }

    const loginBtn = document.getElementById("portal-login-btn");
    if (loginBtn) loginBtn.classList.add("hidden");

    const logoutBtn = document.getElementById("portal-logout-btn");
    if (logoutBtn) logoutBtn.classList.remove("hidden");

    if (user.campus) {
        const select = document.getElementById("campus-select");
        if (select) {
            let option = Array.from(select.options).find((item) => item.value === user.campus);
            if (!option) {
                option = document.createElement("option");
                option.value = user.campus;
                option.textContent = user.campus;
                select.appendChild(option);
            }
            select.value = user.campus;
        }
    }

    updateBroadcastAccess();
    updateCurrentPage();
}

function signOutUser() {
    currentGoogleUser = null;
    localStorage.removeItem("cognivnet_google_user");

    const roleLabel = document.getElementById("current-role-label");
    if (roleLabel) roleLabel.textContent = "Student";

    const emailLabel = document.getElementById("user-email-label");
    if (emailLabel) {
        emailLabel.textContent = "";
        emailLabel.classList.add("hidden");
    }

    const avatarImg = document.getElementById("user-avatar-img");
    if (avatarImg) avatarImg.classList.add("hidden");

    const loginBtn = document.getElementById("portal-login-btn");
    if (loginBtn) loginBtn.classList.remove("hidden");

    const logoutBtn = document.getElementById("portal-logout-btn");
    if (logoutBtn) logoutBtn.classList.add("hidden");

    // Revoke Google Identity Services session if available
    if (window.google?.accounts?.id?.disableAutoSelect) {
        google.accounts.id.disableAutoSelect();
    }

    updateBroadcastAccess();
    updateCurrentPage();
    showToast("Signed out. Switched back to Student / Resident.");
    logEvent("User signed out from CognivNet portal.");
}

let googleSignInAttempts = 0;
function initGoogleSignIn() {
    const container = document.getElementById("google-signin-btn-container");
    const statusEl = document.getElementById("google-auth-status");
    if (!container) return;

    if (window.google?.accounts?.id) {
        try {
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: handleGoogleCredentialResponse,
                auto_select: false,
                cancel_on_tap_outside: true,
            });

            container.innerHTML = "";
            google.accounts.id.renderButton(container, {
                theme: "filled_black",
                size: "large",
                text: "continue_with",
                shape: "pill",
                width: 280,
            });

            // If the container remains empty after render attempt, inject styled interactive button
            setTimeout(() => {
                if (!container.firstElementChild) {
                    renderFallbackGoogleButton(container);
                }
            }, 300);

            if (statusEl && statusEl.textContent.includes("Loading")) {
                statusEl.textContent = "";
            }
        } catch (e) {
            console.warn("Failed to render Google Sign-In button:", e);
            renderFallbackGoogleButton(container);
        }
    } else {
        googleSignInAttempts++;
        if (googleSignInAttempts < 6) {
            setTimeout(initGoogleSignIn, 500);
        } else {
            renderFallbackGoogleButton(container);
        }
    }
}

function renderFallbackGoogleButton(container) {
    if (!container) return;
    container.innerHTML = `
        <button type="button" onclick="triggerGoogleOneTapLogin()"
            class="w-full max-w-[280px] bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold py-2.5 px-4 rounded-full border border-slate-300 shadow-sm transition flex items-center justify-center space-x-2.5">
            <svg class="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>Continue with Google</span>
        </button>
    `;
}

function triggerGoogleOneTapLogin() {
    if (window.google?.accounts?.id) {
        google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                console.info("Google One Tap moment:", notification.getNotDisplayedReason());
            }
        });
    } else {
        showToast("Google Identity Services script loading... please try in a moment.");
    }
}

function restoreSavedSession() {
    try {
        const saved = localStorage.getItem("cognivnet_google_user");
        if (saved) {
            currentGoogleUser = JSON.parse(saved);
            applyUserProfile(currentGoogleUser);
        }
    } catch (e) {
        console.warn("Could not parse saved user session:", e);
    }
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
    const copilotLink = document.getElementById("ai-copilot-nav-link");
    if (copilotLink) {
        copilotLink.hidden = !isAdmin;
    }
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
    updateMapForCampus();
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

async function loadLiveWeatherAqiData() {
    const refreshBtn = document.getElementById("weather-refresh-btn");
    const aqiMainVal = document.getElementById("aqi-main-val");
    const aqiBadge = document.getElementById("aqi-badge-category");
    const aqiAdvisory = document.getElementById("aqi-advisory-summary");
    const tempVal = document.getElementById("weather-temp-val");
    const feelsLike = document.getElementById("weather-feels-like");
    const condDesc = document.getElementById("weather-condition-desc");
    const humidityVal = document.getElementById("weather-humidity-val");
    const windVal = document.getElementById("weather-wind-val");
    const dewVal = document.getElementById("weather-dew-val");
    const uvVal = document.getElementById("weather-uv-val");
    const pressureVal = document.getElementById("weather-pressure-val");
    const visVal = document.getElementById("weather-visibility-val");
    const pm25El = document.getElementById("pollutant-pm25");
    const pm10El = document.getElementById("pollutant-pm10");
    const no2El = document.getElementById("pollutant-no2");
    const so2El = document.getElementById("pollutant-so2");
    const o3El = document.getElementById("pollutant-o3");
    const coEl = document.getElementById("pollutant-co");
    const sourceEl = document.getElementById("aqi-telemetry-source");

    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.classList.add("opacity-60");
    }

    try {
        const campus = getSelectedCampus() || DEFAULT_CAMPUS;
        const coords = campusLocations[campus] || campusLocations[DEFAULT_CAMPUS];
        const res = await fetch(getApiUrl(`/api/weather/live?lat=${coords.lat}&lng=${coords.lng}`));
        const data = await res.json();

        if (!res.ok || !data.ok) {
            throw new Error(data.error || `HTTP ${res.status}`);
        }

        latestLiveWeatherAqi = data;

        // Populate AQI
        const aqi = data.airQuality;
        if (aqiMainVal) aqiMainVal.textContent = aqi.value;
        if (aqiBadge) {
            aqiBadge.textContent = aqi.category;
            aqiBadge.style.color = aqi.color;
            aqiBadge.style.borderColor = aqi.color;
        }
        if (aqiAdvisory) aqiAdvisory.textContent = aqi.advisory;

        // Pollutants
        if (pm25El) pm25El.textContent = `${aqi.pm25} µg/m³`;
        if (pm10El) pm10El.textContent = `${aqi.pm10} µg/m³`;
        if (no2El) no2El.textContent = `${aqi.no2} µg/m³`;
        if (so2El) so2El.textContent = `${aqi.so2} µg/m³`;
        if (o3El) o3El.textContent = `${aqi.o3} µg/m³`;
        if (coEl) coEl.textContent = `${aqi.co} µg/m³`;
        if (sourceEl) sourceEl.textContent = aqi.provider || "Live Multi-Sensor Station";

        // Weather
        const w = data.weather;
        if (tempVal) tempVal.textContent = `${Math.round(w.temperature ?? 31)}°C`;
        if (feelsLike) feelsLike.textContent = `Feels like ${Math.round(w.feelsLike ?? w.temperature ?? 31)}°C`;
        if (condDesc) condDesc.textContent = w.condition || "Clear";
        if (humidityVal) humidityVal.textContent = `${w.humidity ?? 52}%`;
        if (windVal) windVal.textContent = `${w.windSpeed ?? 8} km/h`;
        if (dewVal) dewVal.textContent = w.dewPoint ? `${w.dewPoint}°C` : "18°C";
        if (uvVal) uvVal.textContent = w.uvIndex !== undefined ? String(w.uvIndex) : "6 (Moderate)";
        if (pressureVal) pressureVal.textContent = w.airPressure ? `${w.airPressure} hPa` : "1012 hPa";
        if (visVal) visVal.textContent = w.visibility ? `${w.visibility} km` : "10 km";

        showToast("✓ Live Weather & AQI telemetry synchronized.");
        logEvent(`WEATHER & AQI: Temp ${w.temperature}°C (${w.condition}), AQI ${aqi.value} [${aqi.category}].`);
    } catch (err) {
        console.error("Failed to load live weather/aqi:", err);
        showToast("Could not fetch live weather/AQI telemetry.");
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.classList.remove("opacity-60");
        }
    }
}

function prepareWeatherBroadcast() {
    if (!latestLiveWeatherAqi) {
        showToast("Please wait for weather telemetry to load first.");
        return;
    }
    const campus = getSelectedCampus() || DEFAULT_CAMPUS;
    const w = latestLiveWeatherAqi.weather;
    const aqi = latestLiveWeatherAqi.airQuality;
    const message = `[CAMPUS WEATHER & AQI ADVISORY] ${campus}: Temperature is ${Math.round(w.temperature)}°C (${w.condition}). Air Quality Index is ${aqi.value} (${aqi.category}). ${aqi.advisory}`;

    const broadcastMessage = document.getElementById("broadcast-message");
    const broadcastType = document.getElementById("broadcast-type");
    if (broadcastMessage) broadcastMessage.value = message;
    if (broadcastType) broadcastType.value = aqi.value > 150 ? "emergency" : "alert";

    window.location.hash = "#admin-broadcast";
    showToast("Weather & AQI advisory populated into Admin Broadcast form.");
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

// --- Student Geolocation & Emergency SOS Helpers ---
async function getStudentLocation(preferredZone = null) {
    const campus = getSelectedCampus() || DEFAULT_CAMPUS;
    const fallbackZone = defaultHiTechZones[0]; // Dr Ram Saran Garg Indo-German Hospital

    if (typeof navigator !== "undefined" && navigator.geolocation) {
        try {
            const position = await new Promise((resolve, reject) => {
                let resolved = false;
                const timer = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        reject(new Error("Browser geolocation timed out"));
                    }
                }, 6000);

                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timer);
                            resolve(pos);
                        }
                    },
                    (err) => {
                        // If high-accuracy fails, retry once with low accuracy (standard Wi-Fi/IP location)
                        navigator.geolocation.getCurrentPosition(
                            (lowPos) => {
                                if (!resolved) {
                                    resolved = true;
                                    clearTimeout(timer);
                                    resolve(lowPos);
                                }
                            },
                            (finalErr) => {
                                if (!resolved) {
                                    resolved = true;
                                    clearTimeout(timer);
                                    reject(finalErr);
                                }
                            },
                            { timeout: 4000, maximumAge: 60000, enableHighAccuracy: false }
                        );
                    },
                    {
                        timeout: 3000,
                        maximumAge: 30000,
                        enableHighAccuracy: true,
                    }
                );
            });

            const lat = Number(position.coords.latitude.toFixed(5));
            const lng = Number(position.coords.longitude.toFixed(5));
            userCurrentCoords = { lat, lng };
            return {
                lat,
                lng,
                zone: "Live GPS Fix (Device Sensor)",
                mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
                accuracy: position.coords.accuracy ? Math.round(position.coords.accuracy) : null,
                isLive: true,
            };
        } catch (geoErr) {
            console.info("Geolocation device notice:", geoErr?.message || geoErr);
        }
    }

    // Immediate fallback to verified campus coordinates or last known coordinates
    const defaultZoneName = preferredZone || (campus === DEFAULT_CAMPUS
        ? "Dr Ram Saran Garg Indo-German Medical Centre / Wave City"
        : `${campus} Emergency Zone`);
    const lat = userCurrentCoords?.lat || fallbackZone.lat;
    const lng = userCurrentCoords?.lng || fallbackZone.lng;
    return {
        lat,
        lng,
        zone: defaultZoneName,
        mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
        isLive: false,
    };
}

function triggerStudentMedicalSos() {
    toggleModal("student-sos-modal");
    refreshStudentGps();
}

function setSosPreset(text) {
    const input = document.getElementById("sos-custom-message");
    if (input) {
        input.value = text;
        updateSosDirectWhatsappLink();
    }
}

function setModalSosPreset(text) {
    const input = document.getElementById("modal-sos-custom-message");
    if (input) {
        input.value = text;
        updateModalSosDirectWhatsappLink();
    }
}

async function refreshStudentGps() {
    const badge = document.getElementById("sos-location-text");
    const modalBadge = document.getElementById("modal-sos-location-text");
    const pageBadge = document.getElementById("page-sos-location-text");

    // Instantly show immediate baseline while device GPS resolves
    const fallbackZone = defaultHiTechZones[0];
    const baselineLat = userCurrentCoords?.lat || fallbackZone.lat;
    const baselineLng = userCurrentCoords?.lng || fallbackZone.lng;
    const initialText = `📍 ${baselineLat}, ${baselineLng} · Detecting GPS…`;

    if (badge) badge.textContent = initialText;
    if (modalBadge) modalBadge.textContent = initialText;
    if (pageBadge) pageBadge.textContent = initialText;

    try {
        cachedStudentLocation = await getStudentLocation("Dr Ram Saran Garg Indo-German Medical Centre / Wave City");
        const statusIcon = cachedStudentLocation.isLive ? "📍" : "📌";
        const label = `${statusIcon} ${cachedStudentLocation.zone} (${cachedStudentLocation.lat}, ${cachedStudentLocation.lng})`;
        if (badge) badge.textContent = label;
        if (modalBadge) modalBadge.textContent = label;
        if (pageBadge) pageBadge.textContent = label;
    } catch (err) {
        console.warn("GPS refresh error:", err);
        const fallbackText = `📍 Dr Ram Saran Garg Indo-German Medical Centre / Wave City (${baselineLat}, ${baselineLng})`;
        if (badge) badge.textContent = fallbackText;
        if (modalBadge) modalBadge.textContent = fallbackText;
        if (pageBadge) pageBadge.textContent = fallbackText;
    }

    updatePageSosDirectWhatsappLink();
}

function setPageSosPreset(text) {
    const input = document.getElementById("page-sos-custom-message");
    if (input) {
        input.value = text;
        updatePageSosDirectWhatsappLink();
    }
}

function formatDirectWhatsappUrl(customMsg = "") {
    const msg = customMsg || (document.getElementById("page-sos-custom-message")?.value || "").trim() || "Student urgent medical emergency assistance requested at campus premises";
    const loc = cachedStudentLocation || (userCurrentCoords ? {
        lat: userCurrentCoords.lat,
        lng: userCurrentCoords.lng,
        zone: "Live GPS Fix (Device Sensor)",
    } : defaultHiTechZones[0]);
    const campus = getSelectedCampus() || DEFAULT_CAMPUS;
    const role = document.getElementById("current-role-label")?.textContent || "Student / Resident";
    const timeStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const locStr = `${loc.zone || "Campus Medical Zone"} (Lat: ${loc.lat}, Lng: ${loc.lng})`;
    const body = `🚨 *COGNIVNET CAMPUS MEDICAL EMERGENCY SOS*\n\n📍 *Exact Incident Location:* ${locStr}\n🗺️ *Live GPS Pin:* https://www.google.com/maps?q=${loc.lat},${loc.lng}\n🏫 *Campus:* ${campus}\n👤 *Sender Role:* ${role}\n\n📝 *Emergency Situation / Patient Details:*\n"${msg}"\n\n⏰ *Time:* ${timeStr} IST`;
    return `https://wa.me/918700794497?text=${encodeURIComponent(body)}`;
}

function updatePageSosDirectWhatsappLink() {
    const link = document.getElementById("page-sos-direct-whatsapp-link");
    if (!link) return;
    link.href = formatDirectWhatsappUrl();
}

function sendDirectPageSosWhatsapp(event) {
    if (event) event.preventDefault();
    const url = formatDirectWhatsappUrl();
    const link = document.getElementById("page-sos-direct-whatsapp-link");
    if (link) link.href = url;
    window.open(url, "_blank");
    showToast("Opening WhatsApp with prefilled emergency alert to Campus Admin (+918700794497)...");
    logEvent("Direct WhatsApp Medical SOS triggered with live GPS coordinates.");
}

async function submitPageStudentMedicalSos() {
    const msgInput = document.getElementById("page-sos-custom-message");
    const customMessage = (msgInput?.value || "").trim() || "Student medical emergency assistance requested at campus";
    const btn = document.getElementById("page-sos-dispatch-btn");
    await dispatchStudentSosPayload(customMessage, btn);
}

async function submitStudentMedicalSos() {
    const msgInput = document.getElementById("sos-custom-message");
    const customMessage = (msgInput?.value || "").trim() || "Student medical emergency assistance requested at campus";
    const btn = document.getElementById("sos-dispatch-btn");
    await dispatchStudentSosPayload(customMessage, btn);
}

async function submitModalStudentSos() {
    const msgInput = document.getElementById("modal-sos-custom-message");
    const customMessage = (msgInput?.value || "").trim() || "Student medical emergency assistance requested at campus";
    const btn = document.getElementById("modal-sos-dispatch-btn");
    await dispatchStudentSosPayload(customMessage, btn);
    toggleModal("student-sos-modal");
}

async function dispatchStudentSosPayload(customMessage, triggerBtn) {
    const role = document.getElementById("current-role-label")?.textContent || "Student / Resident";
    const campus = getSelectedCampus() || DEFAULT_CAMPUS;

    if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.classList.add("opacity-50");
    }

    showToast("📍 Acquiring student GPS location & dispatching WhatsApp alert to Admin...");
    logEvent("INITIATING MEDICAL SOS: Transmitting custom emergency payload...");

    try {
        const location = cachedStudentLocation || await getStudentLocation("Dr Ram Saran Garg Indo-German Medical Centre / Hi-Tech Wave City");
        cachedStudentLocation = location;

        const response = await fetch(getApiUrl("/api/emergency/medical-sos"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                campus,
                location,
                studentRole: role,
                message: customMessage,
            }),
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `Medical SOS request failed with status ${response.status}.`);
        }

        showToast("🚨 MEDICAL SOS ACTIVE! Emergency broadcast dispatched with GPS pin.");
        logEvent(`EMERGENCY: Student Medical SOS sent! Note: "${customMessage}". Location: ${location.lat}, ${location.lng}.`);

        // Update direct WhatsApp link href across page and modals
        if (result.whatsappUrl) {
            const pageWa = document.getElementById("page-sos-direct-whatsapp-link");
            if (pageWa) pageWa.href = result.whatsappUrl;
            const sidebarWa = document.getElementById("sos-direct-whatsapp-link");
            if (sidebarWa) sidebarWa.href = result.whatsappUrl;
            const modalWa = document.getElementById("modal-sos-direct-whatsapp-btn");
            if (modalWa) modalWa.href = result.whatsappUrl;
        }

        // Pan map directly to student location
        if (activeMapEngine === "leaflet" && leafletMap) {
            leafletMap.setView([location.lat, location.lng], 18);
            const alertIcon = L.divIcon({
                className: "custom-sos-wrapper",
                html: `<div class="custom-marker-icon" style="background-color: #ef4444; width: 44px; height: 44px; font-size: 22px; border-color: #fca5a5; box-shadow: 0 0 25px #ef4444;">🚑</div>`,
                iconSize: [44, 44],
                iconAnchor: [22, 22],
            });
            const sosMarker = L.marker([location.lat, location.lng], { icon: alertIcon }).addTo(leafletMap);
            sosMarker.bindPopup(`
                <div style="font-family: 'JetBrains Mono', monospace; background: #450a0a; color: #fecaca; padding: 12px; border-radius: 8px; border: 1px solid #ef4444;">
                    <div style="font-size: 13px; font-weight: bold; color: #f87171;">🚨 STUDENT MEDICAL SOS</div>
                    <div style="font-size: 11px; margin-top: 4px; font-weight: 600;">"${customMessage}"</div>
                    <div style="font-size: 11px; margin-top: 4px;">Lat: ${location.lat}, Lng: ${location.lng} (${location.zone})</div>
                    <div style="font-size: 10px; color: #fca5a5; margin-top: 4px;">WhatsApp alert dispatched to Admin (+918700794497)</div>
                    <div style="margin-top: 6px;"><a href="${location.mapsUrl}" target="_blank" style="color: #38bdf8; text-decoration: underline; font-size: 10px;">Open in Google Maps ↗</a></div>
                </div>
            `).openPopup();
        } else if (satelliteMap && typeof google !== "undefined" && google.maps) {
            satelliteMap.panTo({ lat: location.lat, lng: location.lng });
            satelliteMap.setZoom(18);
            new google.maps.Marker({
                position: { lat: location.lat, lng: location.lng },
                map: satelliteMap,
                title: `STUDENT MEDICAL SOS: ${customMessage}`,
                animation: google.maps.Animation.BOUNCE,
            });
        }
    } catch (err) {
        console.error("Medical SOS error:", err);
        showToast(err instanceof Error ? err.message : "Failed to transmit Medical SOS.");
        logEvent(`ERROR: Medical SOS dispatch failed: ${err.message}`);
    } finally {
        if (triggerBtn) {
            triggerBtn.disabled = false;
            triggerBtn.classList.remove("opacity-50");
        }
    }
}

async function sendBroadcast(messageOverride, typeOverride, locationOverride, isMedicalOverride) {
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
        const isMedical = isMedicalOverride !== undefined
            ? isMedicalOverride
            : (/medical|ambulance|hospital|patient|doctor|trauma|injury/i.test(message) || type === "emergency");

        const location = locationOverride || (isMedical ? await getStudentLocation("Dr Ram Saran Garg Indo-German Medical Centre") : null);

        const response = await fetch(getApiUrl("/api/broadcasts"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                campus,
                type,
                message,
                location,
                isMedical,
                studentRole: role,
            }),
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

async function dispatchD2M() {
    const preset = document.getElementById("emergency-type").value;
    const details = document.getElementById("broadcast-message").value.trim();
    const isMedical = preset.toLowerCase().includes("medical");
    const location = isMedical ? await getStudentLocation("Dr Ram Saran Garg Indo-German Medical Centre") : null;
    const locationSuffix = location ? ` [Location: ${location.zone} - Lat: ${location.lat}, Lng: ${location.lng}]` : "";
    const message = details ? `${preset}: ${details}${locationSuffix}` : `${preset}${locationSuffix}`;
    document.getElementById("broadcast-type").value = "emergency";
    sendBroadcast(message.slice(0, 500), "emergency", location, isMedical);
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

/* ===== Dual-Engine Satellite Map System (Google Maps 3D + Leaflet Fallback) ===== */

window.gm_authFailure = function() {
    console.warn("Google Maps API authentication failed or key restricted. Switching cleanly to ESRI satellite fallback engine.");
    googleAuthFailed = true;
    activeMapEngine = "leaflet";
    if (satelliteMap) {
        satelliteMap = null;
    }
    initFallbackSatelliteMap();
};

function initSatelliteMap() {
    const mapElement = document.getElementById("satellite-map");
    if (!mapElement) {
        return;
    }

    // If Google Auth already failed, immediately load Leaflet
    if (googleAuthFailed) {
        initFallbackSatelliteMap();
        return;
    }

    if (typeof google === "undefined" || !google.maps) {
        initFallbackSatelliteMap();
        return;
    }

    // Teardown any existing Leaflet map instance
    if (leafletMap) {
        try {
            leafletMap.remove();
        } catch (e) {
            console.warn("Leaflet cleanup:", e);
        }
        leafletMap = null;
        mapElement.innerHTML = "";
    }

    const campus = getSelectedCampus() || DEFAULT_CAMPUS;
    const location = campusLocations[campus] || campusLocations[DEFAULT_CAMPUS];

    try {
        activeMapEngine = "google";
        mapIs3D = true;
        mapIsRotating = false;
        if (mapRotationInterval) {
            clearInterval(mapRotationInterval);
            mapRotationInterval = null;
        }

        satelliteMap = new google.maps.Map(mapElement, {
            center: { lat: location.lat, lng: location.lng },
            zoom: location.zoom || 17,
            mapTypeId: "hybrid",
            tilt: 45,
            heading: 0,
            mapTypeControl: true,
            mapTypeControlOptions: {
                style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                position: google.maps.ControlPosition.TOP_RIGHT,
            },
            streetViewControl: false,
            fullscreenControl: true,
            zoomControl: true,
            gestureHandling: "greedy",
        });

        const statusBadge = document.getElementById("map-status");
        if (statusBadge) {
            statusBadge.textContent = "3D Satellite View";
        }
        const tiltBtn = document.getElementById("map-toggle-tilt");
        if (tiltBtn) {
            tiltBtn.textContent = "Toggle 2D";
        }
        const rotateBtn = document.getElementById("map-rotate-btn");
        if (rotateBtn) {
            rotateBtn.textContent = "Auto-Rotate";
            rotateBtn.classList.remove("bg-cyan-700");
        }

        placeCampusMarkers(campus);
        logEvent("3D Google satellite map initialized for " + (location.label || campus) + ".");

        // Detect if Google Maps displays internal "Oops! Something went wrong" (ApiNotActivatedMapError / BillingNotEnabled)
        const checkGoogleMapHealth = () => {
            const hasErrorText = mapElement.innerText && (
                mapElement.innerText.includes("Oops! Something went wrong") ||
                mapElement.innerText.includes("This page didn't load Google Maps correctly")
            );
            if (hasErrorText) {
                console.warn("Google Maps rendered error banner. Falling back to high-res ESRI satellite.");
                googleAuthFailed = true;
                satelliteMap = null;
                initFallbackSatelliteMap();
            }
        };
        setTimeout(checkGoogleMapHealth, 1200);
        setTimeout(checkGoogleMapHealth, 2500);
    } catch (err) {
        console.error("Google Maps initialization error:", err);
        googleAuthFailed = true;
        initFallbackSatelliteMap();
    }
}

function initFallbackSatelliteMap() {
    const mapElement = document.getElementById("satellite-map");
    if (!mapElement || typeof L === "undefined") {
        return;
    }

    activeMapEngine = "leaflet";

    if (leafletMap) {
        updateMapForCampus();
        leafletMap.invalidateSize();
        return;
    }

    mapElement.innerHTML = "";
    const campus = getSelectedCampus() || DEFAULT_CAMPUS;
    const location = campusLocations[campus] || campusLocations[DEFAULT_CAMPUS];

    leafletMap = L.map(mapElement, {
        center: [location.lat, location.lng],
        zoom: location.zoom || 17,
        zoomControl: true,
        attributionControl: false,
    });

    // ESRI World Street Map (Clean normal street map - NO API key, ZERO watermarks)
    leafletOsmLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
        attribution: "Esri Street Map",
    });

    // ESRI World Imagery (High-res Satellite view - default - NO API key, ZERO watermarks)
    leafletEsriLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
        attribution: "Esri Satellite Imagery",
    });

    // Default to Satellite view
    if (currentMapMode === "satellite") {
        leafletEsriLayer.addTo(leafletMap);
    } else {
        leafletOsmLayer.addTo(leafletMap);
    }

    updateMapModeUi(currentMapMode);

    placeLeafletCampusMarkers(campus);
    updateDistanceChips();
    // Silently attempt initial GPS positioning
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            const lat = Number(pos.coords.latitude.toFixed(5));
            const lng = Number(pos.coords.longitude.toFixed(5));
            const acc = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : 25;
            userCurrentCoords = { lat, lng };
            displayUserLiveLocationOnMap(lat, lng, acc, false);
            updateDistanceChips();
        }, () => {
            updateDistanceChips();
        }, { timeout: 6000, maximumAge: 30000 });
    }

    setTimeout(() => {
        if (leafletMap) {
            leafletMap.invalidateSize();
        }
    }, 150);
    setTimeout(() => {
        if (leafletMap) {
            leafletMap.invalidateSize();
        }
    }, 400);
    logEvent("Map active in " + currentMapMode + " view for " + (location.label || campus) + ".");
}

function setMapViewMode(mode) {
    currentMapMode = mode;
    updateMapModeUi(mode);

    if (activeMapEngine === "google" && satelliteMap) {
        if (mode === "satellite") {
            satelliteMap.setMapTypeId("hybrid");
            if (mapIs3D) satelliteMap.setTilt(45);
        } else {
            satelliteMap.setMapTypeId("roadmap");
            satelliteMap.setTilt(0);
        }
        showToast(`Map switched to ${mode === "satellite" ? "Satellite" : "Normal Street"} view.`);
        return;
    }

    if (leafletMap) {
        if (mode === "satellite") {
            if (leafletOsmLayer && leafletMap.hasLayer(leafletOsmLayer)) {
                leafletMap.removeLayer(leafletOsmLayer);
            }
            if (leafletEsriLayer && !leafletMap.hasLayer(leafletEsriLayer)) {
                leafletEsriLayer.addTo(leafletMap);
            }
        } else {
            if (leafletEsriLayer && leafletMap.hasLayer(leafletEsriLayer)) {
                leafletMap.removeLayer(leafletEsriLayer);
            }
            if (leafletOsmLayer && !leafletMap.hasLayer(leafletOsmLayer)) {
                leafletOsmLayer.addTo(leafletMap);
            }
        }
        leafletMap.invalidateSize();
        showToast(`Map switched to ${mode === "satellite" ? "High-Res Satellite" : "Normal Street"} view.`);
    }
}

function updateMapModeUi(mode) {
    const btnSat = document.getElementById("btn-map-satellite");
    const btnNorm = document.getElementById("btn-map-normal");
    const status = document.getElementById("map-status");

    if (btnSat && btnNorm) {
        if (mode === "satellite") {
            btnSat.className = "text-xs font-semibold px-2.5 py-1 rounded transition bg-cyan-600 text-white shadow-sm flex items-center space-x-1";
            btnNorm.className = "text-xs font-semibold px-2.5 py-1 rounded transition text-slate-300 hover:text-white flex items-center space-x-1";
        } else {
            btnNorm.className = "text-xs font-semibold px-2.5 py-1 rounded transition bg-cyan-600 text-white shadow-sm flex items-center space-x-1";
            btnSat.className = "text-xs font-semibold px-2.5 py-1 rounded transition text-slate-300 hover:text-white flex items-center space-x-1";
        }
    }

    if (status) {
        status.textContent = mode === "satellite" ? "Satellite View" : "Normal Street Map";
    }
}

async function locateUserOnMap() {
    const locateBtn = document.getElementById("btn-locate-user");
    if (locateBtn) {
        locateBtn.disabled = true;
        locateBtn.classList.add("opacity-60");
    }

    showToast("📍 Accessing device GPS to fetch your live location…");
    logEvent("GEOLOCATION: Querying device GPS sensors for live user location...");

    try {
        if (!navigator.geolocation) {
            throw new Error("Geolocation is not supported by your browser.");
        }

        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 10000,
            });
        });

        const lat = Number(position.coords.latitude.toFixed(5));
        const lng = Number(position.coords.longitude.toFixed(5));
        const accuracy = position.coords.accuracy ? Math.round(position.coords.accuracy) : 30;

        displayUserLiveLocationOnMap(lat, lng, accuracy);
        showToast(`📍 Live Location Found: ${lat}, ${lng} (±${accuracy}m accuracy)`);
        logEvent(`USER LOCATED: Lat: ${lat}, Lng: ${lng} (Accuracy: ±${accuracy}m). Map centered.`);
    } catch (err) {
        console.warn("Live user geolocation error:", err.message);
        // Fallback to high-accuracy Hi-Tech campus coordinates with friendly note
        const campus = getSelectedCampus() || DEFAULT_CAMPUS;
        const loc = campusLocations[campus] || campusLocations[DEFAULT_CAMPUS];
        displayUserLiveLocationOnMap(loc.lat, loc.lng, 25, true);
        showToast("📍 Displaying verified campus coordinates (permission note: " + err.message + ")");
        logEvent(`LOCATION NOTE: Using verified campus node coordinates: ${loc.lat}, ${loc.lng}`);
    } finally {
        if (locateBtn) {
            locateBtn.disabled = false;
            locateBtn.classList.remove("opacity-60");
        }
    }
}

function displayUserLiveLocationOnMap(lat, lng, accuracy = 30, isSimulated = false) {
    if (activeMapEngine === "leaflet" || leafletMap) {
        if (!leafletMap) return;

        // Clean up previous user live markers
        if (userLiveMarker) {
            userLiveMarker.remove();
            userLiveMarker = null;
        }
        if (userLiveAccuracyCircle) {
            userLiveAccuracyCircle.remove();
            userLiveAccuracyCircle = null;
        }

        // Draw accuracy circle
        userLiveAccuracyCircle = L.circle([lat, lng], {
            radius: Math.max(accuracy, 20),
            color: "#38bdf8",
            fillColor: "#0284c7",
            fillOpacity: 0.15,
            weight: 1.5,
            dashArray: "4 4",
        }).addTo(leafletMap);

        // Custom pulsing live radar marker
        const liveUserIcon = L.divIcon({
            className: "custom-user-live-wrapper",
            html: `
                <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
                    <div style="position: absolute; inset: 0; border-radius: 50%; background: #38bdf8; opacity: 0.4; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
                    <div style="width: 22px; height: 22px; border-radius: 50%; background: #0284c7; border: 3px solid #ffffff; box-shadow: 0 0 14px #38bdf8; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #fff;">
                        📍
                    </div>
                </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            popupAnchor: [0, -18],
        });

        userLiveMarker = L.marker([lat, lng], { icon: liveUserIcon, zIndexOffset: 1000 }).addTo(leafletMap);
        
        userLiveMarker.bindPopup(`
            <div style="font-family: 'JetBrains Mono', monospace; background: #082f49; color: #f0f9ff; padding: 12px 14px; border-radius: 8px; border: 1px solid #38bdf8; min-width: 220px;">
                <div style="display: flex; items-center; justify-content: space-between; margin-bottom: 4px;">
                    <span style="font-size: 12px; font-weight: 700; color: #38bdf8;">📍 YOU ARE HERE</span>
                    <span style="font-size: 8px; background: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: bold;">LIVE GPS</span>
                </div>
                <div style="font-size: 10px; color: #bae6fd; margin-bottom: 6px;">
                    ${isSimulated ? "Campus Verified Node" : "Live Device GPS Fix"}
                </div>
                <div style="background: #0c4a6e; padding: 6px 8px; border-radius: 6px; font-size: 9px; line-height: 1.5;">
                    <div>Lat: <strong>${lat}</strong>, Lng: <strong>${lng}</strong></div>
                    <div>Accuracy: <strong>±${accuracy} meters</strong></div>
                </div>
                <div style="margin-top: 8px; text-align: right;">
                    <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" style="color: #38bdf8; text-decoration: underline; font-size: 10px;">Google Maps Navigation ↗</a>
                </div>
            </div>
        `).openPopup();

        userCurrentCoords = { lat, lng };
        updateDistanceChips();
        // If an active route exists, update the route polyline dynamically to reflect new user location
        if (activeRouteDestination) {
            routeToDestination(activeRouteDestination.lat, activeRouteDestination.lng, activeRouteDestination.title, activeRouteDestination.color, false);
        }

        // Smoothly zoom in to user position
        leafletMap.setView([lat, lng], 18, { animate: true });
        return;
    }

    if (satelliteMap && typeof google !== "undefined" && google.maps) {
        userCurrentCoords = { lat, lng };
        updateDistanceChips();
        satelliteMap.panTo({ lat, lng });
        satelliteMap.setZoom(18);

        const marker = new google.maps.Marker({
            position: { lat, lng },
            map: satelliteMap,
            title: "Your Live Location",
            animation: google.maps.Animation.BOUNCE,
        });

        const info = new google.maps.InfoWindow({
            content: `<div style="padding: 8px; font-family: monospace;"><b>📍 YOU ARE HERE</b><br>Lat: ${lat}, Lng: ${lng}</div>`,
        });
        info.open(satelliteMap, marker);
    }
}

// Great-circle Haversine formula to accurately calculate real ground distance in meters
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's mean radius in meters
    const toRad = (val) => (val * Math.PI) / 180;
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const deltaPhi = toRad(lat2 - lat1);
    const deltaLambda = toRad(lon2 - lon1);

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
}

function formatDistance(meters) {
    if (meters < 1000) {
        return `${meters} meters`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
}

function estimateWalkTime(meters) {
    if (meters <= 1500) {
        // Walking distance (<1.5 km, average walking pace ~ 75 meters / min)
        const minutes = Math.max(1, Math.round(meters / 75));
        return `${minutes} min walk`;
    }
    // Greater distance: Transit / Drive time (avg city/expressway 45 km/h ~ 750 m/min)
    const driveMinutes = Math.max(1, Math.round(meters / 750));
    return `${driveMinutes} min drive`;
}

let isSimulatedOnCampus = false;

function setOriginToCampusCenter() {
    const campus = getSelectedCampus() || DEFAULT_CAMPUS;
    const location = campusLocations[campus] || campusLocations[DEFAULT_CAMPUS];
    isSimulatedOnCampus = !isSimulatedOnCampus;

    const snapBtn = document.getElementById("btn-snap-campus");
    const statusBadge = document.getElementById("reroute-gps-status");
    const descText = document.getElementById("reroute-gps-desc");

    if (isSimulatedOnCampus) {
        // Place user precisely at campus entrance/center
        userCurrentCoords = { lat: location.lat, lng: location.lng };
        displayUserLiveLocationOnMap(location.lat, location.lng, 15, true);
        if (snapBtn) {
            snapBtn.innerHTML = `<i data-lucide="crosshair" class="w-3.5 h-3.5"></i><span>Restore Live GPS</span>`;
            snapBtn.className = "text-[11px] bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-700 transition flex items-center space-x-1";
        }
        if (statusBadge) {
            statusBadge.textContent = "On-Campus Mode";
            statusBadge.className = "text-[10px] text-cyan-300 font-mono bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800";
        }
        if (descText) {
            descText.textContent = "Simulating user standing directly at campus grounds. All distances are local walking distances (50m – 300m).";
        }
        showToast("📍 Snapped origin to Hi-Tech Campus Main Gate (Local On-Campus Navigation).");
    } else {
        locateUserOnMap();
        if (snapBtn) {
            snapBtn.innerHTML = `<i data-lucide="building" class="w-3.5 h-3.5"></i><span>Simulate On-Campus</span>`;
            snapBtn.className = "text-[11px] bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 px-2.5 py-1 rounded-lg border border-cyan-800 transition flex items-center space-x-1";
        }
        if (statusBadge) {
            statusBadge.textContent = "Live Device GPS";
            statusBadge.className = "text-[10px] text-emerald-400 font-mono bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800";
        }
        if (descText) {
            descText.textContent = "Click any campus destination to calculate real-time walking/transit distance and render route guide.";
        }
    }
    updateDistanceChips();
    if (window.lucide) {
        lucide.createIcons();
    }
}

function updateDistanceChips() {
    const container = document.getElementById("distance-chips-container");
    if (!container) return;

    const campus = getSelectedCampus() || DEFAULT_CAMPUS;
    const zones = campusZones[campus] || campusZones[DEFAULT_CAMPUS];
    const userLat = userCurrentCoords.lat;
    const userLng = userCurrentCoords.lng;

    container.innerHTML = "";

    zones.forEach((zone) => {
        const dist = calculateDistanceMeters(userLat, userLng, zone.lat, zone.lng);
        const distStr = formatDistance(dist);
        const walkStr = estimateWalkTime(dist);
        const colors = zoneColors[zone.type] || { marker: "#38bdf8" };
        const icon = zoneIcons[zone.type] || "📍";
        const isCurrentRoute = activeRouteDestination && activeRouteDestination.title === zone.title;

        const card = document.createElement("div");
        card.className = `p-2.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
            isCurrentRoute
                ? "bg-cyan-950/90 border-cyan-500 shadow-md ring-1 ring-cyan-500"
                : "bg-slate-900 hover:bg-slate-800/80 border-slate-800 hover:border-slate-700"
        }`;
        card.onclick = () => routeToDestination(zone.lat, zone.lng, zone.title, colors.marker);

        card.innerHTML = `
            <div class="flex items-start justify-between">
                <span class="text-xs font-bold text-slate-100 flex items-center gap-1.5 truncate">
                    <span>${icon}</span>
                    <span class="truncate" title="${zone.title}">${zone.title.split('·')[0].trim()}</span>
                </span>
                <span class="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-bold" style="color: ${colors.marker}; background: ${colors.marker}20;">
                    ${zone.type}
                </span>
            </div>
            <div class="mt-2 flex items-center justify-between text-[11px] font-mono">
                <span class="text-cyan-300 font-bold flex items-center gap-1">
                    <i data-lucide="${dist > 1500 ? 'car' : 'footprints'}" class="w-3 h-3 text-cyan-400"></i>
                    <span>${distStr}</span>
                </span>
                <span class="text-slate-400 text-[10px]">~${walkStr}</span>
            </div>
            <div class="mt-2 text-[10px] text-right font-sans font-semibold text-cyan-400 hover:underline">
                ${isCurrentRoute ? "✓ Active Route" : "Navigate / Reroute →"}
            </div>
        `;
        container.appendChild(card);
    });

    if (window.lucide) {
        lucide.createIcons();
    }
}

function routeToDestination(destLat, destLng, destTitle, color = "#38bdf8", showNotification = true) {
    if (!leafletMap) return;

    activeRouteDestination = { lat: destLat, lng: destLng, title: destTitle, color };

    // Remove any prior active route line
    if (activeRoutePolyline) {
        activeRoutePolyline.remove();
        activeRoutePolyline = null;
    }

    const start = [userCurrentCoords.lat, userCurrentCoords.lng];
    const end = [destLat, destLng];
    const dist = calculateDistanceMeters(start[0], start[1], end[0], end[1]);
    const distStr = formatDistance(dist);
    const walkStr = estimateWalkTime(dist);

    // Draw glowing animated navigational polyline
    activeRoutePolyline = L.polyline([start, end], {
        color: color,
        weight: 4,
        opacity: 0.9,
        dashArray: "8 8",
        lineCap: "round",
    }).addTo(leafletMap);

    activeRoutePolyline.bindPopup(`
        <div style="font-family: 'JetBrains Mono', monospace; background: #0f172a; color: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid ${color};">
            <div style="font-size: 12px; font-weight: bold; color: ${color};">🗺️ ACTIVE ROUTE GUIDANCE</div>
            <div style="font-size: 11px; margin-top: 4px;">Destination: <strong>${destTitle}</strong></div>
            <div style="font-size: 11px; margin-top: 4px; color: #38bdf8;">Straight-line Distance: <strong>${distStr}</strong></div>
            <div style="font-size: 10px; margin-top: 2px; color: #94a3b8;">Estimated walking time: ~<strong>${walkStr}</strong></div>
            <div style="margin-top: 6px;">
                <a href="https://www.google.com/maps/dir/?api=1&origin=${start[0]},${start[1]}&destination=${end[0]},${end[1]}" target="_blank" style="color: #38bdf8; text-decoration: underline; font-size: 10px; font-weight: 600;">
                    Turn-by-turn Directions in Google Maps ↗
                </a>
            </div>
        </div>
    `).openPopup();

    // Fit map bounds to show both user and target destination
    const bounds = L.latLngBounds([start, end]);
    leafletMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });

    const clearBtn = document.getElementById("btn-clear-route");
    if (clearBtn) clearBtn.classList.remove("hidden");

    updateDistanceChips();

    if (showNotification) {
        showToast(`🧭 Route active to ${destTitle.split('·')[0].trim()} (${distStr}, ~${walkStr})`);
        logEvent(`REROUTING: Navigation active from User (${start[0]}, ${start[1]}) to ${destTitle} (${distStr}).`);
    }
}

function clearActiveRoute() {
    if (activeRoutePolyline) {
        activeRoutePolyline.remove();
        activeRoutePolyline = null;
    }
    activeRouteDestination = null;
    const clearBtn = document.getElementById("btn-clear-route");
    if (clearBtn) clearBtn.classList.add("hidden");
    updateDistanceChips();
    showToast("Route cleared.");
    logEvent("Rerouting guide cleared.");
}

function placeLeafletCampusMarkers(campus) {
    if (!leafletMap) return;

    leafletMarkers.forEach((m) => m.remove());
    leafletCircles.forEach((c) => c.remove());
    leafletMarkers = [];
    leafletCircles = [];

    const zones = campusZones[campus] || campusZones[DEFAULT_CAMPUS];
    const bounds = L.latLngBounds([]);

    zones.forEach((zone) => {
        const colors = zoneColors[zone.type];
        const iconEmoji = zoneIcons[zone.type];

        const circle = L.circle([zone.lat, zone.lng], {
            radius: zone.radius,
            color: colors.circle,
            fillColor: colors.circle,
            fillOpacity: 0.16,
            weight: 2,
        }).addTo(leafletMap);
        leafletCircles.push(circle);

        const customIcon = L.divIcon({
            className: "custom-marker-wrapper",
            html: `
                <div class="custom-marker-icon" style="background-color: ${colors.marker}; width: 36px; height: 36px; font-size: 17px; border-color: #ffffff; box-shadow: 0 0 16px ${colors.marker}80;">
                    ${iconEmoji}
                </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            popupAnchor: [0, -20],
        });

        const marker = L.marker([zone.lat, zone.lng], { icon: customIcon }).addTo(leafletMap);
        
        // Permanent readable badge on the map so users always see the place name without needing to click
        marker.bindTooltip(`
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #f8fafc; background: rgba(15, 23, 42, 0.95); padding: 4px 8px; border-radius: 6px; border: 1px solid ${colors.marker}; box-shadow: 0 4px 12px rgba(0,0,0,0.6); display: flex; align-items: center; gap: 4px;">
                <span>${iconEmoji}</span> <span>${zone.title.split('·')[0].trim()}</span>
            </div>
        `, {
            permanent: true,
            direction: "bottom",
            offset: [0, 14],
            className: "cognivnet-permanent-tooltip",
        });

        marker.bindPopup(`
            <div style="font-family: 'JetBrains Mono', monospace; background: #0f172a; color: #e2e8f0; padding: 14px 16px; border-radius: 10px; min-width: 250px; border: 1px solid ${colors.marker}; box-shadow: 0 10px 25px rgba(0,0,0,0.7);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 13px; font-weight: 700; color: ${colors.marker};">${iconEmoji} ${zone.title}</span>
                    <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: ${colors.marker}25; color: ${colors.marker}; font-weight: bold; text-transform: uppercase;">ONLINE</span>
                </div>
                <div style="font-size: 11px; line-height: 1.5; color: #cbd5e1; margin-bottom: 8px;">${zone.desc}</div>
                <div style="background: #020617; padding: 8px 10px; border-radius: 6px; border: 1px solid #1e293b; font-size: 10px; color: #94a3b8; space-y: 4px;">
                    <div style="display: flex; justify-content: space-between;"><span>📍 GPS Lat, Lng:</span><strong style="color: #38bdf8;">${zone.lat}, ${zone.lng}</strong></div>
                    <div style="display: flex; justify-content: space-between; margin-top: 3px;"><span>📡 D2M Range:</span><strong style="color: #34d399;">${zone.radius}m Radius</strong></div>
                </div>
                <div style="margin-top: 8px; text-align: right;">
                    <a href="https://www.google.com/maps?q=${zone.lat},${zone.lng}" target="_blank" style="color: #38bdf8; text-decoration: underline; font-size: 10px; font-weight: 600;">View in Google Maps ↗</a>
                </div>
            </div>
        `);

        bounds.extend([zone.lat, zone.lng]);
        leafletMarkers.push(marker);
    });

    const location = campusLocations[campus] || campusLocations[DEFAULT_CAMPUS];
    const coreIcon = L.divIcon({
        className: "custom-core-wrapper",
        html: `
            <div class="custom-marker-icon" style="background-color: #7c3aed; width: 44px; height: 44px; font-size: 20px; border-color: #c4b5fd; box-shadow: 0 0 24px rgba(167, 139, 250, 0.9);">
                📡
            </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -24],
    });

    const coreMarker = L.marker([location.lat, location.lng], { icon: coreIcon }).addTo(leafletMap);
    
    // Permanent badge for Central Core Hub
    coreMarker.bindTooltip(`
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #c4b5fd; background: rgba(15, 23, 42, 0.95); padding: 4px 8px; border-radius: 6px; border: 1px solid #a78bfa; box-shadow: 0 4px 12px rgba(0,0,0,0.6); display: flex; align-items: center; gap: 4px;">
            <span>📡</span> <span>COGNIVNET 5G/6G CORE</span>
        </div>
    `, {
        permanent: true,
        direction: "bottom",
        offset: [0, 16],
        className: "cognivnet-permanent-tooltip",
    });

    coreMarker.bindPopup(`
        <div style="font-family: 'JetBrains Mono', monospace; background: #0f172a; color: #e2e8f0; padding: 14px 16px; border-radius: 10px; min-width: 260px; border: 1px solid #a78bfa; box-shadow: 0 10px 25px rgba(0,0,0,0.7);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 13px; font-weight: 700; color: #a78bfa;">📡 COGNIVNET CORE HUB</span>
                <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: rgba(167, 139, 250, 0.25); color: #c4b5fd; font-weight: bold;">ACTIVE</span>
            </div>
            <div style="font-size: 12px; font-weight: 600; color: #f8fafc; margin-bottom: 4px;">${location.label || campus}</div>
            <div style="font-size: 10px; line-height: 1.5; color: #94a3b8; margin-bottom: 8px;">Autonomous 5G/6G D2M Cognitive Core with real-time spectrum cognition and terrestrial broadcast sync.</div>
            <div style="background: #020617; padding: 8px 10px; border-radius: 6px; border: 1px solid #1e293b; font-size: 10px; color: #94a3b8;">
                <div style="display: flex; justify-content: space-between;"><span>📍 Coordinates:</span><strong style="color: #38bdf8;">${location.lat}, ${location.lng}</strong></div>
                <div style="display: flex; justify-content: space-between; margin-top: 3px;"><span>⚡ Core Status:</span><strong style="color: #34d399;">SYNCHRONIZED</strong></div>
            </div>
            <div style="margin-top: 8px; text-align: right;">
                <a href="https://www.google.com/maps?q=${location.lat},${location.lng}" target="_blank" style="color: #38bdf8; text-decoration: underline; font-size: 10px; font-weight: 600;">View in Google Maps ↗</a>
            </div>
        </div>
    `);

    bounds.extend([location.lat, location.lng]);
    leafletMarkers.push(coreMarker);

    if (leafletMarkers.length > 0) {
        leafletMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
    }
}

function placeCampusMarkers(campus) {
    mapMarkers.forEach((marker) => marker.setMap(null));
    mapCircles.forEach((circle) => circle.setMap(null));
    mapMarkers = [];
    mapCircles = [];

    const zones = campusZones[campus] || campusZones[DEFAULT_CAMPUS];

    zones.forEach((zone) => {
        const colors = zoneColors[zone.type];
        const icon = zoneIcons[zone.type];

        const circle = new google.maps.Circle({
            strokeColor: colors.circle,
            strokeOpacity: 0.7,
            strokeWeight: 2,
            fillColor: colors.circle,
            fillOpacity: 0.15,
            map: satelliteMap,
            center: { lat: zone.lat, lng: zone.lng },
            radius: zone.radius,
        });
        mapCircles.push(circle);

        const marker = new google.maps.Marker({
            position: { lat: zone.lat, lng: zone.lng },
            map: satelliteMap,
            title: zone.title,
            label: {
                text: icon,
                fontSize: "16px",
            },
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 16,
                fillColor: colors.marker,
                fillOpacity: 0.9,
                strokeColor: "#ffffff",
                strokeWeight: 2,
            },
            animation: google.maps.Animation.DROP,
        });

        const infoWindow = new google.maps.InfoWindow({
            content: `
                <div style="font-family: 'JetBrains Mono', monospace; background: #0f172a; color: #e2e8f0; padding: 12px 16px; border-radius: 8px; max-width: 270px; border: 1px solid ${colors.marker}50;">
                    <div style="font-size: 13px; font-weight: 700; color: ${colors.marker}; margin-bottom: 6px;">${icon} ${zone.title}</div>
                    <div style="font-size: 10px; line-height: 1.6; color: #94a3b8;">${zone.desc}</div>
                    <div style="margin-top: 8px; font-size: 9px; color: ${colors.marker}; font-weight: bold; letter-spacing: 0.08em;">COVERAGE: ${zone.radius}m RADIUS · LIVE</div>
                </div>
            `,
        });

        marker.addListener("click", () => {
            infoWindow.open(satelliteMap, marker);
        });

        mapMarkers.push(marker);
    });

    const location = campusLocations[campus] || campusLocations[DEFAULT_CAMPUS];
    const coreMarker = new google.maps.Marker({
        position: { lat: location.lat, lng: location.lng },
        map: satelliteMap,
        title: "CognivNet Core · " + (location.label || campus),
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 22,
            fillColor: "#a78bfa",
            fillOpacity: 0.35,
            strokeColor: "#a78bfa",
            strokeWeight: 3,
        },
        zIndex: 0,
    });

    const coreInfo = new google.maps.InfoWindow({
        content: `
            <div style="font-family: 'JetBrains Mono', monospace; background: #0f172a; color: #e2e8f0; padding: 14px 18px; border-radius: 8px; max-width: 280px; border: 1px solid #a78bfa50;">
                <div style="font-size: 14px; font-weight: 700; color: #a78bfa; margin-bottom: 6px;">📡 COGNIVNET CORE</div>
                <div style="font-size: 11px; font-weight: 600; color: #e2e8f0; margin-bottom: 4px;">${location.label || campus}</div>
                <div style="font-size: 10px; line-height: 1.6; color: #94a3b8;">Central cognitive network hub — AI-driven load balancing, D2M broadcast control, and URLLC slice management active.</div>
                <div style="margin-top: 8px; font-size: 9px; color: #34d399; font-weight: bold; letter-spacing: 0.08em;">STATUS: ONLINE · ALL SECTORS SYNCHRONIZED</div>
            </div>
        `,
    });

    coreMarker.addListener("click", () => {
        coreInfo.open(satelliteMap, coreMarker);
    });

    mapMarkers.push(coreMarker);

    if (mapMarkers.length > 1) {
        const bounds = new google.maps.LatLngBounds();
        mapMarkers.forEach((m) => bounds.extend(m.getPosition()));
        satelliteMap.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
        if (mapIs3D) {
            satelliteMap.setTilt(45);
        }
    }
}

function toggleMapTilt() {
    if (activeMapEngine === "leaflet" || leafletMap) {
        mapIs3D = !mapIs3D;
        if (leafletMap) {
            leafletMap.setZoom(mapIs3D ? 17 : 15);
        }
        const btn = document.getElementById("map-toggle-tilt");
        const status = document.getElementById("map-status");
        if (btn) btn.textContent = mapIs3D ? "Wide Angle" : "Close-Up 3D";
        if (status) status.textContent = mapIs3D ? "High-Res Close-Up" : "Overview View";
        return;
    }

    if (!satelliteMap) {
        return;
    }

    mapIs3D = !mapIs3D;
    satelliteMap.setTilt(mapIs3D ? 45 : 0);

    const btn = document.getElementById("map-toggle-tilt");
    const status = document.getElementById("map-status");
    if (btn) btn.textContent = mapIs3D ? "Toggle 2D" : "Toggle 3D";
    if (status) status.textContent = mapIs3D ? "3D Satellite View" : "2D Satellite View";
    logEvent(`Map view switched to ${mapIs3D ? "3D tilted" : "2D flat"} satellite mode.`);
}

function toggleMapRotation() {
    if (activeMapEngine === "leaflet" || leafletMap) {
        const btn = document.getElementById("map-rotate-btn");
        if (mapIsRotating) {
            clearInterval(mapRotationInterval);
            mapRotationInterval = null;
            mapIsRotating = false;
            if (btn) {
                btn.textContent = "Auto-Rotate";
                btn.classList.remove("bg-cyan-700");
            }
        } else {
            mapIsRotating = true;
            if (btn) {
                btn.textContent = "Stop Rotation";
                btn.classList.add("bg-cyan-700");
            }
            let angle = 0;
            const center = leafletMap.getCenter();
            const radius = 0.002;
            mapRotationInterval = setInterval(() => {
                angle += 0.05;
                const newLat = center.lat + radius * Math.cos(angle);
                const newLng = center.lng + radius * Math.sin(angle);
                leafletMap.panTo([newLat, newLng], { animate: true, duration: 0.1 });
            }, 100);
        }
        return;
    }

    if (!satelliteMap) {
        return;
    }

    const btn = document.getElementById("map-rotate-btn");

    if (mapIsRotating) {
        clearInterval(mapRotationInterval);
        mapRotationInterval = null;
        mapIsRotating = false;
        if (btn) {
            btn.textContent = "Auto-Rotate";
            btn.classList.remove("bg-cyan-700");
        }
        logEvent("Map auto-rotation stopped.");
    } else {
        if (!mapIs3D) {
            toggleMapTilt();
        }
        mapIsRotating = true;
        if (btn) {
            btn.textContent = "Stop Rotation";
            btn.classList.add("bg-cyan-700");
        }
        let heading = satelliteMap.getHeading() || 0;
        mapRotationInterval = setInterval(() => {
            heading = (heading + 0.5) % 360;
            satelliteMap.setHeading(heading);
        }, 50);
        logEvent("Map auto-rotation enabled — orbiting campus view.");
    }
}

function updateMapForCampus() {
    const campus = getSelectedCampus() || DEFAULT_CAMPUS;
    const location = campusLocations[campus] || campusLocations[DEFAULT_CAMPUS];

    if (activeMapEngine === "leaflet" || leafletMap) {
        if (leafletMap) {
            leafletMap.setView([location.lat, location.lng], location.zoom || 17);
            placeLeafletCampusMarkers(campus);
        }
        logEvent(`Satellite map updated for ${campus}.`);
        return;
    }

    if (!satelliteMap) {
        return;
    }

    if (location) {
        satelliteMap.panTo({ lat: location.lat, lng: location.lng });
        satelliteMap.setZoom(location.zoom || 17);
        placeCampusMarkers(campus);
        logEvent(`Satellite map updated for ${campus}.`);
    } else {
        const defaultLocation = campusLocations[DEFAULT_CAMPUS];
        satelliteMap.panTo({ lat: defaultLocation.lat, lng: defaultLocation.lng });
        satelliteMap.setZoom(defaultLocation.zoom || 17);
        placeCampusMarkers(DEFAULT_CAMPUS);
        logEvent(`Satellite map defaulting to Hi-Tech Campus for dynamic network.`);
    }
}

// --- AI Assistant Broadcast Copilot Handlers ---
async function generateAiBroadcast() {
    const promptInput = document.getElementById("copilot-prompt");
    const tierSelect = document.getElementById("copilot-tier");
    const status = document.getElementById("copilot-status");
    const outputBox = document.getElementById("copilot-output-box");
    const charCount = document.getElementById("copilot-char-count");
    const charPill = document.getElementById("copilot-char-pill");
    const sourceTag = document.getElementById("copilot-source-tag");
    const pushFormBtn = document.getElementById("copilot-push-form-btn");
    const directSendBtn = document.getElementById("copilot-direct-send-btn");
    const generateBtn = document.getElementById("copilot-generate-btn");

    const prompt = (promptInput?.value || "").trim();
    const type = tierSelect?.value || "announcement";
    const languageSelect = document.getElementById("copilot-language");
    const language = languageSelect?.value || "auto";
    const campus = getSelectedCampus() || DEFAULT_CAMPUS;

    if (!prompt) {
        if (status) {
            status.textContent = "Please enter field notes or incident details to condense.";
            status.className = "text-xs font-mono text-amber-400 min-h-[1.5rem]";
        }
        promptInput?.focus();
        return;
    }

    copilotRequestInProgress = true;
    if (generateBtn) generateBtn.disabled = true;
    if (status) {
        status.textContent = "AI Copilot analyzing, translating & polishing into authoritative broadcast (50–100 words)…";
        status.className = "text-xs font-mono text-cyan-400 min-h-[1.5rem]";
    }

    try {
        const response = await fetch(getApiUrl("/api/assistant/chat"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, type, campus, language }),
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `AI Copilot request failed with status ${response.status}.`);
        }

        latestAiDraft = result;
        if (outputBox) {
            outputBox.textContent = result.message;
            outputBox.classList.remove("text-slate-600", "italic");
            outputBox.classList.add("text-emerald-300");
        }
        if (charCount) {
            charCount.textContent = String(result.charCount || result.message.length);
        }
        if (charPill) {
            const wordCountDisplay = result.wordCount ? ` · ${result.wordCount} words` : "";
            charPill.innerHTML = `<span id="copilot-char-count">${result.charCount}</span> / 500 chars${wordCountDisplay}`;
            charPill.className = "text-xs font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-600";
        }
        if (sourceTag) {
            const langLabel = result.language ? ` · ${result.language.toUpperCase()}` : "";
            const engineLabel = result.engine || (result.source?.includes("ollama") ? "Ollama (Llama 3)" : (result.source === "gemini-ai" ? "Gemini 1.5 Flash" : "CognivNet Copilot Engine"));
            sourceTag.textContent = `${engineLabel}${langLabel}`;
            sourceTag.classList.remove("hidden");
        }
        if (pushFormBtn) pushFormBtn.disabled = false;
        if (directSendBtn) directSendBtn.disabled = false;

        if (status) {
            const wordCountStr = result.wordCount ? ` (${result.wordCount} words, ${result.charCount} chars)` : ` (${result.charCount} chars)`;
            status.textContent = `Polished authoritative broadcast ready${wordCountStr}. Safe for D2M transmission.`;
            status.className = "text-xs font-mono text-emerald-400 min-h-[1.5rem]";
        }
        showToast("AI Copilot generated concise, polished emergency broadcast.");
        logEvent(`AI Copilot synthesized broadcast for ${campus} [${result.type.toUpperCase()}] (${result.wordCount || 0} words).`);
    } catch (error) {
        console.error("AI Copilot error:", error);
        if (status) {
            status.textContent = error instanceof Error ? error.message : "AI Copilot failed to process request.";
            status.className = "text-xs font-mono text-red-400 min-h-[1.5rem]";
        }
    } finally {
        copilotRequestInProgress = false;
        if (generateBtn) generateBtn.disabled = false;
    }
}

function pushDraftToBroadcastForm() {
    if (!latestAiDraft || !latestAiDraft.message) {
        showToast("Generate an AI draft first before sending to form.");
        return;
    }

    const broadcastMessage = document.getElementById("broadcast-message");
    const broadcastType = document.getElementById("broadcast-type");
    const copilotToken = document.getElementById("copilot-token-input");
    const broadcastToken = document.getElementById("broadcast-token");

    if (broadcastMessage) {
        broadcastMessage.value = latestAiDraft.message;
    }
    if (broadcastType) {
        broadcastType.value = latestAiDraft.type;
    }
    if (copilotToken && copilotToken.value && broadcastToken) {
        broadcastToken.value = copilotToken.value;
    }

    // Switch to admin broadcast view
    window.location.hash = "#admin-broadcast";
    showToast("AI payload populated into live campus broadcast form.");
    logEvent("AI Copilot payload pushed to admin broadcast dispatch form.");
}

async function directTransmitAiBroadcast() {
    if (!latestAiDraft || !latestAiDraft.message) {
        showToast("Generate an AI draft first before transmitting.");
        return;
    }

    const copilotTokenInput = document.getElementById("copilot-token-input");
    const token = copilotTokenInput ? copilotTokenInput.value.trim() : "";
    const status = document.getElementById("copilot-status");
    const directSendBtn = document.getElementById("copilot-direct-send-btn");

    if (!token) {
        if (status) {
            status.textContent = "Please enter the ADMIN_BROADCAST_TOKEN to authorize direct transmission.";
            status.className = "text-xs font-mono text-amber-400 min-h-[1.5rem]";
        }
        copilotTokenInput?.focus();
        return;
    }

    const campus = getSelectedCampus() || DEFAULT_CAMPUS;
    const type = latestAiDraft.type || "announcement";
    const message = latestAiDraft.message;
    const isMedical = type === "emergency" || /medical|ambulance|hospital|patient|doctor|trauma|injury/i.test(message);

    if (directSendBtn) directSendBtn.disabled = true;
    if (status) {
        status.textContent = "Transmitting AI broadcast payload directly via SSE…";
        status.className = "text-xs font-mono text-cyan-400 min-h-[1.5rem]";
    }

    try {
        const location = isMedical ? await getStudentLocation("Dr Ram Saran Garg Indo-German Medical Centre") : null;
        const response = await fetch(getApiUrl("/api/broadcasts"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ campus, type, message, location, isMedical }),
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `Direct transmission failed with status ${response.status}.`);
        }

        if (status) {
            status.textContent = `Transmitted directly! Delivered to ${result.deliveredSessions} connected session(s) in ${campus}.`;
            status.className = "text-xs font-mono text-emerald-400 min-h-[1.5rem]";
        }
        showToast(`AI Broadcast delivered directly to ${result.deliveredSessions} session(s)!`);
        logEvent(`Direct AI broadcast transmitted for ${campus} (${type.toUpperCase()}).`);
        refreshAudienceCount();
    } catch (error) {
        console.error("Direct transmission error:", error);
        if (status) {
            status.textContent = error instanceof Error ? error.message : "Direct broadcast failed.";
            status.className = "text-xs font-mono text-red-400 min-h-[1.5rem]";
        }
    } finally {
        if (directSendBtn) directSendBtn.disabled = false;
    }
}

function loadSampleCopilotPrompt() {
    const tierSelect = document.getElementById("copilot-tier");
    const promptInput = document.getElementById("copilot-prompt");
    const counter = document.getElementById("copilot-input-counter");

    if (tierSelect) {
        tierSelect.value = "emergency";
    }
    if (promptInput) {
        promptInput.value = "Transformer surge and heavy smoke reported near Wave City sector outside boys hostel perimeter gate. Maintenance and local fire tender dispatched on emergency line. All students and residents in hostel block B must immediately remain indoors, shut exterior windows, and avoid north perimeter.";
        if (counter) {
            counter.textContent = `${promptInput.value.length} chars`;
        }
    }
}