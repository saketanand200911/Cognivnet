const { createServer } = require("node:http");
const { timingSafeEqual, randomUUID } = require("node:crypto");
const { appendFile, readFile } = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "frontend");
const broadcastHistoryPath = path.join(__dirname, "broadcast-history.jsonl");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const adminToken = process.env.ADMIN_BROADCAST_TOKEN || "";
const googleWeatherApiKey = process.env.GOOGLE_WEATHER_API_KEY || "";
const weatherLatitude = Number(process.env.WEATHER_LATITUDE || "28.6711527");
const weatherLongitude = Number(process.env.WEATHER_LONGITUDE || "77.4120356");
const maxMessageBytes = 8 * 1024;
const maxBroadcastsPerMinute = 20;
const weatherPollIntervalMs = 15 * 60 * 1000;
const allowedFrontendOrigins = new Set([
    "http://127.0.0.1:5500",
    "http://localhost:5500",
]);
const connectedSessions = new Map();
const rateLimits = new Map();
let historyWrite = Promise.resolve();
const weatherMonitor = {
    enabled: false,
    campus: null,
    interval: null,
    lastCheckedAt: null,
    lastError: null,
    activeHazards: new Map(),
    checkInProgress: false,
};

const staticFiles = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/index.html", ["index.html", "text/html; charset=utf-8"]],
    ["/index.js", ["index.js", "text/javascript; charset=utf-8"]],
    ["/style.css", ["style.css", "text/css; charset=utf-8"]],
]);

function sendJson(response, status, payload) {
    response.writeHead(status, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
    });
    response.end(JSON.stringify(payload));
}

function applyApiCors(request, response) {
    const origin = request.headers.origin;
    if (!origin) {
        return true;
    }
    if (!allowedFrontendOrigins.has(origin)) {
        sendJson(response, 403, { error: "This frontend origin is not allowed to access the broadcast API." });
        return false;
    }

    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type");
    response.setHeader("Access-Control-Max-Age", "600");
    response.setHeader("Vary", "Origin");
    return true;
}

function getCampus(value) {
    if (typeof value !== "string") {
        return null;
    }
    const campus = value.trim();
    if (!campus || campus.length > 120 || /[\r\n\0]/.test(campus)) {
        return null;
    }
    return campus;
}

function getSessionCount(campus) {
    return connectedSessions.get(campus)?.size || 0;
}

async function archiveBroadcast(broadcast) {
    const write = historyWrite.catch(() => {}).then(() => (
        appendFile(broadcastHistoryPath, `${JSON.stringify(broadcast)}\n`, "utf8")
    ));
    historyWrite = write;
    await write;
}

async function readBroadcastHistory(campus) {
    await historyWrite;
    let content;
    try {
        content = await readFile(broadcastHistoryPath, "utf8");
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    }

    const broadcasts = content.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    return broadcasts.filter((broadcast) => !campus || broadcast.campus === campus).reverse();
}

function removeSession(campus, response) {
    const sessions = connectedSessions.get(campus);
    if (!sessions) {
        return;
    }
    sessions.delete(response);
    if (sessions.size === 0) {
        connectedSessions.delete(campus);
    }
}

function hasValidAdminToken(request) {
    const authorization = request.headers.authorization || "";
    const match = /^Bearer (.+)$/.exec(authorization);
    if (!adminToken || !match) {
        return false;
    }
    const suppliedToken = Buffer.from(match[1]);
    const configuredToken = Buffer.from(adminToken);
    return suppliedToken.length === configuredToken.length
        && timingSafeEqual(suppliedToken, configuredToken);
}

function isRateLimited(request) {
    const address = request.socket.remoteAddress || "unknown";
    const now = Date.now();
    const recentRequests = (rateLimits.get(address) || []).filter((time) => now - time < 60_000);
    if (recentRequests.length >= maxBroadcastsPerMinute) {
        rateLimits.set(address, recentRequests);
        return true;
    }
    recentRequests.push(now);
    rateLimits.set(address, recentRequests);
    return false;
}

async function readJsonBody(request) {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
        size += chunk.length;
        if (size > maxMessageBytes) {
            const error = new Error("Request body is too large.");
            error.statusCode = 413;
            throw error;
        }
        chunks.push(chunk);
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        const error = new Error("Request body must be valid JSON.");
        error.statusCode = 400;
        throw error;
    }
}

function publishBroadcast(campus, broadcast) {
    const sessions = connectedSessions.get(campus);
    if (!sessions) {
        return 0;
    }

    const event = `event: broadcast\ndata: ${JSON.stringify(broadcast)}\n\n`;
    let deliveredSessions = 0;
    for (const response of sessions) {
        if (!response.destroyed && response.writable) {
            response.write(event);
            deliveredSessions += 1;
        }
    }
    return deliveredSessions;
}

async function createBroadcast(campus, type, message) {
    const broadcast = {
        id: randomUUID(),
        campus,
        type,
        message,
        createdAt: new Date().toISOString(),
    };
    await archiveBroadcast(broadcast);
    const deliveredSessions = publishBroadcast(campus, broadcast);
    console.info(`Campus ${type} broadcast ${broadcast.id} sent to ${deliveredSessions} connected session(s).`);
    return { broadcast, deliveredSessions };
}

function getWeatherMonitorStatus() {
    return {
        enabled: weatherMonitor.enabled,
        configured: Boolean(googleWeatherApiKey),
        campus: weatherMonitor.campus,
        location: "Ghaziabad, Uttar Pradesh (city-level coordinates)",
        lastCheckedAt: weatherMonitor.lastCheckedAt,
        lastError: weatherMonitor.lastError,
        activeHazards: [...weatherMonitor.activeHazards.values()],
    };
}

async function fetchGoogleWeather(pathname) {
    const weatherUrl = new URL(`https://weather.googleapis.com/v1/${pathname}`);
    weatherUrl.searchParams.set("key", googleWeatherApiKey);
    weatherUrl.searchParams.set("location.latitude", String(weatherLatitude));
    weatherUrl.searchParams.set("location.longitude", String(weatherLongitude));
    weatherUrl.searchParams.set("unitsSystem", "METRIC");
    if (pathname === "forecast/hours:lookup") {
        weatherUrl.searchParams.set("pageSize", "24");
    }

    const response = await fetch(weatherUrl, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
        const responseText = await response.text();
        let errorMessage = "";
        try {
            errorMessage = JSON.parse(responseText)?.error?.message || "";
        } catch {
            errorMessage = "";
        }
        const safeMessage = errorMessage
            .replaceAll(googleWeatherApiKey, "[redacted]")
            .replace(/\s+/g, " ")
            .slice(0, 240);
        throw new Error(
            `Google Weather ${pathname} failed with HTTP ${response.status}${safeMessage ? `: ${safeMessage}` : "."}`,
        );
    }
    return response.json();
}

function getHazards(current, forecast) {
    const hours = Array.isArray(forecast.forecastHours) ? forecast.forecastHours : [];
    const values = [];
    const numeric = (value) => {
        if (Number.isFinite(value)) {
            return value;
        }
        return Number.isFinite(value?.value) ? value.value : undefined;
    };
    const addHazard = (key, description) => values.push({ key, description });
    const atTime = (hour) => {
        const value = hour.interval?.startTime;
        if (!value) {
            return "";
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : ` near ${date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })} IST`;
    };

    const thunderstormProbability = [
        numeric(current.thunderstormProbability),
        ...hours.map((hour) => numeric(hour.thunderstormProbability)),
    ].filter(Number.isFinite);
    const maxThunderstormProbability = Math.max(...thunderstormProbability, 0);
    if (maxThunderstormProbability >= 70) {
        const hour = hours.find((item) => item.thunderstormProbability >= 70);
        addHazard(
            "thunderstorm",
            `Thunderstorm probability ${Math.round(maxThunderstormProbability)}%${hour ? atTime(hour) : ""}`,
        );
    }

    const windGusts = [
        { value: numeric(current.wind?.gust?.value) },
        ...hours.map((hour) => ({ value: numeric(hour.wind?.gust?.value), hour })),
    ].filter((item) => Number.isFinite(item.value));
    const maxWindGust = Math.max(...windGusts.map((item) => item.value), 0);
    if (maxWindGust >= 60) {
        const peak = windGusts.find((item) => item.value === maxWindGust);
        addHazard("wind", `Wind gusts up to ${Math.round(maxWindGust)} km/h${peak?.hour ? atTime(peak.hour) : ""}`);
    }

    const rainHours = hours
        .map((hour) => ({
            amount: numeric(hour.precipitation?.qpf?.quantity ?? hour.precipitation?.qpf),
            hour,
        }))
        .filter((item) => Number.isFinite(item.amount));
    const peakRain = rainHours.reduce(
        (peak, item) => item.amount > peak.amount ? item : peak,
        { amount: 0, hour: null },
    );
    if (peakRain.amount >= 25) {
        addHazard("rain", `Forecast rainfall ${peakRain.amount} mm/hour${peakRain.hour ? atTime(peakRain.hour) : ""}`);
    }

    const temperatures = [
        { degrees: current.temperature?.degrees },
        ...hours.map((hour) => ({ degrees: hour.temperature?.degrees, hour })),
    ].filter((item) => Number.isFinite(item.degrees));
    const maxTemperature = temperatures.reduce(
        (extreme, item) => item.degrees > extreme.degrees ? item : extreme,
        { degrees: -Infinity, hour: null },
    );
    if (maxTemperature.degrees >= 45) {
        addHazard("heat", `Extreme heat forecast at ${maxTemperature.degrees.toFixed(1)}°C${maxTemperature.hour ? atTime(maxTemperature.hour) : ""}`);
    }
    const minTemperature = temperatures.reduce(
        (extreme, item) => item.degrees < extreme.degrees ? item : extreme,
        { degrees: Infinity, hour: null },
    );
    if (minTemperature.degrees <= 0) {
        addHazard("cold", `Freezing temperatures forecast at ${minTemperature.degrees.toFixed(1)}°C${minTemperature.hour ? atTime(minTemperature.hour) : ""}`);
    }
    return values;
}

async function checkWeatherConditions() {
    if (!weatherMonitor.enabled || weatherMonitor.checkInProgress) {
        return;
    }
    weatherMonitor.checkInProgress = true;
    try {
        const [current, forecast] = await Promise.all([
            fetchGoogleWeather("currentConditions:lookup"),
            fetchGoogleWeather("forecast/hours:lookup"),
        ]);
        if (!weatherMonitor.enabled) {
            return;
        }
        if (!current?.temperature || !Array.isArray(forecast?.forecastHours)) {
            throw new Error("Google Weather API response did not contain current conditions and hourly forecast data.");
        }
        const hazards = getHazards(current, forecast);
        const nextHazards = new Map(hazards.map((hazard) => [hazard.key, hazard]));
        const newlyActive = hazards.filter((hazard) => !weatherMonitor.activeHazards.has(hazard.key));
        if (newlyActive.length > 0) {
            const details = newlyActive.map((hazard) => hazard.description).join("; ");
            const message = `WEATHER EMERGENCY — ${weatherMonitor.campus}. ${details}. Verify with local authorities and official weather alerts.`;
            await createBroadcast(weatherMonitor.campus, "emergency", message.slice(0, 500));
        }
        weatherMonitor.activeHazards = nextHazards;
        weatherMonitor.lastError = null;
        weatherMonitor.lastCheckedAt = new Date().toISOString();
    } catch (error) {
        if (weatherMonitor.enabled) {
            weatherMonitor.lastError = error instanceof Error ? error.message : "Weather check failed.";
            console.error("Weather monitoring check failed:", weatherMonitor.lastError);
        }
    } finally {
        weatherMonitor.checkInProgress = false;
    }
}

function startWeatherMonitor(campus) {
    if (!googleWeatherApiKey) {
        const error = new Error("Set GOOGLE_WEATHER_API_KEY on the server before enabling weather monitoring.");
        error.statusCode = 503;
        throw error;
    }
    if (!Number.isFinite(weatherLatitude) || !Number.isFinite(weatherLongitude)
        || weatherLatitude < -90 || weatherLatitude > 90
        || weatherLongitude < -180 || weatherLongitude > 180) {
        const error = new Error("Weather coordinates are invalid. Set WEATHER_LATITUDE and WEATHER_LONGITUDE.");
        error.statusCode = 500;
        throw error;
    }

    if (weatherMonitor.campus !== campus) {
        weatherMonitor.activeHazards.clear();
    }
    if (weatherMonitor.interval) {
        clearInterval(weatherMonitor.interval);
    }
    weatherMonitor.enabled = true;
    weatherMonitor.campus = campus;
    weatherMonitor.interval = setInterval(checkWeatherConditions, weatherPollIntervalMs);
    weatherMonitor.interval.unref();
    void checkWeatherConditions();
}

function stopWeatherMonitor() {
    if (weatherMonitor.interval) {
        clearInterval(weatherMonitor.interval);
        weatherMonitor.interval = null;
    }
    weatherMonitor.enabled = false;
    weatherMonitor.lastError = null;
}

async function serveStaticFile(request, response, pathname) {
    const file = staticFiles.get(pathname);
    if (!file) {
        sendJson(response, 404, { error: "Not found." });
        return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end();
        return;
    }

    try {
        const content = await readFile(path.join(root, file[0]));
        response.writeHead(200, {
            "Cache-Control": "no-cache",
            "Content-Length": content.length,
            "Content-Type": file[1],
            "Referrer-Policy": "same-origin",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
        });
        response.end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
        console.error("Failed to serve frontend file:", error);
        sendJson(response, 500, { error: "Could not serve the requested page." });
    }
}

const server = createServer(async (request, response) => {
    let url;
    try {
        url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    } catch {
        sendJson(response, 400, { error: "Invalid request URL." });
        return;
    }

    if (url.pathname.startsWith("/api/")) {
        if (!applyApiCors(request, response)) {
            return;
        }
        if (request.method === "OPTIONS") {
            response.writeHead(204);
            response.end();
            return;
        }
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { status: "ok", adminBroadcastConfigured: Boolean(adminToken) });
        return;
    }

    if (request.method === "GET" && url.pathname === "/api/weather/monitor") {
        sendJson(response, 200, getWeatherMonitorStatus());
        return;
    }

    if (request.method === "POST" && url.pathname === "/api/weather/monitor") {
        if (!adminToken) {
            sendJson(response, 503, { error: "Weather monitoring requires ADMIN_BROADCAST_TOKEN on the server." });
            return;
        }
        if (!hasValidAdminToken(request)) {
            sendJson(response, 401, { error: "Administrator key is invalid." });
            return;
        }
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) {
            sendJson(response, 415, { error: "Content-Type must be application/json." });
            return;
        }

        try {
            const body = await readJsonBody(request);
            if (typeof body?.enabled !== "boolean") {
                sendJson(response, 400, { error: "Provide enabled as true or false." });
                return;
            }
            if (body.enabled) {
                const campus = getCampus(body.campus);
                if (!campus) {
                    sendJson(response, 400, { error: "A valid campus is required." });
                    return;
                }
                startWeatherMonitor(campus);
            } else {
                stopWeatherMonitor();
            }
            sendJson(response, 200, getWeatherMonitorStatus());
        } catch (error) {
            if (error instanceof Error && error.statusCode) {
                sendJson(response, error.statusCode, { error: error.message });
            } else {
                console.error("Could not update weather monitoring:", error);
                sendJson(response, 500, { error: "Could not update weather monitoring." });
            }
        }
        return;
    }

    if (request.method === "GET" && url.pathname === "/api/broadcasts/history") {
        const campusValue = url.searchParams.get("campus");
        const campus = campusValue === null ? null : getCampus(campusValue);
        if (campusValue !== null && !campus) {
            sendJson(response, 400, { error: "A valid campus is required." });
            return;
        }

        try {
            sendJson(response, 200, { broadcasts: await readBroadcastHistory(campus) });
        } catch (error) {
            console.error("Could not read campus broadcast history:", error);
            sendJson(response, 500, { error: "Could not load campus broadcast history." });
        }
        return;
    }

    if (request.method === "GET" && url.pathname === "/api/broadcasts/audience") {
        const campus = getCampus(url.searchParams.get("campus"));
        if (!campus) {
            sendJson(response, 400, { error: "A valid campus is required." });
            return;
        }
        sendJson(response, 200, { campus, connectedSessions: getSessionCount(campus) });
        return;
    }

    if (request.method === "GET" && url.pathname === "/api/broadcasts/stream") {
        const campus = getCampus(url.searchParams.get("campus"));
        if (!campus) {
            sendJson(response, 400, { error: "A valid campus is required." });
            return;
        }

        response.writeHead(200, {
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "Content-Type": "text/event-stream; charset=utf-8",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
        });
        response.write("retry: 5000\n\n");
        const sessions = connectedSessions.get(campus) || new Set();
        sessions.add(response);
        connectedSessions.set(campus, sessions);
        response.write(`event: ready\ndata: ${JSON.stringify({ campus })}\n\n`);
        const heartbeat = setInterval(() => {
            if (!response.destroyed) {
                response.write(": keep-alive\n\n");
            }
        }, 25_000);
        heartbeat.unref();
        response.on("close", () => {
            clearInterval(heartbeat);
            removeSession(campus, response);
        });
        return;
    }

    if (request.method === "POST" && url.pathname === "/api/broadcasts") {
        if (!adminToken) {
            sendJson(response, 503, { error: "Broadcasting is not configured on this server." });
            return;
        }
        if (!hasValidAdminToken(request)) {
            sendJson(response, 401, { error: "Administrator key is invalid." });
            return;
        }
        if (isRateLimited(request)) {
            sendJson(response, 429, { error: "Broadcast limit reached. Wait before sending another message." });
            return;
        }
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) {
            sendJson(response, 415, { error: "Content-Type must be application/json." });
            return;
        }

        try {
            const body = await readJsonBody(request);
            const campus = getCampus(body?.campus);
            const type = body?.type;
            const message = typeof body?.message === "string" ? body.message.trim() : "";
            if (!campus || !["announcement", "alert", "emergency"].includes(type)
                || !message || message.length > 500 || /[\0]/.test(message)) {
                sendJson(response, 400, { error: "Provide a valid campus, message type, and message of 1–500 characters." });
                return;
            }

            const { broadcast, deliveredSessions } = await createBroadcast(campus, type, message);
            sendJson(response, 200, { id: broadcast.id, deliveredSessions, campus });
        } catch (error) {
            if (error instanceof Error && error.statusCode) {
                sendJson(response, error.statusCode, { error: error.message });
            } else {
                console.error("Failed to process campus broadcast:", error);
                sendJson(response, 500, { error: "The broadcast could not be processed." });
            }
        }
        return;
    }

    if (url.pathname.startsWith("/api/")) {
        sendJson(response, 404, { error: "API route not found." });
        return;
    }
    await serveStaticFile(request, response, url.pathname);
});

server.listen(port, host, () => {
    console.info(`CognivNet server listening on http://${host}:${port}`);
    if (!adminToken) {
        console.warn("Broadcast API is disabled until ADMIN_BROADCAST_TOKEN is configured.");
    }
});

server.on("error", (error) => {
    console.error("Could not start the CognivNet server:", error);
    process.exitCode = 1;
});

function closeServer() {
    stopWeatherMonitor();
    for (const sessions of connectedSessions.values()) {
        for (const response of sessions) {
            response.end();
        }
    }
    server.close(() => process.exit(0));
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
