# Zenith – Privacy Policy

_Last updated: October 2, 2026_

Zenith is a new tab extension for Chrome. It is built to collect nothing about
you.

## What Zenith stores

Everything you enter stays in your own browser:

| Data | Where it is stored |
|------|--------------------|
| Your name, settings, quick links | `chrome.storage.sync` (synced by Chrome across your own signed-in browsers, if Chrome Sync is on) |
| Tasks, notes, daily intention, favorite photos and quotes, focus session counts | `chrome.storage.local` (this device only) |
| Cached background photos | The browser's Cache Storage (this device only) |
| Optional Unsplash Access Key | `chrome.storage.sync` |

The developer of Zenith has no server and no access to any of this data.
Uninstalling the extension deletes it.

## What Zenith does not do

- No analytics, tracking, advertising or telemetry
- No accounts and no sign-in
- No selling or sharing of data with anyone
- No reading of your browsing history, tabs or web pages
- No remote code: all code ships inside the extension

## Network requests

Zenith only connects to:

- **images.unsplash.com**, to download the background photos. Like any image
  request, this exposes your IP address to Unsplash.
- **api.unsplash.com**, only if you enter your own Unsplash Access Key in the
  settings, to fetch photos and report photo usage as the Unsplash API
  guidelines require.

Unsplash's own privacy policy applies to these requests:
<https://unsplash.com/privacy>.

## Permissions

- `storage`: save your settings and the data listed above
- `alarms`: end a focus session on time, even when no tab is open
- `notifications`: tell you when a focus session or break has ended

## Changes

If this policy changes, the new version will be published at this address
with a new date.

## Contact

Questions about privacy: please open an issue at
<https://github.com/Marvinjulius1/Chrome-Erweiterung/issues>.
