const isDev = process.env.NODE_ENV === "development";
const CORS  = process.env.REACT_APP_CORS_PROXY || "http://localhost:8080";

export async function searchGooglePlaces(apiKey, row) {
  // Production: Vercel serverless function (no CORS issue)
  // Development: local CORS proxy
  const url = isDev
    ? `${CORS}/https://places.googleapis.com/v1/places:searchText`
    : `/api/places`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.location,places.nationalPhoneNumber,places.internationalPhoneNumber,places.formattedAddress",
    },
    body: JSON.stringify({
      textQuery: `${row.raison_sociale} ${row.ville} Maroc`,
      maxResultCount: 3,
      languageCode: "fr",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return (data.places || []).map((p) => ({
    name:    p.displayName?.text || "",
    lat:     p.location?.latitude,
    lng:     p.location?.longitude,
    phone:   p.nationalPhoneNumber || p.internationalPhoneNumber || "",
    address: p.formattedAddress || "",
  }));
}
