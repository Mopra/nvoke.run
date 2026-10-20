"""Real world clips for the nvoke films, made locally and for free.

Stills with Z-Image Turbo, then image to video with Wan 2.2 TI2V 5B, both
through ComfyUI's API. Runs on a 12 GB GPU (RTX 4070 Ti): a still takes
about 15 s, a clip (81 frames at 24 fps, 3.4 s) about 3.5 minutes. The
decode is tiled so a clip fits in 32 GB of RAM next to other work.

How to run:

    # ComfyUI with the models z_image_turbo_bf16, qwen_3_4b, ae (Z-Image) and
    # wan2.2_ti2v_5B_fp16, umt5_xxl_fp8_e4m3fn_scaled, wan2.2_vae (Wan), on :8189:
    python main.py --port 8189 --output-directory <out> --input-directory <in>
    python apps/video/scripts/real-clips.py still magnet 11 22 33 44
    # copy the chosen still into <in> as magnet.png, then:
    python apps/video/scripts/real-clips.py video magnet magnet.png 20 7
    # copy <out>/video/magnet_7_00001_.mp4 to apps/video/public/real/magnet.mp4

What we learned (docs/video.md, "Real world clips"):
- Never name a brand in a prompt: "in the style of Braun" printed BRAUN on
  the device. Say "unbranded, no text" instead.
- Wan 5B is good at light, texture and slow camera moves, weak at actions:
  a finger will not press a key, a ball will not snap to a magnet. Generate
  a few seeds, use the first second, and cut away before it melts.
"""

import json
import sys
import time
import urllib.request
import uuid

HOST = "http://127.0.0.1:8189"
W, H = 1280, 704

LOOK = (
    "Minimalist industrial design product photography, shot on a macro lens, "
    "shallow depth of field, soft studio key light from the top left, deep black background, "
    "subtle film grain, photorealistic, high detail. "
)

DEVICE = (
    "A small premium unbranded hardware device, a dark graphite anodized aluminium body with a matte charcoal top plate, "
    "a single square signal orange keycap, a black glass display strip with a dot matrix of tiny round LEDs. "
    "The plate is completely blank: no logo, no brand name, no printed text anywhere. "
)

STILLS = {
    "city": "Cinematic film still, anamorphic lens, shallow depth of field, moody low key light, cold desaturated tones with a single warm signal orange accent, 35mm film grain, photorealistic. " + "Aerial view straight down at a dense European city at night, a grid of apartment and office windows, "
    "most windows dark, many lit cold white like dots, a few glowing warm orange.",
    "server": "Cinematic film still, anamorphic lens, shallow depth of field, moody low key light, cold desaturated tones with a single warm signal orange accent, 35mm film grain, photorealistic. " + "Extreme macro of a black server rack in a dark data center, rows of tiny round status LEDs glowing cold white, "
    "one single LED glowing signal orange in focus, the rest falling into bokeh.",
    "pen": "Cinematic film still, anamorphic lens, shallow depth of field, moody low key light, cold desaturated tones with a single warm signal orange accent, 35mm film grain, photorealistic. " + "Extreme macro of the nib of a black fountain pen touching thick cream paper, wet ink line, "
    "warm orange rim light from the side, dark background.",
    "letterbox": "Cinematic film still, anamorphic lens, shallow depth of field, moody low key light, cold desaturated tones with a single warm signal orange accent, 35mm film grain, photorealistic. " + "Close-up of a polished brass letterbox slot in a dark navy painted front door, "
    "a crisp white envelope halfway pushed through the slot, morning light raking across the door.",
    "shutter": "Cinematic film still, anamorphic lens, shallow depth of field, moody low key light, cold desaturated tones with a single warm signal orange accent, 35mm film grain, photorealistic. " + "A small independent shop at dawn, the metal roller shutter half raised, warm orange light spilling out "
    "onto a wet empty pavement, blue hour street.",
    "magnet": "Cinematic film still, anamorphic lens, shallow depth of field, moody low key light, cold desaturated tones with a single warm signal orange accent, 35mm film grain, photorealistic. " + "Macro product shot of a heavy horseshoe magnet painted signal orange with steel tips, standing on a black surface, "
    "a single polished steel ball bearing resting in front of it, black background, studio rim light.",
    "keycap": LOOK + DEVICE + "Extreme close-up of a fingertip about to press the orange keycap, the keycap glows faintly, "
    "the aluminium edge catches the light.",
    "display": LOOK + DEVICE + "Extreme close-up of the black dot matrix display strip at a low angle, rows of tiny round LEDs, "
    "some lit warm white and a few lit signal orange, reflections on the glass, the rest of the device falls out of focus.",
    "street": "Cinematic film still, a quiet street of small independent shops in London at blue hour before dawn, "
    "wet cobblestones, shop windows dark, one bakery window glowing warm orange, desaturated cold tones except the orange light, "
    "anamorphic lens, shallow depth of field, 35mm film grain, photorealistic.",
}

MOTION = {
    "city": "The camera slowly descends over the city, windows switch off one after another until only a few orange windows remain glowing. "
    "Slow, quiet, cinematic.",
    "server": "The status LEDs blink rapidly in cold white, the orange LED pulses steadily. Very slow rack focus and slow camera slide. Cinematic.",
    "pen": "The fountain pen nib glides across the paper leaving a wet ink line, slow and smooth. Static macro camera. Cinematic.",
    "letterbox": "The white envelope slides through the brass letterbox slot and falls inside, the brass flap swings shut. Static camera. Cinematic.",
    "shutter": "The metal roller shutter rolls up smoothly, warm orange light floods out onto the wet pavement. Static camera, slow push in. Cinematic.",
    "magnet": "The steel ball bearing rolls slowly away from the orange horseshoe magnet toward the camera across the black surface. "
    "The magnet stays still. Static macro camera. Cinematic.",
    "keycap": "The fingertip presses the orange keycap down slowly and releases it, the key sinks and springs back, "
    "the orange glow pulses once. Slow camera push in. Macro product shot, studio light.",
    "display": "The LEDs on the dot matrix display light up one by one from left to right in white and orange, like a display waking up. "
    "Very slow camera slide along the strip. Macro product shot.",
    "press": "The fingertip resting on the orange keycap pushes it down firmly, the key sinks into the aluminium body and the orange glow "
    "flares brighter, then the finger lifts and the key springs back up. Static camera, macro product shot, studio light.",
    "street": "Lights in the shop windows switch on one after another down the street in warm orange, a light mist drifts, "
    "slow dolly forward along the street. Cinematic, still and quiet.",
}

NEGATIVE = (
    "text, watermark, logo, words, letters, blurry, low quality, distorted, deformed fingers, extra fingers, cartoon, "
    "illustration, oversaturated, jitter, flicker"
)


def post(path: str, body: dict) -> dict:
    req = urllib.request.Request(HOST + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())


def run(graph: dict) -> dict:
    pid = post("/prompt", {"prompt": graph, "client_id": str(uuid.uuid4())})["prompt_id"]
    t0 = time.time()
    while True:
        hist = json.loads(urllib.request.urlopen(f"{HOST}/history/{pid}").read())
        if pid in hist:
            entry = hist[pid]
            if entry.get("status", {}).get("status_str") == "error":
                raise SystemExit(json.dumps(entry["status"], indent=1)[:3000])
            print(f"  done in {time.time() - t0:.0f} s")
            return entry["outputs"]
        time.sleep(3)


def still(name: str, seed: int) -> None:
    g = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b.safetensors", "type": "lumina2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": STILLS[name]}},
        "6": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["5", 0]}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0],
                                                   "seed": seed, "steps": 9, "cfg": 1.0, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1.0}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": f"still_{name}_{seed}"}},
    }
    print(f"still {name} seed {seed}")
    run(g)


def video(name: str, image: str, steps: int, seed: int = 7) -> None:
    g = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "wan2.2_ti2v_5B_fp16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "wan2.2_vae.safetensors"}},
        "4": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": 8}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": MOTION[name]}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": NEGATIVE}},
        "7": {"class_type": "LoadImage", "inputs": {"image": image}},
        "8": {"class_type": "Wan22ImageToVideoLatent", "inputs": {"vae": ["3", 0], "start_image": ["7", 0], "width": W, "height": H, "length": 81, "batch_size": 1}},
        "9": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["8", 0],
                                                   "seed": seed, "steps": steps, "cfg": 5.0, "sampler_name": "uni_pc", "scheduler": "simple", "denoise": 1.0}},
        "10": {"class_type": "VAEDecodeTiled", "inputs": {"samples": ["9", 0], "vae": ["3", 0], "tile_size": 512, "overlap": 64, "temporal_size": 32, "temporal_overlap": 8}},
        "11": {"class_type": "CreateVideo", "inputs": {"images": ["10", 0], "fps": 24}},
        "12": {"class_type": "SaveVideo", "inputs": {"video": ["11", 0], "filename_prefix": f"video/{name}_{seed}", "format": "mp4", "codec": "h264"}},
    }
    print(f"video {name} from {image}, {steps} steps")
    run(g)


if __name__ == "__main__":
    cmd, name, *rest = sys.argv[1:]
    if cmd == "still":
        for s in rest:
            still(name, int(s))
    else:
        video(name, rest[0], int(rest[1]) if len(rest) > 1 else 20, int(rest[2]) if len(rest) > 2 else 7)
