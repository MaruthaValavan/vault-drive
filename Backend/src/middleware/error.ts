import type { Request, Response, NextFunction } from "express";
import multer from "multer";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  console.error(err);
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Files must be 20 MB or smaller" });
    return;
  }
  const message = err.message || "Internal server error";
  res.status(500).json({ error: message });
}
