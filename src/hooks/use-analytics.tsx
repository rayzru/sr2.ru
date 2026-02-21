"use client";

import { useCallback, useEffect, useRef } from "react";

import { usePathname, useSearchParams } from "next/navigation";
import type React from "react";

import { logger } from "~/lib/logger";
import { api } from "~/trpc/react";

const SESSION_STORAGE_KEY = "analytics_session_id";

/**
 * Custom analytics hook for tracking page views and events.
 * Automatically tracks page views on route changes.
 */
export function useAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessionIdRef = useRef<string | null>(null);
  const lastTrackedPath = useRef<string | null>(null);
  const isInitialized = useRef(false);

  const getSessionMutation = api.analytics.getSession.useMutation();
  const trackMutation = api.analytics.track.useMutation();

  // Get session ID from storage
  const getStoredSessionId = useCallback(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(SESSION_STORAGE_KEY);
  }, []);

  // Store session ID
  const storeSessionId = useCallback((sessionId: string) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }, []);

  // Get UTM parameters from URL
  const getUtmParams = useCallback(() => {
    if (typeof window === "undefined") return {};
    const params = new URLSearchParams(window.location.search);
    return {
      utmSource: params.get("utm_source") ?? undefined,
      utmMedium: params.get("utm_medium") ?? undefined,
      utmCampaign: params.get("utm_campaign") ?? undefined,
      utmTerm: params.get("utm_term") ?? undefined,
      utmContent: params.get("utm_content") ?? undefined,
    };
  }, []);

  // Get screen resolution
  const getScreenResolution = useCallback(() => {
    if (typeof window === "undefined") return undefined;
    return `${window.screen.width}x${window.screen.height}`;
  }, []);

  // Initialize session
  const initSession = useCallback(async () => {
    if (typeof window === "undefined") return null;

    const storedSessionId = getStoredSessionId();

    try {
      const result = await getSessionMutation.mutateAsync({
        sessionId: storedSessionId ?? undefined,
        entryPage: window.location.pathname,
        referrer: document.referrer || undefined,
        screenResolution: getScreenResolution(),
        ...getUtmParams(),
      });

      sessionIdRef.current = result.sessionId;
      storeSessionId(result.sessionId);
      return result.sessionId;
    } catch (error) {
      logger.error("Failed to initialize analytics session:", error);
      return null;
    }
  }, [getSessionMutation, getStoredSessionId, storeSessionId, getUtmParams, getScreenResolution]);

  // Track page view
  const trackPageView = useCallback(
    async (pagePath?: string) => {
      const path = pagePath ?? pathname;
      const sessionId = sessionIdRef.current;

      if (!sessionId) return;

      // Don't track the same path twice in a row
      if (lastTrackedPath.current === path) return;
      lastTrackedPath.current = path;

      try {
        await trackMutation.mutateAsync({
          sessionId,
          eventType: "page_view",
          eventName: "page_view",
          pagePath: path,
          pageTitle: typeof document !== "undefined" ? document.title : undefined,
          referrer: typeof document !== "undefined" ? document.referrer : undefined,
        });
      } catch (error) {
        logger.error("Failed to track page view:", error);
      }
    },
    [pathname, trackMutation]
  );

  // Track custom event
  const trackEvent = useCallback(
    async (
      eventName: string,
      options?: {
        category?: string;
        properties?: Record<string, unknown>;
        isConversion?: boolean;
      }
    ) => {
      const sessionId = sessionIdRef.current;

      if (!sessionId) return;

      try {
        await trackMutation.mutateAsync({
          sessionId,
          eventType: options?.isConversion ? "conversion" : "action",
          eventName,
          eventCategory: options?.category,
          pagePath: pathname,
          pageTitle: typeof document !== "undefined" ? document.title : undefined,
          properties: options?.properties,
        });
      } catch (error) {
        logger.error("Failed to track event:", error);
      }
    },
    [pathname, trackMutation]
  );

  // Track conversion
  const trackConversion = useCallback(
    async (conversionName: string, properties?: Record<string, unknown>) => {
      return trackEvent(conversionName, {
        isConversion: true,
        properties,
      });
    },
    [trackEvent]
  );

  // Initialize on mount
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    void initSession().then(() => {
      // Track initial page view after session is ready
      void trackPageView();
    });
  }, [initSession, trackPageView]);

  // Track page views on route changes
  useEffect(() => {
    if (!sessionIdRef.current) return;

    // Skip initial render (handled by initSession)
    if (lastTrackedPath.current === null) return;

    void trackPageView();
  }, [pathname, searchParams, trackPageView]);

  return {
    trackEvent,
    trackPageView,
    trackConversion,
    sessionId: sessionIdRef.current,
  };
}

/**
 * Analytics provider component that auto-tracks page views.
 * Add this once in your layout to enable analytics.
 */
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useAnalytics();
  return <>{children}</>;
}
