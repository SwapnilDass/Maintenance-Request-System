// entry point - this is what starts the API server
import "dotenv/config";
import { app } from "./app";

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
