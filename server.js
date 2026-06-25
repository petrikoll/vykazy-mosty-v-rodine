require("dotenv").config();
const express = require("express");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

const app = express();

const PORT = Number(process.env.PORT || 3001);

const DB_PATH = process.env.APP_DB_PATH
  ? path.resolve(process.env.APP_DB_PATH)
  : path.join(__dirname, "data", "app-db.json");

const BACKUP_PATH = `${DB_PATH}.backup.json`;

const DEFAULT_DATA = {
  positions: [],
  employees: []
};

app.use(express.json({ limit: "2mb" }));

function migrateData(data) {
  const positions = Array.isArray(data?.positions) ? data.positions : DEFAULT_DATA.positions;
  const employees = Array.isArray(data?.employees) ? data.employees : DEFAULT_DATA.employees;

  const migratedEmployees = employees.map((employee) => ({
    ...employee,
    roles: Array.isArray(employee.roles)
      ? employee.roles.map((role) => ({
          ...role,
          contractType: "PS"
        }))
      : []
  }));

  return {
    positions,
    employees: migratedEmployees
  };
}

async function ensureDbFile() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });

  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2), "utf8");
  }
}

async function readDb() {
  await ensureDbFile();

  const raw = await fs.readFile(DB_PATH, "utf8");
  const parsed = JSON.parse(raw);

  return migrateData(parsed);
}

async function writeDb(data) {
  await ensureDbFile();

  const normalizedData = migrateData(data);

  try {
    await fs.copyFile(DB_PATH, BACKUP_PATH);
  } catch {
    // Pokud ještě není co zálohovat, pokračujeme dál.
  }

  await fs.writeFile(DB_PATH, JSON.stringify(normalizedData, null, 2), "utf8");

  return normalizedData;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    dbPath: DB_PATH,
    time: new Date().toISOString()
  });
});

app.get("/api/data", async (_req, res) => {
  try {
    const db = await readDb();
    res.json(db);
  } catch (error) {
    console.error("GET /api/data failed:", error);
    res.status(500).json({
      error: "Nelze načíst data.",
      details: error.message
    });
  }
});

app.put("/api/data", async (req, res) => {
  try {
    const { positions, employees } = req.body || {};

    if (!Array.isArray(positions) || !Array.isArray(employees)) {
      return res.status(400).json({
        error: "Neplatný formát dat. Očekávám pole positions a employees."
      });
    }

    const savedData = await writeDb({ positions, employees });

    return res.json({
      ok: true,
      data: savedData
    });
  } catch (error) {
    console.error("PUT /api/data failed:", error);
    return res.status(500).json({
      error: "Nelze uložit data.",
      details: error.message
    });
  }
});

app.post("/api/ai/generate", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Chybí GEMINI_API_KEY na serveru."
      });
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const {
      promptText,
      systemInstruction = "Jsi asistent pro tvůrce pracovních výkazů v projektech OPZ+. Výstup VŽDY poskytni jako JSON pole objektů s klíči 'desc' (popis) a 'hours' (hodiny jako číslo)."
    } = req.body || {};

    if (!promptText || typeof promptText !== "string") {
      return res.status(400).json({
        error: "Chybí promptText."
      });
    }

    const payload = {
      contents: [
        {
          parts: [
            {
              text: promptText
            }
          ]
        }
      ],
      systemInstruction: {
        parts: [
          {
            text: systemInstruction
          }
        ]
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              desc: { type: "STRING" },
              hours: { type: "NUMBER" }
            },
            required: ["desc", "hours"]
          }
        }
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let details = "";

      try {
        const errorPayload = await response.json();
        details = errorPayload?.error?.message || JSON.stringify(errorPayload);
      } catch {
        details = await response.text();
      }

      return res.status(response.status).json({
        error: "Gemini API chyba.",
        details
      });
    }

    const data = await response.json();
    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResult) {
      return res.status(500).json({
        error: "Neplatná odpověď z Gemini API."
      });
    }

    let parsedResult;

    try {
      parsedResult = JSON.parse(textResult);
    } catch {
      return res.status(500).json({
        error: "Gemini API nevrátilo platný JSON.",
        raw: textResult
      });
    }

    return res.json(parsedResult);
  } catch (error) {
    console.error("POST /api/ai/generate failed:", error);
    return res.status(500).json({
      error: "AI požadavek selhal.",
      details: error.message
    });
  }
});

const DIST_PATH = path.join(__dirname, "dist");
const INDEX_HTML_PATH = path.join(DIST_PATH, "index.html");

app.use(express.static(DIST_PATH));

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  if (fsSync.existsSync(INDEX_HTML_PATH)) {
    return res.sendFile(INDEX_HTML_PATH);
  }

  return res.status(404).send(
    "Frontend build nebyl nalezen. Spusťte nejdříve: npm run build"
  );
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Database path: ${DB_PATH}`);
});
