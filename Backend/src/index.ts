import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { errorHandler } from "./middleware/error.js";
import foldersRouter from "./routes/folders.js";
import filesRouter from "./routes/files.js";
import trashRouter from "./routes/trash.js";

const app = express();

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  }),
);
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// API routes
app.use("/api/folders", foldersRouter);
app.use("/api/files", filesRouter);
app.use("/api/trash", trashRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Vaultly backend running on http://localhost:${config.port}`);
});
