"use client";

import { useEffect, useMemo, useState } from "react";
import { onValue, ref } from "firebase/database";
import RadarCanvas from "../components/RadarCanvas";
import { MAX_DISTANCE_CM, database } from "../lib/firebaseClient";

export default function HomePage() {
  const [scanReadings, setScanReadings] = useState({});
  const [status, setStatus] = useState({
    angle: null,
    temperature: null,
    flame: "SAFE",
    buzzer: "OFF",
    updatedAt: null
  });

  useEffect(() => {
    if (!database) {
      return;
    }

    const scanRef = ref(database, "scan");
    const statusRef = ref(database, "status");

    const unsubscribeScan = onValue(scanRef, (snapshot) => {
      const value = snapshot.val();
      if (value && typeof value === "object") {
        setScanReadings(value);
      }
    });

    const unsubscribeStatus = onValue(statusRef, (snapshot) => {
      const value = snapshot.val();
      if (value && typeof value === "object") {
        setStatus((prev) => ({ ...prev, ...value }));
      }
    });

    return () => {
      unsubscribeScan();
      unsubscribeStatus();
    };
  }, []);

  const latestTemperature = status.temperature?.toFixed
    ? `${status.temperature.toFixed(1)} °C`
    : "--";

  const flameState = status.flame === "FIRE" ? "FIRE" : "SAFE";
  const buzzerState = status.buzzer === "ON" ? "ON" : "OFF";
  const updatedLabel = useMemo(() => {
    if (!status.updatedAt) {
      return "";
    }
    try {
      const date = new Date(status.updatedAt);
      if (Number.isNaN(date.getTime())) {
        return "";
      }
      return `Updated ${date.toLocaleTimeString()}`;
    } catch (error) {
      return "";
    }
  }, [status.updatedAt]);

  return (
    <main>
      <div className="radar-stage">
        <h1 className="radar-title">Mehul IoT Rover Radar</h1>
        <RadarCanvas
          readings={scanReadings}
          sweepAngle={status.angle}
          animateWhenIdle
        />
        <div className="telemetry-bar">
          <span>Temp: {latestTemperature}</span>
          <span className={flameState === "FIRE" ? "status-fire" : "status-safe"}>Flame: {flameState}</span>
          <span>Buzzer: {buzzerState}</span>
          <span>Range: {MAX_DISTANCE_CM} cm</span>
          {updatedLabel ? <span>{updatedLabel}</span> : null}
        </div>
      </div>
    </main>
  );
}
