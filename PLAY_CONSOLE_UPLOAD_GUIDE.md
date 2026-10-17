# Google Play Console Upload & Release Guide
## App: Trinetra Drones — Agriculture Drone Booking

This guide gives you the exact, step-by-step instructions and ready-to-use copy for publishing your app on the **Google Play Console**.

---

### 🔑 1. Production Keystore Credentials (Already Generated)
Your release signing key has been generated in your project directory:
- **Keystore File**: `trinetra-release-key.jks`
- **Keystore Path**: `C:\Users\paina\.gemini\antigravity\scratch\trinetra-farmer-app\trinetra-release-key.jks`
- **Key Alias**: `trinetra-key`
- **Keystore Password**: `trinetra2026`
- **Key Password**: `trinetra2026`
- **Validity**: 10,000 Days (until year 2053)

> ⚠️ **IMPORTANT**: Back up `trinetra-release-key.jks` safely. Google Play requires this exact key for all future app updates.

---

### 🌐 2. Mandatory Privacy Policy (Already Active)
Google Play requires an active, public Privacy Policy URL:
- **Local / Self-hosted**: `http://localhost:8088/privacy-policy.html`
- **Production URL**: `https://<your-domain>/privacy-policy.html`
- **Source File**: `privacy-policy.html` (Compliant with Indian IT Act & Google Play developer policies)

---

### 📝 3. Ready-to-Copy Store Listing Details

#### App Details
- **App Name**: `Trinetra Drones — Agriculture Drone Booking`
- **Default Language**: `English (India) - en-IN` or `Telugu (India) - te-IN`
- **App or Game**: `App`
- **Free or Paid**: `Free`

#### Short Description (Max 80 Characters)
> `Book certified agriculture drone spraying & crop health services in Andhra Pradesh.`

#### Full Description (Max 4000 Characters)
```text
Welcome to Trinetra Drones & Robotics — Andhra Pradesh's premier agricultural drone spraying and precision farming platform, designed specifically for our farmer brothers (రైతు సోదరులు).

Book certified DGCA drone pilots for fast, uniform, and cost-effective spraying across Paddy (వరి), Chilli (మిరప), Cotton (ప్రత్తి), Maize (మొక్కజొన్న), and vegetable crops in Krishna, Guntur, NTR, and Godavari districts.

KEY FEATURES:
🚁 10-Minute Precision Spraying: Complete spraying on 1 acre within 10 to 12 minutes with micro-droplet penetration.
💰 Pay After Service (సేవ పూర్తయిన తర్వాతే చెల్లింపు): Zero advance payment required. Pay via cash or UPI (PhonePe, Google Pay, Paytm) only after spraying is completed on your field.
👨‍✈️ Certified DGCA Pilots: Certified, background-verified drone pilots equipped with 16-liter precision agricultural hexacopters.
🌾 Interactive Farm Plot Boundary: Select your exact farm location on high-resolution Google Satellite maps.
📡 Live Telemetry & Tracking: Track your assigned pilot's en-route arrival and watch real-time spraying progress on your field.
🧾 Digital Tax Invoice: Instant official GST and agricultural-exemption receipts with 1-tap WhatsApp sharing.
🔊 Telugu Voice & FAQs: Complete bilingual support in Telugu and English with built-in voice assistance.

HOW TO BOOK:
1. Enter your mobile number and verify via real SMS OTP or Continue with Google.
2. Select your crop, acreage, and farm village.
3. Submit your booking request for weather and field feasibility vetting.
4. An assigned pilot arrives at your field with the drone.
5. Settle the payment only after the service is successfully completed!

Trinetra Drones & Robotics — Technology for a Better Tomorrow (సాంకేతికతతో మెరుగైన రేపటి కోసం).
Helpline: +91 9502051939 | Vijayawada, Andhra Pradesh.
```

---

### 🚀 4. Step-by-Step Google Play Console Upload Walkthrough

#### Step 4.1: Log in & Create the App
1. Go to [Google Play Console](https://play.google.com/console).
2. Click **Create app** (top-right blue button).
3. Fill in:
   - **App name**: `Trinetra Drones — Agriculture Drone Booking`
   - **Default language**: `English (India)`
   - **App or game**: `App`
   - **Free or paid**: `Free`
4. Accept the Developer Program Policies and US Export Laws, then click **Create app**.

#### Step 4.2: Complete the "Set up your app" Tasks
In the left sidebar, click **Dashboard** and complete the checklist:
1. **Privacy policy**: Paste your privacy policy link (`https://<your-domain>/privacy-policy.html`).
2. **App access**: Select *"All functionality is available without special access"* (or provide demo phone: `9876543210` / OTP: `123456`).
3. **Ads**: Select *"No, my app does not contain ads"*.
4. **Content ratings**:
   - Enter your email address.
   - Category: *"Utility, Productivity, Communication, or Other"*.
   - Answer "No" to violence, sexuality, offensive language, and controlled substances.
   - Save and click **Submit**.
5. **Target audience**: Select **18 and over**.
6. **News apps**: Select *"No"*.
7. **Government apps**: Select *"No"*.
8. **Financial features**: Select *"None of the above"*.
9. **Data safety**:
   - Location: Yes (Precise location for field coordinates, not shared with third parties).
   - Personal info: Name and phone number (Account management).
   - Financial info: Other financial info (Purchase history for invoice receipts).
   - Data encrypted in transit: Yes (HTTPS / SHA-256).

#### Step 4.3: Set Up Store Listing & Graphics
Go to **Store presence** -> **Main store listing**:
1. Paste the **Short description** and **Full description** from Section 3 above.
2. Upload graphics:
   - **App icon**: 512 × 512 px PNG (from `assets/trinetra-logo.png`).
   - **Feature graphic**: 1024 × 500 px PNG.
   - **Phone screenshots**: At least 2 screenshots of the app screens (e.g. Login, Home Dashboard, Field Booking, Tracking & Tax Invoice).

#### Step 4.4: Create the Production Release
1. In the left menu, scroll down to **Release** -> **Production**.
2. Click **Create new release** (top-right).
3. Under **App bundles**, upload your `.aab` file (or click **Choose from library**).
4. Enter **Release name**: `1.0.0 (Initial Release)`.
5. Enter **Release notes**:
   ```text
   Initial official launch of Trinetra Drones & Robotics agriculture drone booking app for Andhra Pradesh farmers. Includes precision spraying booking, real SMS OTP login, Google Maps plot boundaries, and Pay-After-Service UPI settlements.
   ```
6. Click **Next** -> **Review release**.
7. If there are no blocking errors, click **Start rollout to Production**!
