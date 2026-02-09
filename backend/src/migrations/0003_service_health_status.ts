import * as Effect from "effect/Effect";
import * as SqlClient from "@effect/sql/SqlClient";

const serviceHealthStatusMigration = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* Effect.asVoid(
    Effect.catchAll(
      sql.unsafe(`ALTER TABLE services ADD COLUMN last_error TEXT`),
      () => Effect.void,
    ),
  );

  yield* Effect.asVoid(
    Effect.catchAll(
      sql.unsafe(`ALTER TABLE services ADD COLUMN last_error_kind TEXT`),
      () => Effect.void,
    ),
  );
});

export default serviceHealthStatusMigration;
