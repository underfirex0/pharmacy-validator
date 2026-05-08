export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const apiKey = req.headers["x-goog-api-key"];
  const fieldMask = req.headers["x-goog-fieldmask"];

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(req.body),
  });

  const data = await response.json();
  res.status(response.status).json(data);
}
