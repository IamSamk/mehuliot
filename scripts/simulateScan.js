const fs = require("fs");
const path = require("path");
const { initializeApp } = require("firebase/app");
const { getDatabase, ref, set } = require("firebase/database");

// --- Helpers -------------------------------------------------------------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const loadEnv = () => {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error("Missing .env.local. Copy .env.local.example and fill your Firebase keys first.");
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    if (!line || line.trim().startsWith("#")) {
      return;
    }
    const [key, ...rest] = line.split("=");
    if (!key) {
      return;
    }
    const value = rest.join("=").trim();
    if (value) {
      process.env[key.trim()] = value;
    }
  });
};

loadEnv();

const requiredKeys = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_DATABASE_URL",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID"
];

requiredKeys.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Environment variable ${key} missing. Update .env.local.`);
  }
});

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const MAX_DISTANCE = 250;
const CLOSE_OBJECT_DISTANCE = 40;
const SERVO_STEP = 2; // degrees per iteration to mirror firmware sweep
const SAMPLE_INTERVAL_MS = 120;

const AMBIENT_TEMPERATURE = 26.5;

const stages = [
  { label: "vehicle-left", objectAngle: 40, duration: 5000 },
  { label: "clear-path", objectAngle: null, duration: 3000 },
  { label: "vehicle-right", objectAngle: 140, duration: 5000 },
  { label: "clear-path", objectAngle: null, duration: 3000 }
];

let stageIndex = 0;
let stageStartedAt = Date.now();
let servoAngle = 0;
let servoDirection = 1;

async function pushScan(angle, distance) {
  const angleKey = Math.round(angle);
  const reading = {
    distance,
    timestamp: Date.now()
  };
  await set(ref(database, `scan/${angleKey}`), reading);
}

async function pushStatus(angle, buzzerState) {
  const payload = {
    temperature: AMBIENT_TEMPERATURE,
    buzzer: buzzerState ? "ON" : "OFF",
    flame: "SAFE",
    angle: Math.round(angle),
    updatedAt: new Date().toISOString()
  };
  await set(ref(database, "status"), payload);
}

function computeDistance(angle) {
  const stage = stages[stageIndex];
  if (stage.objectAngle === null) {
    return MAX_DISTANCE;
  }
  return Math.abs(angle - stage.objectAngle) <= 6 ? CLOSE_OBJECT_DISTANCE : MAX_DISTANCE;
}

async function loop() {
  const stage = stages[stageIndex];
  const distance = computeDistance(servoAngle);
  const buzzerState = distance <= CLOSE_OBJECT_DISTANCE;

  await Promise.all([pushScan(servoAngle, distance), pushStatus(servoAngle, buzzerState)]);

  servoAngle += servoDirection * SERVO_STEP;
  if (servoAngle >= 180) {
    servoAngle = 180;
    servoDirection = -1;
  } else if (servoAngle <= 0) {
    servoAngle = 0;
    servoDirection = 1;
  }

  if (Date.now() - stageStartedAt >= stage.duration) {
    stageIndex = (stageIndex + 1) % stages.length;
    stageStartedAt = Date.now();
    console.log(`[${new Date().toLocaleTimeString()}] Stage → ${stages[stageIndex].label}`);
  }

  setTimeout(loop, SAMPLE_INTERVAL_MS);
}

async function cleanupAndExit() {
  console.log("\nStopping simulation, clearing database nodes...");
  await Promise.all([
    set(ref(database, "scan"), null),
    set(ref(database, "status"), {
      flame: "SAFE",
      buzzer: "OFF",
      temperature: AMBIENT_TEMPERATURE,
      angle: null,
      updatedAt: new Date().toISOString()
    })
  ]);
  process.exit(0);
}

process.on("SIGINT", cleanupAndExit);
process.on("SIGTERM", cleanupAndExit);

console.log("Radar simulation running.");
console.log(" - 5s obstacle on left, 3s clear, 5s obstacle on right, 3s clear (loops).");
console.log("Press Ctrl+C to stop.");
console.log(`[${new Date().toLocaleTimeString()}] Stage → ${stages[stageIndex].label}`);
loop();
