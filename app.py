import random
import pandas as pd
import plotly.express as px
import streamlit as st

# 1. Page Configuration
st.set_page_config(
    page_title="CognivNet: Umbrella Campus & D2M Hub", page_icon="🌐", layout="wide"
)

# Initialize Session States for Login & Multi-Campus Management
if "logged_in" not in st.session_state:
    st.session_state.logged_in = False
if "user_role" not in st.session_state:
    st.session_state.user_role = "Student / Resident"
if "campus_name" not in st.session_state:
    st.session_state.campus_name = "Global Central Campus"
if "registered_campuses" not in st.session_state:
    st.session_state.registered_campuses = [
        "Global Central Campus",
        "IIT Tech Park Hub",
        "Metro University Smart Block",
    ]

# 2. Sidebar Portal Authentication & Umbrella Onboarding
st.sidebar.header("🔐 Umbrella Portal & Access")
auth_mode = st.sidebar.radio(
    "Navigation Mode", ["Portal Login", "Register New Campus"]
)

if not st.session_state.logged_in:
    if auth_mode == "Portal Login":
        st.title("🌐 CognivNet Umbrella Platform")
        st.markdown(
            "Multi-tenant management portal for next-generation campus connectivity and D2M broadcasting."
        )
        st.markdown("---")

        username = st.text_input("Username / ID", value="student_demo")
        role = st.selectbox(
            "Select Portal Role",
            ["Student / Resident", "Campus Security Admin", "Umbrella Super Admin"],
        )
        selected_campus = st.selectbox(
            "Select Campus Network", st.session_state.registered_campuses
        )

        if st.button("Sign In to Control Hub", type="primary"):
            st.session_state.logged_in = True
            st.session_state.user_role = role
            st.session_state.campus_name = selected_campus
            st.rerun()
    else:
        st.title("🏫 Umbrella Campus Onboarding")
        st.markdown(
            "Register a new campus into the CognivNet ecosystem to instantly spin up its digital twin and D2M broadcast channel."
        )
        st.markdown("---")

        new_campus = st.text_input("Campus / Institution Name")
        admin_email = st.text_input("Administrator Contact Email")
        node_count = st.number_input(
            "Connected IoT Nodes / Base Towers",
            min_value=10,
            max_value=5000,
            value=120,
        )

        if st.button("Deploy Virtual Campus Node"):
            if new_campus and new_campus not in st.session_state.registered_campuses:
                st.session_state.registered_campuses.append(new_campus)
                st.success(
                    f"Successfully onboarded '{new_campus}'! You can now log into your portal."
                )
            else:
                st.warning("Please enter a valid or unique campus name.")
else:
    # --- LOGGED IN DASHBOARD ---
    st.sidebar.success(
        f"**Role:** {st.session_state.user_role}\n\n**Active Campus:** {st.session_state.campus_name}"
    )
    if st.sidebar.button("Log Out"):
        st.session_state.logged_in = False
        st.rerun()

    st.sidebar.markdown("---")
    st.sidebar.header("🎛️ Simulation Controls")
    sim_scenario = st.sidebar.selectbox(
        "Network Cognition State",
        [
            "Normal Operation (Stable)",
            "Campus Mega Event (High Congestion)",
            "Emergency Crisis (D2M Broadcast Trigger)",
            "Primary 5G Tower Outage",
        ],
    )
    traffic_load = st.sidebar.slider(
        "Base Traffic Load (Mbps)", min_value=10, max_value=500, value=150, step=10
    )

    # --- MAIN CONTENT AREA ---
    st.title(f"⚡ CognivNet: {st.session_state.campus_name}")
    st.markdown(
        "AI-Native 5G/6G Network Cognition & **D2M (Direct-to-Mobile) Zero-Internet Broadcasting Hub**."
    )
    st.markdown("---")

    # Role-Based Views: Security Admin gets the D2M Dispatch Panel
    if st.session_state.user_role == "Campus Security Admin":
        st.error(
            "🚨 **D2M Emergency Broadcast Dispatcher (Zero-Internet Broadcast Spectrum)**"
        )
        col_d1, col_d2 = st.columns(2)
        with col_d1:
            emergency_type = st.selectbox(
                "Select Emergency Incident",
                [
                    "Medical Emergency / Ambulance Dispatch",
                    "Security Breach / Theft Alert",
                    "Fire / Environmental Hazard",
                ],
            )
        with col_d2:
            target_zone = st.selectbox(
                "Target Campus Zone",
                [
                    "Block A & Hostels",
                    "Central Library",
                    "Sports Complex",
                    "Entire Campus (All Zones Broadcast)",
                ],
            )

        if st.button(
            "📡 Broadcast Emergency via D2M Wave (Bypass Cellular/Internet)"
        ):
            st.toast(
                f"SUCCESS: {emergency_type} broadcasted directly to mobile devices in '{target_zone}' via terrestrial D2M towers!",
                icon="🚨",
            )
        st.markdown("---")

    elif st.session_state.user_role == "Umbrella Super Admin":
        st.warning("👑 **Umbrella Super Admin View: Multi-Campus Oversight**")
        st.write(
            f"Currently monitoring **{len(st.session_state.registered_campuses)} active campuses** globally across the CognivNet cloud network."
        )
        st.write(
            "Registered Networks:", ", ".join(st.session_state.registered_campuses)
        )
        st.markdown("---")

    # Dynamic Simulation Logic
    if "Emergency Crisis" in sim_scenario:
        lat = random.randint(2, 5)
        loss = "0.0% (URLLC Sliced)"
        tower_status = "🟢 D2M Broadcast Active"
    elif "Outage" in sim_scenario:
        lat = random.randint(35, 55)
        loss = "2.2% (Failover Mesh)"
        tower_status = "🔴 Primary Tower Down"
    elif "Congestion" in sim_scenario:
        lat = random.randint(18, 30)
        loss = "0.8% (AI Load Balanced)"
        tower_status = "🟡 High Traffic State"
    else:
        lat = random.randint(6, 12)
        loss = "0.1% (Optimal)"
        tower_status = "🟢 5G/6G Core Active"

    # Top Metrics Row
    m1, m2, m3, m4 = st.columns(4)
    with m1:
        st.metric(label="Network Status", value=tower_status, delta="Self-Healing AI")
    with m2:
        st.metric(
            label="D2M Broadcast Channel",
            value="Online (100% Free/No Data)",
            delta="Terrestrial Sync",
        )
    with m3:
        st.metric(label="Average Latency", value=f"{lat} ms", delta="Target < 10ms")
    with m4:
        st.metric(
            label="Packet Loss Rate", value=loss, delta="Reliability Grade A"
        )

    st.markdown("---")

    # Bottom Grid: Sectors & Telemetry Chart
    c_left, c_right = st.columns([1.2, 1.8])

    with c_left:
        st.subheader("🏙️ Campus Zone Cognition Status")
        st.markdown(
            f"""
        * **🚑 Sector A (Medical / Response):** Priority Tier 1 $\rightarrow$ **Active D2M Link**
        * **🛡️ Sector B (Hostels / Security):** Priority Tier 2 $\rightarrow$ **Secured**
        * **⚡ Sector C (Smart Microgrid):** Priority Tier 3 $\rightarrow$ **Streaming Telemetry**
        * **📡 Sector D (Campus Broadcast Tower):** Status $\rightarrow$ **Broadcasting (No Internet Required)**
        """
        )
        st.info(
            "💡 **Expo Tip:** Log in as **Campus Security Admin** to test triggering an emergency D2M broadcast live in front of the judges!"
        )

    with c_right:
        st.subheader("📈 Real-Time AI Network Cognition Throughput")
        time_steps = ["12:01", "12:02", "12:03", "12:04", "12:05", "12:06"]
        df_chart = pd.DataFrame(
            {
                "Time": time_steps * 2,
                "Throughput (Mbps)": [
                    random.randint(
                        int(traffic_load * 0.6), int(traffic_load * 1.3)
                    )
                    for _ in range(12)
                ],
                "Cognitive Routing Slice": [
                    "D2M Emergency Broadcast Channel"
                ] * 6
                + ["General Campus Data Slice"] * 6,
            }
        )

        fig = px.line(
            df_chart,
            x="Time",
            y="Throughput (Mbps)",
            color="Cognitive Routing Slice",
            markers=True,
            title="Dynamic Slicing & D2M Spectrum Allocation",
        )
        fig.update_layout(
            height=360,
            margin=dict(l=20, r=20, t=40, b=20),
            legend=dict(orientation="h", y=-0.2),
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
        )
        st.plotly_chart(fig, use_container_width=True)

# Footer
st.markdown("---")
st.caption(
    "CognivNet Umbrella Ecosystem | Intelligent 5G/6G & D2M Campus Network Platform"
)