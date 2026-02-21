import type { JSONContent } from "@tiptap/react";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { buildings, entrances, floors } from "./buildings";
import { createTable } from "./create-table";
import { directoryTags } from "./directory";
import { users } from "./users";

// ============================================================================
// Enums
// ============================================================================

export const publicationTypeEnum = pgEnum("publication_type_enum", [
  "announcement", // Объявление (обычное)
  "event", // Мероприятие
  "help_request", // Просьба о помощи
  "lost_found", // Потеряно/найдено
  "recommendation", // Рекомендация
  "question", // Вопрос сообществу
  "discussion", // Обсуждение
]);

export const publicationStatusEnum = pgEnum("publication_status_enum", [
  "draft", // Черновик
  "pending", // На модерации (ожидает одобрений)
  "published", // Опубликовано
  "rejected", // Отклонено
  "archived", // В архиве
]);

// Результат голосования модератора
export const moderationVoteEnum = pgEnum("moderation_vote_enum", [
  "approve", // Одобрить
  "reject", // Отклонить
  "request_changes", // Запросить изменения
]);

// Действия в истории публикации
export const publicationHistoryActionEnum = pgEnum("publication_history_action_enum", [
  "created", // Создано
  "updated", // Обновлено
  "submitted", // Отправлено на модерацию
  "approved", // Одобрено
  "rejected", // Отклонено
  "archived", // Архивировано
  "published", // Опубликовано
  "pinned", // Закреплено
  "unpinned", // Откреплено
  "moderation_vote", // Голос модератора
]);

// Типы целей для привязки публикаций
export const publicationTargetTypeEnum = pgEnum("publication_target_type_enum", [
  "complex", // Весь ЖК
  "uk", // УК (управляющая компания)
  "building", // Строение/корпус
  "entrance", // Подъезд
  "floor", // Этаж
]);

// Типы повторения событий
export const eventRecurrenceTypeEnum = pgEnum("event_recurrence_type_enum", [
  "none", // Без повторения (одноразовое событие)
  "daily", // Ежедневно
  "weekly", // Еженедельно
  "monthly", // Ежемесячно
  "yearly", // Ежегодно
]);

// ============================================================================
// Publications Table
// ============================================================================

export const publications = createTable(
  "publication",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Basic info
    title: varchar("title", { length: 255 }).notNull(),

    // Content (TipTap JSON)
    content: jsonb("content").$type<JSONContent>().notNull(),

    // Media
    coverImage: varchar("cover_image", { length: 500 }), // URL обложки (опционально)

    // Classification
    type: publicationTypeEnum("type").notNull().default("announcement"),
    status: publicationStatusEnum("status").notNull().default("draft"),

    // Targeting - к каким строениям относится публикация
    // null = ко всем строениям пользователя / без привязки
    buildingId: varchar("building_id", { length: 255 }).references(() => buildings.id),

    // Publication timing
    publishAt: timestamp("publish_at", { withTimezone: true }), // Когда опубликовать (null = сразу)

    // Flags
    isPinned: boolean("is_pinned").notNull().default(false), // Закреплено (только для модераторов)
    isUrgent: boolean("is_urgent").notNull().default(false), // Срочное
    isAnonymous: boolean("is_anonymous").notNull().default(false), // Анонимная публикация (скрыть автора)
    publishToTelegram: boolean("publish_to_telegram").notNull().default(false), // Опубликовать в Telegram (только админы)

    // ========== Event-specific fields (type: "event") ==========
    // Весь день (без конкретного времени)
    eventAllDay: boolean("event_all_day").notNull().default(false),
    // Дата и время начала события
    eventStartAt: timestamp("event_start_at", { withTimezone: true }),
    // Дата и время окончания события (опционально)
    eventEndAt: timestamp("event_end_at", { withTimezone: true }),
    // Адрес события (текстовый)
    eventLocation: varchar("event_location", { length: 500 }),
    // Координаты для карты (опционально)
    eventLatitude: text("event_latitude"),
    eventLongitude: text("event_longitude"),
    // Максимальное количество участников (опционально, 0 = неограничено)
    eventMaxAttendees: integer("event_max_attendees"),
    // Ссылка на внешний ресурс (Zoom, Google Meet, etc.)
    eventExternalUrl: varchar("event_external_url", { length: 500 }),
    // Организатор (если отличается от автора)
    eventOrganizer: varchar("event_organizer", { length: 255 }),
    // Контактный телефон организатора
    eventOrganizerPhone: varchar("event_organizer_phone", { length: 20 }),

    // ========== Event Recurrence (повторяющиеся события) ==========
    // Тип повторения — для быстрой фильтрации без парсинга RRULE
    eventRecurrenceType: eventRecurrenceTypeEnum("event_recurrence_type").default("none"),
    // RRULE строка (RFC 5545) — источник истины для паттерна повторения
    // Примеры:
    //   ежемесячно 20–25:  "FREQ=MONTHLY;BYMONTHDAY=20"
    //   еженедельно пт:    "FREQ=WEEKLY;BYDAY=FR"
    //   ежегодно 15 сен:   "FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=15"
    eventRecurrenceRule: varchar("event_recurrence_rule", { length: 500 }),
    // Дата окончания повторений (null = бессрочно) — для SQL фильтрации без парсинга RRULE
    eventRecurrenceUntil: timestamp("event_recurrence_until", { withTimezone: true }),
    // Связанный контент (ссылки на новости, публикации, события, базу знаний)
    linkedContentIds: jsonb("linked_content_ids").$type<{ id: string; type: string; title?: string }[]>(),

    // Author
    authorId: varchar("author_id", { length: 255 })
      .notNull()
      .references(() => users.id),

    // Moderation
    moderatedBy: varchar("moderated_by", { length: 255 }).references(() => users.id),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    moderationComment: text("moderation_comment"), // Причина отклонения

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("publication_status_idx").on(table.status),
    index("publication_type_idx").on(table.type),
    index("publication_author_idx").on(table.authorId),
    index("publication_building_idx").on(table.buildingId),
    index("publication_created_at_idx").on(table.createdAt),
  ]
);

// ============================================================================
// Publication Tags (junction table)
// ============================================================================

export const publicationTags = createTable(
  "publication_tag",
  {
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    tagId: varchar("tag_id", { length: 255 })
      .notNull()
      .references(() => directoryTags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.publicationId, table.tagId] }),
    index("publication_tag_pub_idx").on(table.publicationId),
    index("publication_tag_tag_idx").on(table.tagId),
  ]
);

// ============================================================================
// Publication Targets (junction table for multiple object bindings)
// ============================================================================

export const publicationTargets = createTable(
  "publication_target",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),

    // Тип цели
    targetType: publicationTargetTypeEnum("target_type").notNull(),

    // ID цели (в зависимости от типа)
    // complex/uk - null (относится ко всему ЖК/УК)
    // building - buildings.id
    // entrance - entrances.id
    // floor - floors.id
    targetId: varchar("target_id", { length: 255 }),
  },
  (table) => [
    index("publication_target_pub_idx").on(table.publicationId),
    index("publication_target_type_idx").on(table.targetType),
    index("publication_target_id_idx").on(table.targetId),
  ]
);

// ============================================================================
// Relations
// ============================================================================

// ============================================================================
// Publication Moderation Votes (multi-level moderation)
// ============================================================================

export const publicationModerationVotes = createTable(
  "publication_moderation_vote",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Reference to publication
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),

    // Moderator who voted
    moderatorId: varchar("moderator_id", { length: 255 })
      .notNull()
      .references(() => users.id),

    // Vote result
    vote: moderationVoteEnum("vote").notNull(),

    // Comment (required for reject/request_changes)
    comment: text("comment"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("pub_mod_vote_pub_idx").on(table.publicationId),
    index("pub_mod_vote_mod_idx").on(table.moderatorId),
    index("pub_mod_vote_vote_idx").on(table.vote),
  ]
);

// ============================================================================
// Publication History Table (История изменений публикации)
// ============================================================================

export const publicationHistory = createTable(
  "publication_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ссылка на публикацию
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),

    // Тип действия
    action: publicationHistoryActionEnum("action").notNull(),

    // Изменение статуса
    fromStatus: publicationStatusEnum("from_status"),
    toStatus: publicationStatusEnum("to_status"),

    // Комментарий модерации (для отклонений)
    moderationComment: text("moderation_comment"),

    // Кто сделал изменение
    changedById: varchar("changed_by_id", { length: 255 })
      .notNull()
      .references(() => users.id),

    // Человекочитаемое описание
    description: text("description").notNull(),

    // Время создания
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index("publication_history_pub_idx").on(table.publicationId),
    index("publication_history_action_idx").on(table.action),
    index("publication_history_created_at_idx").on(table.createdAt),
  ]
);

// ============================================================================
// Relations
// ============================================================================

export const publicationsRelations = relations(publications, ({ one, many }) => ({
  author: one(users, {
    fields: [publications.authorId],
    references: [users.id],
  }),
  moderator: one(users, {
    fields: [publications.moderatedBy],
    references: [users.id],
    relationName: "publicationModerator",
  }),
  building: one(buildings, {
    fields: [publications.buildingId],
    references: [buildings.id],
  }),
  publicationTags: many(publicationTags),
  publicationTargets: many(publicationTargets),
  attachments: many(publicationAttachments),
  moderationVotes: many(publicationModerationVotes),
  history: many(publicationHistory),
}));

export const publicationHistoryRelations = relations(publicationHistory, ({ one }) => ({
  publication: one(publications, {
    fields: [publicationHistory.publicationId],
    references: [publications.id],
  }),
  changedBy: one(users, {
    fields: [publicationHistory.changedById],
    references: [users.id],
  }),
}));

export const publicationModerationVotesRelations = relations(
  publicationModerationVotes,
  ({ one }) => ({
    publication: one(publications, {
      fields: [publicationModerationVotes.publicationId],
      references: [publications.id],
    }),
    moderator: one(users, {
      fields: [publicationModerationVotes.moderatorId],
      references: [users.id],
    }),
  })
);

export const publicationTagsRelations = relations(publicationTags, ({ one }) => ({
  publication: one(publications, {
    fields: [publicationTags.publicationId],
    references: [publications.id],
  }),
  tag: one(directoryTags, {
    fields: [publicationTags.tagId],
    references: [directoryTags.id],
  }),
}));

export const publicationTargetsRelations = relations(publicationTargets, ({ one }) => ({
  publication: one(publications, {
    fields: [publicationTargets.publicationId],
    references: [publications.id],
  }),
}));

// ============================================================================
// Publication Attachments
// ============================================================================

// Allowed attachment types
export const attachmentTypeEnum = pgEnum("attachment_type_enum", [
  "document", // PDF, DOC, DOCX, ODT
  "image", // JPG, PNG, GIF, WEBP
  "archive", // ZIP, RAR, 7Z
  "other", // Other files
]);

// Max file sizes by type (in bytes)
export const ATTACHMENT_SIZE_LIMITS = {
  document: 10 * 1024 * 1024, // 10MB
  image: 5 * 1024 * 1024, // 5MB
  archive: 50 * 1024 * 1024, // 50MB
  other: 5 * 1024 * 1024, // 5MB
} as const;

// Allowed MIME types
export const ALLOWED_ATTACHMENT_MIMES = {
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  image: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  archive: ["application/zip", "application/x-rar-compressed", "application/x-7z-compressed"],
} as const;

export const publicationAttachments = createTable(
  "publication_attachment",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Reference to publication
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),

    // File info
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileType: attachmentTypeEnum("file_type").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    fileSize: integer("file_size").notNull(), // in bytes

    // Storage
    url: varchar("url", { length: 500 }).notNull(),

    // Optional description/label
    description: varchar("description", { length: 255 }),

    // Order
    sortOrder: integer("sort_order").notNull().default(0),

    // Who uploaded
    uploadedBy: varchar("uploaded_by", { length: 255 })
      .notNull()
      .references(() => users.id),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index("publication_attachment_pub_idx").on(table.publicationId),
    index("publication_attachment_type_idx").on(table.fileType),
  ]
);

export const publicationAttachmentsRelations = relations(publicationAttachments, ({ one }) => ({
  publication: one(publications, {
    fields: [publicationAttachments.publicationId],
    references: [publications.id],
  }),
  uploader: one(users, {
    fields: [publicationAttachments.uploadedBy],
    references: [users.id],
  }),
}));

// ============================================================================
// Types
// ============================================================================

export type Publication = typeof publications.$inferSelect;
export type NewPublication = typeof publications.$inferInsert;
export type PublicationType = (typeof publicationTypeEnum.enumValues)[number];
export type PublicationStatus = (typeof publicationStatusEnum.enumValues)[number];
export type PublicationAttachment = typeof publicationAttachments.$inferSelect;
export type AttachmentType = (typeof attachmentTypeEnum.enumValues)[number];
export type PublicationTarget = typeof publicationTargets.$inferSelect;
export type PublicationTargetType = (typeof publicationTargetTypeEnum.enumValues)[number];
export type PublicationModerationVote = typeof publicationModerationVotes.$inferSelect;
export type ModerationVoteType = (typeof moderationVoteEnum.enumValues)[number];
export type PublicationHistory = typeof publicationHistory.$inferSelect;
export type NewPublicationHistory = typeof publicationHistory.$inferInsert;
export type PublicationHistoryAction = (typeof publicationHistoryActionEnum.enumValues)[number];
export type EventRecurrenceType = (typeof eventRecurrenceTypeEnum.enumValues)[number];

// ============================================================================
// Labels (Russian)
// ============================================================================

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  draft: "Черновик",
  pending: "На модерации",
  published: "Опубликовано",
  rejected: "Отклонено",
  archived: "В архиве",
};

export const PUBLICATION_TYPE_LABELS: Record<PublicationType, string> = {
  announcement: "Объявление",
  event: "Мероприятие",
  help_request: "Просьба о помощи",
  lost_found: "Потеряно/найдено",
  recommendation: "Рекомендация",
  question: "Вопрос сообществу",
  discussion: "Обсуждение",
};

export const PUBLICATION_HISTORY_ACTION_LABELS: Record<PublicationHistoryAction, string> = {
  created: "Публикация создана",
  updated: "Публикация обновлена",
  submitted: "Отправлено на модерацию",
  approved: "Одобрено модератором",
  rejected: "Отклонено модератором",
  archived: "Архивировано",
  published: "Опубликовано",
  pinned: "Закреплено",
  unpinned: "Откреплено",
  moderation_vote: "Голос модератора",
};

export const EVENT_RECURRENCE_TYPE_LABELS: Record<EventRecurrenceType, string> = {
  none: "Без повторения",
  daily: "Ежедневно",
  weekly: "Еженедельно",
  monthly: "Ежемесячно",
  yearly: "Ежегодно",
};
