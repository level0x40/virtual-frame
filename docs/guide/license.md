# License

Virtual Frame is released under the [Source Available License 1.0](https://github.com/level0x40/virtual-frame/blob/main/LICENSE) (SAL-1.0). The legal text is authoritative; this page is a plain-English summary for readers evaluating Virtual Frame for production use, because the label "source available" is easy to misread as "commercial restrictions apply."

## Virtual Frame is free to use commercially

Installing `virtual-frame` and `@virtual-frame/*` as dependencies in your application, shipping that application to customers, embedding it in paid services, running it behind a login, or selling access to it — **all of this is explicitly permitted, without payment and without notice.** There is no revenue threshold, no user-count threshold, and no disclosure requirement. Section 2(a) of the license grants this use "without limitation."

You can also view and study the source code, and you can fork the repository to contribute improvements back to the official project.

## What the restrictions actually target

The restrictions in Section 3 are about protecting the project itself, not about gating end-user adoption:

- **No code reuse in other libraries.** You may not copy non-trivial portions of Virtual Frame's source into other MFE libraries, frameworks, or software. This protects the project from being absorbed into a competitor.
- **No redistributing the source as part of another work.** Shipping applications that _depend on_ Virtual Frame is fine; repackaging Virtual Frame's source code into a different published library is not.
- **No VF-as-a-service.** You may not offer Virtual Frame's functionality — microfrontend projection, DOM mirroring, cross-frame state synchronization — as a managed, hosted, or embedded service to third parties. Using VF inside your own product's stack is permitted; reselling VF itself is not.

If you are building an application, a SaaS product, an internal platform, a commercial website, or an embedded experience, none of these restrictions apply to you.

## Decision tree

- **Building a product or service that uses Virtual Frame as a dependency?** → Free to use commercially, no notice required.
- **Building internal tools at your company on top of Virtual Frame?** → Free to use, same terms.
- **Publishing an open-source project that depends on Virtual Frame?** → Allowed; the dependency relationship is explicitly permitted.
- **Forking the repo to prototype a fix you intend to contribute back?** → Allowed under Section 2(c).
- **Building another microfrontend library and copying parts of the source?** → Not permitted. Contact the maintainers at [hello@level0x40.com](mailto:hello@level0x40.com) to discuss.
- **Building a hosted "microfrontend projection service" and selling VF's functionality?** → Not permitted. Contact the maintainers.

## Contributions

Contributions submitted via pull request are covered by Section 4. You retain copyright over your contribution; you grant the maintainers a perpetual, sublicensable license to use, modify, and distribute that contribution under the project's license. This is the standard outbound=inbound pattern; it lets the project ship your change without a separate CLA round-trip.

## Why SAL-1.0 rather than MIT or Apache

Virtual Frame is maintained by a small team (Level 0x40 Labs) that wants the upside of an open, readable codebase — external contributions, public scrutiny, security review — while retaining the ability to sustain the project commercially. SAL-1.0 is a deliberate middle ground: it removes every barrier to _using_ the software (which is the primary thing most people want from an open-source license) and holds a line against being forked-and-rebranded into a competing product or hosted service.

If your organization has a hard policy against non-OSI-approved licenses, that policy will apply here, and we'd rather surface it up front than have you discover it mid-adoption. For most teams the practical result of SAL-1.0 is indistinguishable from a permissive license — you depend on it, you ship, you don't pay, you don't notify anyone.

## Questions

For anything the license doesn't clearly cover, reach out at [hello@level0x40.com](mailto:hello@level0x40.com). Written approval for uses outside Section 2 is available under Section 6 and can be granted by email.
