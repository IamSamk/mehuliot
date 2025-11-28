#include <Arduino.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <ESP32Servo.h>
#include <DHT.h>

// Replace with your Wi-Fi credentials
const char *WIFI_SSID = "your_wifi_ssid";
const char *WIFI_PASSWORD = "your_wifi_password";

// Firebase credentials (project settings)
#define API_KEY "AIzaSyB9KUjHxzq8ktsL9-K8-XKoA4cPEk6EWzU"
#define DATABASE_URL "https://mehuliot-default-rtdb.asia-southeast1.firebasedatabase.app/"
#define USER_EMAIL "rover@mehuliot.com"
#define USER_PASSWORD "choudhary2005"

// Firebase objects
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// Sensor pins
constexpr uint8_t SERVO_PIN = 18;
constexpr uint8_t TRIG_PIN = 5;
constexpr uint8_t ECHO_PIN = 4;
constexpr uint8_t DHT_PIN = 15;
constexpr uint8_t FLAME_PIN = 23;
constexpr uint8_t BUZZER_PIN = 19;

// Sensor configs
constexpr uint16_t MAX_DISTANCE_CM = 250;
constexpr uint16_t BUZZER_TRIGGER_DISTANCE_CM = 60;
constexpr uint8_t SERVO_MIN_DEG = 0;
constexpr uint8_t SERVO_MAX_DEG = 180;
constexpr uint16_t SERVO_DELAY_MS = 15;   // dwell per step
constexpr uint16_t SWEEP_STEP_DEG = 2;    // adjust for smoother sweep
constexpr uint32_t TEMPERATURE_INTERVAL_MS = 4000;
constexpr uint32_t STATUS_PUSH_INTERVAL_MS = 200; // update status 5x per second for smooth UI

// DHT configuration
#define DHTTYPE DHT22
DHT dht(DHT_PIN, DHTTYPE);

Servo scannerServo;

// State tracking
uint8_t servoAngle = 90;
bool sweepForward = true;
uint32_t lastTempMillis = 0;
uint32_t lastStatusMillis = 0;
float lastTemperature = NAN;
bool buzzerState = false;
bool manualBuzzerOverride = false;
uint16_t lastDistance = MAX_DISTANCE_CM;
bool lastFlameDetected = false;

// Utility to perform ultrasonic distance measurement
uint16_t measureDistanceCm()
{
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  uint32_t duration = pulseIn(ECHO_PIN, HIGH, 25000); // 25 ms timeout ≈ 4 m
  if (duration == 0)
  {
    return MAX_DISTANCE_CM;
  }
  uint16_t distance = duration * 0.0343 / 2; // speed of sound
  return min<uint16_t>(distance, MAX_DISTANCE_CM);
}

void updateServoAngle()
{
  scannerServo.write(servoAngle);
  delay(SERVO_DELAY_MS);

  if (sweepForward)
  {
    servoAngle += SWEEP_STEP_DEG;
    if (servoAngle >= SERVO_MAX_DEG)
    {
      servoAngle = SERVO_MAX_DEG;
      sweepForward = false;
    }
  }
  else
  {
    if (servoAngle >= SWEEP_STEP_DEG)
    {
      servoAngle -= SWEEP_STEP_DEG;
    }
    else
    {
      servoAngle = SERVO_MIN_DEG;
    }

    if (servoAngle <= SERVO_MIN_DEG)
    {
      servoAngle = SERVO_MIN_DEG;
      sweepForward = true;
    }
  }
}

void pushScanReading(uint8_t angle, uint16_t distance)
{
  if (!Firebase.ready())
  {
    return;
  }

  FirebaseJson json;
  json.set("distance", distance);
  json.set("timestamp", millis());

  String path = String("/scan/") + angle;
  Firebase.RTDB.setJSON(&fbdo, path.c_str(), &json);
}

void pushStatus()
{
  if (!Firebase.ready())
  {
    return;
  }

  FirebaseJson statusJson;
  statusJson.set("angle", servoAngle);
  statusJson.set("temperature", isnan(lastTemperature) ? nullptr : lastTemperature);
  statusJson.set("flame", lastFlameDetected ? "FIRE" : "SAFE");
  statusJson.set("buzzer", buzzerState ? "ON" : "OFF");
  statusJson.set("distance", lastDistance);
  statusJson.set("updatedAt", millis());

  Firebase.RTDB.setJSON(&fbdo, "/status", &statusJson);
}

void readBuzzerRemote()
{
  if (!Firebase.ready())
  {
    return;
  }

  String command;
  if (Firebase.RTDB.getString(&fbdo, "/commands/buzzer"))
  {
    command = fbdo.stringData();
    command.trim();
    if (command == "ON")
    {
      buzzerState = true;
      digitalWrite(BUZZER_PIN, HIGH);
      manualBuzzerOverride = true;
    }
    else if (command == "OFF")
    {
      buzzerState = false;
      digitalWrite(BUZZER_PIN, LOW);
      manualBuzzerOverride = true;
    }
    else if (command == "AUTO")
    {
      manualBuzzerOverride = false;
    }
  }
}

void setup()
{
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(FLAME_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  dht.begin();

  // Attach servo with custom pulse widths for SG90
  scannerServo.setPeriodHertz(50);
  scannerServo.attach(SERVO_PIN, 500, 2400);
  scannerServo.write(servoAngle);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(300);
    Serial.print('.');
  }
  Serial.println(" connected!");

  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;

  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop()
{
  updateServoAngle();
  uint16_t distance = measureDistanceCm();
  lastDistance = distance;
  pushScanReading(servoAngle, distance);

  readBuzzerRemote();

  bool obstacleClose = distance <= BUZZER_TRIGGER_DISTANCE_CM;
  bool flameDetected = digitalRead(FLAME_PIN) == LOW;
  lastFlameDetected = flameDetected;
  bool hazardDetected = obstacleClose || flameDetected;
  if (!manualBuzzerOverride)
  {
    if (hazardDetected != buzzerState)
    {
      buzzerState = hazardDetected;
      digitalWrite(BUZZER_PIN, buzzerState ? HIGH : LOW);
    }
  }

  if (millis() - lastTempMillis >= TEMPERATURE_INTERVAL_MS)
  {
    lastTempMillis = millis();
    float temp = dht.readTemperature();
    if (!isnan(temp))
    {
      lastTemperature = temp;
    }
  }

  if (millis() - lastStatusMillis >= STATUS_PUSH_INTERVAL_MS)
  {
    lastStatusMillis = millis();
    pushStatus();
  }
}
