# Boc release runbook

This runbook covers the private GitHub release archive and the public Electron update feed for Boc Beta.

## Delivery model

- GitHub remains private. Each successful run creates a private GitHub Release with the desktop installers, updater metadata, blockmaps, and SHA-256 checksums.
- Cloudflare R2 serves only the public update files through `https://boc-updates.bergdev.de`.
- Installer names contain the version and are immutable. The four `latest*.yml` files are the only mutable objects and are uploaded after every platform artifact has been built and validated.
- The existing Electron updater reads the generic R2 feed. No GitHub token is shipped in the application.

The release workflow is `.github/workflows/boc-release.yml`. Release preparation and R2 publishing live under `packages/boc/scripts/release/`.

## One-time infrastructure

The `boc-releases` R2 bucket and its `boc-updates.bergdev.de` custom domain must exist. Keep the bucket's development `r2.dev` URL disabled; the custom domain is the production endpoint.

Create an R2 API token with Object Read & Write access scoped only to `boc-releases`. Store its S3-compatible credentials in GitHub; never commit them or pass them as command-line arguments.

Create a GitHub environment named `release` and restrict deployment branches to `boc-beta`. Add these environment values:

| Kind     | Name                                        | Purpose                                                     |
| -------- | ------------------------------------------- | ----------------------------------------------------------- |
| Variable | `CLOUDFLARE_ACCOUNT_ID`                     | Builds the account-scoped R2 S3 endpoint.                   |
| Secret   | `R2_ACCESS_KEY_ID`                          | R2 S3-compatible access key.                                |
| Secret   | `R2_SECRET_ACCESS_KEY`                      | R2 S3-compatible secret key.                                |
| Secret   | `MACOS_CERTIFICATE_P12`                     | Base64-encoded Developer ID Application certificate export. |
| Secret   | `MACOS_CERTIFICATE_PASSWORD`                | Password of the certificate export.                         |
| Secret   | `APPLE_API_KEY_P8_BASE64`                   | Base64-encoded App Store Connect API private key.           |
| Secret   | `APPLE_API_KEY_ID`                          | App Store Connect API key ID.                               |
| Secret   | `APPLE_API_ISSUER_ID`                       | App Store Connect API issuer ID.                            |

The Apple certificate must be valid for Developer ID distribution, and the API key must be allowed to submit notarization requests.

The workflow deliberately verifies macOS signing and notarization before anything becomes current in R2. Windows packages are intentionally unsigned and can therefore trigger Microsoft Defender SmartScreen warnings; add a signing provider and re-enable update signature verification before distributing Boc broadly to Windows users.

## Create a release

1. Finish and verify the intended commit on `boc-beta`.
2. Choose a new stable semantic version such as `0.1.0`. Prerelease versions are intentionally rejected because the desktop updater follows the stable `latest` channel.
3. Open **Actions → Boc release → Run workflow**, select `boc-beta`, and enter the version without a leading `v`.
4. Wait for all six desktop builds and the publish job. The workflow builds macOS, Windows, and Linux packages for x64 and arm64 on GitHub-hosted runners.
5. Confirm that the private GitHub Release `v<version>` is published and that the public update manifests return the same version:

   ```sh
   curl -fsS https://boc-updates.bergdev.de/latest.yml
   curl -fsS https://boc-updates.bergdev.de/latest-mac.yml
   curl -fsS https://boc-updates.bergdev.de/latest-linux.yml
   curl -fsS https://boc-updates.bergdev.de/latest-linux-arm64.yml
   ```

6. Install the package on each supported operating system. Starting with the second release, keep the previous version installed on at least one machine and confirm that **Check for Updates** downloads and installs the new version.

GitHub Actions usage in a private repository is billed against the account's included minutes and configured spending limits. macOS minutes are usually the largest part of one release.

## Safe retries and failures

- A release tag may be retried only from the same commit. Prefer GitHub's **Re-run failed jobs** so the publish job reuses the original build artifacts.
- Existing versioned R2 objects are reused only when their size and SHA-512 checksum match. A different file with the same name is rejected instead of overwritten.
- A failed build or macOS signing check never changes an updater manifest.
- A publish interruption can be retried with the preserved artifacts. A complete rebuild can produce different signed bytes even from the same commit; in that case, use a new patch version rather than replacing immutable objects.
- Do not delete old assets as part of a routine release. Ship a newer patch version to supersede a bad release.

## Local release validation

Given downloaded per-platform workflow artifacts under `release/input`, validate and merge them without Cloudflare credentials:

```sh
bun packages/boc/scripts/release/publish.ts \
  --dir release/input \
  --manifests-dir release/manifests \
  --version 0.1.0 \
  --dry-run
```

The real publisher uses the AWS CLI rather than Wrangler object upload because desktop installers can exceed Wrangler's single-object upload limit. Wrangler remains the administration tool for the bucket and custom domain.
