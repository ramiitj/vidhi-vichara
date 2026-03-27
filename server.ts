import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
// @ts-ignore
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB
});

app.post("/api/parse-pdf", (req, res, next) => {
  upload.array("files")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    let totalText = "";

    for (const file of files) {
      const dataBuffer = file.buffer;
      let fullText = "";

      if (file.originalname.endsWith(".pdf")) {
        const pdfData = await pdfParse(dataBuffer);
        fullText = pdfData.text;
      } else if (file.originalname.endsWith(".txt") || file.originalname.endsWith(".md")) {
        fullText = dataBuffer.toString("utf-8");
      } else {
        fullText = dataBuffer.toString("utf-8");
      }
      
      totalText += `\n--- Document: ${file.originalname} ---\n${fullText}`;
    }

    res.json({
      success: true,
      textContent: totalText,
    });
  } catch (error) {
    console.error("Parse error details:", error);
    res.status(500).json({ 
      error: "Failed to parse document",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const htmlPath = path.join(distPath, "index.html");
      if (fs.existsSync(htmlPath)) {
        let html = fs.readFileSync(htmlPath, "utf-8");
        // Inject the API key into the HTML so it's available in the browser at runtime
        const injectedScript = `<script>window.process = window.process || {}; window.process.env = window.process.env || {}; window.process.env.GEMINI_API_KEY = "${process.env.GEMINI_API_KEY || ""}";</script>`;
        html = html.replace("</head>", `${injectedScript}</head>`);
        res.send(html);
      } else {
        res.status(404).send("Not Found");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Express error:", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

startServer();
