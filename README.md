# Zenith

A calm, minimal new tab for Chrome. A beautiful photo for every time of day,
the time, a greeting with your name and a thought for the day. Nothing else,
unless you ask for it.

> Work in progress. This README will be expanded once all features are in.

## Install (developer mode)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (the one with `manifest.json`).
4. Open a new tab.

No build step, no dependencies.

## Project structure

```
manifest.json        Extension manifest (Manifest V3)
newtab.html          The new tab page
css/                 Styles (base, clock, features)
js/                  ES modules (main, storage, time, background image, greeting, clock, onboarding)
data/config.json     Time slots, image categories, image + quote settings
data/images.json     Background photos (Unsplash License)
data/greetings.json  Greetings per time slot ({name} is replaced)
fonts/               Inter + Cormorant Garamond (SIL Open Font License)
icons/               Extension icons (16/48/128 px) and the SVG source
```

## Time slots

| Slot        | Time          |
|-------------|---------------|
| Dawn        | 05:00 – 07:59 |
| Morning     | 08:00 – 11:59 |
| Day         | 12:00 – 16:59 |
| Golden Hour | 17:00 – 19:59 |
| Dusk        | 20:00 – 22:59 |
| Night       | 23:00 – 04:59 |

Edit them in `data/config.json`.

## Photos

Every photo in `data/images.json` is published under the
[Unsplash License](https://unsplash.com/license). The photographer is credited
in the bottom-left corner (visible on hover). Photos are cached locally, so the
new tab also works offline.

## Privacy

No tracking, no analytics, no external fonts. Settings live in
`chrome.storage`; images are fetched directly from the Unsplash CDN.
