# Mehuliot Smart Rover Radar

A BLE-enabled ESP32 rover sweeps an ultrasonic sensor from 0–180° using a servo, measures distance, heat and flame conditions, and streams data through Firebase Realtime Database to a Vercel-ready Next.js radar dashboard. The project also monitors a fire sensor, controls a buzzer, and displays live telemetry (temperature, flame state, buzzer status, distance) in real time.

---

## 1. Hardware Connections

| Component | ESP32 Pin | Notes |
| --- | --- | --- |
| SG90 Servo signal | GPIO 18 | Power servo from regulated 5 V; share ground with ESP32 |
| HC-SR04 Trigger | GPIO 5 | Make sure sensor VCC is 5 V |
| HC-SR04 Echo | GPIO 4 (via divider) | Divide echo down to 3.3 V using 1 kΩ / 2 kΩ resistor pair |
| DHT22 Data | GPIO 15 | 10 kΩ pull-up to 3.3 V |
| IR Flame sensor (DO) | GPIO 23 | Outputs LOW when flame detected |
| Buzzer transistor base | GPIO 19 (1 kΩ) | Buzzer powered from 5 V through transistor |
| SG90 servo power | 5 V rail | Decouple with 100 µF capacitor near servo |
| HC-SR04 VCC/GND | 5 V rail | |
| DHT22 power | 3.3 V | |
| Flame sensor VCC/GND | 5 V rail | |

**Power Path**
- Dual Li-ion cells in parallel → TP4056 charger → LM2596 buck converter set to 5 V.
- 5 V rail feeds servo, buzzer, HC-SR04, flame sensor.
- ESP32 DevKit VIN connects to the 5 V rail (onboard regulator supplies 3.3 V logic rail).
- Ensure all grounds are common.

---

## 2. Firmware Data Flow (ESP32)

1. **Servo Sweep**
   - `updateServoAngle()` increments the servo by 2° from 0–180°, then back, pausing 15 ms per step.
   - Angle is stored in `servoAngle` and also sent to Firebase via `/status`.

2. **Ultrasonic Distance**
   - `measureDistanceCm()` triggers HC-SR04 and measures echo time (timeout 25 ms ≈ 4 m).
   - Distance is clamped to `MAX_DISTANCE_CM` (250 cm).
   - Latest distance is sent to Firebase at two levels:
     - `/scan/<angle>` → `{ distance, timestamp }` to map the whole sweep.
     - `/status.distance` to show the current beam hit.

3. **Temperature (DHT22)**
   - Every 4 seconds, `lastTemperature` updates with the latest Celsius reading.
   - `/status.temperature` contains the most recent value.

4. **Flame Detection**
   - `digitalRead(FLAME_PIN)` runs every status push; `LOW` becomes `"FIRE"`.
   - Updates `/status.flame`.

5. **Buzzer Control**
   - Automatic trigger: if `distance <= BUZZER_TRIGGER_DISTANCE_CM` (default 60 cm), buzzer turns on.
   - Manual override: write `/commands/buzzer = "ON"`, `"OFF"`, or `"AUTO"` via Firebase / dashboard.
   - `/status.buzzer` always matches the actual GPIO output.

6. **Firebase Credentials**
   - Firmware uses Firebase email/password auth. Configure `USER_EMAIL` & `USER_PASSWORD` for a dedicated device account.

7. **Update Frequency**
   - `/scan/<angle>` updates on every servo step (~30–40 ms depending on sweep).
   - `/status` pushes every 200 ms for smooth UI syncing.

---

## 3. Web App Data Flow (Next.js + Firebase Web SDK)

- `app/page.js` sets up realtime listeners (`onValue`) on both `/scan` and `/status`.
- `RadarCanvas.jsx` redraws the radar whenever state changes:
  - For each entry in `/scan`, a spoke is rendered by converting angle to radians and scaling length by `distance / MAX_DISTANCE_CM`.
  - The sweep line angle comes from `/status.angle`. If no angle is present (device offline), a client-side idle animation runs.
- The telemetry bar shows live values from `/status.temperature`, `/status.flame`, `/status.buzzer`, and `MAX_DISTANCE_CM`.
- Buzzer state can be controlled by writing to `/commands/buzzer` using Firebase’s console or a custom UI widget (not yet implemented).

Deployment ready via Vercel (use `.env.local` with your Firebase config). The app is responsive and optimized for a single-page full-screen radar.

---

## 4. Project Setup

1. **Install dependencies**
   ```pwsh
   npm install
   ```

2. **Environment Variables**
   - Duplicate `.env.local.example` → `.env.local` and fill Firebase configuration.

3. **Run locally**
   ```pwsh
   npm run dev
   ```
   Visit `http://localhost:3000` to view the live radar.

4. **Simulate telemetry (optional)**
   ```pwsh
   node scripts/simulateScan.js
   ```
   Produces a looping left-right object scenario. Stop with `Ctrl+C`.

5. **Deploy to Vercel**
   - `vercel` or through Vercel dashboard using the same environment variables.

---

## 5. Flashing the ESP32

1. Update firmware credentials in `firmware/esp32_rover.ino`:
   ```cpp
   const char *WIFI_SSID = "your_wifi";
   const char *WIFI_PASSWORD = "your_password";
   #define USER_EMAIL "rover@mehuliot.com"
   #define USER_PASSWORD "device_password"
   ```

2. Configure Firebase email/password auth (see next section).
3. Compile & upload using the Arduino IDE or PlatformIO.
4. Monitor the serial output to verify Wi-Fi and Firebase connection.

---

## 6. Firebase Authentication Setup (Device Account)

To let the ESP32 authenticate securely without exposing service credentials:

1. In Firebase Console → **Build → Authentication → Sign-in method**, enable **Email/Password**.
2. In the **Users** tab, click **Add user** and create a dedicated account (e.g., `rover@mehuliot.com`).
   - Use a strong password. Keep it private; only the firmware should know it.
3. In `USER_EMAIL` / `USER_PASSWORD`, enter the exact email/password you just created.
4. (Optional) Hardening rules:
   ```json
   {
     "rules": {
       "scan": {
         ".read": "auth != null",
         ".write": "auth != null"
       },
       "status": {
         ".read": "auth != null",
         ".write": "auth != null"
       },
       "commands": {
         ".read": "auth != null",
         ".write": "auth != null"
       }
     }
   }
   ```
   Adjust to restrict write access to specific UID if desired.

If you only sent an invitation (as shown in the screenshot), finish by accepting it or by creating the user directly in the Authentication → Users page. Invited members in **Users and permissions** are for console Roles, not RTDB auth. The ESP32 needs a Firebase Authentication user (created via **Authentication**, not by adding project members).

---

## 7. Directory Overview

```
app/
  page.js            # Live radar page
  layout.js
  globals.css
components/
  RadarCanvas.jsx    # Canvas rendering logic
firmware/
  esp32_rover.ino    # ESP32 telemetry + Firebase logic
lib/
  firebaseClient.js  # Firebase Web SDK init
scripts/
  simulateScan.js    # Node simulator for Firebase data
.env.local.example
next.config.mjs
package.json
README.md
```

---

## 8. Troubleshooting

- **Firebase config missing**: ensure `.env.local` is populated and restart `npm run dev`.
- **Servo jitter / resets**: provide dedicated 5 V supply for servo with capacitor and common ground.
- **Firebase auth fails**: verify `USER_EMAIL` exists under Authentication → Users and password is correct.
- **Buzzer always on**: confirm `/commands/buzzer` is set to `AUTO` (or cleared) and that obstacle is not within threshold.
- **Radar stuck in idle**: check ESP32 connectivity; `status.angle` must update. Use Firebase console to confirm data flow.

---

## 9. Credits

Developed for the Mehuliot smart rover project. Radar visualization inspired by classic sweeping displays.
