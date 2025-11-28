import "./globals.css";

export const metadata = {
  title: "ESP32 Smart Rover Radar",
  description: "Live radar view powered by ESP32 telemetry via Firebase"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
