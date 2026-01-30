#!/usr/bin/env python3
"""
Background Playwright screenshot streamer for Open-Inspect.

This module captures screenshots at regular intervals from a target URL
(typically the dev server preview) and streams them to the control plane.
The streamer runs in the background alongside the sandbox agent.

Usage:
    python -m sandbox.screenshot_streamer \
        --target-url http://localhost:5173 \
        --control-plane-url https://... \
        --session-id abc123 \
        --auth-token xyz789 \
        --interval 2.0

The streamer sends frames via HTTP POST to the control plane, which can
then broadcast them to connected web clients via WebSocket.
"""

import argparse
import asyncio
import base64
import signal
import time
from dataclasses import dataclass

import httpx
from playwright.async_api import Browser, Page, async_playwright


@dataclass
class StreamerConfig:
    """Configuration for the screenshot streamer."""

    target_url: str
    control_plane_url: str
    session_id: str
    auth_token: str
    interval: float = 2.0  # Seconds between screenshots
    viewport_width: int = 1280
    viewport_height: int = 720
    quality: int = 80  # JPEG quality (0-100)
    max_retries: int = 3
    retry_delay: float = 1.0


class ScreenshotStreamer:
    """
    Captures screenshots from a target URL and streams them to the control plane.

    The streamer runs a headless browser, navigates to the target URL,
    and periodically captures screenshots. Screenshots are base64-encoded
    and sent to the control plane via HTTP POST.
    """

    def __init__(self, config: StreamerConfig):
        self.config = config
        self.running = False
        self.browser: Browser | None = None
        self.page: Page | None = None
        self.frame_count = 0
        self.last_frame_hash: str | None = None
        self._http_client: httpx.AsyncClient | None = None

    async def start(self) -> None:
        """Start the screenshot streamer."""
        print("[streamer] Starting screenshot streamer")
        print(f"[streamer] Target URL: {self.config.target_url}")
        print(f"[streamer] Interval: {self.config.interval}s")

        self.running = True
        self._http_client = httpx.AsyncClient(timeout=30.0)

        # Wait for target URL to be available
        if not await self._wait_for_target():
            print("[streamer] Target URL never became available, exiting")
            return

        async with async_playwright() as p:
            self.browser = await p.chromium.launch(headless=True)
            self.page = await self.browser.new_page(
                viewport={
                    "width": self.config.viewport_width,
                    "height": self.config.viewport_height,
                }
            )

            # Navigate to target
            try:
                await self.page.goto(self.config.target_url, wait_until="networkidle")
                print(f"[streamer] Navigated to {self.config.target_url}")
            except Exception as e:
                print(f"[streamer] Failed to navigate: {e}")
                return

            # Start capture loop
            await self._capture_loop()

        if self._http_client:
            await self._http_client.aclose()

    async def stop(self) -> None:
        """Stop the screenshot streamer."""
        print("[streamer] Stopping...")
        self.running = False
        if self.browser:
            await self.browser.close()

    async def _wait_for_target(self, timeout: float = 60.0) -> bool:
        """Wait for the target URL to become available."""
        print("[streamer] Waiting for target URL to be available...")
        start = time.time()

        while time.time() - start < timeout:
            if not self.running:
                return False

            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    response = await client.get(self.config.target_url)
                    if response.status_code < 500:
                        print(f"[streamer] Target is available (status {response.status_code})")
                        return True
            except Exception:
                pass

            await asyncio.sleep(1.0)

        return False

    async def _capture_loop(self) -> None:
        """Main capture loop - takes screenshots at regular intervals."""
        while self.running:
            try:
                await self._capture_and_send()
            except Exception as e:
                print(f"[streamer] Capture error: {e}")

            await asyncio.sleep(self.config.interval)

    async def _capture_and_send(self) -> None:
        """Capture a screenshot and send it to the control plane."""
        if not self.page:
            return

        # Capture screenshot
        try:
            screenshot_bytes = await self.page.screenshot(
                type="jpeg",
                quality=self.config.quality,
                full_page=False,
            )
        except Exception as e:
            print(f"[streamer] Screenshot failed: {e}")
            return

        # Simple hash to detect duplicate frames
        import hashlib

        frame_hash = hashlib.md5(screenshot_bytes).hexdigest()[:16]

        # Skip if frame hasn't changed
        if frame_hash == self.last_frame_hash:
            return

        self.last_frame_hash = frame_hash
        self.frame_count += 1

        # Base64 encode
        frame_data = base64.b64encode(screenshot_bytes).decode("ascii")

        # Send to control plane
        await self._send_frame(frame_data, frame_hash)

    async def _send_frame(self, frame_data: str, frame_hash: str) -> None:
        """Send a frame to the control plane."""
        if not self._http_client:
            return

        endpoint = f"{self.config.control_plane_url}/sessions/{self.config.session_id}/stream-frame"

        payload = {
            "type": "screenshot_frame",
            "frameNumber": self.frame_count,
            "frameHash": frame_hash,
            "timestamp": time.time(),
            "imageData": frame_data,
            "imageType": "jpeg",
            "width": self.config.viewport_width,
            "height": self.config.viewport_height,
        }

        for attempt in range(self.config.max_retries):
            try:
                response = await self._http_client.post(
                    endpoint,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.config.auth_token}",
                        "Content-Type": "application/json",
                    },
                )

                if response.status_code == 200:
                    if self.frame_count % 10 == 0:  # Log every 10th frame
                        print(f"[streamer] Sent frame #{self.frame_count}")
                    return
                else:
                    print(f"[streamer] Frame send failed: {response.status_code}")
            except Exception as e:
                print(f"[streamer] Frame send error (attempt {attempt + 1}): {e}")
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)


async def main():
    parser = argparse.ArgumentParser(description="Screenshot streamer for Open-Inspect")
    parser.add_argument("--target-url", required=True, help="URL to capture screenshots from")
    parser.add_argument("--control-plane-url", required=True, help="Control plane URL")
    parser.add_argument("--session-id", required=True, help="Session ID")
    parser.add_argument("--auth-token", required=True, help="Sandbox auth token")
    parser.add_argument(
        "--interval", type=float, default=2.0, help="Screenshot interval in seconds"
    )
    parser.add_argument("--width", type=int, default=1280, help="Viewport width")
    parser.add_argument("--height", type=int, default=720, help="Viewport height")
    parser.add_argument("--quality", type=int, default=80, help="JPEG quality (0-100)")

    args = parser.parse_args()

    config = StreamerConfig(
        target_url=args.target_url,
        control_plane_url=args.control_plane_url,
        session_id=args.session_id,
        auth_token=args.auth_token,
        interval=args.interval,
        viewport_width=args.width,
        viewport_height=args.height,
        quality=args.quality,
    )

    streamer = ScreenshotStreamer(config)

    # Handle graceful shutdown
    loop = asyncio.get_event_loop()

    def handle_signal():
        asyncio.create_task(streamer.stop())

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, handle_signal)

    await streamer.start()


if __name__ == "__main__":
    asyncio.run(main())
