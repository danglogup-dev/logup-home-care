import type { CheckLocation } from "./visitsStore";

export function browserLocation(): Promise<CheckLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location is unavailable on this device."));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude, accuracyM: coords.accuracy }),
      (error) => reject(new Error(error.code === 1 ? "Location permission denied. Allow location in your browser settings and try again." : "Could not get your location. Check your connection and try again.")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}