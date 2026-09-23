import crypto from "node:crypto";

export const newId = () => crypto.randomUUID();

/** URL-safe random token (for invite codes, magic links, calendar feeds). */
export const newToken = (bytes = 24) => crypto.randomBytes(bytes).toString("base64url");

export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
