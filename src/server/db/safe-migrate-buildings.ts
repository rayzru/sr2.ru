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
 * БЕЗОПАСНАЯ миграция структуры ЖК в prod с сохранением связей пользователей
 *
 * Стратегия:
 * 1. Используем уникальные идентификаторы (номер квартиры, номер парковки)
 * 2. Сначала обновляем существующие записи
 * 3. Только потом добавляем новые
 * 4. Связи пользователей остаются по номерам, не по ID
 *
 * КРИТИЧНО: Связи user_apartment и user_parking_spot НЕ ДОЛЖНЫ БЫТЬ ПОТЕРЯНЫ!
 */

interface MigrationPlan {
  // Структура для обновления
  buildingsToUpdate: any[];
  buildingsToInsert: any[];

  entrancesToUpdate: any[];
  entrancesToInsert: any[];

  floorsToUpdate: any[];
  floorsToInsert: any[];

  apartmentsToUpdate: any[];
  apartmentsToInsert: any[];

  parkingsToUpdate: any[];
  parkingsToInsert: any[];

  parkingFloorsToUpdate: any[];
  parkingFloorsToInsert: any[];

  parkingSpotsToUpdate: any[];
  parkingSpotsToInsert: any[];
}

async function analyzeMigration(): Promise<MigrationPlan> {
  logger.info("🔍 Анализируем миграцию...\n");

  const prodDbUrl = process.env.PROD_DATABASE_URL || env.DATABASE_URL;
  if (prodDbUrl === env.DATABASE_URL) {
    logger.warn("⚠️  PROD_DATABASE_URL не задан, используется DATABASE_URL\n");
  }

  const prodDb = postgres(prodDbUrl, { max: 1 });

  try {
    // Получаем локальные данные
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
    logger.info(`      - Квартир: ${localApartments.length}`);
    logger.info(`      - Парковочных мест: ${localParkingSpots.length}\n`);

    // Получаем prod данные
    logger.info("📊 Читаем prod данные...");
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
    logger.info(`      - Квартир: ${prodApartments.length}`);
    logger.info(`      - Парковочных мест: ${prodParkingSpots.length}\n`);

    // Создаем индексы по уникальным ключам
    const prodBuildingsByNumber = new Map(prodBuildings.map((b: any) => [b.number, b]));
    const prodApartmentsByNumber = new Map(prodApartments.map((a: any) => [a.number, a]));
    const prodParkingSpotsByNumber = new Map(prodParkingSpots.map((ps: any) => [ps.number, ps]));

    logger.info("🔎 Анализируем различия...\n");

    // Buildings
    const buildingsToUpdate: any[] = [];
    const buildingsToInsert: any[] = [];

    for (const localBuilding of localBuildings) {
      const prodBuilding = prodBuildingsByNumber.get(localBuilding.number);
      if (prodBuilding) {
        // Обновляем, если есть изменения
        if (
          prodBuilding.title !== localBuilding.title ||
          prodBuilding.liter !== localBuilding.liter ||
          prodBuilding.active !== localBuilding.active
        ) {
          buildingsToUpdate.push({ local: localBuilding, prod: prodBuilding });
        }
      } else {
        buildingsToInsert.push(localBuilding);
      }
    }

    // Apartments - КРИТИЧНО! Обновляем по номеру, сохраняя ID из prod
    const apartmentsToUpdate: any[] = [];
    const apartmentsToInsert: any[] = [];

    for (const localApt of localApartments) {
      const prodApt = prodApartmentsByNumber.get(localApt.number);
      if (prodApt) {
        // Обновляем тип/layout, сохраняя ID
        if (prodApt.type !== localApt.type || prodApt.layout_code !== localApt.layoutCode) {
          apartmentsToUpdate.push({ local: localApt, prod: prodApt });
        }
      } else {
        apartmentsToInsert.push(localApt);
      }
    }

    // Parking Spots - КРИТИЧНО! Обновляем по номеру
    const parkingSpotsToUpdate: any[] = [];
    const parkingSpotsToInsert: any[] = [];

    for (const localSpot of localParkingSpots) {
      const prodSpot = prodParkingSpotsByNumber.get(localSpot.number);
      if (prodSpot) {
        // Обновляем тип, сохраняя ID
        if (prodSpot.type !== localSpot.type) {
          parkingSpotsToUpdate.push({ local: localSpot, prod: prodSpot });
        }
      } else {
        parkingSpotsToInsert.push(localSpot);
      }
    }

    logger.info("📋 Результаты анализа:");
    logger.info("\n🏢 Строения:");
    logger.info(`   - Для обновления: ${buildingsToUpdate.length}`);
    logger.info(`   - Для добавления: ${buildingsToInsert.length}`);

    logger.info("\n🏠 Квартиры (КРИТИЧНО - связи с user_apartment):");
    logger.info(`   - Для обновления: ${apartmentsToUpdate.length}`);
    logger.info(`   - Для добавления: ${apartmentsToInsert.length}`);
    logger.info(
      `   - Без изменений: ${localApartments.length - apartmentsToUpdate.length - apartmentsToInsert.length}`
    );

    logger.info("\n🚗 Парковочные места (КРИТИЧНО - связи с user_parking_spot):");
    logger.info(`   - Для обновления: ${parkingSpotsToUpdate.length}`);
    logger.info(`   - Для добавления: ${parkingSpotsToInsert.length}`);
    logger.info(
      `   - Без изменений: ${localParkingSpots.length - parkingSpotsToUpdate.length - parkingSpotsToInsert.length}\n`
    );

    return {
      buildingsToUpdate,
      buildingsToInsert,
      entrancesToUpdate: [],
      entrancesToInsert: [],
      floorsToUpdate: [],
      floorsToInsert: [],
      apartmentsToUpdate,
      apartmentsToInsert,
      parkingsToUpdate: [],
      parkingsToInsert: [],
      parkingFloorsToUpdate: [],
      parkingFloorsToInsert: [],
      parkingSpotsToUpdate,
      parkingSpotsToInsert,
    };
  } finally {
    await prodDb.end();
  }
}

function generateMigrationSQL(plan: MigrationPlan): string {
  const sqlLines: string[] = [];

  sqlLines.push("-- ============================================================================");
  sqlLines.push("-- БЕЗОПАСНАЯ миграция структуры ЖК с сохранением связей пользователей");
  sqlLines.push(`-- Generated: ${new Date().toISOString()}`);
  sqlLines.push("-- ============================================================================");
  sqlLines.push("--");
  sqlLines.push("-- ВАЖНО:");
  sqlLines.push("-- 1. Сохраняются ID существующих квартир/парковок");
  sqlLines.push("-- 2. Связи user_apartment и user_parking_spot остаются неизменными");
  sqlLines.push("-- 3. Обновляются только свойства (тип, планировка)");
  sqlLines.push("--");
  sqlLines.push("-- ============================================================================");
  sqlLines.push("");
  sqlLines.push("BEGIN;");
  sqlLines.push("");

  // 1. UPDATE Buildings
  if (plan.buildingsToUpdate.length > 0) {
    sqlLines.push(
      "-- ============================================================================"
    );
    sqlLines.push(`-- UPDATE Buildings (${plan.buildingsToUpdate.length})`);
    sqlLines.push(
      "-- ============================================================================"
    );
    sqlLines.push("");

    for (const { local, prod } of plan.buildingsToUpdate) {
      sqlLines.push(`-- Building #${local.number}: ${prod.title} → ${local.title}`);
      sqlLines.push(
        `UPDATE "building" SET "title" = '${local.title?.replace(/'/g, "''")}', "liter" = ${
          local.liter ? `'${local.liter.replace(/'/g, "''")}'` : "NULL"
        }, "active" = ${local.active ? "true" : "false"} WHERE "id" = '${prod.id}';`
      );
    }
    sqlLines.push("");
  }

  // 2. UPDATE Apartments (КРИТИЧНО!)
  if (plan.apartmentsToUpdate.length > 0) {
    sqlLines.push(
      "-- ============================================================================"
    );
    sqlLines.push(`-- UPDATE Apartments (${plan.apartmentsToUpdate.length})`);
    sqlLines.push("-- КРИТИЧНО: Сохраняем ID для связей user_apartment");
    sqlLines.push(
      "-- ============================================================================"
    );
    sqlLines.push("");

    for (const { local, prod } of plan.apartmentsToUpdate) {
      sqlLines.push(`-- Apartment #${local.number}: ${prod.type} → ${local.type}`);
      sqlLines.push(
        `UPDATE "apartment" SET "type" = '${local.type}', "layout_code" = ${
          local.layoutCode ? `'${local.layoutCode}'` : "NULL"
        } WHERE "id" = '${prod.id}';`
      );
    }
    sqlLines.push("");
  }

  // 3. UPDATE Parking Spots (КРИТИЧНО!)
  if (plan.parkingSpotsToUpdate.length > 0) {
    sqlLines.push(
      "-- ============================================================================"
    );
    sqlLines.push(`-- UPDATE Parking Spots (${plan.parkingSpotsToUpdate.length})`);
    sqlLines.push("-- КРИТИЧНО: Сохраняем ID для связей user_parking_spot");
    sqlLines.push(
      "-- ============================================================================"
    );
    sqlLines.push("");

    for (const { local, prod } of plan.parkingSpotsToUpdate) {
      sqlLines.push(`-- Parking Spot #${local.number}: ${prod.type} → ${local.type}`);
      sqlLines.push(
        `UPDATE "parking_spot" SET "type" = '${local.type}' WHERE "id" = '${prod.id}';`
      );
    }
    sqlLines.push("");
  }

  // 4. INSERT new Buildings
  if (plan.buildingsToInsert.length > 0) {
    sqlLines.push(
      "-- ============================================================================"
    );
    sqlLines.push(`-- INSERT new Buildings (${plan.buildingsToInsert.length})`);
    sqlLines.push(
      "-- ============================================================================"
    );
    sqlLines.push("");
    sqlLines.push('INSERT INTO "building" ("id", "number", "title", "liter", "active")');
    sqlLines.push("VALUES");
    sqlLines.push(
      plan.buildingsToInsert
        .map((b, i) => {
          const values = [
            `'${b.id}'`,
            b.number?.toString() ?? "NULL",
            b.title ? `'${b.title.replace(/'/g, "''")}'` : "NULL",
            b.liter ? `'${b.liter.replace(/'/g, "''")}'` : "NULL",
            b.active ? "true" : "false",
          ];
          const isLast = i === plan.buildingsToInsert.length - 1;
          return `    (${values.join(", ")})${isLast ? ";" : ","}`;
        })
        .join("\n")
    );
    sqlLines.push("");
  }

  // 5. INSERT new Apartments
  if (plan.apartmentsToInsert.length > 0) {
    sqlLines.push(
      "-- ============================================================================"
    );
    sqlLines.push(`-- INSERT new Apartments (${plan.apartmentsToInsert.length})`);
    sqlLines.push(
      "-- ============================================================================"
    );
    sqlLines.push("");

    const chunkSize = 1000;
    for (let i = 0; i < plan.apartmentsToInsert.length; i += chunkSize) {
      const chunk = plan.apartmentsToInsert.slice(i, i + chunkSize);
      const isLastChunk = i + chunkSize >= plan.apartmentsToInsert.length;

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

  // 6. INSERT new Parking Spots
  if (plan.parkingSpotsToInsert.length > 0) {
    sqlLines.push(
      "-- ============================================================================"
    );
    sqlLines.push(`-- INSERT new Parking Spots (${plan.parkingSpotsToInsert.length})`);
    sqlLines.push(
      "-- ============================================================================"
    );
    sqlLines.push("");

    const chunkSize = 1000;
    for (let i = 0; i < plan.parkingSpotsToInsert.length; i += chunkSize) {
      const chunk = plan.parkingSpotsToInsert.slice(i, i + chunkSize);
      const isLastChunk = i + chunkSize >= plan.parkingSpotsToInsert.length;

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
  sqlLines.push(`-- Buildings updated: ${plan.buildingsToUpdate.length}`);
  sqlLines.push(`-- Buildings inserted: ${plan.buildingsToInsert.length}`);
  sqlLines.push(`-- Apartments updated: ${plan.apartmentsToUpdate.length} (ID preserved)`);
  sqlLines.push(`-- Apartments inserted: ${plan.apartmentsToInsert.length}`);
  sqlLines.push(`-- Parking spots updated: ${plan.parkingSpotsToUpdate.length} (ID preserved)`);
  sqlLines.push(`-- Parking spots inserted: ${plan.parkingSpotsToInsert.length}`);
  sqlLines.push("--");
  sqlLines.push("-- ✅ Связи user_apartment и user_parking_spot сохранены!");
  sqlLines.push("-- ============================================================================");

  return sqlLines.join("\n");
}

async function main() {
  try {
    const plan = await analyzeMigration();

    const totalChanges =
      plan.buildingsToUpdate.length +
      plan.buildingsToInsert.length +
      plan.apartmentsToUpdate.length +
      plan.apartmentsToInsert.length +
      plan.parkingSpotsToUpdate.length +
      plan.parkingSpotsToInsert.length;

    if (totalChanges === 0) {
      logger.info("✅ Структура ЖК в prod актуальна!");
      logger.info("   Нет изменений для применения.\n");
      return;
    }

    logger.info("📝 Генерирую SQL миграцию...\n");
    const sql = generateMigrationSQL(plan);

    const outputPath = join(process.cwd(), "drizzle", "migrate-buildings-safe.sql");
    writeFileSync(outputPath, sql, "utf-8");

    logger.info("✅ SQL файл создан!");
    logger.info(`📄 Файл: ${outputPath}`);
    logger.info(`📊 Размер: ${(sql.length / 1024).toFixed(2)} KB\n`);

    logger.info("⚠️  ВАЖНЫЕ ИНСТРУКЦИИ:");
    logger.info("1. 📋 Проверьте файл перед применением");
    logger.info("2. 💾 Сделайте бэкап prod БД:");
    logger.info("   pg_dump $PROD_DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql");
    logger.info("3. ✅ Примените миграцию:");
    logger.info(`   psql $PROD_DATABASE_URL -f ${outputPath}`);
    logger.info("4. 🔍 Проверьте связи пользователей:");
    logger.info("   SELECT COUNT(*) FROM user_apartment;");
    logger.info("   SELECT COUNT(*) FROM user_parking_spot;\n");
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
