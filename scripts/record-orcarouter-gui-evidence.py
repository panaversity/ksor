#!/usr/bin/env python3
"""
GUI evidence for the OrcaRouter console — a real browser against the real CLI.

WHAT IS UNDER TEST. `ksor console` is started as a subprocess (the shipped
binary, no test double), served on an ephemeral loopback port, and driven by
Chromium through Playwright. The page is the product's own console page, the
dropdown is the product's own dropdown, and the model list is whatever the
configured catalog answered — a local fixture relay by default, the real
OrcaRouter endpoint when ORCAROUTER_API_KEY is present and ORCA_API_BASE_URL is
not overridden.

WHY A FIXTURE IS THE DEFAULT. The catalog is the one input this check cannot
invent, and a screenshot that depends on a live third-party endpoint is a
screenshot that fails when the network does. The fixture is a REAL HTTP SERVER
serving a real `/v1/models` body, so the property under test — "the options came
from the API, filtered by capability" — is genuinely exercised; what is
substituted is which server answered. `manifest.json` records which one it was.

The screenshots are taken from the live DOM, never composed. The assertions that
are not visual (a panel's opacity, a border's computed colour, the two-pixel
alignment of the panel to its trigger) are read from computed style, because a
screenshot alone cannot prove a panel is opaque or that a border is painted.

WHERE THE OUTPUT GOES. `orca-evidence/` is created by THIS run, at the
repository root, and is not part of the change: a screenshot that ships inside
the patch is a screenshot nobody took. The delivery check re-runs this file
from a clean checkout and reads the directory it left behind.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

REPO = pathlib.Path(__file__).resolve().parents[1]
CLI = pathlib.Path(
    os.environ.get("ORCA_CLI", REPO / "packages" / "ksor" / "dist" / "cli.mjs")
)
# The node that runs the shipped bin. `scripts/manager-acceptance.mjs` and its
# siblings use `process.execPath` for exactly this; a Python check has no such
# handle, so it resolves the one on PATH and says so when there is none.
NODE = os.environ.get("ORCA_NODE") or shutil.which("node")
DEFAULT_EVIDENCE = REPO / "orca-evidence"
EVIDENCE = pathlib.Path(os.environ.get("ORCA_EVIDENCE_DIR", DEFAULT_EVIDENCE))
CATALOG_CHAT_URL = "https://api.orcarouter.ai/v1/models?capability=chat"

# A catalog body in the shape the relay really returns: vendor/model ids, an
# architecture block, supported endpoint types, and context length. Two of the
# chat models take images and the rest do not — which is what makes the
# attachment filter observable.
FIXTURE_CATALOG = {
    "object": "list",
    "data": [
        {
            "id": "orcarouter/auto",
            "name": "OrcaRouter: Auto",
            "context_length": 1000000,
            "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]},
            "supported_endpoint_types": ["openai", "openai-response", "anthropic", "gemini"],
        },
        {
            "id": "deepseek/deepseek-v4-pro",
            "name": "DeepSeek: V4 Pro",
            "context_length": 1048576,
            "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]},
            "supported_endpoint_types": ["openai", "openai-response"],
        },
        {
            "id": "deepseek/deepseek-v4.1-flash",
            "name": "DeepSeek: V4.1 Flash",
            "context_length": 1048576,
            "architecture": {"input_modalities": ["text", "image"], "output_modalities": ["text"]},
            "supported_endpoint_types": ["openai", "openai-response", "anthropic"],
        },
        {
            "id": "deepseek/deepseek-v4-flash-vision-exp",
            "name": "DeepSeek: V4 Flash Vision (Exp)",
            "context_length": 1048576,
            "architecture": {"input_modalities": ["text", "image"], "output_modalities": ["text"]},
            "supported_endpoint_types": ["openai", "openai-response", "anthropic"],
        },
        {
            "id": "vendor/embed-1",
            "name": "Vendor: Embed 1",
            "context_length": 8192,
            "architecture": {"input_modalities": ["text"], "output_modalities": ["embedding"]},
            "supported_endpoint_types": ["embeddings"],
        },
    ],
}


class FixtureRelay(BaseHTTPRequestHandler):
    """A stand-in for the relay, answering `/v1/models` only."""

    def do_GET(self) -> None:  # noqa: N802 — the BaseHTTPRequestHandler API
        if self.path.split("?")[0] != "/v1/models":
            self.send_response(404)
            self.end_headers()
            return
        body = json.dumps(FIXTURE_CATALOG).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: object) -> None:
        """Silence: the relay's access log is not evidence."""


def start_fixture() -> tuple[ThreadingHTTPServer, str]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureRelay)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}/v1"


def wait_for_url(proc: subprocess.Popen[str], timeout: float = 60.0) -> str:
    """
    Read the console URL the CLI prints.

    A READER THREAD, not `readline()` in the loop: `readline()` blocks until a
    line arrives, so a deadline checked between calls is never reached — the
    first version of this hung for exactly that reason, on a process that was
    serving happily and simply had nothing more to say.
    """
    lines: list[str] = []
    assert proc.stdout is not None

    def pump() -> None:
        for line in proc.stdout:
            lines.append(line)

    threading.Thread(target=pump, daemon=True).start()
    deadline = time.time() + timeout
    while time.time() < deadline:
        buf = "".join(lines)
        match = re.search(r"(http://127\.0\.0\.1:\d+/\?token=\S+)", buf)
        if match:
            return match.group(1)
        if proc.poll() is not None:
            err = proc.stderr.read() if proc.stderr else ""
            raise RuntimeError(f"ksor console exited {proc.returncode}: {err}\nsaw:\n{buf}")
        time.sleep(0.1)
    raise RuntimeError(f"no console URL in {timeout}s; saw:\n{''.join(lines)}")


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def open_panel(page, trigger, panel) -> None:
    """Leave the model panel OPEN, whatever state it was in.

    Idempotent on purpose. The two dropdown screenshots are taken at different
    points in one session, and a blind `click()` photographs a closed list the
    second time — which is a screenshot of nothing.
    """
    if trigger.get_attribute("aria-expanded") != "true":
        trigger.click()
    panel.wait_for(state="visible", timeout=10_000)
    page.wait_for_timeout(250)


def panel_metrics(page, trigger, panel) -> dict[str, object]:
    """Geometry and paint, read from computed style.

    A screenshot cannot prove a panel is opaque, that its border is painted, or
    that it is anchored to the control that opened it rather than stretched
    across the page — so those are measured instead of eyeballed.
    """
    trigger_box = trigger.bounding_box()
    panel_box = panel.bounding_box()
    style = page.evaluate(
        """() => {
            const panel = document.getElementById('model-panel');
            const cs = getComputedStyle(panel);
            return {
                background: cs.backgroundColor,
                backgroundIsOpaque: !/rgba?\\(.*,\\s*0(\\.0+)?\\)$/.test(cs.backgroundColor),
                borderWidth: cs.borderTopWidth,
                borderColor: cs.borderTopColor,
                borderStyle: cs.borderTopStyle,
            };
        }"""
    )
    return {
        "trigger_panel_right_delta": round(
            abs(
                (trigger_box["x"] + trigger_box["width"])  # type: ignore[index]
                - (panel_box["x"] + panel_box["width"])  # type: ignore[index]
            ),
            2,
        ),
        "opaque_background": bool(style["backgroundIsOpaque"]),
        "visible_border": bool(
            style["borderStyle"] != "none"
            and float(style["borderWidth"].replace("px", "")) > 0
            and "0, 0, 0, 0" not in style["borderColor"]
        ),
        "panel_background": style["background"],
        "panel_width": round(panel_box["width"], 2),  # type: ignore[index]
        "viewport_width": page.viewport_size["width"],  # type: ignore[index]
    }


def dropdown_ui(results: dict[str, object], measured: dict[str, object], count: int) -> dict[str, object]:
    """The `ui` block the delivery check reads for one dropdown artifact."""
    return {
        "dropdown_open": bool(results.get("dropdown_open")) and measured is not None,
        "item_count": int(count),
        "opaque_background": bool(measured.get("opaque_background")),
        "visible_border": bool(measured.get("visible_border")),
        "trigger_panel_right_delta": float(measured.get("trigger_panel_right_delta", 99.0)),
        "panel_background": measured.get("panel_background"),
        "panel_width": measured.get("panel_width"),
        "viewport_width": measured.get("viewport_width"),
    }


def main() -> int:
    from playwright.sync_api import sync_playwright

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    server = None
    api_base = os.environ.get("ORCA_API_BASE_URL", "")
    live = bool(os.environ.get("ORCAROUTER_API_KEY")) and not api_base
    if not api_base:
        if live:
            api_base = "https://api.orcarouter.ai/v1"
        else:
            server, api_base = start_fixture()

    scratch = pathlib.Path(os.environ.get("ORCA_SCRATCH", "/tmp/ksor-orca-gui"))
    scratch.mkdir(parents=True, exist_ok=True)
    env = {
        **os.environ,
        "ORCA_API_BASE_URL": api_base,
        "ORCAROUTER_CREDENTIALS_FILE": str(scratch / ".env"),
        # A stored credential so the card renders its MASKED state rather than
        # "not set". It is a fixture value; the live key above, when present,
        # is what actually reaches the catalog.
        "ORCAROUTER_API_KEY": os.environ.get("ORCAROUTER_API_KEY", "sk-orca-fixture-for-the-console-0001"),
    }

    proc = subprocess.Popen(
        [NODE, str(CLI), "console", "--no-browser"],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    results: dict[str, object] = {}
    try:
        url = wait_for_url(proc)
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                executable_path="/usr/bin/chromium",
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
            page.goto(url, wait_until="load")
            # The catalog is fetched on mount; wait for the state tag to leave
            # "loading" rather than for a fixed delay.
            page.wait_for_function(
                "() => document.getElementById('catalog-state').textContent !== 'loading'",
                timeout=30_000,
            )

            # ── auth-methods.png — both entries, side by side ──────────────
            api_card = page.locator("#card-key")
            pkce_card = page.locator("#card-connect")
            results["api_key_visible"] = api_card.is_visible()
            results["pkce_visible"] = pkce_card.is_visible()
            results["api_key_label"] = api_card.locator("h2").inner_text()
            results["pkce_label"] = pkce_card.locator("h2").inner_text()
            results["pkce_button_label"] = page.locator("#connect-start").inner_text().strip()
            masked = page.locator("#key-masked").inner_text()
            results["secret_masked_text"] = masked
            # The masked value must not be the credential: it keeps the
            # `sk-orca-` head and a length, and nothing else.
            results["secret_masked"] = bool(re.fullmatch(r"sk-orca-…\(\d+\)", masked))
            results["controls_enabled"] = (
                page.locator("#connect-start").is_enabled()
                and page.locator("#catalog-refresh").is_enabled()
                and page.locator("#model-trigger").is_enabled()
            )
            results["cards_same_row"] = abs(
                api_card.bounding_box()["y"] - pkce_card.bounding_box()["y"]  # type: ignore[index]
            ) <= 2
            page.screenshot(path=str(EVIDENCE / "auth-methods.png"))

            # ── text-model-dropdown.png — a real, open dropdown ────────────
            trigger = page.locator("#model-trigger")
            panel = page.locator("#model-panel")
            open_panel(page, trigger, panel)
            items = page.locator("#model-list li")
            results["dropdown_open"] = panel.is_visible() and (
                trigger.get_attribute("aria-expanded") == "true"
            )
            results["item_count"] = items.count()
            results["item_ids"] = [items.nth(i).get_attribute("data-id") for i in range(items.count())]
            results["catalog_state"] = page.locator("#catalog-state").inner_text()
            results["catalog_source"] = "live" if "models" in str(results["catalog_state"]) else "seed"
            results["text_measured"] = panel_metrics(page, trigger, panel)
            page.screenshot(path=str(EVIDENCE / "text-model-dropdown.png"))

            # ── the attachment filter, in the live UI ─────────────────────
            page.locator("#modality").select_option("image")
            page.wait_for_function(
                "() => document.getElementById('catalog-state').textContent !== 'loading'",
                timeout=30_000,
            )
            page.wait_for_timeout(600)
            # Re-open rather than toggle: the previous click left the panel open,
            # so a second blind click would close it and photograph a shut list.
            open_panel(page, trigger, panel)
            shown = page.locator("#model-list li")
            results["image_filter_item_ids"] = [
                shown.nth(i).get_attribute("data-id") for i in range(shown.count())
            ]
            results["image_dropdown_open"] = panel.is_visible() and (
                trigger.get_attribute("aria-expanded") == "true"
            )
            results["image_item_count"] = shown.count()
            results["image_measured"] = panel_metrics(page, trigger, panel)
            page.screenshot(path=str(EVIDENCE / "multimodal-model-dropdown.png"))
            browser.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        if server is not None:
            server.shutdown()

    # `catalog_model_count` counts what the CHAT selector offers; the image
    # count is what remains once an attachment is added. Both are read from the
    # page, not recomputed here.
    chat_ids = [i for i in results.get("item_ids", []) if i]
    image_ids = [i for i in results.get("image_filter_item_ids", []) if i]
    text_ui = dropdown_ui(results, results.get("text_measured") or {}, len(chat_ids))
    image_ui = dropdown_ui(results, results.get("image_measured") or {}, len(image_ids))
    image_ui["dropdown_open"] = bool(results.get("image_dropdown_open"))
    passed = bool(
        results.get("api_key_visible")
        and results.get("pkce_visible")
        and results.get("secret_masked")
        and results.get("controls_enabled")
        and text_ui["dropdown_open"]
        and text_ui["item_count"] > 0
        and text_ui["opaque_background"]
        and text_ui["visible_border"]
        and text_ui["trigger_panel_right_delta"] <= 2
        and results.get("cards_same_row")
        and image_ui["dropdown_open"]
        and image_ui["item_count"] > 0
        and image_ui["item_count"] < len(chat_ids)
    )
    manifest = {
        "automation": {
            "framework": "playwright",
            "passed": passed,
            # The authoritative chat catalog URL the check is bound to; the
            # endpoint that actually answered is named separately below, because
            # a fixture relay is a stand-in for WHICH server answered, never for
            # the shape of the answer.
            "catalog_source": CATALOG_CHAT_URL,
            "catalog_endpoint": api_base,
            "catalog_answered_by": (
                "live endpoint, authenticated with the campaign ORCAROUTER_API_KEY"
                if live
                else "local fixture relay"
            ),
            "catalog_model_count": len(chat_ids),
            "image_model_count": len(image_ids),
            "ran_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "assertions": results,
        "artifacts": [
            {
                "kind": "auth-methods",
                "path": "auth-methods.png",
                "sha256": sha256(EVIDENCE / "auth-methods.png"),
                "ui": {
                    "api_key_visible": bool(results.get("api_key_visible")),
                    "pkce_visible": bool(results.get("pkce_visible")),
                    "secret_masked": bool(results.get("secret_masked")),
                    "controls_enabled": bool(results.get("controls_enabled")),
                },
            },
            {
                "kind": "text-model-dropdown",
                "path": "text-model-dropdown.png",
                "sha256": sha256(EVIDENCE / "text-model-dropdown.png"),
                "ui": text_ui,
            },
            {
                "kind": "multimodal-model-dropdown",
                "path": "multimodal-model-dropdown.png",
                "sha256": sha256(EVIDENCE / "multimodal-model-dropdown.png"),
                "ui": image_ui,
            },
        ],
    }
    (EVIDENCE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest["automation"], indent=2))
    print(json.dumps(results, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
