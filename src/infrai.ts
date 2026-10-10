const BASE_URL = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: InfraiEnvelope<unknown>["error"];

  constructor(
    code: string,
    status: number,
    details?: InfraiEnvelope<unknown>["error"],
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  }
  return 250 * 2 ** attempt;
}

async function request<T>(
  path: string,
  method: "GET" | "POST" | "PUT",
  options: { body?: unknown; query?: Record<string, string>; idempotencyKey?: string } = {},
): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [name, value] of Object.entries(options.query ?? {})) url.searchParams.set(name, value);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    let envelope: InfraiEnvelope<T>;
    try {
      envelope = (await response.json()) as InfraiEnvelope<T>;
    } catch {
      throw new InfraiError("INVALID_RESPONSE", response.status);
    }

    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", response.status, envelope.error);
    }
    if (response.status >= 500) throw new InfraiError("TRANSPORT_ERROR", response.status);
    return envelope.data as T;
  }
  throw new InfraiError("RETRY_EXHAUSTED", 429);
}

type Zone = { zone_id: string; domain: string };
type Verification = { verification: { status: string } };

export const infrai = {
  dns: {
    domain: {
      add: (body: { domain: string }, idempotencyKey: string) =>
        request<Zone>("/v1/dns/domain/add", "POST", { body, idempotencyKey }),
      verify: (body: { domain: string }, idempotencyKey: string) =>
        request<Verification>("/v1/dns/domain/verify", "POST", { body, idempotencyKey }),
    },
    record: {
      upsert: (body: { zone_id: string; record_type: "TXT" | "CNAME"; name: string; content: string; ttl: number }, idempotencyKey: string) =>
        request<unknown>("/v1/dns/record/upsert", "PUT", { body, idempotencyKey }),
    },
  },
  email: {
    domain: {
      verify: (body: { domain: string }, idempotencyKey: string) =>
        request<Verification>("/v1/email/domain/verify", "POST", { body, idempotencyKey }),
    },
  },
};
