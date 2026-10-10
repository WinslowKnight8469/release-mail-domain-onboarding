const domain = process.env.SENDING_DOMAIN;
const dkimValue = process.env.DKIM_VALUE;
if (!domain || !dkimValue) throw new Error("SENDING_DOMAIN and DKIM_VALUE are required");

const response = await fetch("http://localhost:3000/sending-domains/onboard", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    domain,
    build: { id: "build-184", commit: "8ca14bd", environment: "production" },
    release: { id: "release-42", operation: "publish" },
    records: {
      spf: "v=spf1 include:example.net -all",
      dkim: { selector: "release", value: dkimValue },
      dmarc: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`,
    },
  }),
});

const result = await response.json();
console.log(JSON.stringify(result, null, 2));
if (!response.ok) process.exitCode = 1;
