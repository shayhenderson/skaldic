# Code signing policy

**Status:** installers are currently unsigned, and Windows SmartScreen may warn about an unknown publisher (the [README](../README.md#install) explains how to proceed). Code signing for the Windows installers is planned as the project grows; once it is active, every installer published on the [Releases](https://github.com/shayhenderson/skaldic/releases) page will carry a signature that Windows verifies.

## Build and signing process

Releases are built by the project's public CI pipeline ([release workflow](../.github/workflows/release.yml)) from the source in this repository, on a `v*` tag push. Since v0.2.1, only binaries produced by that pipeline are published (v0.1.0 and v0.2.0 were built locally by the maintainer), and each release is manually tested and approved by the maintainer before it goes live. Skaldic contains no proprietary components; see [NOTICE.md](../NOTICE.md) for third-party acknowledgments and licenses.

## Team and roles

Skaldic is maintained by a single developer, who holds all roles:

- **Shay Henderson** ([@shayhenderson](https://github.com/shayhenderson)): committer, reviewer, and release approver.

## Privacy policy

Skaldic does not collect, store, or transmit any personal data or telemetry.

The app's only network access: on launch it contacts `shayhenderson.dev`, which redirects to GitHub Releases, to check for a newer version and, if you accept, downloads the update (see [RELEASING.md](RELEASING.md) for how updates are signed and verified). No user information is sent beyond what any HTTPS request implies. Songs, projects, and settings are stored only on your machine.
