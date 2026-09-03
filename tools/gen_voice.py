#!/usr/bin/env python3
"""Bake radio DJ / AM news / nav voice lines with ElevenLabs into assets/audio/voice/*.mp3.
Usage: python tools/gen_voice.py [--force]. Key in secrets/elevenlabs.txt. Existing files are skipped.
The game falls back silently to text-only radio + no nav voice when a file is missing."""
import json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'audio', 'voice')
KEY = open(os.path.join(ROOT, 'secrets', 'elevenlabs.txt')).read().strip()
H = {'xi-api-key': KEY, 'Content-Type': 'application/json'}

LINES = {
    # Surf FM DJ (laid-back male)
    'surf_1': ('Roger', "You're listening to Surf FM, one oh one point five, Pelican Point's home for sunset sessions."),
    'surf_2': ('Roger', "Coming up, more waves and more tunes. Traffic on Ocean Avenue is moving easy this afternoon."),
    'surf_3': ('Roger', "That was the sound of summer. This is Surf FM."),
    'surf_4': ('Roger', "Big swell rolling in at the pier tonight. Bring a jacket, it's cooling off out there."),
    'surf_5': ('Roger', "Surf FM. Keep it locked, we've got the whole coast covered."),
    # KJAZ (warm storyteller)
    'jazz_1': ('George', "This is KJAZ, eighty eight point nine. Late night jazz for the coast road."),
    'jazz_2': ('George', "Stay with us on KJAZ, as the tide comes in."),
    'jazz_3': ('George', "Slow it down. You're cruising with KJAZ."),
    # KPCH AM traffic & weather (confident female)
    'kpch_1': ('Sarah', "KPCH six forty, coast traffic and weather. Pacific Coast Highway is clear through the tunnels. Watch for fog north of the canyon bridge."),
    'kpch_2': ('Sarah', "KPCH weather. Sunny and seventy two at the pier, with a marine layer moving in after sunset."),
    'kpch_3': ('Sarah', "Traffic update. Signals on Ocean Avenue are cycling normally. Expect delays near the pier lot."),
    'kpch_4': ('Sarah', "This is KPCH. Drive safe out there."),
    # navigation prompts (neutral)
    'nav_left': ('River', "Turn left."),
    'nav_right': ('River', "Turn right."),
    'nav_left_300': ('River', "In three hundred feet, turn left."),
    'nav_right_300': ('River', "In three hundred feet, turn right."),
    'nav_straight': ('River', "Continue straight."),
    'nav_uturn': ('River', "Make a U-turn when possible."),
    'nav_arrived': ('River', "You have arrived."),
    'nav_start': ('River', "Starting route."),
    'nav_recalc': ('River', "Route recalculated."),
    # dispatcher
    'dispatch_new': ('Sarah', "New delivery. The pickup is on your nav."),
    'dispatch_done': ('Sarah', "Nice work. Payment's in."),
}


def voices():
    req = urllib.request.Request('https://api.elevenlabs.io/v1/voices', headers=H)
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    return {v['name'].split(' - ')[0]: v['voice_id'] for v in data['voices']}


def tts(voice_id, text):
    body = {'text': text, 'model_id': 'eleven_turbo_v2_5', 'voice_settings': {'stability': 0.45, 'similarity_boost': 0.8, 'style': 0.25}}
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_64', data=json.dumps(body).encode(), headers=H)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def main():
    os.makedirs(OUT, exist_ok=True)
    force = '--force' in sys.argv
    ids = voices()
    for name, (voice, text) in LINES.items():
        path = os.path.join(OUT, name + '.mp3')
        if os.path.exists(path) and not force:
            print('skip', name); continue
        vid = ids.get(voice)
        if not vid:
            print('no voice', voice, 'for', name); continue
        print('tts', name, flush=True)
        open(path, 'wb').write(tts(vid, text))
    print('done', len(os.listdir(OUT)), 'files')


if __name__ == '__main__':
    main()
