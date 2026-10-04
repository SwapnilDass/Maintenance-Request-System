// entry point - this is what starts the API server
import "dotenv/config";
import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";

const app = express();

app.use(cors()); // lets the frontend (different port) call this API
app.use(express.json()); // lets us read JSON request bodies

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
