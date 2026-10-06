-- Move immutable provider/refund evidence out of the diagnostic lastError field.
ALTER TABLE "GymRefundAttempt"
  ADD COLUMN "reservation" JSONB;

-- Backfill only valid v1 envelopes. Rows that cannot be decoded remain untouched;
-- application retries fail closed and require operator reconciliation for those rows.
DO $$
DECLARE
  attempt_row RECORD;
  payload TEXT;
  padded_payload TEXT;
  envelope JSONB;
  reservation_snapshot JSONB;
  version_number DOUBLE PRECISION;
  amount_number DOUBLE PRECISION;
  starting_refund_amount_number DOUBLE PRECISION;
  prefix CONSTANT TEXT := 'gym-refund-reservation:v1:';
BEGIN
  FOR attempt_row IN
    SELECT "id", "lastError", "payment", "requestKey", "amount", "startingRefundAmount"
    FROM "GymRefundAttempt"
    WHERE "lastError" LIKE prefix || '%'
  LOOP
    BEGIN
      payload := substring(attempt_row."lastError" FROM length(prefix) + 1);
      IF payload !~ '^[A-Za-z0-9_-]+$' OR length(payload) % 4 = 1 THEN
        CONTINUE;
      END IF;

      padded_payload := translate(payload, '-_', '+/') || repeat('=', (4 - length(payload) % 4) % 4);
      envelope := convert_from(decode(padded_payload, 'base64'), 'UTF8')::JSONB;
      reservation_snapshot := envelope -> 'reservation';
      -- Match JSON.parse + parseRefundReservation's JavaScript Number semantics.
      -- Lexical integer regexes reject valid numeric forms such as 1.0 and 5e2,
      -- while a DOUBLE PRECISION cast applies the same IEEE-754 rounding first.
      version_number := (reservation_snapshot ->> 'version')::DOUBLE PRECISION;
      amount_number := (reservation_snapshot ->> 'amount')::DOUBLE PRECISION;
      starting_refund_amount_number := (reservation_snapshot ->> 'startingRefundAmount')::DOUBLE PRECISION;

      IF jsonb_typeof(reservation_snapshot) = 'object'
        AND jsonb_typeof(reservation_snapshot -> 'version') = 'number'
        AND version_number = 1
        AND jsonb_typeof(reservation_snapshot -> 'paymentId') = 'string'
        AND NULLIF(reservation_snapshot ->> 'paymentId', '') IS NOT NULL
        AND reservation_snapshot ->> 'paymentId' = attempt_row."payment"
        AND jsonb_typeof(reservation_snapshot -> 'providerId') = 'string'
        AND NULLIF(reservation_snapshot ->> 'providerId', '') IS NOT NULL
        AND jsonb_typeof(reservation_snapshot -> 'paymentIntentId') = 'string'
        AND NULLIF(reservation_snapshot ->> 'paymentIntentId', '') IS NOT NULL
        AND jsonb_typeof(reservation_snapshot -> 'requestKey') = 'string'
        AND NULLIF(reservation_snapshot ->> 'requestKey', '') IS NOT NULL
        AND reservation_snapshot ->> 'requestKey' = attempt_row."requestKey"
        AND jsonb_typeof(reservation_snapshot -> 'providerRequestKey') = 'string'
        AND NULLIF(reservation_snapshot ->> 'providerRequestKey', '') IS NOT NULL
        AND jsonb_typeof(reservation_snapshot -> 'amount') = 'number'
        AND amount_number BETWEEN 1 AND 9007199254740991
        AND trunc(amount_number) = amount_number
        AND amount_number = attempt_row."amount"::DOUBLE PRECISION
        AND jsonb_typeof(reservation_snapshot -> 'startingRefundAmount') = 'number'
        AND starting_refund_amount_number BETWEEN 0 AND 9007199254740991
        AND trunc(starting_refund_amount_number) = starting_refund_amount_number
        AND starting_refund_amount_number = attempt_row."startingRefundAmount"::DOUBLE PRECISION
        AND jsonb_typeof(reservation_snapshot -> 'currencyCode') = 'string'
        AND reservation_snapshot ->> 'currencyCode' = 'USD'
        AND jsonb_typeof(reservation_snapshot -> 'reason') = 'string'
      THEN
        UPDATE "GymRefundAttempt"
        SET "reservation" = reservation_snapshot,
            "lastError" = CASE WHEN jsonb_typeof(envelope -> 'detail') = 'string' THEN envelope ->> 'detail' ELSE '' END
        WHERE "id" = attempt_row."id";
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Preserve malformed/undecodable evidence verbatim for explicit reconciliation.
      NULL;
    END;
  END LOOP;
END $$;
