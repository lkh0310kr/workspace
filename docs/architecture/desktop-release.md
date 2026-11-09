# Desktop release policy

Release scope follows actual platform use. A platform that is not currently used must not block shipping a verified build for an active platform. Build and validate inactive platforms when their use resumes or when a user explicitly requests a release for them.

## Release checklist

- Bump the desktop app version and keep the Git tag aligned as `v<version>`.
- Build from a clean, pushed commit and sign the native package for the active platform.
- Verify the installer/archive, embedded updater configuration, update metadata, and a clean app launch.
- Publish updater metadata and install assets together so `electron-updater` can find the correct package.
- Record signing, notarization, and platform coverage in the release notes. Do not imply a platform is supported by a release when its native package has not been built and checked.
- Keep platform builds separate. Native dependencies must match the target OS and architecture; cross-built installers are not accepted without checking their native modules.
- Treat Windows/macOS/other platform build pipelines as on-demand for platforms outside current use. Do not spend release time on unused targets by default.

The current Workspace release focus is macOS Apple Silicon. Windows builds are deferred while Windows is not in active use. This is a prioritization rule, not a claim that the Windows package is currently validated.
