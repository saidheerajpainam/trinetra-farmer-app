# 🚁 Trinetra Drones & Robotics — Agriculture Drone Booking Ecosystem

> **ఆంధ్రప్రదేశ్ రైతుల కోసం అధికారిక వ్యవసాయ డ్రోన్ బుకింగ్ ప్లాట్‌ఫారమ్**  
> *Official Precision Agriculture Drone Spraying & Monitoring Platform for Andhra Pradesh Farmers.*

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/Database-SQLite3-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)
[![Flutter](https://img.shields.io/badge/Flutter-v3.41-02569B?logo=flutter&logoColor=white)](https://flutter.dev/)
[![Android](https://img.shields.io/badge/Android-APK_%26_AAB-3DDC84?logo=android&logoColor=white)](https://developer.android.com/)
[![DGCA Compliant](https://img.shields.io/badge/DGCA-Certified_Operations-059669)](https://dgca.gov.in/)
[![Bilingual](https://img.shields.io/badge/Languages-Telugu_%7C_English-10B981)](#)

---

## 🌾 Project Overview

**Trinetra Drones & Robotics** is an end-to-end agritech platform built to serve farmers (రైతు సోదరులు) across Andhra Pradesh (Krishna, Guntur, NTR, Godavari districts). Farmers can book certified DGCA drone pilots for precision crop spraying across **Paddy (వరి)**, **Chilli (మిరప)**, **Cotton (ప్రత్తి)**, **Maize (మొక్కజొన్న)**, and vegetables with **Zero Advance Payment (Pay-After-Service)**.

---

## 🏛️ Ecosystem Architecture

```
                                ┌─────────────────────────────────┐
                                │       SQLite (trinetra.db)      │
                                │  (Users, Bookings, Telemetry)   │
                                └───────────────▲─────────────────┘
                                                │
                                ┌───────────────┴─────────────────┐
                                │   Node.js REST API (server.js)  │
                                │   Fast2SMS • Google Auth • SSE  │
                                └───────▲───────────────▲─────────┘
                                        │               │
            ┌──────────────────────────┴────┐   ┌──────┴──────────────────────────┐
            │                               │   │                                 │
┌───────────┴───────────┐       ┌───────────┴───┴───────┐       ┌─────────────────┴───────────┐
│   Farmer Mobile App   │       │   Pilot Console App   │       │    Admin Operations Deck    │
│  (farmer-app.html)    │       │   (pilot-app.html)    │       │    (admin-console.html)     │
│  - Telugu + English   │       │  - DGCA Licensed      │       │  - Weather & Radar Review   │
│  - Real SMS OTP Login │       │  - GPS Turn-by-Turn   │       │  - Pilot Fleet Assignment   │
│  - Google Maps Plot   │       │  - Flight Telemetry   │       │  - Realtime Fleet Tracking  │
│  - Paytm / SBI UPI    │       │  - Job Completion     │       │  - Pricing & Policy Config  │
└───────────────────────┘       └───────────────────────┘       └─────────────────────────────┘
```

---

## ✨ Key Features

* **⚡ 10-Minute Precision Spraying**: 1 acre covered in 10–12 minutes with micro-droplet penetration.
* **💰 Pay After Service (సేవ పూర్తయిన తర్వాతే చెల్లింపు)**: Zero advance fees. Payment via Cash or UPI (PhonePe, GPay, Paytm) only after field completion.
* **👨‍✈️ DGCA Certified Pilots**: Verified pilots operating 16-liter agricultural hexacopter drones.
* **🗺️ Interactive Satellite Plot Boundaries**: Real-time farm plot boundary drawing on satellite maps.
* **📡 Realtime Telemetry**: Live pilot approach status, GPS speed, altitude, and spraying coverage indicators.
* **🧾 Instant Digital Tax Invoices**: GST and agricultural-exemption receipts with 1-tap WhatsApp sharing.
* **🔊 Bilingual Audio & Support**: Full native Telugu and English support with voice guidance.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
* **Node.js**: v18.0.0 or higher
* **Flutter SDK**: v3.41+ (for mobile builds)
* **Android SDK & JDK 21**

### 2. Install & Initialize
```bash
# Clone the repository
git clone https://github.com/saidheerajpainam/trinetra-farmer-app.git
cd trinetra-farmer-app

# Install dependencies
npm install

# Initialize SQLite database (creates schema and sample data)
node init_db.js
```

### 3. Start the Server
```bash
node server.js
```
The server will boot on port `8088`:
* **Farmer App**: `http://localhost:8088/farmer-app.html`
* **Pilot Console**: `http://localhost:8088/pilot-app.html`
* **Admin Command Center**: `http://localhost:8088/admin-console.html`
* **APK Download Portal**: `http://localhost:8088/download.html`
* **Health API**: `http://localhost:8088/api/health`

---

## 📱 Mobile App Releases

### Production Android App Bundle (.aab)
Built for official release on the [Google Play Console](https://play.google.com/console):
* **Target Package**: `com.trinetrabots.trinetra_farmer_app`
* **Build Command**:
  ```bash
  cd trinetra_mobile_bundle
  flutter build appbundle --release
  ```

### Direct Install APK (.apk)
Built for direct sideloading and field distribution to pilots and farmers:
* **Build Command**:
  ```bash
  cd trinetra_mobile_bundle
  flutter build apk --release
  ```
* **Download Portal**: Download directly over local Wi-Fi from `http://<your-ip>:8088/download.html`.

---

## 🧪 Testing & Verification

Run the automated test suite to verify database integrity, rate limiting, and SMS security:
```bash
# Run individual test suites
node test_database_e2e.js       # SQLite ACID & transaction tests (9/9)
node test_sms_otp_e2e.js         # SHA-256 HMAC & rate-limiting tests (28/28)
node test_google_auth_e2e.js     # OAuth 2.0 handshake tests (25/25)
node test_ai_features_e2e.js     # Field boundary vetting & diagnostics
```

---

## 📄 License & Organization

Developed by **Trinetra Drones & Robotics**  
*Technology for a Better Tomorrow • సాంకేతికతతో మెరుగైన రేపటి కోసం*  
📍 Vijayawada, Andhra Pradesh, India  
📞 Helpline: `+91 9502051939`
