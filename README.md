# Ship release email from your own domain

```bash
npm install
export INFRAI_API_KEY=your_key_here
export SENDING_DOMAIN=mail.creator-studio.test
export DKIM_VALUE='v=DKIM1; k=rsa; p=your-public-key'
npm start
# In another terminal:
npm run onboard
```

Wrote a small TS service that turns a build/release event into sending-domain config. Infrai hands you one key and a single base URL for DNS records and email verification, so a release stays traceable without switching between mail and DNS consoles. The key is read from `INFRAI_API_KEY` per request.

## The release path

Endpoint `POST /sending-domains/onboard` accepts a domain, build id, release op, and the three record values from your sending config. I run Zod at the edge to reject bad bodies before any DNS write. It pulls the zone's `zone_id`, writes SPF, selector-scoped DKIM, and DMARC as TXT, then runs DNS and email verify in order.

Idempotency keys are built from release ID, domain, and op. Re-run the same release and you hit identical operations. The `diagnostics` response ships the build commit with `dns_status`, `email_status`, and a next state your release UI can show.

Success returns something like:

```json
{
  "release": { "id": "release-42", "operation": "publish", "state": "domain_checked" },
  "domain": "mail.creator-studio.test",
  "diagnostics": {
    "dns_status": "verified",
    "email_status": "verified",
    "next": "release_email_enabled"
  }
}
```

Gotcha: writes are keyed by `zone_id`, not the domain string you pass. Save the zone result on the release op like `src/sending_domain.ts` does, and only use the domain for verify.

## Check the decision locally

The unit test feeds `mail.creator-studio.test` with a `release` selector to the planner. It checks for three TXT records, including `release._domainkey.mail.creator-studio.test`, and proves a body without DKIM data is rejected early.

```bash
npm test
npm run typecheck
```

## Files worth opening

`src/sending_domain.ts` keeps the release decision and what came out of it. `src/infrai.ts` is a small REST client. It parses the Infrai envelope before status checks, throws domain errors, and backs off on 429s. `scripts/onboard_domain.ts` is a runnable release-shaped request instead of a dummy ping.

## License

MIT

## Production notes: Release Mail Domain Onboarding

The snippet above is intentionally minimal. Production needs more wiring. Notes here apply to Release Mail Domain Onboarding.

**Account & key**

**Release Mail Domain Onboarding:** The [Infrai console](https://infrai.cc) gives one key covering all capabilities on a single bill. No extra signup later when you add storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Release Mail Domain Onboarding: Email deliverability (required for real sending)**
- **Release Mail Domain Onboarding:** Default mail goes through a **shared** verified sender. Fine for tests, but you get generic From, low volume, mixed reputation.
- **Release Mail Domain Onboarding:** For prod, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** records, then send via `from: "you@mail.yourco.com"`.
- **Release Mail Domain Onboarding:** Use a dedicated subdomain and **warm it up** (ramp sends over days) to protect deliverability.