const express = require("express");
const path = require("path");
const { readCsv, appendLine } = require("./lib/community-store");

const app = express();
const PORT = process.env.PORT || 3000;

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

app.use(express.json({ limit: "32kb" }));

app.get("/api/seatings", async (_req, res) => {
  try {
    const csv = await readCsv();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(csv);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "failed to read csv" });
  }
});

app.post("/api/seatings", async (req, res) => {
  const body = req.body || {};
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
    return res.status(500).json({ error: "failed to write csv" });
  }
});

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`server running at http://localhost:${PORT}`);
});
