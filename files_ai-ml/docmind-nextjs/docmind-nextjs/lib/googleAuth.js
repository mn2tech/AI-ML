import { google } from "googleapis";
import { serialize, parse } from "cookie";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

/** Resolve app base URL for OAuth redirect (Vercel, env, or localhost) */
export function getBaseUrl(req) {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const host = req?.headers?.host;
  if (host) {
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function createOAuth2Client(redirectUri) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

export function parseReqCookies(req) {
  return parse(req.headers.cookie || "");
}

export function setTokenCookies(res, tokens) {
  const cookies = [];
  if (tokens.access_token) {
    cookies.push(
      serialize("gdrive_access_token", tokens.access_token, {
        ...COOKIE_OPTS,
        maxAge: tokens.expiry_date
          ? Math.max(60, Math.floor((tokens.expiry_date - Date.now()) / 1000))
          : 3600,
      })
    );
  }
  if (tokens.refresh_token) {
    cookies.push(
      serialize("gdrive_refresh_token", tokens.refresh_token, {
        ...COOKIE_OPTS,
        maxAge: 60 * 60 * 24 * 30,
      })
    );
  }
  cookies.push(
    serialize("gdrive_connected", "1", {
      ...COOKIE_OPTS,
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 30,
    })
  );
  res.setHeader("Set-Cookie", cookies);
}

export function clearTokenCookies(res) {
  const expired = { ...COOKIE_OPTS, maxAge: 0 };
  res.setHeader("Set-Cookie", [
    serialize("gdrive_access_token", "", expired),
    serialize("gdrive_refresh_token", "", expired),
    serialize("gdrive_connected", "", { ...expired, httpOnly: false }),
  ]);
}

/** Build authenticated OAuth client from httpOnly cookies */
export async function getAuthenticatedClient(req, res) {
  const cookies = parseReqCookies(req);
  if (!cookies.gdrive_refresh_token && !cookies.gdrive_access_token) {
    return null;
  }

  const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
  const client = createOAuth2Client(redirectUri);
  client.setCredentials({
    access_token: cookies.gdrive_access_token,
    refresh_token: cookies.gdrive_refresh_token,
  });

  client.on("tokens", (tokens) => {
    if (tokens.access_token && res) {
      res.setHeader(
        "Set-Cookie",
        serialize("gdrive_access_token", tokens.access_token, {
          ...COOKIE_OPTS,
          maxAge: tokens.expiry_date
            ? Math.max(60, Math.floor((tokens.expiry_date - Date.now()) / 1000))
            : 3600,
        })
      );
    }
  });

  return client;
}
