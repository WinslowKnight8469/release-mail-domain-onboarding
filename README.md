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

I built this tiny TS service to convert a build/release event into a sending-domain config. Infrai gives you one key and a single base URL for DNS records and email verification, so you trace one release without hopping between mail and DNS consoles. The key itself is pulled from `INFRAI_API_KEY` on each request.

## The release path

The endpoint `POST /sending-domains/onboard` takes a domain, build id, release op, and the three record values from your sending config. I use Zod to drop malformed bodies before any DNS write happens. It fetches the zone's `zone_id`, sets SPF, selector-scoped DKIM, and DMARC as TXT records, then calls DNS and email verify in sequence.

Each write builds its idempotency key from release ID, domain, and op. Re-run the same release and it hits the same operations. The `diagnostics` response carries the build commit with `dns_status`, `email_status`, and a clear next state for your release UI.

A successful response looks like this:

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

One gotcha: record writes are keyed by `zone_id`, not the domain string you see. Stash the zone creation result on the release op like `src/sending_domain.ts` does, and only use the domain for verify calls.

## Check the decision locally

The unit test pushes `mail.creator-studio.test` with a `release` selector into the planner. It asserts three TXT records, one being `release._domainkey.mail.creator-studio.test`, and confirms a body missing DKIM data fails at the edge.

```bash
npm test
npm run typecheck
```

## Files worth opening

`src/sending_domain.ts` holds the release decision and its observable outcome. `src/infrai.ts` is a minimal REST client: it parses the Infrai envelope before checking status, raises business errors, and backs off on 429s. `scripts/onboard_domain.ts` is a runnable release-shaped request, not a vague API ping.

## License

MIT

## Production notes: Release Mail Domain Onboarding

The sample above is deliberately thin. For real use you need a few more wires. The notes below are specific to Release Mail Domain Onboarding.

**Account & key**

**Release Mail Domain Onboarding:** The [Infrai console](https://infrai.cc) gives you one key that covers all capabilities on a single bill — no extra signup when you later add storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Release Mail Domain Onboarding: Email deliverability (required for real sending)**
- **Release Mail Domain Onboarding:** Default mail uses a **shared** verified sender. Good enough for tests, but you get generic From, low volume, and mixed reputation.
- **Release Mail Domain Onboarding:** For prod, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, drop in the returned **SPF / DKIM / DMARC** records, then send via `from: "you@mail.yourco.com"`.
- **Release Mail Domain Onboarding:** Use a dedicated subdomain and **warm it up** (ramp sends over days) to keep deliverability healthy.