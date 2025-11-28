"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_DISTANCE_CM } from "../lib/firebaseClient";

export default function RadarCanvas({ readings = {}, sweepAngle, animateWhenIdle = false }) {
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ width: 800, height: 450 });
  const [idleAngle, setIdleAngle] = useState(0);
  const idleStateRef = useRef({ angle: 0, direction: 1, frame: 0 });

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      });
    });

    observer.observe(wrapper);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const state = idleStateRef.current;
    cancelAnimationFrame(state.frame);

      if (!animateWhenIdle) {
      return () => {};
    }

    const hasSweep = typeof sweepAngle === "number" && !Number.isNaN(sweepAngle);
    const hasReadings = Object.keys(readings || {}).length > 0;
    if (hasSweep || hasReadings) {
      return () => {};
    }

    const animate = () => {
        state.angle += state.direction * 0.25;
      if (state.angle >= 180) {
        state.angle = 180;
        state.direction = -1;
      } else if (state.angle <= 0) {
        state.angle = 0;
        state.direction = 1;
      }
      setIdleAngle(state.angle);
      state.frame = requestAnimationFrame(animate);
    };

    state.frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(state.frame);
  }, [animateWhenIdle, readings, sweepAngle]);

  const effectiveAngle = useMemo(() => {
    if (typeof sweepAngle === "number" && !Number.isNaN(sweepAngle)) {
      return sweepAngle;
    }
    return idleAngle;
  }, [idleAngle, sweepAngle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const { width, height } = size;
    if (!width || !height) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height * 0.92;
    const radius = Math.min(width / 2 - 40, centerY - 20);
    const clampedRadius = Math.max(radius, 120);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    ctx.strokeStyle = "rgba(0, 255, 100, 0.35)";
    ctx.lineWidth = 2;
    for (let i = 1; i <= 5; i += 1) {
      const r = (clampedRadius / 5) * i;
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, Math.PI, 0, false);
      ctx.stroke();
    }

    ctx.lineWidth = 1;
    ctx.setLineDash([6, 12]);
    for (let deg = 0; deg <= 180; deg += 30) {
      const theta = (deg * Math.PI) / 180;
      const x = centerX + Math.cos(theta) * clampedRadius;
      const y = centerY - Math.sin(theta) * clampedRadius;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(0, 255, 140, 0.45)";
    ctx.font = "14px 'Segoe UI', sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 1; i <= 4; i += 1) {
      const r = (clampedRadius / 5) * i;
      const label = Math.round((MAX_DISTANCE_CM / 5) * i);
      ctx.fillText(`${label} cm`, centerX - r - 6, centerY - 6);
    }

    const angleKeys = Object.keys(readings || {})
      .map((key) => Number(key))
      .filter((key) => Number.isFinite(key))
      .sort((a, b) => a - b);

    angleKeys.forEach((angle) => {
      const { distance, timestamp } = readings[angle] || {};
      if (typeof distance !== "number" || distance <= 0) {
        return;
      }

      const clamped = Math.min(distance, MAX_DISTANCE_CM);
      const ratio = clamped / MAX_DISTANCE_CM;
      const theta = (angle * Math.PI) / 180;
      const x = centerX + Math.cos(theta) * clampedRadius * ratio;
      const y = centerY - Math.sin(theta) * clampedRadius * ratio;

      const danger = 1 - ratio;
      const alpha = 0.3 + danger * 0.6;
      const rColor = Math.floor(255 * Math.min(1, danger + 0.35));
      const gColor = Math.floor(255 * (0.25 + ratio * 0.5));
      ctx.strokeStyle = `rgba(${rColor}, ${gColor}, 0, ${alpha})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.stroke();

      ctx.fillStyle = `rgba(${rColor}, ${gColor}, 40, ${Math.min(0.92, alpha + 0.25)})`;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();

      if (timestamp) {
        ctx.fillStyle = "rgba(225, 255, 245, 0.7)";
        ctx.font = "11px 'Segoe UI', sans-serif";
        ctx.textAlign = angle < 90 ? "left" : "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(`${angle.toFixed(0)}°`, x + (angle < 90 ? 10 : -10), y - 8);
      }
    });

    const sweepRad = (effectiveAngle * Math.PI) / 180;
    const sweepX = centerX + Math.cos(sweepRad) * clampedRadius;
    const sweepY = centerY - Math.sin(sweepRad) * clampedRadius;
      const gradientSweep = ctx.createLinearGradient(centerX, centerY, sweepX, sweepY);
      gradientSweep.addColorStop(0, "rgba(0, 255, 180, 0.2)");
      gradientSweep.addColorStop(1, "rgba(0, 255, 120, 0.02)");

    ctx.fillStyle = gradientSweep;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + Math.cos(((effectiveAngle - 3) * Math.PI) / 180) * clampedRadius, centerY - Math.sin(((effectiveAngle - 3) * Math.PI) / 180) * clampedRadius);
      ctx.lineTo(sweepX, sweepY);
      ctx.closePath();
      ctx.fill();

    ctx.strokeStyle = "rgba(120, 255, 160, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(sweepX, sweepY);
    ctx.stroke();

    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 40);
    gradient.addColorStop(0, "rgba(0, 255, 160, 0.8)");
    gradient.addColorStop(1, "rgba(0, 140, 90, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, [effectiveAngle, readings, size]);

  return (
    <div ref={wrapperRef} className="radar-canvas">
      <canvas ref={canvasRef} role="img" aria-label="Live radar visualization" />
    </div>
  );
}
