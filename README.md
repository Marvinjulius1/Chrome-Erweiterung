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
css/                 Styles (base, clock, panel, features)
js/                  ES modules (main, storage, time, background image, unsplash, greeting, quote,
                     clock, panel, settings, shortcuts, onboarding)
data/config.json     Time slots, image categories, image settings
data/images.json     Background photos (Unsplash License)
data/greetings.json  Greetings per time slot ({name} is replaced)
data/quotes.json     Thoughts of the day (author only when the attribution is reliable)
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

## Thought of the Day

About 10 seconds after the tab opens, the greeting cross-fades into the
thought of the day. Click the text or press Space to switch back and forth.
The quote is chosen from the date, so it stays the same all day; every quote
in `data/quotes.json` is shown once before any repeats. Hover the quote and
click the heart to save it as a favorite.

## Keyboard shortcuts

| Key          | Action                            |
|--------------|-----------------------------------|
| Space        | Switch greeting / thought of the day |
| N            | New background image              |
| ← / →        | Previous / next background image  |
| S            | Open or close settings            |
| Esc          | Close                             |

## Settings

Move the mouse and a small round button appears in the bottom-right corner.
It opens a glass panel with:

- **General**: your name
- **Clock**: six styles with live previews (Digital, Digital + seconds,
  Analog, Flip, Words, Stacked), position above / below / beside the
  greeting, 12-hour / 24-hour / system format, seconds and date
- **Time zone**: device time or any city in the world (searchable). Clock,
  greeting and image slot follow the selected zone.
- **Background**: image behavior (follow the time of day, new image every
  tab, favorites only), photo categories and an optional Unsplash key
- **Thought of the Day**: automatic switch on or off, and its delay

Settings are stored in `chrome.storage.sync` and apply instantly in every
open tab.

### Optional: your own Unsplash key

1. Create a free account at <https://unsplash.com/developers> and register a
   new application.
2. Copy its **Access Key** and paste it into *Settings → Background*.
3. Zenith checks the key and from then on loads new photos from the Unsplash
   API, using each time slot's `query` from `data/config.json`. The built-in
   collection is the fallback whenever the API is unavailable.

## Photos

Every photo in `data/images.json` is published under the
[Unsplash License](https://unsplash.com/license). The photographer is credited
in the bottom-left corner (visible on hover). Photos are cached locally, so the
new tab also works offline.

## Privacy

No tracking, no analytics, no external fonts. Settings live in
`chrome.storage`; images are fetched directly from the Unsplash CDN.
