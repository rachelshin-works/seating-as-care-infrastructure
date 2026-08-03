const {
  readCsv,
  appendLine,
} = require("../lib/community-store");

const CATEGORY_MAP = {
  "portable-chair": "portable_seating",
  staircase: "staircase",
  "building-infrastructures": "building_infrastructures",
  "building-scaffolding": "building_scaffolding",
  cars: "cars",
};

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toFeature({ longitude, latitude, category, rate, comment, observed_date }) {
  const heatByCategory = {
    portable_seating: 1,
    floor: 2,
    small_infrastructure: 3,
    staircase: 4,
  };

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [longitude, latitude],
    },
    properties: {
      kind: "undocumented",
      category: category.replace(/_/g, " "),
      categoryKey: category,
      lng: String(longitude),
      lat: String(latitude),
      date: observed_date,
      rate: rate == null ? "" : String(rate),
      comment: comment || "",
      heat: heatByCategory[category] ?? 4,
    },
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    try {
      const csv = await readCsv();
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(csv);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "failed to read csv" });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch (_) {
      return res.status(400).json({ error: "invalid json body" });
    }
  }
  body = body || {};

  const lng = parseFloat(body.longitude);
  const lat = parseFloat(body.latitude);
  const rawCategory = String(body.category || "").trim();
  const category = CATEGORY_MAP[rawCategory] || rawCategory.replace(/-/g, "_");
  const rate = body.rate;
  const comment = String(body.comment || "").trim();

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return res.status(400).json({ error: "valid longitude and latitude required" });
  }
  if (!category) {
    return res.status(400).json({ error: "category required" });
  }

  const observed_date = new Date().toISOString().slice(0, 10);
  const line = [
    csvEscape(lng),
    csvEscape(lat),
    csvEscape(category),
    csvEscape(rate ?? ""),
    csvEscape(comment),
    csvEscape(observed_date),
  ].join(",");

  try {
    await appendLine(line);
    const feature = toFeature({
      longitude: lng,
      latitude: lat,
      category,
      rate,
      comment,
      observed_date,
    });
    return res.status(201).json({ ok: true, feature });
  } catch (err) {
    console.error(err);
    const missingToken =
      !process.env.GITHUB_TOKEN &&
      /EROFS|read-only|EACCES|ENOENT|Vercel cannot write/i.test(String(err.message));
    return res.status(500).json({
      error: missingToken
        ? "set GITHUB_TOKEN in Vercel project env vars"
        : "failed to write csv",
    });
  }
};
