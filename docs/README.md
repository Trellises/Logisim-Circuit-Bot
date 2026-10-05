# Logisim Circuit Bot (desktop app)

A chat-style desktop app for CSCI-335 — no browser, no web page. Type or tap
what circuit you need, watch it simulate live (click the pins), then save a
ready-to-open Logisim file.

## Setup (one-time)

```
pip install customtkinter matplotlib
```

That's it — no API key, no account, no internet connection needed. Both
packages are free and open-source.

## Run

```
python logisim_chatbot_app.py
```

## What's in the library right now

- NOT / AND / OR / XOR gates
- Half adder
- Full adder
- 2-to-1 multiplexer (built from gates, so the selection logic is visible)

4-bit ripple carry adder, a 1-bit ALU, and MIPS pipeline stages are natural
next additions once this version is confirmed working.

## Files

- `logisim_chatbot_app.py` — the app (CustomTkinter GUI + embedded matplotlib
  circuit view)
- `circuits.py` — circuit geometry, the verified `.circ` file contents, and
  a small generic logic simulator shared by the live diagram and the saved
  file, so they can never disagree with each other

## Optional: looser natural-language matching

By default the app matches your request with simple keyword rules (fast,
free, no setup). If you want it to understand fuzzier phrasing, there's an
optional hook for Google's free-tier Gemini API in `logisim_chatbot_app.py`
— set `USE_GEMINI = True` near the top and run
`pip install google-generativeai`, then set your own free key with
`export GEMINI_API_KEY=your_key_here` before launching.
