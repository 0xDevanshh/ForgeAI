import { prisma } from "../src/lib/prisma";

async function main() {
  // Seed data goes here once fixtures are defined.
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
