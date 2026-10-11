# 🌐 CognivNet — Intelligent 5G/6G & D2M Campus Network Platform

> **A software-defined digital twin control room and multi-tenant umbrella platform modeling AI-native 5G/6G network slicing and internet-independent D2M (Direct-to-Mobile) emergency broadcasting.**

---

## 🚀 About the Project
Modern smart campuses and cities will connect billions of IoT devices, vehicles, and users. However, raw speed is no longer enough—future networks must be self-aware, predictive, and resilient. 

**CognivNet** demonstrates how an AI-native intelligence layer can operate on top of future telecommunications infrastructure. Instead of relying on physical hardware, it provides an interactive web control room where administrators can monitor multi-campus health, manage traffic loads, and execute internet-independent emergency broadcasts.

---

## ✨ Key Features

*   **🏢 Umbrella Multi-Campus Management:** Centralized multi-tenant portal allowing multiple institutions to register, spin up virtual digital twin nodes, and monitor localized network health.
*   **📡 D2M (Direct-to-Mobile) Emergency Broadcasting:** Simulates terrestrial spectrum broadcasting that pushes critical safety alerts (medical emergencies, theft, fire hazards) straight to mobile device feeds *without* cellular data or internet dependency.
*   **🧠 AI Network Cognition & Slicing:** Automatically assigns priority tiers (URLLC slices) to mission-critical services like emergency ambulances while load-balancing general traffic.
*   **🔐 Role-Based Access Control (RBAC):** Tailored portal views for **Students/Residents**, **Campus Security Admins**, and **Umbrella Super Admins**.
*   **📊 Real-Time Telemetry Dashboard:** Dynamic charts powered by **Chart.js** that track live throughput, latency, and packet loss based on interactive simulation controls.

---

## 🔄 The Cognitive Cycle
CognivNet follows a continuous closed-loop cognitive architecture:
> **Sense $\rightarrow$ Understand $\rightarrow$ Predict $\rightarrow$ Decide $\rightarrow$ Adapt $\rightarrow$ Learn**

---

## 🛠️ Tech Stack
*   **Frontend Structure:** HTML5
*   **Styling & UI Design:** Tailwind CSS (Modern Dark Mode Control Room aesthetic)
*   **Logic & Interactivity:** Vanilla JavaScript (ES6)
*   **Telemetry Visualizations:** Chart.js
*   **Icons:** Lucide Icons

---

## 🚀 Quick Start / Local Installation

The dashboard uses HTML, CSS, and JavaScript. The real-time campus broadcast feature requires the included Node.js server.

```bash
git clone https://github.com/saketanand200911/IMC.git
cd IMC
```

## Campus announcements and emergency broadcasts

The campus broadcast panel sends announcements, important alerts, and emergencies to dashboard sessions currently connected to the same campus. It uses the included Node.js server and requires Node.js 18 or newer; no extra packages are needed.

To preview the dashboard with VS Code Live Server, open `frontend/index.html`. Start the API server below in a terminal as well. The frontend automatically connects from Live Server's default port 5500 to the API on port 4173, including live sessions, sending, audience counts, and broadcast history.

From the repository root, start the server with a private administrator key:

```bash
ADMIN_BROADCAST_TOKEN='replace-with-a-long-random-secret' node backend/server.js
```

Open `http://127.0.0.1:4173`. The dispatcher is visible to everyone, but its send buttons stay disabled until **Campus Security Admin** or **Umbrella Super Admin** is selected in the portal dialog. Enter the same key in the broadcast panel to send. The portal role selector is only a demo UI; the server-side key is what authorizes sending. The server refuses to send if `ADMIN_BROADCAST_TOKEN` is not configured.

Type custom text in **Custom broadcast message**. Use **Emergency category** and **Send emergency alert** to prepend a medical, security, or fire label and publish it as an emergency. Connected sessions display the message in a dismissible live banner; emergencies use a high-visibility alert banner.

Select **04. Broadcast history** in the dashboard navigation to browse archived broadcasts across all campuses, newest first. The server appends each accepted broadcast to `backend/broadcast-history.jsonl`, which is kept locally and excluded from Git. History recording starts when this feature is installed; broadcasts sent before then cannot be recovered.

Broadcasts only reach connected dashboard sessions for the selected campus. The recipient count represents connected sessions, not enrolled people or devices. Offline users and physical devices do not receive these messages. Despite the D2M-themed prototype UI, this web server is not a cellular/D2M transmitter and cannot deliver without internet connectivity. Production use needs campus identity-provider authentication, HTTPS, and an integrated push-notification or telecom delivery provider for mobile and offline users.