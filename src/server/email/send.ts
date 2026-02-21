import { readFile } from "fs/promises";
import { join } from "path";

import { emailLogger } from "~/lib/logger";

import { emailConfig, getTransporter } from "./config";

/**
 * Email template types
 */
export type EmailTemplateId =
  | "welcome"
  | "verification"
  | "password-reset"
  | "password-changed"
  | "account-linked"
  | "account-unlinked"
  | "security-alert"
  | "claim-submitted"
  | "claim-approved"
  | "claim-rejected";

/**
 * Template payload types
 */
export interface WelcomePayload {
  userName: string;
  loginUrl: string;
}

export interface VerificationPayload {
  userName: string;
  verificationUrl: string;
  expiresIn: string;
}

export interface PasswordResetPayload {
  userName: string;
  resetUrl: string;
  expiresIn: string;
}

export interface PasswordChangedPayload {
  userName: string;
  changedAt: string;
}

export interface ClaimSubmittedPayload {
  userName: string;
  claimType: string;
  propertyAddress: string;
  claimUrl: string;
}

export interface ClaimApprovedPayload {
  userName: string;
  claimType: string;
  propertyAddress: string;
  dashboardUrl: string;
}

export interface ClaimRejectedPayload {
  userName: string;
  claimType: string;
  propertyAddress: string;
  reason: string;
  supportUrl: string;
}

export interface AccountLinkedPayload {
  userName: string;
  providerName: string;
  linkedAt: string;
  securityUrl: string;
}

export interface AccountUnlinkedPayload {
  userName: string;
  providerName: string;
  unlinkedAt: string;
  securityUrl: string;
}

export interface SecurityAlertPayload {
  userName: string;
  alertType: string;
  details: string;
  occurredAt: string;
  securityUrl: string;
}

export type EmailPayload<T extends EmailTemplateId> = T extends "welcome"
  ? WelcomePayload
  : T extends "verification"
    ? VerificationPayload
    : T extends "password-reset"
      ? PasswordResetPayload
      : T extends "password-changed"
        ? PasswordChangedPayload
        : T extends "account-linked"
          ? AccountLinkedPayload
          : T extends "account-unlinked"
            ? AccountUnlinkedPayload
            : T extends "security-alert"
              ? SecurityAlertPayload
              : T extends "claim-submitted"
                ? ClaimSubmittedPayload
                : T extends "claim-approved"
                  ? ClaimApprovedPayload
                  : T extends "claim-rejected"
                    ? ClaimRejectedPayload
                    : never;

/**
 * Template subjects mapping
 */
const templateSubjects: Record<EmailTemplateId, string> = {
  welcome: "Добро пожаловать в SR2.ru!",
  verification: "Подтвердите ваш email",
  "password-reset": "Сброс пароля",
  "password-changed": "Пароль успешно изменён",
  "account-linked": "Новый способ входа привязан",
  "account-unlinked": "Способ входа отвязан",
  "security-alert": "Уведомление безопасности",
  "claim-submitted": "Заявка на регистрацию собственности принята",
  "claim-approved": "Заявка на регистрацию собственности одобрена",
  "claim-rejected": "Заявка на регистрацию собственности отклонена",
};

/**
 * Load compiled HTML template from public/templates/email
 */
async function loadTemplate(templateId: EmailTemplateId): Promise<string> {
  const templatePath = join(process.cwd(), "public", "templates", "email", `${templateId}.html`);
  return readFile(templatePath, "utf-8");
}

/**
 * Replace placeholders in template with payload values
 * Supports both {{variableName}} and {{ variableName }} formats
 */
function renderTemplate(template: string, payload: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    return payload[key] ?? match;
  });
}

/**
 * Send email using template
 *
 * @param templateId - Template file name (without extension)
 * @param to - Recipient email address
 * @param payload - Data to inject into template
 */
export async function sendEmail<T extends EmailTemplateId>(
  templateId: T,
  to: string,
  payload: EmailPayload<T>
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = getTransporter();

    // Load and render template
    const template = await loadTemplate(templateId);
    const html = renderTemplate(template, payload as unknown as Record<string, string>);

    // Get subject from mapping
    const subject = templateSubjects[templateId];

    // Send email
    const info = await transporter.sendMail({
      from: `"${emailConfig.from.name}" <${emailConfig.from.address}>`,
      replyTo: emailConfig.replyTo,
      to,
      subject,
      html,
    });

    emailLogger.info({ templateId, to, messageId: info.messageId }, "Email sent successfully");

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    emailLogger.error({ err: error, templateId, to }, "Failed to send email");

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Verify SMTP connection
 */
export async function verifyEmailConnection(): Promise<boolean> {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    emailLogger.info("SMTP connection verified successfully");
    return true;
  } catch (error) {
    emailLogger.error("SMTP connection verification failed", error);
    return false;
  }
}
