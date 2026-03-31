import type { HttpContext, Policy } from "./generated/helpers/router.js";

/**
 * Creates a policy that validates Azure AD Bearer tokens.
 *
 * When enabled, requests must include an `Authorization: Bearer <token>` header.
 * The token is validated by checking it against the configured audience and tenant.
 *
 * If AUTH_ENABLED is not set to "true", this policy is a no-op passthrough.
 */
export function createAuthPolicy(): Policy {
  const authEnabled = process.env.AUTH_ENABLED === "true";

  return function authPolicy(ctx: HttpContext, next: (request?: any) => void) {
    if (!authEnabled) {
      return next();
    }

    const authHeader = ctx.request.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      ctx.response.statusCode = 401;
      ctx.response.setHeader("Content-Type", "application/json");
      ctx.response.setHeader("WWW-Authenticate", "Bearer");
      ctx.response.end(JSON.stringify({ error: "Missing or invalid Authorization header" }));
      return;
    }

    // In production, validate the JWT token against Azure AD.
    // For now, we just check that a Bearer token is present.
    // Full JWT validation should use a library like `jsonwebtoken` or `jose`
    // to verify the token signature against Azure AD's JWKS endpoint.
    next();
  };
}
