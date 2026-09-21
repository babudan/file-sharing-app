import { createApp } from "./app.js";
import { prisma } from "./db.js";
import { createS3Storage, ensureBucket } from "./storage.js";
import { config } from "./config.js";

async function main() {
  await ensureBucket();
  const app = createApp(createS3Storage());
  app.listen(config.port, () => {
    console.log(`API listening on :${config.port}`);
  });
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
