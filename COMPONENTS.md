# Smart Rover Hardware Overview

## Bill of Materials
- ESP32 DevKit v1 (30-pin)
- HC-SR04 ultrasonic distance sensor
- SG90 micro servo
- DHT22 temperature and humidity sensor (can swap with DHT11)
- IR flame sensor module (digital output)
- Active buzzer + 2N2222 NPN transistor + 1 kΩ base resistor
- TP4056 Li-Ion charger module (USB-C recommended)
- Two 3.7 V Li-Ion cells connected in parallel
- LM2596 buck converter module
- Breadboard or custom PCB, jumper wires, headers

## Power Distribution
- Parallel battery pack → TP4056 charger → LM2596 buck converter
- Buck converter set to 5.0 V → powers servo, HC-SR04, DHT sensor, flame sensor module
- ESP32 powered from buck-converted 5.0 V through the DevKit VIN pin (onboard regulator supplies 3.3 V)
- Buzzer powered from 5.0 V rail; NPN transistor used as low-side switch driven by ESP32 GPIO

## Signal Connections

| Subsystem | ESP32 Pin | Notes |
| --- | --- | --- |
| Servo (SG90) | GPIO 18 (PWM capable) | 5 V supply, common ground |
| HC-SR04 Trigger | GPIO 5 | |
| HC-SR04 Echo | GPIO 4 (through 1 kΩ/2 kΩ divider to 3.3 V logic) | Protect ESP32 from 5 V |
| DHT22 Data | GPIO 15 | 10 kΩ pull-up to 3.3 V |
| Flame Sensor (DO) | GPIO 23 | Module DO is active LOW on flame |
| Buzzer Transistor Base | GPIO 19 through 1 kΩ | Buzzer between +5 V and collector |

## Interconnect Notes
- Tie all grounds together (battery, buck converter, sensors, ESP32, servo, TP4056 OUT-).
- Keep servo power separate from ESP32 3.3 V rail; decouple with 100 µF electrolytic capacitor near servo power leads to reduce noise.
- Mount the HC-SR04 on the servo horn to enable 0–180° sweeps; add flexible wiring to accommodate rotation.
- Wire the flame sensor module VCC to 5 V and use the digital output (DO) for simple HIGH/LOW detection.
- For the buzzer driver, connect emitter to ground, collector to buzzer negative, buzzer positive to 5 V, and flyback diode across the buzzer if it is inductive.

## Data Flow Summary
1. ESP32 sweeps the servo, gathering distance values from the HC-SR04 and posting angle + distance + alerts to Firebase Realtime Database.
2. Temperature and flame readings are sampled periodically and uploaded alongside distance measurements.
3. Website subscribes to Firebase paths for live updates and renders a 180° radar display, temperature box, flame status, and buzzer state.
