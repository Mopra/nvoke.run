"""Teaser audio for the nvoke launch film: voice lines, sound kit and beat.

Everything is made locally and for free: the voice with Kokoro (kokoro-onnx),
the sound kit and the beat from plain synthesis (numpy and scipy, no samples).
Output goes to apps/video/public/teaser/ (gitignored).

How to run (any folder outside the repo works for the venv and the models):

    python -m venv .venv
    .venv/Scripts/python -m pip install kokoro-onnx soundfile numpy scipy matplotlib
    # models from https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
    #   kokoro-v1.0.onnx and voices-v1.0.bin, both into one folder
    .venv/Scripts/python apps/video/scripts/teaser-audio.py kit
    .venv/Scripts/python apps/video/scripts/teaser-audio.py voice --models path/to/models
    .venv/Scripts/python apps/video/scripts/teaser-audio.py check --png path/to/spectrograms

Subcommands:
    kit     sfx/*.wav, beat.wav and beat.json
    voice   voice/<voice id>/l01.wav to l09.wav and preview.wav
    check   prints duration, peak, RMS, DC and clipping for every file, and
            optionally renders spectrograms of beat, ping and magnet
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48_000
REPO = Path(__file__).resolve().parents[3]
OUT = REPO / "apps" / "video" / "public" / "teaser"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def secs(n: float) -> int:
    """Seconds to a sample count at SR."""
    return int(round(n * SR))


def t_axis(dur: float) -> np.ndarray:
    return np.arange(secs(dur)) / SR


def db(x: float) -> float:
    return 20 * np.log10(max(x, 1e-12))


def norm(x: np.ndarray, peak_db: float) -> np.ndarray:
    """Peak normalize to peak_db dBFS."""
    p = np.max(np.abs(x))
    return x if p == 0 else x * (10 ** (peak_db / 20) / p)


def fades(x: np.ndarray, fade_in: float = 0.0005, fade_out: float = 0.005) -> np.ndarray:
    """Short raised cosine fades so the file starts and ends at zero."""
    x = x.copy()
    n_in, n_out = secs(fade_in), secs(fade_out)
    if n_in:
        x[:n_in] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n_in))
    if n_out:
        x[-n_out:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, n_out))
    return x


def env_exp(dur: float, tau: float, attack: float = 0.0) -> np.ndarray:
    """Exponential decay with an optional linear attack."""
    t = t_axis(dur)
    e = np.exp(-t / tau)
    if attack > 0:
        e *= np.clip(t / attack, 0, 1)
    return e


def bandpass(x: np.ndarray, lo: float, hi: float, order: int = 4) -> np.ndarray:
    sos = signal.butter(order, [lo, hi], btype="bandpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def highpass(x: np.ndarray, f: float, order: int = 2) -> np.ndarray:
    sos = signal.butter(order, f, btype="highpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lowpass(x: np.ndarray, f: float, order: int = 4) -> np.ndarray:
    sos = signal.butter(order, f, btype="lowpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def sweep(f0: float, f1: float, dur: float, tau: float | None = None) -> np.ndarray:
    """Sine whose pitch glides from f0 to f1 (exponential glide when tau is set)."""
    t = t_axis(dur)
    if tau is None:
        f = f0 * (f1 / f0) ** (t / dur)
    else:
        f = f1 + (f0 - f1) * np.exp(-t / tau)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def shaped_noise(dur: float, center, width_oct: float, rng: np.random.Generator) -> np.ndarray:
    """White noise filtered by a moving band: center(t) in Hz, width in octaves.

    Done in the STFT domain, so the band can move freely without filter state.
    """
    n = secs(dur)
    noise = rng.standard_normal(n + 4096)
    f, frames_t, z = signal.stft(noise, fs=SR, nperseg=1024)
    logf = np.log2(np.maximum(f, 1.0))[:, None]
    c = np.log2(np.array([center(min(tt, dur)) for tt in frames_t]))[None, :]
    z *= np.exp(-0.5 * ((logf - c) / (width_oct / 2)) ** 2)
    _, y = signal.istft(z, fs=SR, nperseg=1024)
    return y[:n]


def write(path: Path, x: np.ndarray, sr: int = SR) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), np.clip(x, -1, 1).astype(np.float32), sr, subtype="PCM_16")


# ---------------------------------------------------------------------------
# Sound kit
# ---------------------------------------------------------------------------


def make_tick(freq: float = 4200.0, dur: float = 0.03, seed: int = 1) -> np.ndarray:
    """A dry digital detent: a few cycles of a high sine over a tiny noise spike."""
    rng = np.random.default_rng(seed)
    t = t_axis(dur)
    tone = np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.0025)
    spike = highpass(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.0007)
    body = np.sin(2 * np.pi * 1100 * t) * np.exp(-t / 0.004) * 0.25
    return fades(tone + 0.5 * spike + body, 0.0002, 0.004)


def make_key(seed: int, body_hz: float, bright: float, dur: float = 0.05) -> np.ndarray:
    """Mechanical key: switch click (filtered noise), plate tick and a short body thock."""
    rng = np.random.default_rng(seed)
    t = t_axis(dur)
    click = bandpass(rng.standard_normal(len(t)), 1800, 1800 + 4500 * bright) * np.exp(-t / 0.0025)
    plate = np.sin(2 * np.pi * (2400 + 900 * bright) * t) * np.exp(-t / 0.003) * 0.3
    thock = np.sin(2 * np.pi * body_hz * t + 0.6 * np.sin(2 * np.pi * body_hz * 1.5 * t)) * env_exp(dur, 0.012, 0.001)
    # Bottom out: a second, softer click a few milliseconds after the first.
    d = secs(0.007 + 0.002 * bright)
    bottom = np.zeros_like(t)
    bottom[d:] = click[: len(t) - d] * 0.45
    return fades(highpass(click + plate + 0.9 * thock + bottom, 60), 0.0002, 0.006)


def make_click() -> np.ndarray:
    """Trackpad or mouse click: lower, fuller and a little longer than a key."""
    rng = np.random.default_rng(7)
    dur = 0.08
    t = t_axis(dur)
    snap = bandpass(rng.standard_normal(len(t)), 900, 4500) * np.exp(-t / 0.003)
    body = sweep(260, 140, dur, tau=0.01) * env_exp(dur, 0.018, 0.0008)
    knock = np.sin(2 * np.pi * 1300 * t) * np.exp(-t / 0.004) * 0.35
    return fades(highpass(snap + 1.2 * body + knock, 50), 0.0002, 0.01)


def make_ping(freq: float, dur: float = 0.4) -> np.ndarray:
    """Clean high sine with a whisper of octave and soft exponential decay."""
    t = t_axis(dur)
    tone = np.sin(2 * np.pi * freq * t) + 0.12 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t / 0.05)
    return fades(tone * env_exp(dur, 0.11, attack=0.002), 0.0, 0.03)


def make_thud(dur: float = 0.5) -> np.ndarray:
    """Deep sub thump: a falling sine from 95 to 38 Hz with a soft felt attack."""
    rng = np.random.default_rng(3)
    t = t_axis(dur)
    sub = sweep(95, 38, dur, tau=0.05) * env_exp(dur, 0.14, attack=0.003)
    felt = lowpass(rng.standard_normal(len(t)), 400) * np.exp(-t / 0.008) * 0.6
    x = np.tanh(1.4 * (sub + felt)) / np.tanh(1.4)
    return fades(highpass(x, 20), 0.0, 0.05)


def make_scan(dur: float = 1.2) -> np.ndarray:
    """A scan line passing: a narrow noise band rising from 250 Hz to 9 kHz."""
    rng = np.random.default_rng(11)
    band = shaped_noise(dur, lambda tt: 250 * (9000 / 250) ** (tt / dur), 0.6, rng)
    t = t_axis(dur)
    swell = np.sin(np.pi * t / dur) ** 1.5
    # A faint resonant whistle that follows the band gives it a laser edge.
    whistle = sweep(250, 9000, dur) * 0.04
    return fades(band * swell / np.max(np.abs(band)) + whistle * swell, 0.01, 0.05)


def make_air(dur: float = 1.6) -> np.ndarray:
    """The hero's turn: air moving past, a wide noise band that swells and
    falls from 400 Hz to 3 kHz and back, slightly different in each ear."""
    t = t_axis(dur)
    swell = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2.2
    ears = []
    for seed in (41, 42):
        rng = np.random.default_rng(seed)
        band = shaped_noise(dur, lambda tt: 400 * (3000 / 400) ** np.sin(np.pi * tt / dur), 1.4, rng)
        ears.append(band * swell / np.max(np.abs(band)))
    return np.stack([fades(e, 0.05, 0.2) for e in ears], axis=1)


def make_drop(dur: float = 1.4) -> np.ndarray:
    """A sub drop under the hero's first frame: 70 Hz falling to 32 Hz, a soft knock on top."""
    t = t_axis(dur)
    body = sweep(70, 32, dur, tau=0.35) * env_exp(dur, 0.5, attack=0.004)
    knock = np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.012) * 0.3
    return fades(np.tanh(1.4 * (body + knock)), 0.0, 0.15)


def make_roll(dur: float = 1.5) -> np.ndarray:
    """Counters spinning: ticks whose spacing shrinks from 110 ms to 16 ms."""
    out = np.zeros(secs(dur))
    rng = np.random.default_rng(5)
    t, k = 0.0, 0
    while t < dur - 0.04:
        p = t / dur
        tick = make_tick(3600 + 900 * rng.random(), seed=100 + k) * (0.45 + 0.55 * p)
        i = secs(t)
        n = min(len(tick), len(out) - i)
        out[i : i + n] += tick[:n]
        t += 0.016 + (0.11 - 0.016) * (1 - p) ** 2.2
        k += 1
    return fades(out, 0.0, 0.03)


def make_glitch(dur: float = 0.2) -> np.ndarray:
    """Digital stutter: a crushed square jumping pitch, then a repeated grain."""
    rng = np.random.default_rng(9)
    n = secs(dur)
    t = np.arange(n) / SR
    pitches = [220, 880, 330, 1760, 440, 660, 1320, 220]
    seg = n // len(pitches)
    f = np.repeat(pitches, seg)
    f = np.pad(f, (0, n - len(f)), mode="edge")
    sq = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR))
    sq += 0.5 * rng.standard_normal(n) * (t > dur * 0.55)
    # Sample and hold to 4 kHz, then quantize to 3 bits.
    hold = 12
    sq = np.repeat(sq[::hold], hold)[:n]
    sq = np.round(sq * 3) / 3
    # Stutter: the first 14 ms grain repeats four times with gaps.
    grain = secs(0.014)
    for r in range(4):
        start = secs(0.11 + r * 0.022)
        if start + grain <= n:
            sq[start : start + grain] = sq[:grain] * (0.9 - 0.15 * r)
            sq[start + grain : start + secs(0.022)] = 0
    gate = np.ones(n)
    gate[secs(0.07) : secs(0.085)] = 0
    x = lowpass(sq * gate, 11000)
    return fades(x * 0.6, 0.0005, 0.01)


def make_magnet(dur: float = 0.7) -> np.ndarray:
    """Falling whoosh pulled into a solid low snap at 0.42 s, then a short tail."""
    rng = np.random.default_rng(13)
    hit = 0.42
    t = t_axis(dur)
    pre = np.clip(t / hit, 0, 1)
    # Gate that closes over the last 6 ms before the snap, so the cut never clicks.
    gate = np.clip((hit - t) / 0.006, 0, 1)
    whoosh = shaped_noise(dur, lambda tt: 300 + 5700 * (1 - min(tt / hit, 1)) ** 2, 0.9, rng)
    whoosh = whoosh / np.max(np.abs(whoosh)) * (pre**2.5) * gate
    fall = sweep(1400, 90, dur) * (pre**3) * gate * 0.35
    th = np.maximum(t - hit, 0)
    on = t >= hit
    snap_low = np.sin(2 * np.pi * (55 + 90 * np.exp(-th / 0.012)) * th) * np.exp(-th / 0.09) * on
    snap_mid = np.sin(2 * np.pi * 1150 * th) * np.exp(-th / 0.006) * on * 0.5
    snap_noise = bandpass(rng.standard_normal(len(t)), 1500, 7000) * np.exp(-th / 0.002) * on * 0.6
    x = 0.55 * whoosh + fall + 1.3 * snap_low + snap_mid + snap_noise
    x = highpass(np.tanh(1.2 * x), 25)
    return fades(x, 0.01, 0.04)


def make_hum(dur: float = 4.0) -> np.ndarray:
    """Warm low drone. Every partial and the slow swell complete whole cycles in
    4 s, so the file loops seamlessly (sample 0 follows the last sample)."""
    t = t_axis(dur)
    partials = [(55.0, 1.0), (110.0, 0.45), (165.0, 0.18), (220.25, 0.08), (54.75, 0.35)]
    x = sum(a * np.sin(2 * np.pi * f * t) for f, a in partials)
    swell = 1 + 0.15 * np.sin(2 * np.pi * 0.5 * t)
    return x * swell


def build_sfx(out: Path) -> None:
    sfx = out / "sfx"
    kit = {
        "tick": (make_tick(), -6),
        "key": (make_key(21, 190, 0.6), -6),
        "key2": (make_key(22, 215, 0.4, dur=0.045), -7),
        "key3": (make_key(23, 170, 0.8, dur=0.055), -6.5),
        "click": (make_click(), -4),
        "ping": (make_ping(1318.51), -3),  # E6
        "ping_hi": (make_ping(1975.53), -3),  # B6, a fifth above
        "thud": (make_thud(), -1),
        "scan": (make_scan(), -6),
        "roll": (make_roll(), -4),
        "glitch": (make_glitch(), -9),
        "magnet": (make_magnet(), -1),
        "hum": (make_hum(), -20),
        "air": (make_air(), -8),
        "drop": (make_drop(), -2),
    }
    for name, (x, peak) in kit.items():
        write(sfx / f"{name}.wav", norm(x, peak))


# ---------------------------------------------------------------------------
# Beat: 100 BPM, 4/4, 12 bars, stops on beat 1 of the last bar
# ---------------------------------------------------------------------------

BPM = 100
BARS = 12
BEATS_PER_BAR = 4
BEAT = 60 / BPM
BAR = BEAT * BEATS_PER_BAR
SIXTEENTH = BEAT / 4


def drum_kick() -> np.ndarray:
    dur = 0.35
    t = t_axis(dur)
    body = sweep(150, 46, dur, tau=0.03) * env_exp(dur, 0.11, attack=0.0008)
    click = np.sin(2 * np.pi * 2500 * t) * np.exp(-t / 0.0012) * 0.25
    return fades(np.tanh(1.5 * (body + click)), 0.0, 0.03)


def drum_hat(seed: int = 0) -> np.ndarray:
    """Closed hat: six detuned squares (the 808 recipe) plus noise, band limited."""
    rng = np.random.default_rng(seed)
    dur = 0.05
    t = t_axis(dur)
    metal = sum(np.sign(np.sin(2 * np.pi * f * t)) for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0))
    x = bandpass(metal / 6 + 0.6 * rng.standard_normal(len(t)), 7000, 15000)
    return fades(x * np.exp(-t / 0.009), 0.0002, 0.008)


def drum_rim() -> np.ndarray:
    """Very dry rim: two short resonances and a crack of noise, 40 ms."""
    rng = np.random.default_rng(31)
    dur = 0.04
    t = t_axis(dur)
    x = (
        np.sin(2 * np.pi * 1720 * t) * np.exp(-t / 0.006)
        + 0.6 * np.sin(2 * np.pi * 480 * t) * np.exp(-t / 0.008)
        + 0.5 * bandpass(rng.standard_normal(len(t)), 2000, 6000) * np.exp(-t / 0.002)
    )
    return fades(x, 0.0002, 0.006)


def bass_note(freq: float, dur: float) -> np.ndarray:
    """Sub note with a touch of saturation so it reads on small speakers."""
    t = t_axis(dur)
    x = np.sin(2 * np.pi * freq * t) * env_exp(dur, dur * 0.45, attack=0.015)
    return fades(np.tanh(1.8 * x) / np.tanh(1.8), 0.0, 0.06)


def build_beat(out: Path) -> None:
    total = BARS * BAR
    mix = np.zeros((secs(total), 2))

    def place(x: np.ndarray, at: float, gain: float, pan: float = 0.0) -> None:
        i = secs(at)
        n = min(len(x), len(mix) - i)
        if n <= 0:
            return
        left, right = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
        mix[i : i + n, 0] += x[:n] * gain * left
        mix[i : i + n, 1] += x[:n] * gain * right

    tick, tick_lo = make_tick(), make_tick(3100, seed=2)
    kick, rim = drum_kick(), drum_rim()
    hats = [drum_hat(s) for s in range(4)]
    # One sub note per bar, a deadpan four bar cycle: A1, A1, F1, G1.
    roots = [55.0, 55.0, 43.65, 49.0]

    for bar in range(1, BARS + 1):
        b0 = (bar - 1) * BAR
        if bar == BARS:
            # Final bar: one hit on beat 1, then silence for the logo.
            place(kick, b0, 0.9)
            place(bass_note(55.0, 0.6), b0, 0.4)
            place(tick, b0, 0.3)
            break
        for step in range(16):
            at = b0 + step * SIXTEENTH
            beat, sub = divmod(step, 4)
            if bar <= 2:
                # Ticks only: quarters, the one accented, a quiet off-beat eighth.
                if sub == 0:
                    place(tick if beat == 0 else tick_lo, at, 0.55 if beat == 0 else 0.4)
                elif sub == 2:
                    place(tick_lo, at, 0.18)
                continue
            # Kick on 1 and 3; every second bar a pickup on the last sixteenth.
            if step in (0, 8) or (bar % 2 == 0 and step == 15):
                place(kick, at, 0.9 if step != 15 else 0.55)
            # Hats on eighths, off-beats a little louder, a 16th ghost now and then.
            if sub in (0, 2):
                place(hats[step % 4], at, 0.45 if sub == 2 else 0.3, pan=0.2)
            elif step == 13 and bar % 4 == 3:
                place(hats[1], at, 0.18, pan=0.2)
            # Rim on 2 and 4 from bar 7.
            if bar >= 7 and step in (4, 12):
                place(rim, at, 0.5, pan=-0.15)
            # Keep the detent tick on beat 1 as a through line.
            if step == 0:
                place(tick, at, 0.25)
            # Sub bass on the one.
            if step == 0:
                place(bass_note(roots[(bar - 3) % 4], BEAT * 1.5), at, 0.4)

    mix = norm(mix, -1.0)
    write(out / "beat.wav", mix)

    sections = [
        {"name": "ticks", "fromBar": 1, "toBar": 2, "startSeconds": 0.0, "endSeconds": round(2 * BAR, 3)},
        {"name": "kick and hat", "fromBar": 3, "toBar": 6, "startSeconds": round(2 * BAR, 3), "endSeconds": round(6 * BAR, 3)},
        {"name": "rim on 2 and 4", "fromBar": 7, "toBar": 11, "startSeconds": round(6 * BAR, 3), "endSeconds": round(11 * BAR, 3)},
        {"name": "stop", "fromBar": 12, "toBar": 12, "startSeconds": round(11 * BAR, 3), "endSeconds": round(12 * BAR, 3),
         "note": "one hit on beat 1, then silence for the logo"},
    ]
    meta = {
        "bpm": BPM,
        "bars": BARS,
        "beatsPerBar": BEATS_PER_BAR,
        "firstBeatSeconds": 0,
        "beatSeconds": BEAT,
        "barSeconds": BAR,
        "durationSeconds": round(total, 3),
        "sampleRate": SR,
        "sections": sections,
    }
    (out / "beat.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Voice (Kokoro)
# ---------------------------------------------------------------------------

# Kokoro's phonemizer already reads "nvoke" as en-voke (/ˈɛnvˈoʊk/).
LINES = [
    ("l01", "This is a lead."),
    ("l02", "These are three hundred."),
    ("l03", "Most of them are dead."),
    ("l04", "nvoke finds the ones that answer."),
    ("l05", "It reads their site."),
    ("l06", "It asks their mail server."),
    ("l07", "It writes the first line."),
    ("l08", "You send it."),
    ("l09", "nvoke."),
]

VOICES = {
    "af_heart": "en-us",  # calm female
    "am_michael": "en-us",  # dry male
    "bf_emma": "en-gb",  # British female
    "bm_george": "en-gb",  # British male
}


def trim(x: np.ndarray, sr: int, floor_db: float = -45.0, pad: float = 0.02) -> np.ndarray:
    """Cut leading and trailing silence below floor_db (5 ms RMS windows)."""
    win = max(1, int(sr * 0.005))
    rms = np.sqrt(np.convolve(x**2, np.ones(win) / win, mode="same"))
    loud = np.where(rms > 10 ** (floor_db / 20) * np.max(np.abs(x)))[0]
    if len(loud) == 0:
        return x
    a = max(0, loud[0] - int(pad * sr))
    b = min(len(x), loud[-1] + int(pad * sr))
    return x[a:b]


def tame_peaks(x: np.ndarray, crest_db: float = 14.0) -> np.ndarray:
    """Pull isolated plosive spikes (the k in "asks") down to crest_db above the
    speech RMS, so peak normalization does not leave one line quieter than the rest."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d

    active = np.abs(x) > 0.01 * np.max(np.abs(x))
    thr = np.sqrt(np.mean(x[active] ** 2)) * 10 ** (crest_db / 20)
    gain = np.minimum(1.0, thr / np.maximum(np.abs(x), 1e-9))
    gain = minimum_filter1d(gain, secs(0.004))
    gain = uniform_filter1d(gain, secs(0.002))
    return x * gain


def build_voice(out: Path, models: Path, speed: float) -> None:
    from kokoro_onnx import Kokoro

    kokoro = Kokoro(str(models / "kokoro-v1.0.onnx"), str(models / "voices-v1.0.bin"))
    for voice, lang in VOICES.items():
        clips = []
        for name, text in LINES:
            samples, sr = kokoro.create(text, voice=voice, speed=speed, lang=lang)
            x = signal.resample_poly(np.asarray(samples, dtype=np.float64), SR, sr)
            x = fades(trim(x, SR), 0.003, 0.015)
            x = norm(tame_peaks(highpass(x, 40)), -3.0)
            write(out / "voice" / voice / f"{name}.wav", x)
            clips.append(x)
        gap = np.zeros(secs(0.6))
        preview = np.concatenate([c for x in clips for c in (x, gap)][:-1])
        write(out / "voice" / voice / "preview.wav", preview)


# ---------------------------------------------------------------------------
# Check
# ---------------------------------------------------------------------------


def check(out: Path, png: Path | None) -> None:
    print(f"{'file':42} {'sec':>7} {'peak':>7} {'rms':>7} {'dc':>9} {'clip':>5} {'ends':>9}")
    for f in sorted(out.rglob("*.wav")):
        x, sr = sf.read(str(f), always_2d=True)
        mono = x.mean(axis=1)
        peak = np.max(np.abs(x))
        clip = int(np.sum(np.abs(x) >= 0.9999))
        ends = max(np.max(np.abs(x[0])), np.max(np.abs(x[-1])))
        print(
            f"{str(f.relative_to(out)):42} {len(x) / sr:7.3f} {db(peak):7.1f} "
            f"{db(np.sqrt(np.mean(mono**2))):7.1f} {np.mean(mono):9.5f} {clip:5d} {ends:9.5f}"
        )
    if png is None:
        return
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    png.mkdir(parents=True, exist_ok=True)
    for rel in ("beat.wav", "sfx/ping.wav", "sfx/magnet.wav"):
        x, sr = sf.read(str(out / rel), always_2d=True)
        mono = x.mean(axis=1)
        fig, (a1, a2) = plt.subplots(2, 1, figsize=(12, 6), sharex=True)
        a1.plot(np.arange(len(mono)) / sr, mono, linewidth=0.4)
        a1.set_ylabel("amplitude")
        nper = 2048 if len(mono) > sr else 512
        f, tt, s = signal.spectrogram(mono, fs=sr, nperseg=nper, noverlap=nper * 3 // 4)
        a2.pcolormesh(tt, f, 10 * np.log10(s + 1e-12), shading="auto", vmin=-120, vmax=-30)
        a2.set_yscale("symlog", linthresh=200)
        a2.set_ylim(20, sr / 2)
        a2.set_ylabel("Hz")
        a2.set_xlabel("s")
        fig.suptitle(rel)
        fig.tight_layout()
        fig.savefig(png / (Path(rel).stem + ".png"), dpi=80)
        plt.close(fig)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=["kit", "voice", "check"])
    p.add_argument("--out", type=Path, default=OUT)
    p.add_argument("--models", type=Path, help="folder with kokoro-v1.0.onnx and voices-v1.0.bin")
    p.add_argument("--speed", type=float, default=0.9)
    p.add_argument("--png", type=Path, help="check: folder for spectrogram PNGs")
    a = p.parse_args()
    if a.command == "kit":
        build_sfx(a.out)
        build_beat(a.out)
    elif a.command == "voice":
        if a.models is None:
            p.error("voice needs --models")
        build_voice(a.out, a.models, a.speed)
    else:
        check(a.out, a.png)


if __name__ == "__main__":
    main()
