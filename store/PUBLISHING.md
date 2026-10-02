# Publishing Zenith on the Chrome Web Store

Everything in this folder is ready for the submission. Only the account and
the final click have to be done by the publisher.

## 1. Create a developer account (once)

1. Open <https://chrome.google.com/webstore/devconsole> and sign in with
   the Google account that should own the extension.
2. Accept the developer agreement and pay the one-time registration fee
   (5 USD).
3. Verify the contact email address in *Account*.

## 2. Build the package

```sh
./store/build-zip.sh
```

This creates `store/zenith-<version>.zip` with only the files the extension
needs (no README, no store graphics).

## 3. Create the item

1. In the dashboard, click **New item** and upload the ZIP.
2. **Store listing**: copy name, summary, description and category from
   `store/listing.md`. Upload:
   - Icon: `icons/icon128.png`
   - Screenshots: `store/screenshots/1-new-tab.png` … `5-settings.png`
   - Small promo tile: `store/promo-small.png`
   - Marquee promo tile (optional): `store/promo-marquee.png`
3. **Privacy practices**: copy the single purpose, the permission
   justifications, "no remote code" and the data usage answers from
   `store/listing.md`, and paste the privacy policy URL.
4. **Distribution**: Public, all regions (or choose regions).
5. Click **Submit for review**. Reviews usually take a few days; the
   dashboard and email tell you when Zenith is live.

## 4. Updates

1. Raise `"version"` in `manifest.json` (e.g. 1.0.0 → 1.0.1).
2. Run `./store/build-zip.sh`.
3. In the dashboard: **Package → Upload new package**, then submit again.
   Installed copies update automatically after approval.
