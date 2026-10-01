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
background.js        Service worker: finishes focus sessions and notifies
css/                 Styles (base, clock, panel, features)
js/                  ES modules (main, storage, time, background image, unsplash, greeting, quote,
                     clock, panel, settings, shortcuts, onboarding, audio)
js/features/         Focus mode, intention, to-do, notes, links, sounds, breathing, zen, help
data/config.json     Time slots, image categories, image settings
data/images.json     Background photos (Unsplash License)
data/greetings.json  Greetings per time slot ({name} is replaced)
data/quotes.json     Thoughts of the day (author only when the attribution is reliable)
data/sounds.json     Ambient sounds (synthesized, or your own files in /sounds)
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

| Key          | Action                                          |
|--------------|-------------------------------------------------|
| Space        | Greeting / thought of the day (pause in focus)  |
| F            | Start or end focus mode                         |
| N            | New background image                            |
| ← / →        | Previous / next background image                |
| Z            | Zen mode (only image and clock)                 |
| B            | Breathing exercise                              |
| S            | Settings                                        |
| ?            | Show all shortcuts                              |
| Esc          | Close / leave                                   |

## Extras (hidden until you need them)

Open the menu with the small round button in the bottom-right corner.

**Today**
- **Quick links**: up to six favorite sites as small icons (only in the menu)
- **Daily intention**: "What's your main focus today?" One line under the
  clock; click it to mark it done. Resets at midnight.
- **Today's tasks**: up to five. Finished tasks clear at midnight, open ones
  carry over.
- **Notes**: a small notepad, saved on this device

**Tools**
- **Focus mode**: Pomodoro timer (25/5 by default, adjustable) with a
  progress ring. Everything except the clock and the timer fades away.
  A chime and a notification mark the end of each phase; completed sessions
  are counted per day. The timer runs in the background, so it also finishes
  when no tab is open.
- **Breathing**: a one-minute exercise (in 4, hold 2, out 6) with a calm,
  animated circle
- **Ambient sound**: Rain, Forest, Ocean, Wind. Synthesized live, so no audio
  files are needed; see `sounds/README.md` to use your own recordings.

**Zen mode** (Z) hides everything except the photo and the clock.

## Settings

The Settings tab of the menu (or press S) contains:

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

Permissions: `storage` (settings and your data), `alarms` and
`notifications` (to finish a focus session on time and tell you about it).
