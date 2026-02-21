import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

import { logger } from "~/lib/logger";

export interface VKIDProfile {
  user: {
    user_id: number;
    first_name: string;
    last_name: string;
    phone: string;
    avatar: string;
    email?: string;
  };
}

/**
 * VK ID OAuth Provider
 *
 * @see https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-integration
 *
 * VK ID использует отличный от старого VK OAuth протокол.
 *
 * ВАЖНО: VK ID портит state параметр, убирая точки из JWE токенов.
 * Но если использовать checks: ["pkce"], то code_verifier хранится в cookie,
 * а не в state. Попробуем отключить state check.
 */
export default function VKIDProvider(
  config: OAuthUserConfig<VKIDProfile>
): OAuthConfig<VKIDProfile> {
  const clientId = config.clientId!;
  const clientSecret = config.clientSecret!;

  return {
    id: "vk",
    name: "VK ID",
    type: "oauth",
    clientId,
    clientSecret,
    authorization: {
      url: "https://id.vk.com/authorize",
      params: {
        scope: "email phone",
        response_type: "code",
      },
    },
    // VK ID uses custom token endpoint handling
    // We need to manually handle the token exchange
    token: "https://id.vk.com/oauth2/auth",
    userinfo: {
      url: "https://id.vk.com/oauth2/user_info",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async request({ tokens }: { tokens: any }) {
        logger.info("[VK ID] Userinfo request, tokens:", tokens);
        const response = await fetch("https://id.vk.com/oauth2/user_info", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            access_token: tokens.access_token as string,
            client_id: clientId,
          }),
        });
        const data = await response.json();
        logger.info("[VK ID] Userinfo response:", data);
        return data;
      },
    },
    profile(profile) {
      logger.info("[VK ID] Profile:", profile);
      const user = profile.user;
      return {
        id: String(user.user_id),
        name: [user.first_name, user.last_name].filter(Boolean).join(" "),
        email: user.email ?? null,
        image: user.avatar ?? null,
      };
    },
    // Use PKCE - VK ID requires it
    // State is stored in cookies, not in the state param, so VK's corruption doesn't affect it
    checks: ["pkce"],
    client: {
      token_endpoint_auth_method: "client_secret_post",
    },
    style: {
      bg: "#0077FF",
      text: "#fff",
    },
  };
}
