import { eq, inArray } from "drizzle-orm";

import { logger } from "~/lib/logger";

import { db } from "./index";
import { directoryTags, knowledgeBaseArticles, knowledgeBaseArticleTags } from "./schema";

/**
 * Seed script for HowTo articles (База знаний) ЖК Сердце Ростова 2
 *
 * Creates draft articles based on analysis of Telegram chat discussions.
 * All articles are created as DRAFTS for editorial review.
 *
 * Categories (7):
 * 1. Документы и право
 * 2. Инженерные системы
 * 3. Доступ и безопасность
 * 4. Платежи и ЖКХ
 * 5. Ремонт и благоустройство
 * 6. Паркинг и въезд
 * 7. Цифровые сервисы
 */

// ============== HOWTO CATEGORY TAGS ==============

type HowtoTagDefinition = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  order: number;
};

const HOWTO_TAGS: HowtoTagDefinition[] = [
  {
    id: "howto-cat-docs",
    name: "Документы и право",
    slug: "howto-docs",
    description: "Регистрация собственности, снятие обременения, техпаспорт, перепланировка",
    icon: "FileText",
    order: 1,
  },
  {
    id: "howto-cat-engineering",
    name: "Инженерные системы",
    slug: "howto-engineering",
    description: "Отопление, вода, окна, вентиляция",
    icon: "Wrench",
    order: 2,
  },
  {
    id: "howto-cat-access",
    name: "Доступ и безопасность",
    slug: "howto-access",
    description: "Домофон, ключи, пульты, видеонаблюдение, пожарная сигнализация",
    icon: "Shield",
    order: 3,
  },
  {
    id: "howto-cat-payments",
    name: "Платежи и ЖКХ",
    slug: "howto-payments",
    description: "Квитанции, передача показаний, управляющая компания",
    icon: "CreditCard",
    order: 4,
  },
  {
    id: "howto-cat-renovation",
    name: "Ремонт и благоустройство",
    slug: "howto-renovation",
    description: "Приёмка квартиры, гарантийные работы, планировки, вывоз мусора",
    icon: "Hammer",
    order: 5,
  },
  {
    id: "howto-cat-parking",
    name: "Паркинг и въезд",
    slug: "howto-parking",
    description: "Ворота, шлагбаумы, машиноместа, доступ на территорию",
    icon: "Car",
    order: 6,
  },
  {
    id: "howto-cat-digital",
    name: "Цифровые сервисы",
    slug: "howto-digital",
    description: "Интернет-провайдеры, мобильные приложения, онлайн-сервисы",
    icon: "Smartphone",
    order: 7,
  },
];

// ============== HOWTO ARTICLES ==============

type ArticleDefinition = {
  slug: string;
  title: string;
  excerpt: string;
  icon?: string;
  categoryId: string; // Reference to HOWTO_TAGS.id
  order: number;
  priority: 1 | 2 | 3; // 1 = highest, based on chat frequency
};

const HOWTO_ARTICLES: ArticleDefinition[] = [
  // ===== ИНЖЕНЕРНЫЕ СИСТЕМЫ (highest frequency) =====
  {
    slug: "otoplenie-nastroyka-termoregulyatora",
    title: "Отопление: как настроить терморегулятор и что делать с холодными батареями",
    excerpt:
      "Инструкция по настройке терморегуляторов Danfoss RTR-C, решение проблем с холодными или чуть тёплыми батареями в морозы.",
    icon: "Thermometer",
    categoryId: "howto-cat-engineering",
    order: 1,
    priority: 1,
  },
  {
    slug: "okna-kondensat-i-remont",
    title: "Окна: конденсат, протечки и режим зима-лето",
    excerpt:
      "Почему текут и потеют окна, как убрать конденсат, регулировка режима зима-лето, гарантийный ремонт стеклопакетов.",
    icon: "Square",
    categoryId: "howto-cat-engineering",
    order: 2,
    priority: 1,
  },
  {
    slug: "voda-napor-i-temperatura",
    title: "Вода: низкий напор и температура горячей воды",
    excerpt:
      "Решение проблем с напором воды, промывка фильтров, обратные клапаны, холодный полотенцесушитель.",
    icon: "Droplet",
    categoryId: "howto-cat-engineering",
    order: 3,
    priority: 1,
  },
  {
    slug: "ventilyatsiya-proverka-i-obsluzhivanie",
    title: "Вентиляция: проверка работы и обслуживание",
    excerpt:
      "Как проверить работу вентиляции в квартире, что делать при плохой тяге, куда обращаться.",
    icon: "Wind",
    categoryId: "howto-cat-engineering",
    order: 4,
    priority: 3,
  },

  // ===== ДОСТУП И БЕЗОПАСНОСТЬ (highest frequency) =====
  {
    slug: "domofon-nastroyka-i-prilozhenie",
    title: "Домофон: настройка VDome и подключение к квартире",
    excerpt:
      "Установка приложения VDome на iOS и Android, регистрация, набор номера квартиры, решение проблем с линией.",
    icon: "DoorOpen",
    categoryId: "howto-cat-access",
    order: 1,
    priority: 1,
  },
  {
    slug: "klyuchi-i-pulty-dostupa",
    title: "Ключи и пульты: где получить и как настроить",
    excerpt:
      "Получение магнитных ключей у консьержа, пульты для ворот и калиток, стоимость и сроки.",
    icon: "Key",
    categoryId: "howto-cat-access",
    order: 2,
    priority: 2,
  },
  {
    slug: "videonablyudenie-dostup-k-kameram",
    title: "Видеонаблюдение: доступ к камерам подъезда",
    excerpt:
      "Приложение DMSS для просмотра камер, получение доступа к регистратору, личные камеры на этаже.",
    icon: "Camera",
    categoryId: "howto-cat-access",
    order: 3,
    priority: 2,
  },
  {
    slug: "pozharnaya-signalizatsiya",
    title: "Пожарная сигнализация: что делать при срабатывании",
    excerpt:
      "Порядок действий при срабатывании пожарной сигнализации, контакты для вызова, датчики в квартире.",
    icon: "Siren",
    categoryId: "howto-cat-access",
    order: 4,
    priority: 3,
  },

  // ===== ДОКУМЕНТЫ И ПРАВО =====
  {
    slug: "registratsiya-sobstvennosti",
    title: "Регистрация права собственности на квартиру",
    excerpt:
      "Пошаговая инструкция по регистрации права собственности в Росреестре, необходимые документы, сроки.",
    icon: "FileCheck",
    categoryId: "howto-cat-docs",
    order: 1,
    priority: 2,
  },
  {
    slug: "snyatie-obremeneniya-ipoteka",
    title: "Снятие обременения по ипотеке",
    excerpt:
      "Как снять обременение после погашения ипотеки, документы, сроки, письмо из Росреестра.",
    icon: "Unlock",
    categoryId: "howto-cat-docs",
    order: 2,
    priority: 2,
  },
  {
    slug: "tehnicheskiy-pasport-kvartiry",
    title: "Технический паспорт квартиры",
    excerpt: "Как получить техпаспорт, для чего он нужен, куда обращаться.",
    icon: "FileText",
    categoryId: "howto-cat-docs",
    order: 3,
    priority: 3,
  },
  {
    slug: "pereplanirovka-soglasovanie",
    title: "Перепланировка: что можно и как узаконить",
    excerpt:
      "Какие перепланировки разрешены, порядок согласования, штрафы за незаконные изменения.",
    icon: "LayoutGrid",
    categoryId: "howto-cat-docs",
    order: 4,
    priority: 2,
  },
  {
    slug: "otkrytie-litsevyh-schetov",
    title: "Открытие лицевых счетов",
    excerpt:
      "Как открыть лицевые счета на воду, электричество, газ после заселения в новую квартиру.",
    icon: "Receipt",
    categoryId: "howto-cat-docs",
    order: 5,
    priority: 2,
  },

  // ===== ПЛАТЕЖИ И ЖКХ =====
  {
    slug: "kvitantsii-rasshifrovka",
    title: "Квитанции: расшифровка и оплата",
    excerpt: "Как читать квитанции ЖКХ, что означает каждая строка, способы оплаты, перерасчёт.",
    icon: "Receipt",
    categoryId: "howto-cat-payments",
    order: 1,
    priority: 1,
  },
  {
    slug: "peredacha-pokazaniy-schetchikov",
    title: "Передача показаний счётчиков",
    excerpt:
      "Куда и когда передавать показания воды (Водоканал), электричества (ТНС-Энерго), тепла (Теплосервис).",
    icon: "Gauge",
    categoryId: "howto-cat-payments",
    order: 2,
    priority: 2,
  },
  {
    slug: "konsierzh-oplata-i-pereraschet",
    title: "Консьерж: расчёт оплаты и перерасчёт",
    excerpt: "Как начисляется оплата за консьержа, когда можно запросить перерасчёт.",
    icon: "UserCheck",
    categoryId: "howto-cat-payments",
    order: 3,
    priority: 2,
  },
  {
    slug: "gosuslugi-dom-prilozhenie",
    title: "Госуслуги.Дом: работа с приложением",
    excerpt: "Регистрация в приложении Госуслуги.Дом, передача показаний, электронные квитанции.",
    icon: "Smartphone",
    categoryId: "howto-cat-payments",
    order: 4,
    priority: 2,
  },
  {
    slug: "kontakty-uk-i-zastroyschika",
    title: "Контакты: УК, застройщик, мастера",
    excerpt:
      "Все контакты управляющей компании, застройщика МСК, аварийных служб и местных мастеров.",
    icon: "Phone",
    categoryId: "howto-cat-payments",
    order: 5,
    priority: 1,
  },

  // ===== РЕМОНТ И БЛАГОУСТРОЙСТВО =====
  {
    slug: "garantiynye-raboty-zastroyschika",
    title: "Гарантийные работы: куда обращаться и что покрывает",
    excerpt:
      "Контакты гарантийного отдела МСК, как оставить заявку, сроки устранения дефектов, что попадает под гарантию.",
    icon: "ShieldCheck",
    categoryId: "howto-cat-renovation",
    order: 1,
    priority: 1,
  },
  {
    slug: "priyomka-kvartiry-chek-list",
    title: "Приёмка квартиры: чек-лист и порядок",
    excerpt: "На что обратить внимание при приёмке, типичные дефекты whitebox, как оформить акт.",
    icon: "ClipboardCheck",
    categoryId: "howto-cat-renovation",
    order: 2,
    priority: 2,
  },
  {
    slug: "remont-whitebox-byudzhet-i-etapy",
    title: "Ремонт после whitebox: бюджет и этапы",
    excerpt:
      "Примерный бюджет ремонта студии, этапы работ, выбор подрядчиков, сантехника и электрика.",
    icon: "HardHat",
    categoryId: "howto-cat-renovation",
    order: 3,
    priority: 2,
  },
  {
    slug: "planirovki-idei-dlya-kvartir",
    title: "Планировки: идеи для студий и многокомнатных",
    excerpt:
      "Популярные решения планировок: кухня-гостиная, маленькая ванная, гардеробные, размещение стиралки.",
    icon: "LayoutGrid",
    categoryId: "howto-cat-renovation",
    order: 4,
    priority: 2,
  },
  {
    slug: "vyvoz-stroitelnogo-musora",
    title: "Вывоз строительного мусора",
    excerpt: "Как организовать вывоз строительного мусора, правила, контакты служб.",
    icon: "Trash2",
    categoryId: "howto-cat-renovation",
    order: 5,
    priority: 3,
  },
  {
    slug: "shum-pravila-i-kuda-zhalovatsya",
    title: "Шум от соседей: правила тишины и куда жаловаться",
    excerpt: "Часы ремонтных работ, правила тишины в ЖК, куда обращаться при нарушениях.",
    icon: "Volume2",
    categoryId: "howto-cat-renovation",
    order: 6,
    priority: 2,
  },

  // ===== ПАРКИНГ И ВЪЕЗД =====
  {
    slug: "vorota-kak-otkryt",
    title: "Ворота: как открыть и настроить доступ",
    excerpt: "Открытие ворот через приложение VDome, пульты, звонок охране, проблемы с доступом.",
    icon: "DoorClosed",
    categoryId: "howto-cat-parking",
    order: 1,
    priority: 1,
  },
  {
    slug: "mashinomesta-arenda-i-pokupka",
    title: "Машиноместа: аренда и покупка",
    excerpt: "Подземный паркинг, доступные машиноместа, аренда, оформление в собственность.",
    icon: "ParkingCircle",
    categoryId: "howto-cat-parking",
    order: 2,
    priority: 2,
  },
  {
    slug: "blokirovka-vyezda-chto-delat",
    title: "Блокировка выезда: что делать",
    excerpt: "Куда звонить если заблокировали выезд, правила парковки на территории.",
    icon: "Ban",
    categoryId: "howto-cat-parking",
    order: 3,
    priority: 2,
  },
  {
    slug: "videonablyudenie-na-parkovke",
    title: "Видеонаблюдение на паркинге",
    excerpt: "Доступ к камерам паркинга, установка личной камеры в машиноместе.",
    icon: "Camera",
    categoryId: "howto-cat-parking",
    order: 4,
    priority: 3,
  },

  // ===== ЦИФРОВЫЕ СЕРВИСЫ =====
  {
    slug: "internet-provaydery-podklyuchenie",
    title: "Интернет: провайдеры и подключение",
    excerpt: "Доступные провайдеры (Орбита, дом.ру, билайн), тарифы, подключение в новой квартире.",
    icon: "Wifi",
    categoryId: "howto-cat-digital",
    order: 1,
    priority: 2,
  },
  {
    slug: "prilozhenie-vdome-polnaya-instrukciya",
    title: "Приложение VDome: полная инструкция",
    excerpt: "Установка VDome, регистрация, подключение домофона, открытие ворот, решение проблем.",
    icon: "Smartphone",
    categoryId: "howto-cat-digital",
    order: 2,
    priority: 1,
  },
  {
    slug: "prilozhenie-dmss-kamery",
    title: "Приложение DMSS: доступ к камерам",
    excerpt:
      "Установка и настройка DMSS для просмотра камер видеонаблюдения в подъезде и на территории.",
    icon: "Camera",
    categoryId: "howto-cat-digital",
    order: 3,
    priority: 2,
  },
  {
    slug: "lichnye-kabinety-zhkh",
    title: "Личные кабинеты ЖКХ: вода, свет, тепло",
    excerpt:
      "Регистрация в личных кабинетах Водоканала, ТНС-Энерго, Теплосервис Юг для передачи показаний и оплаты.",
    icon: "User",
    categoryId: "howto-cat-digital",
    order: 4,
    priority: 2,
  },
  {
    slug: "kvartplata-onlayn-servis",
    title: "Квартплата.Онлайн: оплата и показания",
    excerpt: "Работа с сервисом Квартплата.Онлайн для оплаты ЖКХ и передачи показаний счётчиков.",
    icon: "CreditCard",
    categoryId: "howto-cat-digital",
    order: 5,
    priority: 2,
  },
];

// ============== SEED FUNCTION ==============

async function seedHowtos() {
  logger.info("🌱 Seeding HowTo articles for ЖК Сердце Ростова 2...");

  try {
    // Clear existing howto data
    logger.info("🧹 Clearing existing howto data...");
    await db.delete(knowledgeBaseArticleTags);
    await db.delete(knowledgeBaseArticles);

    // Delete only howto category tags (preserve other directory tags)
    const howtoTagIds = HOWTO_TAGS.map((t) => t.id);
    if (howtoTagIds.length > 0) {
      await db.delete(directoryTags).where(inArray(directoryTags.id, howtoTagIds));
    }

    // Insert howto category tags
    logger.info("📁 Inserting howto category tags...");
    for (const tag of HOWTO_TAGS) {
      await db.insert(directoryTags).values({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        description: tag.description,
        scope: "core", // Using core scope for ЖК-related content
        icon: tag.icon,
        order: tag.order + 200, // Offset to not conflict with directory tags
      });
    }
    logger.info(`  ✓ Inserted ${HOWTO_TAGS.length} howto category tags`);

    // Insert articles
    logger.info("📝 Inserting draft articles...");
    let articleCount = 0;

    for (const article of HOWTO_ARTICLES) {
      const articleId = crypto.randomUUID();

      // Create placeholder TipTap content structure
      const placeholderContent = JSON.stringify({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Проблема" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Описание проблемы..." }],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Решение" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Пошаговое решение..." }],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Контакты" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Куда обращаться..." }],
          },
        ],
      });

      await db.insert(knowledgeBaseArticles).values({
        id: articleId,
        slug: article.slug,
        title: article.title,
        excerpt: article.excerpt,
        content: placeholderContent,
        status: "draft",
        icon: article.icon,
        order: article.order,
      });

      // Link article to category tag
      await db.insert(knowledgeBaseArticleTags).values({
        articleId,
        tagId: article.categoryId,
      });

      articleCount++;
    }

    logger.info(`  ✓ Inserted ${articleCount} draft articles`);

    // Summary by category
    logger.info("\n✅ HowTo seeding complete!");
    logger.info("");
    logger.info("📊 Summary by category:");
    for (const tag of HOWTO_TAGS) {
      const count = HOWTO_ARTICLES.filter((a) => a.categoryId === tag.id).length;
      logger.info(`  • ${tag.name}: ${count} статей`);
    }

    logger.info("");
    logger.info("📝 Priority breakdown:");
    const p1 = HOWTO_ARTICLES.filter((a) => a.priority === 1).length;
    const p2 = HOWTO_ARTICLES.filter((a) => a.priority === 2).length;
    const p3 = HOWTO_ARTICLES.filter((a) => a.priority === 3).length;
    logger.info(`  ⭐⭐⭐ High priority: ${p1} статей`);
    logger.info(`  ⭐⭐ Medium priority: ${p2} статей`);
    logger.info(`  ⭐ Low priority: ${p3} статей`);

    logger.info("");
    logger.info("💡 All articles created as DRAFTS. Use admin panel to edit and publish.");
  } catch (error) {
    logger.error("❌ Error seeding howtos:", error);
    throw error;
  }

  process.exit(0);
}

seedHowtos();
