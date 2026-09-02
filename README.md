# Highway One

A first-person driving simulator set on a fictional stretch of the Pacific Coast Highway: the beach town of Pelican Point, its pier, and the cliff road north. Everything is built in code — no downloaded models, textures, or sounds — and it runs in a browser.

**Play:** https://samizdat-publications.github.io/highway-one/

## What it is
- Driver's-seat view only, with a working cockpit: steering wheel, speedometer and tach, warning lights, turn signals, mirrors, wipers, shifter, pedals, nav screen, radio.
- A regular sedan with a proper drivetrain: automatic by default, or a manual with a clutch you can stall.
- Free roam, deliveries, a driving-test mode that grades you on the rules of the road, and time trials.
- Day/night cycle, fog, rain with wet roads, ocean surf, traffic that stops at lights.
- Keyboard, Xbox-style gamepad, or a wheel and pedals.

## Run locally
```
python serve.py
```
Then open http://localhost:8432. ES modules must be served over http (opening the file directly will not work).

## Tech
three.js r185 (vendored), ES modules with an import map, no bundler, no npm, Web Audio for all sound.
