# FlutterFlow + Firebase Step-by-Step Implementation Guide
## Trinetra Farmer App (త్రినేత్ర రైతు యాప్)

This visual, step-by-step implementation guide provides the exact sequence of actions to build and deploy the **Trinetra Farmer App** on **FlutterFlow** connected to **Google Firebase**.

---

## 1. Firebase Project Setup

### Step 1.1: Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/) and click **Add Project**.
2. Name the project: `TrinetraFarmerApp`.
3. Choose Analytics region: `India` (or `asia-south1`).
4. Click **Create Project**.

### Step 1.2: Enable Phone Authentication
1. In Firebase Console, go to **Build** -> **Authentication** -> **Sign-in method**.
2. Click **Phone** -> Toggle **Enable**.
3. Under **Phone numbers for testing**, add developer test numbers:
   - Phone: `+919876543210`, Verification code: `123456`
   - Phone: `+919502051939`, Verification code: `123456`
4. Click **Save**.

### Step 1.3: Enable Cloud Firestore
1. In Firebase Console, navigate to **Build** -> **Firestore Database** -> **Create Database**.
2. Location: Select `asia-south1` (Mumbai).
3. Start in **Production Mode**.
4. Paste the security rules from [firebase/firestore.rules](file:///C:/Users/paina/.gemini/antigravity/scratch/trinetra-farmer-app/firebase/firestore.rules).
5. Click **Publish**.

---

## 2. FlutterFlow Project Creation & Connection

### Step 2.1: Create Project in FlutterFlow
1. Log into [FlutterFlow](https://app.flutterflow.io/).
2. Click **Create New** -> Name: `TrinetraFarmerApp`.
3. Select **Blank App**.
4. Package Name: `com.trinetrabots.farmerapp`.

### Step 2.2: Connect Firebase
1. In FlutterFlow, click the **Settings** gear icon in the left sidebar.
2. Select **Firebase**.
3. Enter your **Firebase Project ID**: `trinetrafarmerapp-XXXXX`.
4. Click **Connect** and then click **Generate Config Files**.
5. Once green checkmarks appear, Firebase Authentication and Firestore are linked.

### Step 2.3: Configure Languages (Telugu + English)
1. Go to **Settings** -> **Languages**.
2. Set Primary Language: `Telugu (te)`.
3. Add Secondary Language: `English (en)`.
4. Import translation keys from:
   - [flutterflow/i18n_te.json](file:///C:/Users/paina/.gemini/antigravity/scratch/trinetra-farmer-app/flutterflow/i18n_te.json)
   - [flutterflow/i18n_en.json](file:///C:/Users/paina/.gemini/antigravity/scratch/trinetra-farmer-app/flutterflow/i18n_en.json)

---

## 3. Screen Building (1 to 5)

### Screen 1: Splash Screen (`SplashScreen`)
- **Widgets**:
  - `Scaffold` -> Background: Gradient (`#F0FDF4` to `#FFFFFF` to `#ECFDF5`).
  - `Image`: Trinetra Logo or Drone Icon with shadow.
  - `Text`: `"TRINETRA Drones & Robotics"` (`HeadlineMedium`, bold).
  - `Text`: `"సాంకేతికతతో మెరుగైన రేపటి కోసం / Technology for a Better Tomorrow"`.
  - `Row` with 2 buttons: `[ తెలుగు ]` and `[ English ]`.
    - Action on tap: `Set App Language (te/en)`.
  - `Button`: `"ప్రారంభించండి (Get Started)"` -> Action: `Navigate to LoginScreen`.

### Screen 2: Login & Registration (`LoginScreen`)
- **Widgets**:
  - `TextField` for Phone: Prefix `+91`, Keyboard Type: Phone.
  - `Button`: `"ఓటీపీ పంపండి (Send OTP)"` -> Action: `Firebase Auth -> Phone Sign In`.
  - `PinCode` (6 digits) for SMS OTP.
  - `TextField`: Farmer Name (*రైతు పేరు*).
  - `TextField`: Village (*గ్రామం*).
  - `DropDown`: District (*కృష్ణా, ఎన్టీఆర్, గుంటూరు*).
  - `Button`: `"లాగిన్ అవ్వండి & నమోదు చేయండి"`:
    - Action 1: `Verify Phone OTP`.
    - Action 2: `Firestore -> Create Document in 'users'` with `role: 'farmer'`.
    - Action 3: `Navigate to HomeScreen`.

### Screen 3: Farmer Home Dashboard (`HomeScreen`)
- **Widgets**:
  - Header: Farmer Name & Village greeting card.
  - **Hero Action Card**: `"డ్రోన్ స్ప్రేయింగ్ బుక్ చేయండి (Book Drone Spraying)"` (Emerald gradient, large icon).
    - Action: `Navigate to BookingScreen`.
  - **Card 2**: `"నా బుకింగ్స్ (My Bookings)"` -> Action: `Navigate to StatusScreen`.
  - **Card 3**: `"సేవా ధరల పట్టిక (Service Prices)"` -> Action: `Open Bottom Sheet with Price Table`.
  - **Card 4**: `"త్రినేత్రను సంప్రదించండి (Contact Trinetra)"` -> Action: `Launch URL (tel:9502051939)`.
  - **Card 5**: `"తెలుగు సహాయం (Help in Telugu)"` -> Action: `Show Dialog / Audio FAQ`.

### Screen 4: Book a Drone (`BookingScreen`)
- **Step-by-step Input Elements**:
  1. `ChoiceChips` for Crop:
     - Options: `వరి (Paddy)`, `మిరప (Chilli)`, `ప్రత్తి (Cotton)`, `మొక్కజొన్న (Maize)`, `కూరగాయలు (Vegetables)`.
  2. `CountController` for Acreage: Step: 1, Min: 1, Max: 100.
  3. `TextField`: Village & Field Landmark.
  4. `DatePicker`: Preferred Date.
  5. `DropDown`: Service Type (`పురుగుమందుల స్ప్రేయింగ్ - ₹450`, `నానో యూరియా - ₹400`, `శిలీంద్ర సంహారిణి - ₹450`, `మ్యాపింగ్ - ₹300`).
  6. Dynamic Text: `Total = Acres * PricePerAcre`.
  7. **Notice Banner**:
     > *"ముఖ్య గమనిక: ఇది బుకింగ్ అభ్యర్థన మాత్రమే. త్రినేత్ర బృందం వాతావరణం మరియు పొలం పరిస్థితిని పరిశీలించి బుకింగ్‌ను ధృవీకరిస్తుంది."*
  8. `Button`: `"బుకింగ్ అభ్యర్థన సమర్పించండి"`:
     - Action 1: `Firestore -> Create Document in 'bookings'` with `status: 'received'`.
     - Action 2: `Navigate to StatusScreen(bookingRef)`.

### Screen 5: Booking Status Tracker (`StatusScreen`)
- **5-Stage Vertical Timeline / Stepper**:
  - Stage 1: `బుకింగ్ అందింది (Booking Received)` [Always Green Check]
  - Stage 2: `పరిశీలనలో ఉంది (Awaiting Confirmation)` [Pending/Under Review by Admin]
  - Stage 3: `పైలట్ కేటాయించబడ్డారు (Pilot Assigned)` [Shows Pilot Name + Call Button]
  - Stage 4: `స్ప్రేయింగ్ జరుగుతోంది (Service in Progress)` [Drone flying badge]
  - Stage 5: `పూర్తి అయ్యింది (Completed)` [Invoice + Cash/UPI Pay-After-Service notice]
- Real-time binding:
  - Document query: `bookings` collection where `bookingId == currentBookingId`.
  - Conditional visibility for Pilot card and Payment summary based on `status`.

---

## 4. Admin & Pilot Multi-Role Workflows

### Admin Approval Workflow
1. Admin opens Admin console.
2. Views new requests with `status == 'received'`.
3. Verifies weather (wind, rain) and field conditions via AI Scheduling recommendations.
4. Selects pilot from dropdown and clicks **Confirm Booking**:
   - Updates Firestore `bookings`:
     ```json
     {
       "status": "pilot_assigned",
       "assignedPilotId": "usr_pilot_001",
       "assignedPilotName": "రమేష్ కుమార్",
       "assignedPilotPhone": "9502051939",
       "droneModel": "Trinetra Hexa-16L (AP-07)"
     }
     ```
   - Farmer's Screen 5 instantly transitions to Stage 3!

### Pilot Workflow
1. Pilot sees assigned job on their dashboard.
2. Taps **Start Spraying**:
   - Updates `status` to `in_progress`.
   - Onboard companion or pilot app begins streaming GPS telemetry packets to `/api/telemetry/ingest` and Firestore `telemetry`.
3. Taps **Finish Spraying**:
   - Updates `status` to `completed`.
   - Records cash collected or presents UPI QR code.

---

## 5. Intelligent AI Screens (Screens 6 to 9)

### Screen 6: AI Crop Health Scanner (`AICropHealthScreen`)
- **Widgets**:
  - `Camera / UploadButton`: Capture crop leaf photo directly in field.
  - `ImagePreview`: Displays uploaded photo.
  - `DropDown`: Select Crop Type (`వరి - Paddy`, `మిరప - Chilli`, `ప్రత్తి - Cotton`).
  - `Button`: `"పంట ఆరోగ్యం విశ్లేషించండి (Analyze Crop Health)"`
    - Action: Custom Action `analyzeCropHealthAI(imageBytes, cropType)`.
  - **Results Card**:
    - Condition detected, Confidence Score bar (`92%`).
    - Symptoms & Recommended chemical formulation.
    - 1-Tap Shortcut: `"డ్రోన్ స్ప్రేయింగ్ బుక్ చేయండి (Book Drone Spraying for this)"`.
  - **Mandatory Safety Disclaimer Banner** (Yellow/Amber Card with Warning Icon):
    > *"ముఖ్య గమనిక: ఇది ప్రాథమిక AI పరిశీలన మాత్రమే. రసాయన పిచికారీ చేయడానికి ముందు స్థానిక వ్యవసాయ అధికారి లేదా శాస్త్రవేత్తను సంప్రదించండి." / "Warning: Preliminary AI guidance only. Consult your local agricultural officer before chemical application."*

### Screen 7: AI Voice & Booking Assistant (`AIBookingAssistantScreen`)
- **Widgets**:
  - `AnimatedMicButton`: Tap to speak in Telugu or English.
  - `SpeechToText`: Captures voice query (e.g. *"నా బుకింగ్ ఎలా ఉంది?"* or *"5 ఎకరాలు వరి స్ప్రేయింగ్ బుక్ చేయాలి"*).
  - `ChatBubbleList`: Dynamic chat thread with Trinetra AI.
  - `TextToSpeech` Action: Reads out response in Telugu or English.
  - Action Chips: `[ నా బుకింగ్ స్టేటస్ ]`, `[ సేవా ధరలు ]`, `[ కొత్త బుకింగ్ ]`.

### Screen 8: AI Acreage & Live Telemetry HUD (`AIAcreageTelemetryScreen`)
- **Widgets**:
  - Integrated into Stage 4 of `StatusScreen`.
  - `GoogleMap / Leaflet`: Displays real-time drone icon, GPS breadcrumb trail, and active spray swath polygon.
  - `ProgressBar`: Verified Sprayed Acres (e.g. `3.5 / 5.0 Acres (70%)`).
  - `TelemetryCards`:
    - Altitude: `2.5 m AGL`
    - Ground Speed: `18.2 km/h`
    - Battery: `84% (22.8V)`
    - Spray Pump Flow: `1.8 L/min`
  - `DisclaimerText`: *"స్ప్రే చేసిన విస్తీర్ణం జీపీఎస్ టెలిమెట్రీ ద్వారా ధృవీకరించబడింది. మిగిలిన సమయం AI అంచనా."*

### Screen 9: Smart Admin Command Dashboard (`SmartAdminDashboardScreen`)
- **Widgets**:
  - `MapWidget`: Full-screen satellite map of Krishna District with active hexacopters (AP-07, AP-09, AP-12).
  - `KPIGrid`: Target Acres, Verified Acres, Active Drones, Revenue, Pilot Count.
  - `AIAdminChatDrawer`: Grounded queries against database facts.
  - `MaintenancePredictionCard`: Flags drones with high LiPo cycles (>250) or bearing overhaul needs.
  - `OperationalReportsTab`: 1-click generation of daily/monthly PDF reports.

---

## 6. FlutterFlow Custom Actions (AI & Telemetry)

### Custom Action: `queryAdminAssistantAI`
```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

Future<String> queryAdminAssistantAI(String query, String language) async {
  final url = Uri.parse('https://your-server-domain/api/ai/admin-assistant');
  final response = await http.post(
    url,
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'query': query, 'language': language}),
  );
  if (response.statusCode == 200) {
    final data = jsonDecode(response.body);
    return data['answer'] ?? 'No response';
  }
  return 'Service unavailable';
}
```

### Custom Action: `analyzeCropHealthAI`
```dart
Future<dynamic> analyzeCropHealthAI(String base64Image, String cropType) async {
  final url = Uri.parse('https://your-server-domain/api/ai/crop-health');
  final response = await http.post(
    url,
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'imageUrl': base64Image, 'cropType': cropType, 'farmerId': 1}),
  );
  return jsonDecode(response.body);
}
```

---

## 7. Safety, Disclaimers & Governance Rules
1. **Never Autonomous Flight**: AI is purely analytical. No flight commands are generated or executed.
2. **Mandatory Disclaimer**: All crop diagnosis screens require the amber preliminary guidance banner.
3. **Verified vs. Estimated**: Always visually separate verified telemetry measurements from estimated finish times.
4. **Human Review**: AI recommendations require admin approval before scheduling changes take effect.

---

## 8. Testing and Android APK Generation

1. In FlutterFlow, click the **Test** or **Run** button to test in the cloud simulator.
2. For real physical Android device testing:
   - Go to **Settings** -> **Mobile Deployment**.
   - Connect **Google Play Developer Account** or click **Download APK**.
   - Install APK on Android phones (Samsung, Redmi, Realme).
   - Test Phone OTP with the configured test numbers (`+919876543210` / `123456`).

