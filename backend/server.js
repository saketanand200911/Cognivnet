const { createServer } = require("node:http");
const { timingSafeEqual, randomUUID } = require("node:crypto");
const { appendFile, readFile } = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "frontend");
const broadcastHistoryPath = path.join(__dirname, "broadcast-history.jsonl");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const adminToken = process.env.ADMIN_BROADCAST_TOKEN || "";
const maxMessageBytes = 8 * 1024;
const maxBroadcastsPerMinute = 20;
const allowedFrontendOrigins = new Set([
    "http://127.0.0.1:5500",
    "http://localhost:5500",
]);
const connectedSessions = new Map();
const rateLimits = new Map();
let historyWrite = Promise.resolve();

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
    for (const sessions of connectedSessions.values()) {
        for (const response of sessions) {
            response.end();
        }
    }
    server.close(() => process.exit(0));
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
