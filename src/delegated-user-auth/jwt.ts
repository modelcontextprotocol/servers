import {
  jwtVerify,
  createLocalJWKSet,
  SignJWT,
  JWTPayload,
  generateKeyPair,
  exportJWK,
  JSONWebKeySet,
} from "jose";
import { AssertionFailureReason, SERVER_RESOURCE_URI } from "./extension.js";

export class AssertionError extends Error {
  constructor(public reason: AssertionFailureReason) {
    super(`Assertion error: ${reason}`);
    this.name = "AssertionError";
  }
}

export interface MintAssertionInput {
  subject: string;
  verificationMethod: string;
  overrides?: {
    aud?: string | string[];
    iss?: string;
    sub?: string;
    expSeconds?: number;
  };
}

export interface Idp {
  issuerName: string;
  mintAssertion: (input: MintAssertionInput) => Promise<string>;
  mintExpiredAssertion: (input: MintAssertionInput) => Promise<string>;
  getJwks: () => JSONWebKeySet;
}

export async function createIdp(issuerName: string): Promise<Idp> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);

  async function mintAssertion(input: MintAssertionInput): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: input.overrides?.sub ?? input.subject,
      aud: input.overrides?.aud ?? SERVER_RESOURCE_URI,
      iss: input.overrides?.iss ?? issuerName,
      iat: now,
      exp: now + (input.overrides?.expSeconds ?? 300),
      email_verified: true,
      verification_method: input.verificationMethod,
    };
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "RS256" })
      .sign(privateKey);
  }

  async function mintExpiredAssertion(
    input: MintAssertionInput
  ): Promise<string> {
    return mintAssertion({
      ...input,
      overrides: { ...input.overrides, expSeconds: -60 },
    });
  }

  function getJwks(): JSONWebKeySet {
    return { keys: [publicJwk] };
  }

  return { issuerName, mintAssertion, mintExpiredAssertion, getJwks };
}

export type JwksFetcher = (
  jwksUri: string
) => JSONWebKeySet | Promise<JSONWebKeySet>;

export interface VerifyAssertionOptions {
  jwksFetcher: JwksFetcher;
  jwksUri: string;
  expectedTokenIssuer: string;
  expectedSubject: string;
}

// verifyAssertion validates a JWT against the negotiated issuer's JWKS. All jose
// failures map centrally to one of three AssertionError reasons; nothing else leaks.
// The `assertion_missing` check happens before any jose call, so the central
// try/catch rethrows existing AssertionErrors unchanged before mapping jose errors.
export async function verifyAssertion(
  jwt: string | undefined,
  opts: VerifyAssertionOptions
): Promise<void> {
  if (!jwt) {
    throw new AssertionError("assertion_missing");
  }

  try {
    const jwks = await opts.jwksFetcher(opts.jwksUri);
    const getKey = createLocalJWKSet(jwks);
    const { payload } = await jwtVerify(jwt, getKey, {
      audience: SERVER_RESOURCE_URI,
      issuer: opts.expectedTokenIssuer,
    });

    if (payload.sub !== opts.expectedSubject) {
      throw new AssertionError("assertion_invalid");
    }
  } catch (err) {
    // Rethrow our own typed errors unchanged — don't re-wrap assertion_missing.
    if (err instanceof AssertionError) throw err;

    if (err instanceof Error && err.name === "JWTExpired") {
      throw new AssertionError("assertion_expired");
    }
    throw new AssertionError("assertion_invalid");
  }
}
