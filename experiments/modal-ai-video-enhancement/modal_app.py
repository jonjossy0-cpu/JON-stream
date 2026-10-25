"""Isolated Modal GPU proof-of-concept for JON Stream frame enhancement.

This endpoint enhances individual image frames. It is NOT a live HLS proxy and
must not be wired into production playback until performance, cost, and quality
are measured.
"""
from __future__ import annotations

import hmac
import io
import os
from typing import Any

import modal
from fastapi import FastAPI, HTTPException, Request, Response

APP_NAME = "jon-stream-ai-frame-enhancer"
MODEL_URL = (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/"
    "v0.1.0/RealESRGAN_x4plus.pth"
)
MAX_UPLOAD_BYTES = 4 * 1024 * 1024
MAX_INPUT_PIXELS = 1280 * 720

app = modal.App(APP_NAME)

gpu_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("libgl1", "libglib2.0-0")
    .uv_pip_install(
        "numpy<2",
        "Pillow==10.4.0",
        "opencv-python-headless==4.10.0.84",
        "torch==2.1.2",
        "torchvision==0.16.2",
        "basicsr==1.4.2",
        "realesrgan==0.3.0",
    )
)

_upsampler: Any = None


def _get_upsampler() -> Any:
    """Load the model once per warm GPU container."""
    global _upsampler
    if _upsampler is not None:
        return _upsampler

    import torch
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer
    from urllib.request import urlretrieve

    weights_path = "/tmp/RealESRGAN_x4plus.pth"
    if not os.path.exists(weights_path):
        urlretrieve(MODEL_URL, weights_path)

    model = RRDBNet(
        num_in_ch=3,
        num_out_ch=3,
        num_feat=64,
        num_block=23,
        num_grow_ch=32,
        scale=4,
    )
    _upsampler = RealESRGANer(
        scale=4,
        model_path=weights_path,
        model=model,
        tile=256,
        tile_pad=10,
        pre_pad=0,
        half=bool(torch.cuda.is_available()),
    )
    return _upsampler


@app.function(image=gpu_image, gpu="T4", timeout=120, scaledown_window=120)
def enhance_frame(image_bytes: bytes) -> bytes:
    """Enhance one JPEG/PNG frame and return a WebP image."""
    import cv2
    import numpy as np
    from PIL import Image

    with Image.open(io.BytesIO(image_bytes)) as source:
        if source.width * source.height > MAX_INPUT_PIXELS:
            raise ValueError("Input frame exceeds the 1280x720 pixel limit")
        source.load()
        rgb = source.convert("RGB")

    bgr = cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2BGR)
    enhanced_bgr, _ = _get_upsampler().enhance(bgr, outscale=4)
    enhanced_rgb = cv2.cvtColor(enhanced_bgr, cv2.COLOR_BGR2RGB)

    output = io.BytesIO()
    Image.fromarray(enhanced_rgb).save(output, format="WEBP", quality=90, method=4)
    return output.getvalue()


web_image = modal.Image.debian_slim(python_version="3.10").uv_pip_install(
    "fastapi==0.115.6",
    "Pillow==10.4.0",
)
web_app = FastAPI(title="JON Stream AI Frame Enhancement")


@web_app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": APP_NAME,
        "mode": "single-frame-proof-of-concept",
        "live_hls": "not-enabled",
    }


@web_app.post("/enhance-frame")
async def enhance_endpoint(request: Request) -> Response:
    """Accept one image body; authenticate and cap bytes before GPU use."""
    expected_key = os.environ.get("JON_AI_API_KEY")
    supplied_key = request.headers.get("x-api-key")
    if not expected_key:
        raise HTTPException(
            status_code=503,
            detail="Service is not configured yet: add JON_AI_API_KEY as a Modal secret.",
        )
    if not supplied_key or not hmac.compare_digest(supplied_key, expected_key):
        raise HTTPException(status_code=401, detail="Invalid API key.")

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Image must be 4 MB or smaller.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid Content-Length header.")

    # Stream the body with a hard cap so oversized requests are rejected before
    # the entire payload is held in memory or any GPU work is started.
    body_buffer = bytearray()
    async for chunk in request.stream():
        if len(body_buffer) + len(chunk) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Image must be 4 MB or smaller.")
        body_buffer.extend(chunk)
    body = bytes(body_buffer)
    if not body:
        raise HTTPException(status_code=400, detail="Upload an image in the request body.")

    try:
        from PIL import Image

        with Image.open(io.BytesIO(body)) as image:
            image.verify()
            width, height = image.size
            if width * height > MAX_INPUT_PIXELS:
                raise HTTPException(
                    status_code=413, detail="Image must be 1280×720 pixels or smaller."
                )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=415, detail="Body must be a valid image.") from exc

    try:
        enhanced = await enhance_frame.remote.aio(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return Response(content=enhanced, media_type="image/webp")


@app.function(
    image=web_image,
    secrets=[modal.Secret.from_name("jon-stream-ai-secret")],
    timeout=120,
    scaledown_window=120,
)
@modal.asgi_app()
def api():
    return web_app
