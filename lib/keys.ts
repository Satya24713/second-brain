import { env } from "cloudflare:workers";
import { ApiError } from "./server";
import { seal, unseal } from "./crypto";
function secret() {
  if (!env.KEY_ENCRYPTION_SECRET)
    throw new ApiError(503, "Secure key storage is not configured yet.");
  return env.KEY_ENCRYPTION_SECRET;
}
export const encryptKey = (key: string, userId: string) =>
  seal(key, userId, secret());
export const decryptKey = (value: string, userId: string) =>
  unseal(value, userId, secret());
