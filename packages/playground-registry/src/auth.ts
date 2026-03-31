import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { HttpContext, Policy } from "./generated/helpers/router.js";

/**
 * Configuration for Azure AD authentication on protected endpoints.
 */
export interface AuthConfig {
  /** The Azure AD tenant ID used to validate tokens. */
  tenantId: string;

  /** The expected audience (`aud`) claim in the JWT. */
  audience: string;

  /**
   * List of Azure AD object IDs (user or service principal) allowed to upload.
   * The `oid` claim in the JWT is checked against this list.
   */
  allowedUploaders: string[];
}

/**
 * Loads the auth configuration from a JSON file.
 * @param configPath Path to the auth config JSON file. Defaults to `auth-config.json` in the package root.
 */
export function loadAuthConfig(configPath?: string): AuthConfig {
  const resolved = configPath ?? resolve(import.meta.dirname, "../../auth-config.json");
  const raw = readFileSync(resolved, "utf-8");
  const config: AuthConfig = JSON.parse(raw);

  if (!config.tenantId || !config.audience || !Array.isArray(config.allowedUploaders)) {
    throw new Error(
      `Invalid auth config at ${resolved}: must contain tenantId, audience, and allowedUploaders`,
    );
  }

  if (config.allowedUploaders.length === 0) {
    throw new Error(`Auth config at ${resolved}: allowedUploaders must not be empty`);
  }

  return config;
}

/**
 * Creates a router policy that validates Azure AD Bearer tokens and checks
 * the caller's identity against the allowed uploaders list.
 *
 * Token validation includes:
 * - Signature verification via Azure AD's JWKS endpoint
 * - Issuer validation against the configured tenant
 * - Audience validation
 * - Object ID (`oid` claim) checked against `allowedUploaders`
 */
export function createAuthPolicy(config: AuthConfig): Policy {
  const jwksUrl = new URL(
    `https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`,
  );
  const jwks = createRemoteJWKSet(jwksUrl);
  const allowedSet = new Set(config.allowedUploaders);

  return async function authPolicy(ctx: HttpContext, next: (request?: any) => void) {
    const authHeader = ctx.request.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      respondUnauthorized(ctx, "Missing or invalid Authorization header");
      return;
    }

    const token = authHeader.slice(7);

    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, jwks, {
        issuer: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
        audience: config.audience,
      });
      payload = result.payload;
    } catch (err: any) {
      respondUnauthorized(ctx, `Token validation failed: ${err.message}`);
      return;
    }

    const oid = payload.oid as string | undefined;
    if (!oid || !allowedSet.has(oid)) {
      respondForbidden(ctx, oid);
      return;
    }

    next();
  };
}

function respondUnauthorized(ctx: HttpContext, message: string): void {
  ctx.response.statusCode = 401;
  ctx.response.setHeader("Content-Type", "application/json");
  ctx.response.setHeader("WWW-Authenticate", "Bearer");
  ctx.response.end(JSON.stringify({ error: message }));
}

function respondForbidden(ctx: HttpContext, oid: string | undefined): void {
  ctx.response.statusCode = 403;
  ctx.response.setHeader("Content-Type", "application/json");
  ctx.response.end(
    JSON.stringify({
      error: "Forbidden: your identity is not in the allowed uploaders list",
      oid: oid ?? "unknown",
    }),
  );
}
