import { relations, sql } from "drizzle-orm";
import { boolean, index, jsonb, pgEnum, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { createTable } from "./create-table";
import { users } from "./users";

// ============================================================================
// Enums
// ============================================================================

export const feedbackTypeEnum = pgEnum("feedback_type_enum", [
  "complaint", // Жалоба
  "suggestion", // Пожелание/предложение
  "request", // Заявка/просьба
  "question", // Вопрос
  "other", // Другое
]);

export const feedbackStatusEnum = pgEnum("feedback_status_enum", [
  "new", // Новое (не рассмотрено)
  "in_progress", // В работе
  "forwarded", // Перенаправлено (в УК, МСК и т.д.)
  "resolved", // Решено
  "closed", // Закрыто (без решения)
]);

export const feedbackPriorityEnum = pgEnum("feedback_priority_enum", [
  "low", // Низкий
  "normal", // Обычный
  "high", // Высокий
  "urgent", // Срочный
]);

// Действия в истории обращения
export const feedbackHistoryActionEnum = pgEnum("feedback_history_action_enum", [
  "created", // Создано
  "status_changed", // Изменён статус
  "priority_changed", // Изменён приоритет
  "assigned", // Назначено ответственному
  "unassigned", // Снято с ответственного
  "forwarded", // Перенаправлено
  "responded", // Дан ответ
  "note_added", // Добавлена заметка
  "closed", // Закрыто
  "reopened", // Переоткрыто
  "deleted", // Удалено
]);

// ============================================================================
// Feedback Table (Книга отзывов и предложений)
// ============================================================================

export const feedback = createTable(
  "feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Тип обращения
    type: feedbackTypeEnum("type").notNull().default("suggestion"),

    // Заголовок (необязателен)
    title: varchar("title", { length: 255 }),

    // Текст обращения (до 4000 символов)
    content: text("content").notNull(),

    // Статус обработки
    status: feedbackStatusEnum("status").notNull().default("new"),

    // Приоритет (устанавливается администратором)
    priority: feedbackPriorityEnum("priority").notNull().default("normal"),

    // ========== Контактные данные (для обратной связи) ==========
    // Имя заявителя (может быть заполнено автоматически для авторизованных)
    contactName: varchar("contact_name", { length: 255 }),
    // Email для обратной связи
    contactEmail: varchar("contact_email", { length: 255 }),
    // Телефон для обратной связи
    contactPhone: varchar("contact_phone", { length: 20 }),

    // ========== Вложения ==========
    // URLs загруженных файлов (до 10)
    attachments: jsonb("attachments").$type<string[]>().default([]),
    // URLs загруженных фотографий (до 10)
    photos: jsonb("photos").$type<string[]>().default([]),

    // ========== Метаданные ==========
    // ID пользователя (если авторизован, но хранится анонимно)
    // Администратор НЕ видит привязку к пользователю, только контактные данные
    submittedByUserId: varchar("submitted_by_user_id", { length: 255 }).references(() => users.id, {
      onDelete: "set null",
    }),

    // IP адрес отправителя (для защиты от спама)
    ipAddress: varchar("ip_address", { length: 45 }),

    // User Agent (для аналитики)
    userAgent: text("user_agent"),

    // Флаг анонимности (для внутреннего использования)
    isAnonymous: boolean("is_anonymous").notNull().default(true),

    // ========== Обработка администратором ==========
    // Кто взял в работу
    assignedToId: varchar("assigned_to_id", { length: 255 }).references(() => users.id),

    // Куда перенаправлено (текстовое описание)
    forwardedTo: varchar("forwarded_to", { length: 500 }),

    // Внутренняя заметка администратора
    internalNote: text("internal_note"),

    // Ответ заявителю
    response: text("response"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    respondedById: varchar("responded_by_id", { length: 255 }).references(() => users.id),

    // ========== Test Field (for migration verification) ==========
    testMigrationField: varchar("test_migration_field", { length: 100 }),

    // ========== Soft Delete ==========
    // Обращения не удаляются физически, только помечаются удалёнными
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedById: varchar("deleted_by_id", { length: 255 }).references(() => users.id),
    deleteReason: text("delete_reason"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("feedback_type_idx").on(table.type),
    index("feedback_status_idx").on(table.status),
    index("feedback_priority_idx").on(table.priority),
    index("feedback_created_at_idx").on(table.createdAt),
    index("feedback_ip_idx").on(table.ipAddress),
    index("feedback_is_deleted_idx").on(table.isDeleted),
    index("feedback_assigned_idx").on(table.assignedToId),
  ]
);

// ============================================================================
// Feedback History Table (История изменений обращения)
// ============================================================================

export const feedbackHistory = createTable(
  "feedback_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ссылка на обращение
    feedbackId: uuid("feedback_id")
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),

    // Тип действия
    action: feedbackHistoryActionEnum("action").notNull(),

    // Изменение статуса
    fromStatus: feedbackStatusEnum("from_status"),
    toStatus: feedbackStatusEnum("to_status"),

    // Изменение приоритета
    fromPriority: feedbackPriorityEnum("from_priority"),
    toPriority: feedbackPriorityEnum("to_priority"),

    // Назначение ответственному
    assignedToId: varchar("assigned_to_id", { length: 255 }).references(() => users.id),

    // Перенаправление
    forwardedTo: varchar("forwarded_to", { length: 500 }),

    // Ответ заявителю
    response: text("response"),

    // Внутренняя заметка
    internalNote: text("internal_note"),

    // Кто сделал изменение
    changedById: varchar("changed_by_id", { length: 255 }).references(() => users.id),

    // Человекочитаемое описание (автогенерируемое)
    description: text("description").notNull(),

    // Время создания
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index("feedback_history_feedback_idx").on(table.feedbackId),
    index("feedback_history_action_idx").on(table.action),
    index("feedback_history_created_at_idx").on(table.createdAt),
  ]
);

// ============================================================================
// Relations
// ============================================================================

export const feedbackRelations = relations(feedback, ({ one, many }) => ({
  submittedBy: one(users, {
    fields: [feedback.submittedByUserId],
    references: [users.id],
    relationName: "feedbackSubmitter",
  }),
  assignedTo: one(users, {
    fields: [feedback.assignedToId],
    references: [users.id],
    relationName: "feedbackAssignee",
  }),
  respondedBy: one(users, {
    fields: [feedback.respondedById],
    references: [users.id],
    relationName: "feedbackResponder",
  }),
  deletedBy: one(users, {
    fields: [feedback.deletedById],
    references: [users.id],
    relationName: "feedbackDeleter",
  }),
  history: many(feedbackHistory),
}));

export const feedbackHistoryRelations = relations(feedbackHistory, ({ one }) => ({
  feedback: one(feedback, {
    fields: [feedbackHistory.feedbackId],
    references: [feedback.id],
  }),
  changedBy: one(users, {
    fields: [feedbackHistory.changedById],
    references: [users.id],
    relationName: "feedbackHistoryActor",
  }),
  assignedTo: one(users, {
    fields: [feedbackHistory.assignedToId],
    references: [users.id],
    relationName: "feedbackHistoryAssignee",
  }),
}));

// ============================================================================
// Types
// ============================================================================

export type Feedback = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;
export type FeedbackType = (typeof feedbackTypeEnum.enumValues)[number];
export type FeedbackStatus = (typeof feedbackStatusEnum.enumValues)[number];
export type FeedbackPriority = (typeof feedbackPriorityEnum.enumValues)[number];

export type FeedbackHistory = typeof feedbackHistory.$inferSelect;
export type NewFeedbackHistory = typeof feedbackHistory.$inferInsert;
export type FeedbackHistoryAction = (typeof feedbackHistoryActionEnum.enumValues)[number];

// ============================================================================
// Constants
// ============================================================================

export const FEEDBACK_LIMITS = {
  MAX_CONTENT_LENGTH: 4000,
  MAX_TITLE_LENGTH: 255,
  MAX_ATTACHMENTS: 10,
  MAX_PHOTOS: 10,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_PHOTO_SIZE: 5 * 1024 * 1024, // 5MB
} as const;

// Rate limiting: максимум 5 обращений в час с одного IP
export const FEEDBACK_RATE_LIMIT = {
  MAX_PER_HOUR: 5,
  MAX_PER_DAY: 20,
} as const;

// Человекочитаемые названия статусов
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "Новое",
  in_progress: "В работе",
  forwarded: "Перенаправлено",
  resolved: "Решено",
  closed: "Закрыто",
};

// Человекочитаемые названия приоритетов
export const FEEDBACK_PRIORITY_LABELS: Record<FeedbackPriority, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  urgent: "Срочный",
};

// Человекочитаемые названия типов
export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  complaint: "Жалоба",
  suggestion: "Пожелание",
  request: "Заявка",
  question: "Вопрос",
  other: "Другое",
};

// Человекочитаемые названия действий истории
export const FEEDBACK_HISTORY_ACTION_LABELS: Record<FeedbackHistoryAction, string> = {
  created: "Обращение создано",
  status_changed: "Статус изменён",
  priority_changed: "Приоритет изменён",
  assigned: "Назначен ответственный",
  unassigned: "Снят ответственный",
  forwarded: "Перенаправлено",
  responded: "Дан ответ",
  note_added: "Добавлена заметка",
  closed: "Закрыто",
  reopened: "Переоткрыто",
  deleted: "Удалено",
};
