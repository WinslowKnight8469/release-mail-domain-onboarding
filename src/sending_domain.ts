import { createHash } from "node:crypto";
import { z } from "zod";
import { infrai } from "./infrai.js";

export const onboardingRequest = z.object({
  domain: z.string().trim().min(3),
  build: z.object({ id: z.string().min(1), commit: z.string().min(7), environment: z.enum(["preview", "production"]) }),
  release: z.object({ id: z.string().min(1), operation: z.enum(["publish", "promote"]) }),
  records: z.object({
    spf: z.string().startsWith("v=spf1 "),
    dkim: z.object({ selector: z.string().min(1), value: z.string().min(1) }),
    dmarc: z.string().startsWith("v=DMARC1;"),
  }),
});

export type OnboardingInput = z.infer<typeof onboardingRequest>;
export type DnsRecord = { record_type: "TXT"; name: string; content: string; ttl: number };

export function buildRecordPlan(input: OnboardingInput): DnsRecord[] {
  const name = input.domain.toLowerCase();
  return [
    { record_type: "TXT", name, content: input.records.spf, ttl: 300 },
    { record_type: "TXT", name: `${input.records.dkim.selector}._domainkey.${name}`, content: input.records.dkim.value, ttl: 300 },
    { record_type: "TXT", name: `_dmarc.${name}`, content: input.records.dmarc, ttl: 300 },
  ];
}

function operationKey(input: OnboardingInput, step: string): string {
  return createHash("sha256").update(`${input.release.id}:${input.domain}:${step}`).digest("hex");
}

export async function onboardSendingDomain(input: OnboardingInput) {
  const records = buildRecordPlan(input);
  const zone = await infrai.dns.domain.add({ domain: input.domain }, operationKey(input, "zone"));

  await Promise.all(records.map((record) => infrai.dns.record.upsert(
    { zone_id: zone.zone_id, ...record },
    operationKey(input, `record:${record.name}`),
  )));

  const dns = await infrai.dns.domain.verify({ domain: input.domain }, operationKey(input, "dns-verify"));
  const email = await infrai.email.domain.verify({ domain: input.domain }, operationKey(input, "email-verify"));

  return {
    build: input.build,
    release: { ...input.release, state: "domain_checked" as const },
    domain: input.domain,
    records_written: records.map(({ record_type, name }) => ({ record_type, name })),
    diagnostics: {
      dns_status: dns.verification.status,
      email_status: email.verification.status,
      next: email.verification.status === "verified" ? "release_email_enabled" : "dns_propagation_pending",
    },
  };
}
