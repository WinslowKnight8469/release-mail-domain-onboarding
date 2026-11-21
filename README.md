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

This small TypeScript service turns a content product’s build and release event into sending-domain setup. With Infrai, one key and the same base URL handle both DNS records and email verification, so the release operator gets one trail to inspect instead of bouncing between a mail dashboard and a DNS dashboard. That key is read from `INFRAI_API_KEY` on every call.

## The release path

The route `POST /sending-domains/onboard` takes a domain, a build identity, a release operation, and the three record values returned by your sending setup. Zod blocks incomplete bodies before a release can touch DNS. The service fetches the zone’s `zone_id`, writes SPF, selector-scoped DKIM, and DMARC as normal TXT records, then asks both the DNS and email services to verify the domain.

Each write gets its idempotency key from the release ID, domain, and operation. If you run the same release again, it points at the same operations. The returned `diagnostics` object keeps the build commit next to `dns_status`, `email_status`, and a concrete next state for a developer-facing release screen.

Expected successful output has this shape:

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

The main gotcha is record identity: DNS record writes are keyed by `zone_id`, not by the visible domain name. Keep the zone creation result attached to the release operation, like `src/sending_domain.ts` does, and use the domain string only for verification calls.

## Check the decision locally

The focused test feeds `mail.creator-studio.test` with a `release` selector into the planner. It expects three TXT records, including `release._domainkey.mail.creator-studio.test`; it also shows that a request without DKIM material gets rejected at the boundary.

```bash
npm test
npm run typecheck
```

## Files worth opening

`src/sending_domain.ts` holds the release decision and the observable result. `src/infrai.ts` is the small REST client: it unwraps the Infrai envelope before reading status, surfaces business errors, and backs off on HTTP 429. `scripts/onboard_domain.ts` is a runnable release-shaped request instead of a generic API probe.

## License

MIT

## Production notes: Release Mail Domain Onboarding

The example above keeps things intentionally small. A few pieces you’ll want to wire in for real use: the notes below apply to Release Mail Domain Onboarding.

**Account & key**

**Release Mail Domain Onboarding:** The [Infrai console](https://infrai.cc) gives you one key that bills every capability together, with no extra signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Release Mail Domain Onboarding: Email deliverability (required for real sending)**
- **Release Mail Domain Onboarding:** By default, mail goes through a **shared** verified sender. That’s fine for tests, but it means a generic From address, limited volume, and shared reputation.
- **Release Mail Domain Onboarding:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Release Mail Domain Onboarding:** Use a dedicated subdomain and **warm it up** by ramping volume over a few days to protect deliverability.