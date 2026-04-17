# Security Policy

We take the security of Virtual Frame seriously. This document explains how to report vulnerabilities, what's in scope, and what to expect after you report.

## Supported versions

Security fixes land on the latest minor release line of each package. We do not back-port to older minors.

| Package family                                             | Supported    |
| ---------------------------------------------------------- | ------------ |
| `virtual-frame` (core)                                     | Latest minor |
| `@virtual-frame/*` bindings                                | Latest minor |
| `@virtual-frame/*` integrations (Next/Nuxt/SvelteKit/etc.) | Latest minor |

While the project remains pre-1.0 (`0.x`), every `0.x` minor bump may include breaking changes; security fixes target the most recent published minor only.

## Reporting a vulnerability

**Do not open a public GitHub issue.** Use one of the private channels below.

1. **Preferred — GitHub Private Vulnerability Reporting**
   Open an advisory at:
   <https://github.com/level0x40/virtual-frame/security/advisories/new>

2. **Email**
   <hello@level0x40.com>
   Use the subject line `[security] virtual-frame: <short summary>`.

If you'd like to encrypt your report, request our PGP key in the first message.

### What to include

- Affected package(s) and version(s).
- A description of the vulnerability and its security impact.
- Step-by-step reproduction — ideally a minimal repository or runnable snippet.
- Proof-of-concept exploit, if you have one.
- Any mitigation or workaround you've already identified.
- Whether you'd like public credit and how you'd like to be acknowledged.

### What to expect

| Timeframe               | What we do                                                                 |
| ----------------------- | -------------------------------------------------------------------------- |
| Within 3 business days  | Initial acknowledgement — we've received your report and are assessing it. |
| Within 10 business days | Triage outcome — confirmed, declined, or duplicate, with reasoning.        |
| Within 90 days          | Fix released, advisory published, and credit assigned (if accepted).       |

For critical issues actively exploited in the wild, we'll work with you on an accelerated disclosure timeline.

## Scope

In scope:

- Code in `packages/**` shipped to npm.
- The official documentation site at <https://virtual-frame.level0x40.com>.
- The build & release workflows in `.github/workflows/**` insofar as a flaw could be used to ship malicious package versions.

Out of scope:

- Bugs that don't have a security impact (please open a regular [bug report](https://github.com/level0x40/virtual-frame/issues/new/choose)).
- Vulnerabilities in third-party dependencies that are already publicly disclosed and tracked in our advisory feed — though pointers to mitigation we should ship are welcome.
- Findings from automated scanners with no demonstrated exploit path.
- Social engineering of maintainers or contributors.
- Issues in example apps under `examples/` that exist purely to demonstrate framework integration patterns.

## Safe harbor

We support coordinated disclosure. As long as you act in good faith, comply with this policy, and avoid privacy violations, data destruction, or service degradation, we will:

- Not pursue or support legal action against you.
- Treat your testing as authorized under the Computer Fraud and Abuse Act and equivalent laws.
- Work with you on disclosure timing.

## Security model for embedded content

Virtual Frame is, by design, a mechanism for embedding HTML from a remote origin into a server-rendered response — a "virtual iframe". The trust model is the same one you accept when you write `<iframe src="…">` or `<iframe srcdoc="…">`:

- **You choose the origin.** The URL passed to `fetchVirtualFrame(url, …)` is under your control. Only embed origins you trust to the same degree you would trust any page you `<iframe>` into your site. Treat a virtual-frame of `https://example.com/…` with the same scrutiny you would treat `<iframe src="https://example.com/…">`.
- **The embedded HTML is not escaped.** That is the purpose of the library. The HTML fetched from the remote origin is composed into the response unescaped so styles, markup, and the "resume delta" can be reconstructed on the client without a second round-trip.
- **Scripts from the remote page are stripped** (`<script>`, `<noscript>`) before the embed is composed. The library does not execute remote script content in the host origin.
- **CSS is scoped via declarative shadow DOM** when `isolate` is set (the default). Shadow DOM is a _scoping_ boundary, not a security boundary — it prevents accidental style leakage but does not defend against a hostile origin.
- **The `isolate` attribute is validated** against a fixed two-value set (`"open"` / `"closed"`) before it is interpolated into the response, so a crafted `isolate` value cannot inject additional attributes.

If you cannot assume the remote origin is trusted, do not use Virtual Frame — use a real `<iframe>` with `sandbox` instead, which gives you cross-origin script isolation that declarative shadow DOM cannot.

### CodeQL and other static analysers

Static analysers will — correctly, under their generic trust model — flag the points where remote HTML is composed into the response (`js/html-constructed-from-input`, `js/xss-through-dom`). These are intentional sinks under the trust model above.

The sinks are centralised in `packages/react-server/src/internal/html-sink.ts` so reviewers can audit the boundary as a single unit. CodeQL's html-injection queries are suppressed for that file via `.github/codeql/codeql-config.yml`; the rest of the workspace stays under full analysis, so any new html-injection pattern introduced _outside_ that file is a real finding.

## Acknowledgements

Reporters who follow this policy and confirm a real vulnerability are credited in the published security advisory unless they prefer to remain anonymous.
