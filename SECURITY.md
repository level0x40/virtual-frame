# Security Policy

We take the security of Virtual Frame seriously. This document explains how to report vulnerabilities, what's in scope, and what to expect after you report.

## Supported versions

Security fixes land on the latest minor release line of each package. We do not back-port to older minors.

| Package family               | Supported                          |
| ---------------------------- | ---------------------------------- |
| `virtual-frame` (core)       | Latest minor                       |
| `@virtual-frame/*` bindings  | Latest minor                       |
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

| Timeframe          | What we do                                                                 |
| ------------------ | -------------------------------------------------------------------------- |
| Within 3 business days  | Initial acknowledgement — we've received your report and are assessing it. |
| Within 10 business days | Triage outcome — confirmed, declined, or duplicate, with reasoning.        |
| Within 90 days     | Fix released, advisory published, and credit assigned (if accepted).       |

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

## Acknowledgements

Reporters who follow this policy and confirm a real vulnerability are credited in the published security advisory unless they prefer to remain anonymous.
