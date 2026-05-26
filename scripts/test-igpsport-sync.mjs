import * as esbuild from "esbuild";
import { unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";

const outfile = "tmp-igpsport-sync.mjs";

await esbuild.build({
  bundle: true,
  entryPoints: ["src/integrations.ts"],
  format: "esm",
  logLevel: "silent",
  outfile,
  platform: "browser",
});

try {
  const { loginIgpsportAccount, syncIgpsportDateToIntervals } = await import(
    pathToFileURL(`${process.cwd()}/${outfile}`),
  );
  const baseSettings = {
    ftp: 175,
    intervalsApiBase: "https://intervals.example/api/v1",
    intervalsAthleteId: "athlete",
    intervalsApiKey: "interval-key",
    igpsportUsername: "rider",
  };

  let loginBody = {};
  globalThis.fetch = async (_url, options) => {
    loginBody = JSON.parse(String(options.body));
    return {
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 604800,
        },
      }),
    };
  };
  const settings = await loginIgpsportAccount({
    settings: baseSettings,
    password: "password",
  });
  if (loginBody.appId !== "igpsport-web" || loginBody.username !== "rider") {
    throw new Error("Login payload is not compatible with iGPSPORT web login.");
  }
  if (
    settings.igpsportAccessToken !== "access-token" ||
    settings.igpsportRefreshToken !== "refresh-token" ||
    settings.igpsportPassword !== "password"
  ) {
    throw new Error("Login tokens were not returned to settings.");
  }

  let refreshCalled = false;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/auth/refresh")) {
      refreshCalled = true;
      const body = JSON.parse(String(options.body));
      if (body.refreshToken !== "refresh-token") {
        throw new Error("Refresh request did not send refreshToken.");
      }
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            access_token: "refreshed-access-token",
            refresh_token: "refreshed-refresh-token",
            expires_in: 604800,
          },
        }),
      };
    }
    if (target.includes("queryMyActivity")) {
      const authorization = options.headers?.Authorization;
      if (authorization !== "Bearer refreshed-access-token") {
        throw new Error("Expired iGPSPORT token was not refreshed before list request.");
      }
      return {
        ok: true,
        json: async () => ({ code: 0, data: { rows: [] } }),
      };
    }
    if (target.includes("/activities?") && !options.method) {
      return {
        ok: true,
        json: async () => [],
      };
    }
    throw new Error(`Unexpected refresh request: ${target}`);
  };
  const refreshed = await syncIgpsportDateToIntervals({
    settings: {
      ...settings,
      igpsportTokenExpiresAt: "2000-01-01T00:00:00.000Z",
    },
    date: "2026-05-26",
    plan: {
      date: "2026-05-26",
      title: "Z2",
      kind: "z2",
      durationMinutes: 60,
      powerRange: [110, 125],
    },
    syncRecords: {},
  });
  if (
    !refreshCalled ||
    refreshed.settings.igpsportAccessToken !== "refreshed-access-token" ||
    refreshed.settings.igpsportRefreshToken !== "refreshed-refresh-token"
  ) {
    throw new Error("Expired iGPSPORT session was not refreshed.");
  }

  let reloginCalled = false;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/auth/refresh") || target.includes("/auth/account/refresh")) {
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({}),
      };
    }
    if (target.includes("/auth/account/login")) {
      reloginCalled = true;
      const body = JSON.parse(String(options.body));
      if (body.password !== "password") {
        throw new Error("Saved iGPSPORT password was not used for re-login.");
      }
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            access_token: "relogin-access-token",
            refresh_token: "relogin-refresh-token",
            expires_in: 604800,
          },
        }),
      };
    }
    if (target.includes("queryMyActivity")) {
      const authorization = options.headers?.Authorization;
      if (authorization !== "Bearer relogin-access-token") {
        throw new Error("Re-login token was not used before list request.");
      }
      return {
        ok: true,
        json: async () => ({ code: 0, data: { rows: [] } }),
      };
    }
    if (target.includes("/activities?") && !options.method) {
      return {
        ok: true,
        json: async () => [],
      };
    }
    throw new Error(`Unexpected re-login request: ${target}`);
  };
  const relogged = await syncIgpsportDateToIntervals({
    settings: {
      ...settings,
      igpsportTokenExpiresAt: "2000-01-01T00:00:00.000Z",
    },
    date: "2026-05-26",
    plan: {
      date: "2026-05-26",
      title: "Z2",
      kind: "z2",
      durationMinutes: 60,
      powerRange: [110, 125],
    },
    syncRecords: {},
  });
  if (
    !reloginCalled ||
    relogged.settings.igpsportAccessToken !== "relogin-access-token"
  ) {
    throw new Error("Expired iGPSPORT session did not fall back to saved password login.");
  }

  let uploadCount = 0;
  let uploadedFileName = "";
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("queryMyActivity")) {
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: { rows: [{ rideId: "ride-1", title: "Morning ride" }] },
        }),
      };
    }
    if (target.includes("getDownloadUrl")) {
      return {
        ok: true,
        json: async () => ({ code: 0, data: "https://files.example/ride.fit" }),
      };
    }
    if (target === "https://files.example/ride.fit") {
      return {
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode("fit-data").buffer,
      };
    }
    if (
      target.includes("/activities?external_id=") &&
      options.method === "POST"
    ) {
      uploadCount += 1;
      const file = options.body?.get?.("file");
      uploadedFileName = file?.name ?? "";
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: "interval-activity" }),
      };
    }
    if (target.includes("/activities?") && !options.method) {
      return {
        ok: true,
        json: async () => [
          {
            start_date_local: "2026-05-26T07:00:00",
            moving_time: 3600,
            average_watts: 120,
            distance: 25000,
            icu_training_load: 40,
          },
        ],
      };
    }
    throw new Error(`Unexpected request: ${target}`);
  };

  const plan = {
    date: "2026-05-26",
    title: "Z2",
    kind: "z2",
    durationMinutes: 60,
    powerRange: [110, 125],
  };
  const first = await syncIgpsportDateToIntervals({
    settings,
    date: plan.date,
    plan,
    syncRecords: {},
  });
  if (uploadCount !== 1 || !first.syncRecords["igpsport-ride-1"]) {
    throw new Error("First activity file sync did not upload and record the ride.");
  }
  if (
    first.syncRecords["igpsport-ride-1"].fileType !== "fit" ||
    uploadedFileName !== "igpsport-ride-1.fit"
  ) {
    throw new Error("FIT file was not uploaded with the expected file metadata.");
  }
  if (first.analysis.activityCount !== 1) {
    throw new Error("Intervals analysis was not refreshed after upload.");
  }

  await syncIgpsportDateToIntervals({
    settings,
    date: plan.date,
    plan,
    syncRecords: first.syncRecords,
  });
  if (uploadCount !== 1) {
    throw new Error("Repeated FIT sync uploaded the same ride again.");
  }

  uploadCount = 0;
  uploadedFileName = "";
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("queryMyActivity")) {
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: { rows: [{ rideId: "ride-2", title: "Fallback ride" }] },
        }),
      };
    }
    if (target.includes("getDownloadUrl")) {
      return {
        ok: true,
        json: async () => ({ code: 0, data: "https://files.example/ride.fit" }),
      };
    }
    if (target === "https://files.example/ride.fit") {
      throw new TypeError("CORS blocked");
    }
    if (target.includes("exportGpx/ride-2")) {
      return {
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode("<gpx />").buffer,
      };
    }
    if (
      target.includes("/activities?external_id=") &&
      options.method === "POST"
    ) {
      uploadCount += 1;
      const file = options.body?.get?.("file");
      uploadedFileName = file?.name ?? "";
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: "interval-gpx-activity" }),
      };
    }
    if (target.includes("/activities?") && !options.method) {
      return {
        ok: true,
        json: async () => [],
      };
    }
    throw new Error(`Unexpected fallback request: ${target}`);
  };
  const fallback = await syncIgpsportDateToIntervals({
    settings,
    date: plan.date,
    plan,
    syncRecords: {},
  });
  if (
    uploadCount !== 1 ||
    fallback.syncRecords["igpsport-ride-2"].fileType !== "gpx" ||
    uploadedFileName !== "igpsport-ride-2.gpx"
  ) {
    throw new Error("GPX fallback did not upload and record the ride.");
  }

  console.log("iGPSPORT sync fixtures passed.");
} finally {
  unlinkSync(outfile);
}
