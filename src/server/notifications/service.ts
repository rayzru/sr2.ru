/**
 * Centralized Notification Service
 *
 * Handles all notification events and routes them to appropriate channels
 * (email, push notifications, in-app notifications, etc.)
 */

import { logger } from "~/lib/logger";
import { type EmailPayload, type EmailTemplateId, sendEmail } from "~/server/email";

import type {
  AccountLinkedEvent,
  AccountUnlinkedEvent,
  ClaimApprovedEvent,
  ClaimRejectedEvent,
  ClaimSubmittedEvent,
  EmailVerificationRequestedEvent,
  NotificationEvent,
  PasswordChangedEvent,
  PasswordResetCompletedEvent,
  PasswordResetRequestedEvent,
  SecurityAlertEvent,
  UserRegisteredEvent,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

const getBaseUrl = (): string => {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  return "http://localhost:3000";
};

// Provider display names
const PROVIDER_NAMES: Record<string, string> = {
  yandex: "Яндекс ID",
  vk: "VK ID",
  google: "Google",
  mailru: "Mail.ru",
  odnoklassniki: "Одноклассники",
  sber: "Сбер ID",
  tinkoff: "Т-Банк",
  telegram: "Telegram",
};

/**
 * Get human-readable provider name
 */
export function getProviderDisplayName(providerId: string): string {
  return PROVIDER_NAMES[providerId] ?? providerId;
}

// ============================================================================
// Event Handlers (Mappers)
// ============================================================================

type EmailMapping<T extends EmailTemplateId> = {
  templateId: T;
  to: string;
  payload: EmailPayload<T>;
};

/**
 * Map UserRegisteredEvent to email
 */
function mapUserRegistered(event: UserRegisteredEvent): EmailMapping<"welcome"> {
  return {
    templateId: "welcome",
    to: event.email,
    payload: {
      userName: event.name,
      loginUrl: `${getBaseUrl()}/login`,
    },
  };
}

/**
 * Map EmailVerificationRequestedEvent to email
 */
function mapEmailVerificationRequested(
  event: EmailVerificationRequestedEvent
): EmailMapping<"verification"> {
  return {
    templateId: "verification",
    to: event.email,
    payload: {
      userName: event.name,
      verificationUrl: `${getBaseUrl()}/verify-email?token=${event.verificationToken}`,
      expiresIn: "24 часа",
    },
  };
}

/**
 * Map PasswordChangedEvent to email
 */
function mapPasswordChanged(event: PasswordChangedEvent): EmailMapping<"password-changed"> {
  return {
    templateId: "password-changed",
    to: event.email,
    payload: {
      userName: event.name,
      changedAt: new Date().toLocaleString("ru-RU", {
        dateStyle: "long",
        timeStyle: "short",
      }),
    },
  };
}

/**
 * Map PasswordResetRequestedEvent to email
 */
function mapPasswordResetRequested(
  event: PasswordResetRequestedEvent
): EmailMapping<"password-reset"> {
  return {
    templateId: "password-reset",
    to: event.email,
    payload: {
      userName: event.name,
      resetUrl: `${getBaseUrl()}/reset-password?token=${event.resetToken}`,
      expiresIn: "1 час",
    },
  };
}

/**
 * Map PasswordResetCompletedEvent to email
 */
function mapPasswordResetCompleted(
  event: PasswordResetCompletedEvent
): EmailMapping<"password-changed"> {
  return {
    templateId: "password-changed",
    to: event.email,
    payload: {
      userName: event.name,
      changedAt: new Date().toLocaleString("ru-RU", {
        dateStyle: "long",
        timeStyle: "short",
      }),
    },
  };
}

/**
 * Map AccountLinkedEvent to email
 */
function mapAccountLinked(event: AccountLinkedEvent): EmailMapping<"account-linked"> {
  return {
    templateId: "account-linked",
    to: event.email,
    payload: {
      userName: event.name,
      providerName: event.providerName,
      linkedAt: new Date().toLocaleString("ru-RU", {
        dateStyle: "long",
        timeStyle: "short",
      }),
      securityUrl: `${getBaseUrl()}/my/security`,
    },
  };
}

/**
 * Map AccountUnlinkedEvent to email
 */
function mapAccountUnlinked(event: AccountUnlinkedEvent): EmailMapping<"account-unlinked"> {
  return {
    templateId: "account-unlinked",
    to: event.email,
    payload: {
      userName: event.name,
      providerName: event.providerName,
      unlinkedAt: new Date().toLocaleString("ru-RU", {
        dateStyle: "long",
        timeStyle: "short",
      }),
      securityUrl: `${getBaseUrl()}/my/security`,
    },
  };
}

/**
 * Map ClaimSubmittedEvent to email
 */
function mapClaimSubmitted(event: ClaimSubmittedEvent): EmailMapping<"claim-submitted"> {
  return {
    templateId: "claim-submitted",
    to: event.email,
    payload: {
      userName: event.name,
      claimType: event.claimType,
      propertyAddress: event.propertyAddress,
      claimUrl: `${getBaseUrl()}/my/claims/${event.claimId}`,
    },
  };
}

/**
 * Map ClaimApprovedEvent to email
 */
function mapClaimApproved(event: ClaimApprovedEvent): EmailMapping<"claim-approved"> {
  return {
    templateId: "claim-approved",
    to: event.email,
    payload: {
      userName: event.name,
      claimType: event.claimType,
      propertyAddress: event.propertyAddress,
      dashboardUrl: `${getBaseUrl()}/my`,
    },
  };
}

/**
 * Map ClaimRejectedEvent to email
 */
function mapClaimRejected(event: ClaimRejectedEvent): EmailMapping<"claim-rejected"> {
  return {
    templateId: "claim-rejected",
    to: event.email,
    payload: {
      userName: event.name,
      claimType: event.claimType,
      propertyAddress: event.propertyAddress,
      reason: event.reason,
      supportUrl: `${getBaseUrl()}/support`,
    },
  };
}

/**
 * Map SecurityAlertEvent to email
 */
function mapSecurityAlert(event: SecurityAlertEvent): EmailMapping<"security-alert"> {
  const alertMessages: Record<SecurityAlertEvent["alertType"], string> = {
    new_login: "Выполнен вход в ваш аккаунт",
    suspicious_activity: "Обнаружена подозрительная активность",
    password_attempt: "Попытка смены пароля",
  };

  return {
    templateId: "security-alert",
    to: event.email,
    payload: {
      userName: event.name,
      alertType: alertMessages[event.alertType],
      details: event.details,
      occurredAt: new Date().toLocaleString("ru-RU", {
        dateStyle: "long",
        timeStyle: "short",
      }),
      securityUrl: `${getBaseUrl()}/my/security`,
    },
  };
}

// ============================================================================
// Main Notification Service
// ============================================================================

/**
 * Process notification event and send appropriate notifications
 *
 * This is the main entry point for sending notifications.
 * It routes events to the appropriate handlers and sends emails.
 *
 * @param event - The notification event to process
 * @returns Promise with success status
 */
export async function notify(
  event: NotificationEvent
): Promise<{ success: boolean; error?: string }> {
  try {
    // Route event to appropriate mapper and send email
    switch (event.type) {
      case "user.registered": {
        const mapping = mapUserRegistered(event);
        await sendEmail(mapping.templateId, mapping.to, mapping.payload);
        break;
      }

      case "email.verification_requested": {
        const mapping = mapEmailVerificationRequested(event);
        await sendEmail(mapping.templateId, mapping.to, mapping.payload);
        break;
      }

      case "password.changed": {
        const mapping = mapPasswordChanged(event);
        await sendEmail(mapping.templateId, mapping.to, mapping.payload);
        break;
      }

      case "password.reset_requested": {
        const mapping = mapPasswordResetRequested(event);
        await sendEmail(mapping.templateId, mapping.to, mapping.payload);
        break;
      }

      case "password.reset_completed": {
        const mapping = mapPasswordResetCompleted(event);
        await sendEmail(mapping.templateId, mapping.to, mapping.payload);
        break;
      }

      case "account.linked": {
        const mapping = mapAccountLinked(event);
        await sendEmail(mapping.templateId, mapping.to, mapping.payload);
        break;
      }

      case "account.unlinked": {
        const mapping = mapAccountUnlinked(event);
        await sendEmail(mapping.templateId, mapping.to, mapping.payload);
        break;
      }

      case "claim.submitted": {
        const mapping = mapClaimSubmitted(event);
        await sendEmail(mapping.templateId, mapping.to, mapping.payload);
        break;
      }

      case "claim.approved": {
        const mapping = mapClaimApproved(event);
        await sendEmail(mapping.templateId, mapping.to, mapping.payload);
        break;
      }

      case "claim.rejected": {
        const mapping = mapClaimRejected(event);
        await sendEmail(mapping.templateId, mapping.to, mapping.payload);
        break;
      }

      case "security.alert": {
        const mapping = mapSecurityAlert(event);
        await sendEmail(mapping.templateId, mapping.to, mapping.payload);
        break;
      }

      default: {
        // TypeScript will catch unhandled event types at compile time
        const _exhaustiveCheck: never = event;
        logger.warn({ event: _exhaustiveCheck }, "Unhandled notification event type");
      }
    }

    logger.info({ type: event.type, email: event.email }, "Notification sent");
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(
      { err: error, type: event.type, email: event.email },
      "Failed to send notification"
    );
    return { success: false, error: errorMessage };
  }
}

/**
 * Send notification without blocking (fire-and-forget)
 *
 * Use this when you don't need to wait for the notification to complete
 * and don't want to block the main request.
 */
export function notifyAsync(event: NotificationEvent): void {
  notify(event).catch((err) => {
    logger.error({ err, type: event.type }, "Async notification failed");
  });
}
