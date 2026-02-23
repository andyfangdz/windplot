'use client';

import { useEffect } from 'react';
import { datadogRum } from '@datadog/browser-rum';

const APP_ID = process.env.NEXT_PUBLIC_DD_RUM_APPLICATION_ID;
const CLIENT_TOKEN = process.env.NEXT_PUBLIC_DD_RUM_CLIENT_TOKEN;
const SITE = process.env.NEXT_PUBLIC_DD_SITE || 'datadoghq.com';
const SERVICE = process.env.NEXT_PUBLIC_DD_SERVICE || 'windplot-web';
const ENV = process.env.NEXT_PUBLIC_DD_ENV || process.env.NODE_ENV || 'development';
const VERSION = process.env.NEXT_PUBLIC_DD_VERSION;
const SESSION_SAMPLE_RATE = Number(process.env.NEXT_PUBLIC_DD_RUM_SESSION_SAMPLE_RATE || 100);
const SESSION_REPLAY_SAMPLE_RATE = Number(
  process.env.NEXT_PUBLIC_DD_RUM_SESSION_REPLAY_SAMPLE_RATE || 0
);
const TRACK_USER_INTERACTIONS =
  process.env.NEXT_PUBLIC_DD_RUM_TRACK_USER_INTERACTIONS !== 'false';
const TRACK_RESOURCES = process.env.NEXT_PUBLIC_DD_RUM_TRACK_RESOURCES !== 'false';
const TRACK_LONG_TASKS = process.env.NEXT_PUBLIC_DD_RUM_TRACK_LONG_TASKS !== 'false';

let didInit = false;

export function DatadogRumInit() {
  useEffect(() => {
    if (didInit) return;
    if (!APP_ID || !CLIENT_TOKEN) return;

    datadogRum.init({
      applicationId: APP_ID,
      clientToken: CLIENT_TOKEN,
      site: SITE,
      service: SERVICE,
      env: ENV,
      version: VERSION,
      sessionSampleRate: Number.isFinite(SESSION_SAMPLE_RATE) ? SESSION_SAMPLE_RATE : 100,
      sessionReplaySampleRate: Number.isFinite(SESSION_REPLAY_SAMPLE_RATE)
        ? SESSION_REPLAY_SAMPLE_RATE
        : 0,
      trackUserInteractions: TRACK_USER_INTERACTIONS,
      trackResources: TRACK_RESOURCES,
      trackLongTasks: TRACK_LONG_TASKS,
      defaultPrivacyLevel: 'mask-user-input',
      allowedTracingUrls: [/^\/(?!\/)/],
    });

    didInit = true;
  }, []);

  return null;
}
