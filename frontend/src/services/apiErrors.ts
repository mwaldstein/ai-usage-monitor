import { Either, Schema as S } from "effect";
import { ApiError } from "shared/api";

export async function getApiErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  try {
    const data: unknown = await response.json();
    const decoded = S.decodeUnknownEither(ApiError)(data);
    if (Either.isRight(decoded)) {
      return decoded.right.error;
    }
  } catch {
    // Ignore malformed/non-JSON error bodies and use fallback below.
  }

  return fallbackMessage;
}
