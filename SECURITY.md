# Security Policy

We take the security of Ping Monitor seriously. Thank you for helping keep the
project and its users safe.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately through GitHub's built-in flow:

1. Go to the **[Security tab](https://github.com/jodacame/ping-monitor/security/advisories/new)** of this repository.
2. Click **"Report a vulnerability"**.
3. Describe the issue with enough detail to reproduce it.

This keeps the report private between you and the maintainers until a fix is
released. No email is involved.

A helpful report ideally includes:

- The affected component (API, worker, scheduler, notifier, web) and version/commit.
- Steps to reproduce, or a proof of concept.
- The impact you believe it has (e.g. data exposure, auth bypass, RCE).
- Any suggested remediation, if you have one.

## What to expect

- **Acknowledgement** of your report as soon as it is triaged.
- An assessment of severity and, when confirmed, a fix on a private branch.
- **Coordinated disclosure**: we publish a GitHub Security Advisory (and request a
  CVE when warranted) once a patch is available, crediting you unless you prefer to
  stay anonymous.

Please give us reasonable time to release a fix before any public disclosure.

## Supported versions

Ping Monitor is pre-1.0 and evolving quickly. Security fixes target the latest
`main`. Pin to a released tag and update regularly.

## Scope & hardening notes

The application ships with security-focused defaults that operators **must** review
before exposing it to the internet:

- Set a strong, unique `JWT_SECRET` (`openssl rand -base64 48`). Never ship the
  example/default value.
- Keep self-service registration closed (`ALLOW_REGISTRATION=false`, the default).
  The first account is always allowed so you can complete setup; open registration
  only if you deliberately want a public sign-up.
- Serve the API and dashboard over HTTPS/TLS (terminate at your proxy).
- Restrict database and Redis to the internal network; never expose them publicly.
- Use scoped, expiring, IP-restricted **API keys** for automation, and prefer
  read-only keys where possible.
- Keep rate limiting and security headers enabled (they are on by default).

Configuration mistakes (e.g. a public database, a default secret) are the operator's
responsibility, but we welcome documentation improvements that help others avoid them.
