import { db } from "./db";
import { setupFixtures, teardownFixtures } from "./fixtures";

export default async function () {
  // Sanity: DB reachable
  await db`SELECT 1`;

  await setupFixtures();

  return async () => {
    await teardownFixtures();
    await db.end();
  };
}
