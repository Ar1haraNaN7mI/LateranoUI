"""Check the distributable files and exercise the real standalone HTTP preview.

Uses only the Python standard library; no browser or installed DSH is required.
"""

from __future__ import annotations

import hashlib
import json
import queue
import re
import subprocess
import sys
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
import wave
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OMITTED = {"startup-visuals.js", "startup-emblem.js", "dsh-emblem.svg"}


class DocumentReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.resources = []
        self.style_options = []
        self.style_disabled = False
        self.in_style_select = False

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag in {"script", "img", "audio", "source", "video"} and values.get("src"):
            self.resources.append(values["src"])
        if tag == "link" and values.get("href"):
            self.resources.append(values["href"])
        if tag == "select" and values.get("id") == "visualStyle":
            self.in_style_select = True
            self.style_disabled = "disabled" in values
        if tag == "option" and self.in_style_select:
            self.style_options.append(values.get("value"))

    def handle_endtag(self, tag):
        if tag == "select":
            self.in_style_select = False


def resolve_resource(owner: Path, reference: str) -> Path | None:
    parsed = urllib.parse.urlsplit(reference)
    if parsed.scheme or parsed.netloc or not parsed.path:
        return None
    raw = urllib.parse.unquote(parsed.path)
    target = (DOCS / raw.lstrip("/") if raw.startswith("/") else owner.parent / raw).resolve()
    if not target.is_relative_to(DOCS.resolve()):
        raise AssertionError(f"Resource escapes the preview bundle: {reference}")
    return target


def preview_resources() -> set[Path]:
    start = DOCS / "startup-preview.html"
    found, pending = set(), [start]
    while pending:
        owner = pending.pop()
        if owner in found:
            continue
        if not owner.is_file():
            raise AssertionError(f"Missing preview resource: {owner.relative_to(DOCS)}")
        found.add(owner)
        refs = []
        if owner.suffix == ".html":
            parser = DocumentReferences()
            parser.feed(owner.read_text(encoding="utf-8"))
            refs.extend(parser.resources)
        if owner.suffix in {".html", ".css"}:
            refs.extend(re.findall(r"url\(\s*['\"]?([^)'\"\s]+)", owner.read_text(encoding="utf-8")))
        for reference in refs:
            target = resolve_resource(owner, reference)
            if target is not None:
                pending.append(target)
    return found


class BundleTests(unittest.TestCase):
    def test_referenced_resources_and_single_style(self):
        resources = preview_resources()
        self.assertGreaterEqual(len(resources), 10, "The test must inspect the full page, scripts, CSS and font")
        self.assertFalse(OMITTED.intersection(path.name for path in DOCS.rglob("*")), "The standalone package must not ship the removed art assets")
        self.assertTrue({"startup-laterano.js", "startup-laterano-ornaments.js", "startup-laterano-emblem.js", "startup-laterano.css"}.issubset(path.name for path in resources))
        self.assertTrue(any(path.suffix == ".woff2" for path in resources))
        parser = DocumentReferences()
        parser.feed((DOCS / "startup-preview.html").read_text(encoding="utf-8"))
        self.assertEqual(parser.style_options, ["laterano"])
        self.assertTrue(parser.style_disabled)
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertIs(package["private"], True)
        self.assertFalse(package.get("dependencies"))
        self.assertFalse(package.get("devDependencies"))

    def test_voice_files_match_published_manifest(self):
        folder = DOCS / "assets" / "voice"
        manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
        required = {f"phase-{index}.wav" for index in range(6)} | {"phase-3-mounted.wav", "load-warning.wav", "load-unavailable.wav"}
        clips = manifest["clips"]
        self.assertTrue(required.issubset(clip["file"] for clip in clips))
        for clip in clips:
            with self.subTest(clip=clip["file"]):
                target = (folder / clip["file"]).resolve()
                self.assertTrue(target.is_relative_to(folder.resolve()))
                self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), clip["sha256"])
                with wave.open(str(target), "rb") as audio:
                    self.assertEqual(audio.getnchannels(), clip["channels"])
                    self.assertEqual(audio.getframerate(), clip["sample_rate"])
                    self.assertEqual(audio.getnframes(), clip["frames"])
                    self.assertEqual(audio.getsampwidth(), 2)
                    self.assertEqual(audio.getcomptype(), "NONE")
        self.assertTrue((DOCS / "assets" / "dsh-laterano-emblem.svg").is_file())
        self.assertTrue((DOCS / "assets" / "dsh-laterano-desktop.ico").is_file())

    def test_actual_preview_server(self):
        process = subprocess.Popen(
            [sys.executable, "-u", str(ROOT / "scripts" / "preview.py"), "--port", "0"],
            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        output = queue.Queue()

        def read_output():
            for line in process.stdout:
                output.put(line)
            output.put(None)

        threading.Thread(target=read_output, daemon=True).start()
        try:
            log, base = [], None
            for _ in range(20):
                try:
                    line = output.get(timeout=1)
                except queue.Empty:
                    continue
                if line is None:
                    break
                log.append(line)
                match = re.search(r"http://127\.0\.0\.1:(\d+)", line)
                if match:
                    self.assertNotEqual(match[1], "0", "The server must report its assigned ephemeral port")
                    base = match[0]
                    break
            self.assertIsNotNone(base, "Preview did not announce a usable loopback URL: " + "".join(log))
            with urllib.request.urlopen(base + "/", timeout=5) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers.get_content_type(), "text/html")
                self.assertEqual(response.read(), (DOCS / "startup-preview.html").read_bytes())
            # Fetch the real transitive resource set, not only the HTML shell.
            resources = preview_resources() | {DOCS / "assets" / "voice" / "phase-0.wav", DOCS / "assets" / "dsh-laterano-emblem.svg"}
            for resource in resources:
                with self.subTest(resource=resource.relative_to(DOCS)):
                    request_path = "/" + urllib.parse.quote(resource.relative_to(DOCS).as_posix())
                    with urllib.request.urlopen(base + request_path, timeout=5) as response:
                        self.assertEqual(response.status, 200)
                        self.assertEqual(response.read(), resource.read_bytes())
                        if resource.suffix == ".js":
                            self.assertIn(response.headers.get_content_type(), {"text/javascript", "application/javascript"})
                        if resource.suffix == ".css":
                            self.assertEqual(response.headers.get_content_type(), "text/css")
            # The standalone preview cannot impersonate a connected DSH host.
            for request_path in ["/api/access", "/api/profile", "/api/load"]:
                with self.subTest(endpoint=request_path), self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(base + request_path, timeout=5)
                self.assertEqual(error.exception.code, 404)
            for request_path in ["/../package.json", "/%2e%2e/package.json", "/%2e%2e%2fpackage.json", "/.git/config"]:
                with self.subTest(path=request_path), self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(base + request_path, timeout=5)
                self.assertIn(error.exception.code, {400, 403, 404})
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            process.stdout.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
