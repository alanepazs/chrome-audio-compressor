import random
import colorsys
import os

random.seed(7)

W = H = 512
CX, CY = W / 2, H / 2

# ---------- Waveform (spectrum) ----------
N_BARS = 70
PAD_X = 34
usable = W - 2 * PAD_X
bar_slot = usable / N_BARS
bar_w = bar_slot * 0.62
MAX_AMP = 176      # half-height at the edges
MIN_FRAC = 0.11     # how thin it gets at the very center (not zero)

def lerp(a, b, t):
    return a + (b - a) * t

def hue_lerp(c1, c2, t):
    # Interpolate through HSV, taking the shorter hue path, so the midpoint
    # stays vibrant (magenta -> red -> orange -> yellow -> lime) instead of
    # collapsing into a muddy brown like a direct RGB blend would.
    h1, s1, v1 = colorsys.rgb_to_hsv(*(c / 255 for c in c1))
    h2, s2, v2 = colorsys.rgb_to_hsv(*(c / 255 for c in c2))
    diff = h2 - h1
    if diff > 0.5:
        diff -= 1
    elif diff < -0.5:
        diff += 1
    h = (h1 + diff * t) % 1.0
    s = lerp(s1, s2, t)
    v = lerp(v1, v2, t)
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return f"rgb({round(r*255)},{round(g*255)},{round(b*255)})"

MAGENTA = (236, 20, 150)
LIME = (198, 255, 26)

bars = []
for i in range(N_BARS):
    t = i / (N_BARS - 1)          # 0..1 left->right
    d = abs(t - 0.5) * 2           # 0 at center, 1 at edges
    shape = d ** 1.5
    jitter = 1 + (random.random() - 0.5) * 0.35 * (0.35 + 0.65 * d)
    amp = MAX_AMP * (MIN_FRAC + (1 - MIN_FRAC) * shape) * jitter
    amp = max(amp, MAX_AMP * MIN_FRAC * 0.8)
    x = PAD_X + i * bar_slot + (bar_slot - bar_w) / 2
    color = hue_lerp(MAGENTA, LIME, t)
    y1 = CY - amp
    y2 = CY + amp
    bars.append(
        f'<line x1="{x + bar_w/2:.2f}" y1="{y1:.2f}" x2="{x + bar_w/2:.2f}" y2="{y2:.2f}" '
        f'stroke="{color}" stroke-width="{bar_w:.2f}" stroke-linecap="round" />'
    )

waveform_svg = "\n      ".join(bars)

# ---------- Hands (stylized fist + forearm) ----------
GAP = 96          # vertical gap between the two fists' facing edges, centered on CY
FIST_H = 128
FIST_W = 250
FIST_X = (W - FIST_W) / 2

TOP_FIST_BOTTOM = CY - GAP / 2          # front (facing) edge of the top fist
TOP_FIST_TOP = TOP_FIST_BOTTOM - FIST_H
BOTTOM_FIST_TOP = CY + GAP / 2          # front (facing) edge of the bottom fist
BOTTOM_FIST_BOTTOM = BOTTOM_FIST_TOP + FIST_H

FOREARM_OVERLAP = 46  # how far the forearm reaches into the fist, hidden under it (avoids a "floating ball" look)

def fist_group(color_top, color_bottom, flip, glow_id):
    """flip=False => top hand pushing down. flip=True => bottom hand pushing up (mirrored)."""
    if not flip:
        forearm = (
            f'<rect x="196" y="-10" width="120" height="{TOP_FIST_TOP + FOREARM_OVERLAP + 10:.1f}" rx="40" '
            f'fill="url(#{color_top})" />'
        )
        fist = (
            f'<rect x="{FIST_X}" y="{TOP_FIST_TOP:.1f}" width="{FIST_W}" height="{FIST_H}" '
            f'rx="58" fill="url(#{color_top})" />'
        )
        thumb = (
            f'<rect x="{FIST_X - 34}" y="{TOP_FIST_TOP + 30:.1f}" width="60" height="72" rx="28" '
            f'fill="url(#{color_top})" />'
        )
        knuckle_cy = TOP_FIST_BOTTOM - 38
        knuckles = "".join(
            f'<circle cx="{kx}" cy="{knuckle_cy:.1f}" r="17" fill="{color_bottom}" opacity="0.3" />'
            for kx in (198, 240, 282, 324)
        )
    else:
        forearm_top = BOTTOM_FIST_BOTTOM - FOREARM_OVERLAP
        forearm = (
            f'<rect x="196" y="{forearm_top:.1f}" width="120" height="{H + 10 - forearm_top:.1f}" '
            f'rx="40" fill="url(#{color_top})" />'
        )
        fist = (
            f'<rect x="{FIST_X}" y="{BOTTOM_FIST_TOP:.1f}" width="{FIST_W}" height="{FIST_H}" '
            f'rx="58" fill="url(#{color_top})" />'
        )
        thumb = (
            f'<rect x="{FIST_X - 34}" y="{BOTTOM_FIST_BOTTOM - 30 - 72:.1f}" width="60" height="72" rx="28" '
            f'fill="url(#{color_top})" />'
        )
        knuckle_cy = BOTTOM_FIST_TOP + 38
        knuckles = "".join(
            f'<circle cx="{kx}" cy="{knuckle_cy:.1f}" r="17" fill="{color_bottom}" opacity="0.3" />'
            for kx in (198, 240, 282, 324)
        )

    return f"""
    <g filter="url(#{glow_id})">
      {forearm}
      {thumb}
      {fist}
      {knuckles}
    </g>
    """

svg = f"""<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d1424"/>
      <stop offset="100%" stop-color="#05070d"/>
    </linearGradient>
    <linearGradient id="orange" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffb020"/>
      <stop offset="100%" stop-color="#ff5a1f"/>
    </linearGradient>
    <linearGradient id="blue" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#00c2ff"/>
      <stop offset="100%" stop-color="#0057ff"/>
    </linearGradient>
    <radialGradient id="pinchGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="softshadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>

  <rect x="0" y="0" width="{W}" height="{H}" rx="96" fill="url(#bg)" />

  <circle cx="{CX}" cy="{CY}" r="60" fill="url(#pinchGlow)" />

  <g>
    {waveform_svg}
  </g>

  {fist_group('orange', '#ff5a1f', False, 'softshadow')}
  {fist_group('blue', '#0057ff', True, 'softshadow')}
</svg>
"""

OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons", "icon.svg")
with open(OUT_PATH, "w", encoding="utf-8") as f:
    f.write(svg)

print("SVG written to", os.path.normpath(OUT_PATH), "-", len(svg), "chars")
