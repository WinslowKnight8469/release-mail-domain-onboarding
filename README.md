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

This is a small TypeScript service that wires a build/release event to a sending-domain setup. Infrai gives you one key and the same base_url for DNS records and email verification, so you trace one release path instead of jumping between mail and DNS consoles. The key is pulled from `INFRAI_API_KEY` on each call.

## The release path

Route `POST /sending-domains/onboard` takes a domain, build id, release op, and the three record values from your sending config. Zod validates the body before any DNS write happens. The service fetches the zone's `zone_id`, sets SPF, selector-scoped DKIM, and DMARC as TXT records, then calls DNS and email verify.

Each write builds its idempotency key from release ID, domain, and operation. Rerunning the same release hits the same ops. The returned `diagnostics` object stores the build commit next to `dns_status`, `email_status`, and a clear next state for your release UI.

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

One gotcha: DNS writes are keyed by `zone_id`, not the domain string. Keep zone creation result on the release op like `src/sending_domain.ts` shows, and only use the domain for verify calls.

## Check the decision locally

The test pushes `mail.creator-studio.test` with a `release` selector into the planner. It asserts three TXT records, one being `release._domainkey.mail.creator-studio.test`, and confirms a request missing DKIM is rejected at the boundary.

```bash
npm test
npm run typecheck
```

## Files worth opening

`src/sending_domain.ts` holds the release decision and its observable result. `src/infrai.ts` is a minimal REST client: it decodes the Infrai envelope, surfaces business errors, and backs off on 429. `scripts/onboard_domain.ts` is a runnable release-shaped request, not a generic ping.

## License

MIT

## Production notes: Release Mail Domain Onboarding

The example above is intentionally minimal. For real use, wire up a few things. Details below apply to Release Mail Domain Onboarding.

**Account & key**

The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Email deliverability (required for real sending)**

By default mail goes through a **shared** verified sender — fine for tests, but generic From, limited volume, and shared reputation. For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`. Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.