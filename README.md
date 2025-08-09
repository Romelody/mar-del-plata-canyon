# Mar del Plata Canyon

Minimal prototype for a browser game intro screen using JetBrains Mono.

## Run locally

Use any static server. On macOS you can run:

```
npx serve -s .
```

Then open the printed URL.

## Config

- Intro duration is configurable via query string:
  - `/?introMs=4000` → 4 seconds

## Structure

- `index.html` — markup for intro and game screens
- `styles.css` — styling and transitions
- `main.js` — logic to auto-advance or click PLAY to start
