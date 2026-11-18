import { test as base, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prepareDatabase, startBackend, temporaryDatabase } from "./backend.ts";

type SeedType = {
  id: string;
  name: string;
  durationMinutes: number;
  description?: string;
  createdAt?: number;
};
type SeedBooking = {
  eventTypeId: string;
  startsAt: string;
  endsAt: string;
  guestName?: string;
  guestEmail?: string;
  topic?: string;
};
type Fixtures = {
  eventTypes: { values: SeedType[] };
  serverTime: string | undefined;
  bookings: SeedBooking[];
  backend: { url: string; setTime: (value: string) => Promise<void> };
};

export const test = base.extend<Fixtures>({
  eventTypes: [{ values: [] }, { option: true }],
  serverTime: [undefined, { option: true }],
  bookings: [[], { option: true }],
  backend: [
    async ({ eventTypes, serverTime, bookings }, use) => {
      const database = await temporaryDatabase();
      let backend: Awaited<ReturnType<typeof startBackend>> | undefined;
      try {
        await prepareDatabase(database.path);
        const connection = new DatabaseSync(database.path);
        try {
          const insert = connection.prepare(
            "INSERT INTO event_types (id,name,duration_minutes,description,created_at) VALUES (?,?,?,?,?)",
          );
          for (const type of eventTypes.values)
            insert.run(
              type.id,
              type.name,
              type.durationMinutes,
              type.description ?? null,
              type.createdAt ?? 0,
            );
          for (const [index, booking] of bookings.entries()) {
            const columns = [
              "id",
              "event_type_id",
              "starts_at",
              "ends_at",
              "guest_name",
              "guest_email",
              ...(booking.topic === undefined ? [] : ["topic"]),
            ];
            connection
              .prepare(
                `INSERT INTO bookings (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
              )
              .run(
                `fixture-${index}`,
                booking.eventTypeId,
                Date.parse(booking.startsAt),
                Date.parse(booking.endsAt),
                booking.guestName ?? "Гость",
                booking.guestEmail ?? "guest@example.com",
                ...(booking.topic === undefined ? [] : [booking.topic]),
              );
          }
        } finally {
          connection.close();
        }
        const clockPath = join(database.directory, "clock.txt");
        if (serverTime) await writeFile(clockPath, serverTime);
        backend = await startBackend(
          database.path,
          3183,
          serverTime
            ? {
                entry: "tests/support/clock-server.ts",
                env: { TEST_CLOCK_PATH: clockPath },
              }
            : {},
        );
        await use({
          ...backend,
          setTime: (value) => writeFile(clockPath, value),
        });
      } finally {
        await backend?.stop();
        await database.dispose();
      }
    },
    { auto: true },
  ],
});
export { expect };

export async function observe(
  page: import("@playwright/test").Page,
  info: import("@playwright/test").TestInfo,
  state: string,
) {
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: info.outputPath(`${state}-${width}.png`),
      fullPage: true,
    });
  }
}
