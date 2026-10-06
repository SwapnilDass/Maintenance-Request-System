// sets up the express app - kept separate from index.ts so tests can use it without starting the server
import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";
import categoriesRouter from "./routes/categories";
import requestsRouter from "./routes/requests";

export const app = express();

app.use(cors()); // lets the frontend (different port) call this API
app.use(express.json()); // lets us read JSON request bodies

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/requests", requestsRouter);
