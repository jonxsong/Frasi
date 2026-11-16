# Security policy

## Reporting a vulnerability

Please use GitHub’s private **Report a vulnerability** flow for this repository. Do not open a
public issue containing exploit steps, credentials, personal data, or private audio. Include the
affected commit, impact, reproduction, and any suggested mitigation. Maintainers should
acknowledge a complete report within five business days.

## Supported version

Security fixes target the current `main` branch until tagged release support windows are
published.

## Security boundaries

Frasi treats uploaded audio, account data, refresh sessions, storage keys, and integration
credentials as sensitive. The application validates decoded media, enforces ownership at the API,
stores objects privately, rotates refresh tokens, rate-limits sensitive routes, and rejects known
development JWT secrets in production mode.

Deployers remain responsible for HTTPS, network isolation, managed-secret storage, database and
object backups, credential rotation, retention/deletion policy, monitoring, and timely dependency
updates. YouTube/Spotify reference support is metadata/embed-only and is not authorization to
download or process protected content.
