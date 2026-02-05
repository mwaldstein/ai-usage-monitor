import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as ParseResult from "effect/ParseResult";
import { DbError, toDbError } from "../errors.ts";

export async function runDbQueryEffect<A>(effect: Effect.Effect<A, unknown, unknown>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect as Effect.Effect<A, unknown, never>);
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));
  if (ParseResult.isParseError(failure)) {
    throw toDbError(failure, { operation: "decode" });
  }

  if (failure instanceof DbError) {
    if (ParseResult.isParseError(failure.cause)) {
      throw toDbError(failure.cause, {
        operation: "decode",
        sql: failure.sql,
        params: failure.params,
      });
    }

    throw failure;
  }

  const squashed = Cause.squash(exit.cause);
  if (ParseResult.isParseError(squashed)) {
    throw toDbError(squashed, { operation: "decode" });
  }

  throw toDbError(squashed, { operation: "query" });
}
