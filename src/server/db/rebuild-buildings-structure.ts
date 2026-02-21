import { asc } from "drizzle-orm";
import { writeFileSync } from "fs";
import { join } from "path";

import { logger } from "~/lib/logger";

import { apartments, buildings, entrances, floors } from "./schemas/buildings";
import { parkingFloors, parkings, parkingSpots } from "./schemas/parkings";
import { db } from "./index";

/**
 * Скрипт для полной замены структуры ЖК в prod
 *
 * ВНИМАНИЕ: Удаляет ВСЕ квартиры и парковки, включая связи пользователей!
 * Используйте только если готовы пересоздать связи пользователей вручную.
 */

async function generateRebuildSQL() {
  logger.info("🔄 Генерируем SQL для полной замены структуры ЖК...\n");

  // Читаем локальные данные
  logger.info("📊 Читаем данные из локальной БД...");
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

  logger.info("   ✅ Данные прочитаны:");
  logger.info(`      - Строений: ${localBuildings.length}`);
  logger.info(`      - Подъездов: ${localEntrances.length}`);
  logger.info(`      - Этажей: ${localFloors.length}`);
  logger.info(`      - Квартир: ${localApartments.length}`);
  logger.info(`      - Парковок: ${localParkings.length}`);
  logger.info(`      - Этажей парковок: ${localParkingFloors.length}`);
  logger.info(`      - Парковочных мест: ${localParkingSpots.length}\n`);

  const sqlLines: string[] = [];

  sqlLines.push("-- ============================================================================");
  sqlLines.push("-- ПОЛНАЯ ЗАМЕНА структуры ЖК в prod");
  sqlLines.push(`-- Generated: ${new Date().toISOString()}`);
  sqlLines.push("-- ============================================================================");
  sqlLines.push("--");
  sqlLines.push("-- ⚠️  ВНИМАНИЕ: Этот скрипт удаляет ВСЕ квартиры и парковки!");
  sqlLines.push("-- ⚠️  Все связи user_apartment и user_parking_spot будут удалены!");
  sqlLines.push("-- ⚠️  Убедитесь, что есть резервная копия БД!");
  sqlLines.push("--");
  sqlLines.push("-- ============================================================================");
  sqlLines.push("");
  sqlLines.push("BEGIN;");
  sqlLines.push("");

  // Удаляем существующие данные (каскадно удалятся связи пользователей)
  sqlLines.push("-- ============================================================================");
  sqlLines.push("-- Шаг 1: Удаление существующих данных");
  sqlLines.push("-- ============================================================================");
  sqlLines.push("");
  sqlLines.push("-- Удаляем парковочные места (каскадно удалит user_parking_spot)");
  sqlLines.push('DELETE FROM "parking_spot";');
  sqlLines.push("");
  sqlLines.push("-- Удаляем этажи парковок");
  sqlLines.push('DELETE FROM "parking_floor";');
  sqlLines.push("");
  sqlLines.push("-- Удаляем парковки");
  sqlLines.push('DELETE FROM "parking";');
  sqlLines.push("");
  sqlLines.push("-- Удаляем квартиры (каскадно удалит user_apartment)");
  sqlLines.push('DELETE FROM "apartment";');
  sqlLines.push("");
  sqlLines.push("-- Удаляем этажи");
  sqlLines.push('DELETE FROM "floor";');
  sqlLines.push("");
  sqlLines.push("-- Удаляем подъезды");
  sqlLines.push('DELETE FROM "entrance";');
  sqlLines.push("");
  sqlLines.push("-- Удаляем строения");
  sqlLines.push('DELETE FROM "building";');
  sqlLines.push("");

  // Вставляем новые данные
  sqlLines.push("-- ============================================================================");
  sqlLines.push("-- Шаг 2: Вставка новой структуры из локальной БД");
  sqlLines.push("-- ============================================================================");
  sqlLines.push("");

  // Buildings
  if (localBuildings.length > 0) {
    sqlLines.push(`-- Строения (${localBuildings.length})`);
    sqlLines.push('INSERT INTO "building" ("id", "number", "title", "liter", "active")');
    sqlLines.push("VALUES");
    sqlLines.push(
      localBuildings
        .map((b, i) => {
          const values = [
            `'${b.id}'`,
            b.number?.toString() ?? "NULL",
            b.title ? `'${b.title.replace(/'/g, "''")}'` : "NULL",
            b.liter ? `'${b.liter.replace(/'/g, "''")}'` : "NULL",
            b.active ? "true" : "false",
          ];
          const isLast = i === localBuildings.length - 1;
          return `    (${values.join(", ")})${isLast ? ";" : ","}`;
        })
        .join("\n")
    );
    sqlLines.push("");
  }

  // Entrances
  if (localEntrances.length > 0) {
    sqlLines.push(`-- Подъезды (${localEntrances.length})`);
    sqlLines.push('INSERT INTO "entrance" ("id", "building_id", "entrance_number")');
    sqlLines.push("VALUES");
    sqlLines.push(
      localEntrances
        .map((e, i) => {
          const values = [`'${e.id}'`, `'${e.buildingId}'`, e.entranceNumber.toString()];
          const isLast = i === localEntrances.length - 1;
          return `    (${values.join(", ")})${isLast ? ";" : ","}`;
        })
        .join("\n")
    );
    sqlLines.push("");
  }

  // Floors
  if (localFloors.length > 0) {
    sqlLines.push(`-- Этажи (${localFloors.length})`);
    sqlLines.push('INSERT INTO "floor" ("id", "entrance_id", "floor_number")');
    sqlLines.push("VALUES");
    sqlLines.push(
      localFloors
        .map((f, i) => {
          const values = [`'${f.id}'`, `'${f.entranceId}'`, f.floorNumber.toString()];
          const isLast = i === localFloors.length - 1;
          return `    (${values.join(", ")})${isLast ? ";" : ","}`;
        })
        .join("\n")
    );
    sqlLines.push("");
  }

  // Apartments (single INSERT)
  if (localApartments.length > 0) {
    sqlLines.push(`-- Квартиры (${localApartments.length})`);
    sqlLines.push('INSERT INTO "apartment" ("id", "floor_id", "number", "type", "layout_code")');
    sqlLines.push("VALUES");
    sqlLines.push(
      localApartments
        .map((a, idx) => {
          const values = [
            `'${a.id}'`,
            `'${a.floorId}'`,
            `'${a.number}'`,
            `'${a.type}'`,
            a.layoutCode ? `'${a.layoutCode}'` : "NULL",
          ];
          const isLast = idx === localApartments.length - 1;
          return `    (${values.join(", ")})${isLast ? ";" : ","}`;
        })
        .join("\n")
    );
    sqlLines.push("");
  }

  // Parkings
  if (localParkings.length > 0) {
    sqlLines.push(`-- Парковки (${localParkings.length})`);
    sqlLines.push('INSERT INTO "parking" ("id", "building_id", "name")');
    sqlLines.push("VALUES");
    sqlLines.push(
      localParkings
        .map((p, i) => {
          const values = [`'${p.id}'`, `'${p.buildingId}'`, `'${p.name.replace(/'/g, "''")}'`];
          const isLast = i === localParkings.length - 1;
          return `    (${values.join(", ")})${isLast ? ";" : ","}`;
        })
        .join("\n")
    );
    sqlLines.push("");
  }

  // Parking Floors
  if (localParkingFloors.length > 0) {
    sqlLines.push(`-- Этажи парковок (${localParkingFloors.length})`);
    sqlLines.push('INSERT INTO "parking_floor" ("id", "parking_id", "floor_number")');
    sqlLines.push("VALUES");
    sqlLines.push(
      localParkingFloors
        .map((pf, i) => {
          const values = [`'${pf.id}'`, `'${pf.parkingId}'`, pf.floorNumber.toString()];
          const isLast = i === localParkingFloors.length - 1;
          return `    (${values.join(", ")})${isLast ? ";" : ","}`;
        })
        .join("\n")
    );
    sqlLines.push("");
  }

  // Parking Spots (single INSERT)
  if (localParkingSpots.length > 0) {
    sqlLines.push(`-- Парковочные места (${localParkingSpots.length})`);
    sqlLines.push('INSERT INTO "parking_spot" ("id", "floor_id", "number", "type")');
    sqlLines.push("VALUES");
    sqlLines.push(
      localParkingSpots
        .map((ps, idx) => {
          const values = [`'${ps.id}'`, `'${ps.floorId}'`, `'${ps.number}'`, `'${ps.type}'`];
          const isLast = idx === localParkingSpots.length - 1;
          return `    (${values.join(", ")})${isLast ? ";" : ","}`;
        })
        .join("\n")
    );
    sqlLines.push("");
  }

  sqlLines.push("COMMIT;");
  sqlLines.push("");
  sqlLines.push("-- ============================================================================");
  sqlLines.push("-- Summary:");
  sqlLines.push(`-- Buildings: ${localBuildings.length}`);
  sqlLines.push(`-- Entrances: ${localEntrances.length}`);
  sqlLines.push(`-- Floors: ${localFloors.length}`);
  sqlLines.push(`-- Apartments: ${localApartments.length}`);
  sqlLines.push(`-- Parkings: ${localParkings.length}`);
  sqlLines.push(`-- Parking Floors: ${localParkingFloors.length}`);
  sqlLines.push(`-- Parking Spots: ${localParkingSpots.length}`);
  sqlLines.push("--");
  sqlLines.push("-- ⚠️  Все связи пользователей удалены!");
  sqlLines.push("-- ⚠️  Необходимо пересоздать связи user_apartment и user_parking_spot");
  sqlLines.push("-- ============================================================================");

  return sqlLines.join("\n");
}

async function main() {
  try {
    const sql = await generateRebuildSQL();

    const outputPath = join(process.cwd(), "drizzle", "rebuild-buildings.sql");
    writeFileSync(outputPath, sql, "utf-8");

    logger.info("✅ SQL файл создан!");
    logger.info(`📄 Файл: ${outputPath}`);
    logger.info(`📊 Размер: ${(sql.length / 1024).toFixed(2)} KB\n`);
    logger.info("⚠️  КРИТИЧЕСКАЯ ВАЖНОСТЬ:");
    logger.info("   1. Этот скрипт УДАЛИТ все квартиры и парковки");
    logger.info("   2. Все связи user_apartment и user_parking_spot будут УДАЛЕНЫ");
    logger.info("   3. Убедитесь, что есть резервная копия БД");
    logger.info("   4. После применения нужно ПЕРЕСОЗДАТЬ связи пользователей\n");
    logger.info("🚀 Для применения в prod:");
    logger.info(`   psql <PROD_DATABASE_URL> -f ${outputPath}\n`);
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
