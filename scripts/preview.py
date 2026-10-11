#!/usr/bin/env python3
"""Serve the Laterano presentation on loopback without simulating host APIs."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class PreviewHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path == "/":
            self.send_response(302)
            self.send_header("Location", "/startup-preview.html")
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8780, help="Local port (0 selects a free port)")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    docs = Path(__file__).resolve().parents[1] / "docs"
    if not (docs / "startup-preview.html").is_file():
        parser.error("Missing docs/startup-preview.html; keep the complete repository together")
    handler = partial(PreviewHandler, directory=str(docs))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        parser.exit(1, f"Cannot start preview: {error}\nTry --port 0 or another free port.\n")
    with server:
        print(f"LateranoUI: http://127.0.0.1:{server.server_port}/startup-preview.html", flush=True)
        print("Static preview only. Press Ctrl+C to stop.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
