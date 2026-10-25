/**
 * JON Stream — Cloudflare AI image-upscaling proof of concept.
 *
 * IMPORTANT:
 * - This processes ONE uploaded still image per request, not a live HLS stream.
 * - It uses Cloudflare Images AI upscaling ("upscale: generate"), not a custom
 *   temporal video super-resolution model.
 * - Keep this endpoint private while testing. Do not place API_TOKEN in the
 *   browser or in JON Stream's public HTML.
 */
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        service: "JON Stream AI image-upscale test",
        status: "ready",
        mode: "single-image-test-only",
        liveVideo: false,
      });
    }

    if (url.pathname !== "/upscale") {
      return json({ error: "Not found" }, 404);
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { allow: "POST", "cache-control": "no-store" },
      });
    }

    if (!env.API_TOKEN) {
      return json({ error: "Server is not configured: API_TOKEN secret is missing" }, 503);
    }

    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${env.API_TOKEN}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    const contentType = (request.headers.get("content-type") || "")
      .split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) {
      return json({ error: "Send a JPEG, PNG, or WebP image" }, 415);
    }

    const statedLength = Number(request.headers.get("content-length") || 0);
    if (statedLength > MAX_INPUT_BYTES) {
      return json({ error: "Image exceeds the 5 MB test limit" }, 413);
    }

    if (!env.IMAGES) {
      return json({ error: "Cloudflare Images binding IMAGES is not configured" }, 503);
    }

    const width = Number(url.searchParams.get("width") || 1280);
    const height = Number(url.searchParams.get("height") || 720);
    if (
      !Number.isInteger(width) || !Number.isInteger(height) ||
      width < 160 || height < 90 || width > 1920 || height > 1080
    ) {
      return json({ error: "Output dimensions must be 160x90 through 1920x1080" }, 400);
    }

    try {
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (!bytes.byteLength) return json({ error: "Empty image body" }, 400);
      if (bytes.byteLength > MAX_INPUT_BYTES) {
        return json({ error: "Image exceeds the 5 MB test limit" }, 413);
      }

      const transformed = await env.IMAGES
        .input(bytes)
        .transform({
          width,
          height,
          fit: "scale-up",
          upscale: "generate",
        })
        .output({ format: "image/webp", quality: 85 });

      const response = transformed.response();
      const headers = new Headers(response.headers);
      headers.set("content-type", "image/webp");
      headers.set("cache-control", "no-store");
      headers.set("x-content-type-options", "nosniff");
      headers.set("x-jon-ai-mode", "single-image-upscale-test");

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (error) {
      console.error("JON Stream image upscaling failed", error);
      return json({
        error: "Image upscaling failed",
        detail: "Check Cloudflare Images binding, account access, and transformation quota.",
      }, 502);
    }
  },
};
