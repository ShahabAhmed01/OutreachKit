# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.0   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in OutreachKit, please report it by opening an issue on this repository.

**Do not** include credentials, session cookies, or access tokens in your report. If your report involves session data, describe the issue without reproducing or exposing actual credentials.

## Security Notes for Users

OutreachKit automates direct messages on Instagram and Facebook. Please keep the following in mind:

- **Platform Terms of Service:** Automated messaging may violate Instagram's or Facebook's Terms of Service. Use daily caps, delays, and schedule windows to reduce risk. You are responsible for compliance with platform policies.
- **Session data:** Your browser profile (including cookies and login session) is stored locally in the `profile/` directory. This directory is excluded from version control by `.gitignore`. Never commit or share it.
- **Configuration:** `config.json` stores your campaign settings. It does not store passwords. Review it before sharing backups.
- **Data:** Campaign data (commenters, sent messages, replies) is stored in CSV files under `data/`. Back these up regularly using the built-in backup feature.

## Dependency Security

This project uses `npm audit` to monitor dependencies. Vulnerability reports are addressed in dependency updates. See `package.json` for the pinned dependency set.
