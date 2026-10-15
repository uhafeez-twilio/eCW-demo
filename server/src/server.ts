import "dotenv/config";
import { startTACServer } from "./tac-server.js";

const PORT = Number(process.env.PORT ?? 3001);

async function main() {
  await startTACServer(PORT);
  console.log(`Server running on port ${PORT}`);
}

main().catch(console.error);
