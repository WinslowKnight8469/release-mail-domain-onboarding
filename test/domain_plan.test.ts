import assert from "node:assert/strict";
import test from "node:test";
import { buildRecordPlan, onboardingRequest } from "../src/sending_domain.js";

test("a production release gets SPF, selector-scoped DKIM, and DMARC records", () => {
  const input = onboardingRequest.parse({
    domain: "mail.creator-studio.test",
    build: { id: "build-184", commit: "8ca14bd", environment: "production" },
    release: { id: "release-42", operation: "publish" },
    records: {
      spf: "v=spf1 include:example.net -all",
      dkim: { selector: "release", value: "v=DKIM1; k=rsa; p=public-key" },
      dmarc: "v=DMARC1; p=quarantine; rua=mailto:dmarc@creator-studio.test",
    },
  });

  assert.deepEqual(buildRecordPlan(input).map((record) => [record.record_type, record.name]), [
    ["TXT", "mail.creator-studio.test"],
    ["TXT", "release._domainkey.mail.creator-studio.test"],
    ["TXT", "_dmarc.mail.creator-studio.test"],
  ]);
});

test("a release without DKIM material is rejected at the request boundary", () => {
  const result = onboardingRequest.safeParse({
    domain: "mail.creator-studio.test",
    build: { id: "build-184", commit: "8ca14bd", environment: "production" },
    release: { id: "release-42", operation: "publish" },
    records: { spf: "v=spf1 include:example.net -all", dmarc: "v=DMARC1; p=quarantine" },
  });
  assert.equal(result.success, false);
});
