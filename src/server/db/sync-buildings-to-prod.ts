import { asc } from "drizzle-orm";
import { writeFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

import { env } from "~/env";
import { logger } from "~/lib/logger";

import { apartments, buildings, entrances, floors } from "./schemas/buildings";
import { parkingFloors, parkings, parkingSpots } from "./schemas/parkings";
import { db } from "./index";

/**
 * Скрипт для синхронизации структуры ЖК с prod
 *
 * Сверяет локальную БД с prod и генерирует SQL для переноса отсутствующих данных
 */

interface ComparisonResult {
  missingBuildings: any[];
  missingEntrances: any[];
  missingFloors: any[];
  missingApartments: any[];
  missingParkings: any[];
  missingParkingFloors: any[];
  missingParkingSpots: any[];
}

async function compareWithProd(): Promise<ComparisonResult> {
  logger.info("🔍 Сверяем локальную БД с prod...\n");

  // Read prod connection from env or ask user
  const prodDbUrl = process.env.PROD_DATABASE_URL || env.DATABASE_URL;

  if (prodDbUrl === env.DATABASE_URL) {
    logger.warn("⚠️  PROD_DATABASE_URL не задан, используется DATABASE_URL");
    logger.warn("   Для подключения к prod установите PROD_DATABASE_URL\n");
  }

  const prodDb = postgres(prodDbUrl, { max: 1 });

  try {
    // Get local data
    logger.info("📊 Читаем локальные данные...");
    const [
      localBuildings,
      localEntrances,
      localFloors,
      localApartments,
      localParkings,
      localParkingFloors,
      localParkingSpots,
    ] = await Promise.all([
      db.query.buildings.findMany({ orderBy: [asc(buildings.number)] }),
      db.query.entrances.findMany(),
      db.query.floors.findMany(),
      db.query.apartments.findMany(),
      db.query.parkings.findMany(),
      db.query.parkingFloors.findMany(),
      db.query.parkingSpots.findMany(),
    ]);

    logger.info("   ✅ Локально:");
    logger.info(`      - Строений: ${localBuildings.length}`);
    logger.info(`      - Подъездов: ${localEntrances.length}`);
    logger.info(`      - Этажей: ${localFloors.length}`);
    logger.info(`      - Квартир: ${localApartments.length}`);
    logger.info(`      - Парковок: ${localParkings.length}`);
    logger.info(`      - Этажей парковок: ${localParkingFloors.length}`);
    logger.info(`      - Парковочных мест: ${localParkingSpots.length}\n`);

    // Get prod data
    logger.info("📊 Читаем данные из prod...");
    const [
      prodBuildings,
      prodEntrances,
      prodFloors,
      prodApartments,
      prodParkings,
      prodParkingFloors,
      prodParkingSpots,
    ] = await Promise.all([
      prodDb`SELECT * FROM building ORDER BY number`,
      prodDb`SELECT * FROM entrance`,
      prodDb`SELECT * FROM floor`,
      prodDb`SELECT * FROM apartment`,
      prodDb`SELECT * FROM parking`,
      prodDb`SELECT * FROM parking_floor`,
      prodDb`SELECT * FROM parking_spot`,
    ]);

    logger.info("   ✅ В prod:");
    logger.info(`      - Строений: ${prodBuildings.length}`);
    logger.info(`      - Подъездов: ${prodEntrances.length}`);
    logger.info(`      - Этажей: ${prodFloors.length}`);
    logger.info(`      - Квартир: ${prodApartments.length}`);
    logger.info(`      - Парковок: ${prodParkings.length}`);
    logger.info(`      - Этажей парковок: ${prodParkingFloors.length}`);
    logger.info(`      - Парковочных мест: ${prodParkingSpots.length}\n`);

    // Find missing data
    logger.info("🔎 Ищем различия...\n");

    const prodBuildingIds = new Set(prodBuildings.map((b: any) => b.id));
    const prodEntranceIds = new Set(prodEntrances.map((e: any) => e.id));
    const prodFloorIds = new Set(prodFloors.map((f: any) => f.id));
    const prodApartmentIds = new Set(prodApartments.map((a: any) => a.id));
    const prodParkingIds = new Set(prodParkings.map((p: any) => p.id));
    const prodParkingFloorIds = new Set(prodParkingFloors.map((pf: any) => pf.id));
    const prodParkingSpotIds = new Set(prodParkingSpots.map((ps: any) => ps.id));

    const missingBuildings = localBuildings.filter((b) => !prodBuildingIds.has(b.id));
    const missingEntrances = localEntrances.filter((e) => !prodEntranceIds.has(e.id));
    const missingFloors = localFloors.filter((f) => !prodFloorIds.has(f.id));
    const missingApartments = localApartments.filter((a) => !prodApartmentIds.has(a.id));
    const missingParkings = localParkings.filter((p) => !prodParkingIds.has(p.id));
    const missingParkingFloors = localParkingFloors.filter((pf) => !prodParkingFloorIds.has(pf.id));
    const missingParkingSpots = localParkingSpots.filter((ps) => !prodParkingSpotIds.has(ps.id));

    logger.info("📋 Различия:");
    logger.info(`   - Строений для добавления: ${missingBuildings.length}`);
    logger.info(`   - Подъездов для добавления: ${missingEntrances.length}`);
    logger.info(`   - Этажей для добавления: ${missingFloors.length}`);
    logger.info(`   - Квартир для добавления: ${missingApartments.length}`);
    logger.info(`   - Парковок для добавления: ${missingParkings.length}`);
    logger.info(`   - Этажей парковок для добавления: ${missingParkingFloors.length}`);
    logger.info(`   - Парковочных мест для добавления: ${missingParkingSpots.length}\n`);

    return {
      missingBuildings,
      missingEntrances,
      missingFloors,
      missingApartments,
      missingParkings,
      missingParkingFloors,
      missingParkingSpots,
    };
  } finally {
    await prodDb.end();
  }
}

function generateInsertSQL(result: ComparisonResult): string {
  const sqlLines: string[] = [];

  sqlLines.push("-- ============================================================================");
  sqlLines.push("-- Sync building structure to prod");
  sqlLines.push(`-- Generated: ${new Date().toISOString()}`);
  sqlLines.push("-- ============================================================================");
  sqlLines.push("");
  sqlLines.push("BEGIN;");
  sqlLines.push("");

  // Buildings
  if (result.missingBuildings.length > 0) {
    sqlLines.push("-- Missing Buildings");
    sqlLines.push('INSERT INTO "building" ("id", "number", "title", "liter", "active")');
    sqlLines.push("VALUES");
    sqlLines.push(
      result.missingBuildings
        .map((b, i) => {
          const values = [
            `'${b.id}'`,
            b.number?.toString() ?? "NULL",
            b.title ? `'${b.title.replace(/'/g, "''")}'` : "NULL",
            b.liter ? `'${b.liter.replace(/'/g, "''")}'` : "NULL",
            b.active ? "true" : "false",
          ];
          const isLast = i === result.missingBuildings.length - 1;
          return `    (${values.join(", ")})${isLast ? ";" : ","}`;
        })
        .join("\n")
    );
    sqlLines.push("");
  }

  // Entrances
  if (result.missingEntrances.length > 0) {
    sqlLines.push("-- Missing Entrances");
    sqlLines.push('INSERT INTO "entrance" ("id", "building_id", "entrance_number")');
    sqlLines.push("VALUES");
    sqlLines.push(
      result.missingEntrances
        .map((e, i) => {
          const values = [`'${e.id}'`, `'${e.buildingId}'`, e.entranceNumber.toString()];
          const isLast = i === result.missingEntrances.length - 1;
          return `    (${values.join(", ")})${isLast ? ";" : ","}`;
        })
        .join("\n")
    );
    sqlLines.push("");
  }

  // Floors
  if (result.missingFloors.length > 0) {
    sqlLines.push("-- Missing Floors");
    sqlLines.push('INSERT INTO "floor" ("id", "entrance_id", "floor_number")');
    sqlLines.push("VALUES");
    sqlLines.push(
      result.missingFloors
        .map((f, i) => {
          const values = [`'${f.id}'`, `'${f.entranceId}'`, f.floorNumber.toString()];
          const isLast = i === result.missingFloors.length - 1;
          return `    (${values.join(", ")})${isLast ? ";" : ","}`;
        })
        .join("\n")
    );
    sqlLines.push("");
  }

  // Apartments (in chunks)
  if (result.missingApartments.length > 0) {
    sqlLines.push("-- Missing Apartments");
    const chunkSize = 1000;
    for (let i = 0; i < result.missingApartments.length; i += chunkSize) {
      const chunk = result.missingApartments.slice(i, i + chunkSize);
      const isLastChunk = i + chunkSize >= result.missingApartments.length;

      if (i > 0) sqlLines.push("");

      sqlLines.push('INSERT INTO "apartment" ("id", "floor_id", "number", "type", "layout_code")');
      sqlLines.push("VALUES");
      sqlLines.push(
        chunk
          .map((a, idx) => {
            const values = [
              `'${a.id}'`,
              `'${a.floorId}'`,
              `'${a.number}'`,
              `'${a.type}'`,
              a.layoutCode ? `'${a.layoutCode}'` : "NULL",
            ];
            const isLast = isLastChunk && idx === chunk.length - 1;
            return `    (${values.join(", ")})${isLast ? ";" : ","}`;
          })
          .join("\n")
      );
    }
    sqlLines.push("");
  }

  // Parkings
  if (result.missingParkings.length > 0) {
    sqlLines.push("-- Missing Parkings");
    sqlLines.push('INSERT INTO "parking" ("id", "building_id", "name")');
    sqlLines.push("VALUES");
    sqlLines.push(
      result.missingParkings
        .map((p, i) => {
          const values = [`'${p.id}'`, `'${p.buildingId}'`, `'${p.name.replace(/'/g, "''")}'`];
          const isLast = i === result.missingParkings.length - 1;
          return `    (${values.join(", ")})${isLast ? ";" : ","}`;
        })
        .join("\n")
    );
    sqlLines.push("");
  }

  // Parking Floors
  if (result.missingParkingFloors.length > 0) {
    sqlLines.push("-- Missing Parking Floors");
    sqlLines.push('INSERT INTO "parking_floor" ("id", "parking_id", "floor_number")');
    sqlLines.push("VALUES");
    sqlLines.push(
      result.missingParkingFloors
        .map((pf, i) => {
          const values = [`'${pf.id}'`, `'${pf.parkingId}'`, pf.floorNumber.toString()];
          const isLast = i === result.missingParkingFloors.length - 1;
          return `    (${values.join(", ")})${isLast ? ";" : ","}`;
        })
        .join("\n")
    );
    sqlLines.push("");
  }

  // Parking Spots (in chunks)
  if (result.missingParkingSpots.length > 0) {
    sqlLines.push("-- Missing Parking Spots");
    const chunkSize = 1000;
    for (let i = 0; i < result.missingParkingSpots.length; i += chunkSize) {
      const chunk = result.missingParkingSpots.slice(i, i + chunkSize);
      const isLastChunk = i + chunkSize >= result.missingParkingSpots.length;

      if (i > 0) sqlLines.push("");

      sqlLines.push('INSERT INTO "parking_spot" ("id", "floor_id", "number", "type")');
      sqlLines.push("VALUES");
      sqlLines.push(
        chunk
          .map((ps, idx) => {
            const values = [`'${ps.id}'`, `'${ps.floorId}'`, `'${ps.number}'`, `'${ps.type}'`];
            const isLast = isLastChunk && idx === chunk.length - 1;
            return `    (${values.join(", ")})${isLast ? ";" : ","}`;
          })
          .join("\n")
      );
    }
    sqlLines.push("");
  }

  sqlLines.push("COMMIT;");
  sqlLines.push("");
  sqlLines.push("-- ============================================================================");
  sqlLines.push("-- Summary:");
  sqlLines.push(`-- Missing Buildings: ${result.missingBuildings.length}`);
  sqlLines.push(`-- Missing Entrances: ${result.missingEntrances.length}`);
  sqlLines.push(`-- Missing Floors: ${result.missingFloors.length}`);
  sqlLines.push(`-- Missing Apartments: ${result.missingApartments.length}`);
  sqlLines.push(`-- Missing Parkings: ${result.missingParkings.length}`);
  sqlLines.push(`-- Missing Parking Floors: ${result.missingParkingFloors.length}`);
  sqlLines.push(`-- Missing Parking Spots: ${result.missingParkingSpots.length}`);
  sqlLines.push("-- ============================================================================");

  return sqlLines.join("\n");
}

async function main() {
  try {
    const result = await compareWithProd();

    const totalMissing =
      result.missingBuildings.length +
      result.missingEntrances.length +
      result.missingFloors.length +
      result.missingApartments.length +
      result.missingParkings.length +
      result.missingParkingFloors.length +
      result.missingParkingSpots.length;

    if (totalMissing === 0) {
      logger.info("✅ Prod и локальная БД синхронизированы!");
      logger.info("   Нет данных для переноса.\n");
      return;
    }

    logger.info("📝 Генерирую SQL для синхронизации...\n");
    const sql = generateInsertSQL(result);

    const outputPath = join(process.cwd(), "drizzle", "sync-to-prod.sql");
    writeFileSync(outputPath, sql, "utf-8");

    logger.info("✅ SQL файл создан!");
    logger.info(`📄 Файл: ${outputPath}`);
    logger.info(`📊 Размер: ${(sql.length / 1024).toFixed(2)} KB\n`);
    logger.info("🚀 Для применения в prod:");
    logger.info(`   psql <PROD_DATABASE_URL> -f ${outputPath}\n`);
    logger.info("⚠️  ВАЖНО: Проверьте файл перед применением!");
  } catch (error) {
    logger.error("❌ Ошибка:", error);
    process.exit(1);
  }
}

main()
  .then(() => {
    logger.info("✨ Готово!");
    process.exit(0);
  })
  .catch((error) => {
    logger.error("❌ Ошибка:", error);
    process.exit(1);
  });
