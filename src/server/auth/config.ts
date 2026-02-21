import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { CredentialsSignin, type DefaultSession, type NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import YandexProvider from "next-auth/providers/yandex";

import { authLogger } from "~/lib/logger";
import { db } from "~/server/db";
import {
  accounts,
  sessions,
  telegramAuthTokens,
  userBlocks,
  userProfiles,
  userRoles,
  users,
  verificationTokens,
} from "~/server/db/schema";
import { getProviderDisplayName, notifyAsync } from "~/server/notifications";

import SberProvider from "./providers/sber";
import TinkoffProvider from "./providers/tinkoff";
import VKIDProvider from "./providers/vkid";
import { isAdmin, type UserRole } from "./rbac";

// Custom error classes for auth
class EmailNotVerifiedError extends CredentialsSignin {
  code = "EMAIL_NOT_VERIFIED";
}

class UserBlockedError extends CredentialsSignin {
  code = "USER_BLOCKED";
}

// Test accounts for development
const TEST_ACCOUNTS: Record<string, { name: string; email: string; roles: UserRole[] }> = {
  admin: {
    name: "Test Admin",
    email: "admin@test.local",
    roles: ["Root", "SuperAdmin", "Admin"],
  },
  moderator: {
    name: "Test Moderator",
    email: "moderator@test.local",
    roles: ["Moderator"],
  },
  owner: {
    name: "Test Owner",
    email: "owner@test.local",
    roles: ["ApartmentOwner", "ParkingOwner"],
  },
  resident: {
    name: "Test Resident",
    email: "resident@test.local",
    roles: ["ApartmentResident"],
  },
  guest: {
    name: "Test Guest",
    email: "guest@test.local",
    roles: ["Guest"],
  },
  editor: {
    name: "Test Editor",
    email: "editor@test.local",
    roles: ["Editor"],
  },
  chairman: {
    name: "Test Chairman",
    email: "chairman@test.local",
    roles: ["BuildingChairman"],
  },
  ukRep: {
    name: "Test UK Rep",
    email: "ukrep@test.local",
    roles: ["ComplexRepresenative"],
  },
};

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      roles: UserRole[];
      isAdmin: boolean;
    } & DefaultSession["user"];
  }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
// Helper to get or create test user
async function getOrCreateTestUser(accountKey: string) {
  const account = TEST_ACCOUNTS[accountKey];
  if (!account) return null;

  // Check if user exists
  let user = await db.query.users.findFirst({
    where: eq(users.email, account.email),
  });

  if (!user) {
    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        email: account.email,
        name: account.name,
        emailVerified: new Date(),
      })
      .returning();
    user = newUser;

    // Create roles
    if (user && account.roles.length > 0) {
      await db.insert(userRoles).values(
        account.roles.map((role) => ({
          userId: user!.id,
          role,
        }))
      );
    }
  }

  return user;
}

// Check if development mode
const isDev = process.env.NODE_ENV === "development";

// Helper to check if user is blocked
async function isUserBlocked(userId: string): Promise<boolean> {
  try {
    const activeBlock = await db.query.userBlocks.findFirst({
      where: and(eq(userBlocks.userId, userId), eq(userBlocks.isActive, true)),
    });
    return !!activeBlock;
  } catch (error) {
    // If table doesn't exist yet or query fails, allow login
    authLogger.error({ err: error, userId }, "Error checking user block status");
    return false;
  }
}

// Build providers array dynamically based on available credentials
function buildProviders() {
  const providers: NextAuthConfig["providers"] = [];

  // Yandex (required)
  providers.push(
    YandexProvider({
      clientId: process.env.YANDEX_CLIENT_ID!,
      clientSecret: process.env.YANDEX_CLIENT_SECRET!,
      authorization: "https://oauth.yandex.ru/authorize?scope=login:email",
    })
  );

  // VK ID (id.vk.com) - custom provider
  if (process.env.VK_CLIENT_ID && process.env.VK_CLIENT_SECRET) {
    providers.push(
      VKIDProvider({
        clientId: process.env.VK_CLIENT_ID,
        clientSecret: process.env.VK_CLIENT_SECRET,
      })
    );
  }

  // Google (optional)
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    );
  }

  // Сбер ID (optional)
  if (process.env.SBER_CLIENT_ID && process.env.SBER_CLIENT_SECRET) {
    providers.push(
      SberProvider({
        clientId: process.env.SBER_CLIENT_ID,
        clientSecret: process.env.SBER_CLIENT_SECRET,
      })
    );
  }

  // T-ID / Тинькофф (optional)
  if (process.env.TINKOFF_CLIENT_ID && process.env.TINKOFF_CLIENT_SECRET) {
    providers.push(
      TinkoffProvider({
        clientId: process.env.TINKOFF_CLIENT_ID,
        clientSecret: process.env.TINKOFF_CLIENT_SECRET,
      })
    );
  }

  // Telegram Bot Auth (optional)
  if (process.env.TELEGRAM_BOT_TOKEN) {
    providers.push(
      CredentialsProvider({
        id: "telegram",
        name: "Telegram",
        credentials: {
          code: { label: "Код из бота", type: "text" },
        },
        async authorize(credentials) {
          if (!credentials?.code) return null;

          const code = credentials.code as string;

          // Find verified token by code
          const token = await db.query.telegramAuthTokens.findFirst({
            where: and(
              eq(telegramAuthTokens.code, code),
              eq(telegramAuthTokens.verified, true),
              isNotNull(telegramAuthTokens.telegramId),
              gt(telegramAuthTokens.expires, new Date())
            ),
          });

          if (!token || token.usedAt) {
            return null;
          }

          // Mark token as used
          await db
            .update(telegramAuthTokens)
            .set({ usedAt: new Date() })
            .where(eq(telegramAuthTokens.id, token.id));

          // Find or create user by Telegram ID
          let user = await db.query.users.findFirst({
            where: eq(users.email, `tg_${token.telegramId}@telegram.local`),
          });

          if (!user) {
            // Create new user
            const [newUser] = await db
              .insert(users)
              .values({
                email: `tg_${token.telegramId}@telegram.local`,
                name:
                  [token.telegramFirstName, token.telegramLastName].filter(Boolean).join(" ") ||
                  `Telegram User`,
                emailVerified: new Date(),
              })
              .returning();
            user = newUser;

            // Assign Guest role
            if (user) {
              await db.insert(userRoles).values({
                userId: user.id,
                role: "Guest",
              });
            }
          }

          if (!user) return null;

          // Check if user is blocked
          if (await isUserBlocked(user.id)) {
            throw new UserBlockedError();
          }

          // Create/update account link
          const existingAccount = await db.query.accounts.findFirst({
            where: and(
              eq(accounts.provider, "telegram"),
              eq(accounts.providerAccountId, token.telegramId!)
            ),
          });

          if (!existingAccount) {
            await db.insert(accounts).values({
              userId: user.id,
              type: "oauth", // Use oauth type for compatibility with NextAuth adapter
              provider: "telegram",
              providerAccountId: token.telegramId!,
            });
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          };
        },
      })
    );
  }

  // VK ID Session (used by custom VK callback flow)
  providers.push(
    CredentialsProvider({
      id: "vk-session",
      name: "VK Session",
      credentials: {
        userId: { label: "User ID", type: "text" },
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.userId || !credentials?.token) return null;

        const userId = credentials.userId as string;
        const token = credentials.token as string;

        // Verify the token matches expected format (simple HMAC validation)
        // Token format: base64(userId:timestamp:signature)
        try {
          const decoded = Buffer.from(token, "base64").toString();
          const [tokenUserId, timestamp, signature] = decoded.split(":");

          if (tokenUserId !== userId) return null;

          // Check timestamp is within 5 minutes
          const tokenTime = parseInt(timestamp || "0", 10);
          const now = Date.now();
          if (now - tokenTime > 5 * 60 * 1000) return null;

          // Verify signature using AUTH_SECRET
          const crypto = await import("crypto");
          const expectedSig = crypto
            .createHmac("sha256", process.env.AUTH_SECRET!)
            .update(`${userId}:${timestamp}`)
            .digest("hex")
            .substring(0, 16);

          if (signature !== expectedSig) return null;
        } catch {
          return null;
        }

        // Find user in database
        const user = await db.query.users.findFirst({
          where: eq(users.id, userId),
        });

        if (!user) return null;

        // Check if user is blocked
        if (await isUserBlocked(user.id)) {
          throw new UserBlockedError();
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    })
  );

  // Email + Password Credentials
  providers.push(
    CredentialsProvider({
      id: "credentials",
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        // Find user by email
        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });

        if (!user?.passwordHash) {
          // User doesn't exist or doesn't have password set
          return null;
        }

        // Check if user is deleted
        if (user.isDeleted) {
          return null;
        }

        // Check if email is verified for password-based accounts
        if (!user.emailVerified) {
          throw new EmailNotVerifiedError();
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        // Check if user is blocked
        if (await isUserBlocked(user.id)) {
          throw new UserBlockedError();
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    })
  );

  // Development-only test credentials provider
  if (isDev) {
    providers.push(
      CredentialsProvider({
        id: "test-credentials",
        name: "Test Account",
        credentials: {
          account: {
            label: "Account Type",
            type: "text",
            placeholder: "admin, moderator, owner, resident, guest, editor, chairman, ukRep",
          },
        },
        async authorize(credentials) {
          if (!credentials?.account) return null;
          const accountKey = credentials.account as string;
          const user = await getOrCreateTestUser(accountKey);
          if (!user) return null;
          return {
            id: user.id,
            email: user.email,
            name: user.name,
          };
        },
      })
    );
  }

  return providers;
}

export const authConfig = {
  secret: process.env.AUTH_SECRET,
  providers: buildProviders(),
  logger: {
    error: (code) => {
      // Подавляем стандартный стек-трейс для ожидаемых ошибок аутентификации
      if (
        code.name === "CredentialsSignin" ||
        code.name === "EmailNotVerifiedError" ||
        code.name === "UserBlockedError"
      ) {
        const errorType =
          code.name === "EmailNotVerifiedError"
            ? "email не подтверждён"
            : code.name === "UserBlockedError"
              ? "пользователь заблокирован"
              : "неверные учётные данные";
        authLogger.warn({ name: code.name, errorType }, "Auth error");
        return;
      }
      authLogger.error({ code }, "Auth error");
      // Выводим cause для отладки VK ID
      if (code.cause) {
        authLogger.error({ cause: code.cause }, "Auth error cause");
      }
    },
    warn: (code) => {
      authLogger.warn({ code }, "Auth warning");
    },
    debug: (code) => {
      if (isDev) {
        authLogger.debug({ code }, "Auth debug");
      }
    },
  },
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: {
    strategy: "jwt", // Use JWT for both dev and production for simplicity and reliability
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    signIn: async ({ user, account }) => {
      try {
        // Check if user is blocked (for OAuth providers)
        if (user?.id && account?.provider !== "credentials" && account?.provider !== "telegram") {
          // For credentials and telegram, block check happens in authorize()
          // For OAuth, we need to check here
          if (await isUserBlocked(user.id)) {
            authLogger.warn({ userId: user.id }, "Blocked user attempted sign in");
            return "/login?error=USER_BLOCKED";
          }
        }

        authLogger.info({ userId: user?.id, provider: account?.provider }, "User signed in");
        return true;
      } catch (error) {
        authLogger.error("Error in signIn callback", error);
        // Allow sign in to continue even if block check fails
        return true;
      }
    },
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session: async ({ session, user, token }) => {
      // Get user ID from either user object (database strategy) or token (jwt strategy)
      const userId = user?.id ?? (token?.id as string);

      if (!userId) {
        authLogger.warn("No userId in session callback");
        return session;
      }

      try {
        // Fetch user roles and profile avatar from database
        const [roles, profile] = await Promise.all([
          db
            .select({ role: userRoles.role })
            .from(userRoles)
            .where(eq(userRoles.userId, userId))
            .catch((error) => {
              authLogger.error({ err: error, userId }, "Error fetching roles");
              return [];
            }),
          db.query.userProfiles
            .findFirst({
              where: eq(userProfiles.userId, userId),
              columns: { avatar: true },
            })
            .catch((error) => {
              authLogger.error({ err: error, userId }, "Error fetching profile");
              return null;
            }),
        ]);

        let userRolesList = roles.map((r) => r.role);

        // Fallback: If user has no roles, assign Guest role
        if (userRolesList.length === 0) {
          authLogger.warn({ userId }, "User has no roles, assigning Guest");
          try {
            await db
              .insert(userRoles)
              .values({
                userId,
                role: "Guest",
              })
              .onConflictDoNothing();
            userRolesList = ["Guest"];
          } catch (error) {
            authLogger.error({ err: error, userId }, "Failed to assign Guest role");
            // Still allow session with empty roles array
            userRolesList = ["Guest"];
          }
        }

        return {
          ...session,
          user: {
            ...session.user,
            id: userId,
            roles: userRolesList,
            isAdmin: isAdmin(userRolesList),
            // Use profile avatar if set, otherwise fall back to OAuth avatar
            image: profile?.avatar ?? session.user.image,
          },
        };
      } catch (error) {
        authLogger.error({ err: error, userId }, "Unexpected error in session callback");
        // Return session with minimal data to prevent complete auth failure
        return {
          ...session,
          user: {
            ...session.user,
            id: userId,
            roles: ["Guest"],
            isAdmin: false,
          },
        };
      }
    },
  },
  events: {
    // Send notification when a new OAuth account is linked
    linkAccount: async ({ user, account }) => {
      try {
        authLogger.info({ provider: account.provider, userId: user.id }, "Linking account");
        if (user.email && account.provider) {
          notifyAsync({
            type: "account.linked",
            userId: user.id ?? "",
            email: user.email,
            name: user.name ?? "Пользователь",
            provider: account.provider,
            providerName: getProviderDisplayName(account.provider),
          });
        }
      } catch (error) {
        authLogger.error("Error in linkAccount event", error);
      }
    },
    createUser: async ({ user }) => {
      authLogger.info({ userId: user.id, email: user.email }, "New user created");
    },
    session: async ({ session }) => {
      // Session callback - no logging needed
    },
  },
} satisfies NextAuthConfig;

// Export test accounts for login page
export { TEST_ACCOUNTS };

// Export list of available providers for UI
export function getAvailableProviders() {
  const available: {
    id: string;
    name: string;
    type: "oauth" | "credentials";
  }[] = [];

  // Always available
  available.push({ id: "yandex", name: "Яндекс", type: "oauth" });

  if (process.env.VK_CLIENT_ID) {
    available.push({ id: "vk", name: "ВКонтакте", type: "oauth" });
  }

  if (process.env.GOOGLE_CLIENT_ID) {
    available.push({ id: "google", name: "Google", type: "oauth" });
  }

  if (process.env.MAILRU_CLIENT_ID) {
    available.push({ id: "mailru", name: "Mail.ru", type: "oauth" });
  }

  if (process.env.OK_CLIENT_ID) {
    available.push({
      id: "odnoklassniki",
      name: "Одноклассники",
      type: "oauth",
    });
  }

  if (process.env.SBER_CLIENT_ID) {
    available.push({ id: "sber", name: "Сбер ID", type: "oauth" });
  }

  if (process.env.TINKOFF_CLIENT_ID) {
    available.push({ id: "tinkoff", name: "Т-Банк", type: "oauth" });
  }

  if (process.env.TELEGRAM_BOT_TOKEN) {
    available.push({ id: "telegram", name: "Telegram", type: "credentials" });
  }

  // Email/password always available
  available.push({ id: "credentials", name: "Email", type: "credentials" });

  return available;
}
