import test from "node:test";
import assert from "node:assert/strict";
import { getJWTExpiration, normalizeBearerToken } from "./jwt.ts";

function toBase64Url(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function makeJWT(exp: number): string {
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = toBase64Url(JSON.stringify({ exp }));
  const signature = "signature";
  return `${header}.${payload}.${signature}`;
}

test("getJWTExpiration parses bearer-prefixed tokens", () => {
  const exp = 1893456000;
  const token = makeJWT(exp);
  assert.equal(getJWTExpiration(`Bearer ${token}`), exp);
});

test("normalizeBearerToken strips prefix and whitespace", () => {
  assert.equal(normalizeBearerToken("  Bearer abc.def.ghi  "), "abc.def.ghi");
  assert.equal(normalizeBearerToken("abc.def.ghi"), "abc.def.ghi");
});
