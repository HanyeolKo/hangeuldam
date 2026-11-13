#!/usr/bin/env python3
"""Dependency-free localhost server for the portable offline application."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8787)
args = parser.parse_args()

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.mjs': 'text/javascript', '.webmanifest': 'application/manifest+json'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        studio = urlsplit(self.path).path.startswith('/studio/')
        ancestor = "'self'" if studio else "'none'"
        font = "'self' blob:" if studio else "'self'"
        self.send_header('Content-Security-Policy', f"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src {font}; connect-src 'self'; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors {ancestor}")
        self.send_header('X-Frame-Options', 'SAMEORIGIN' if studio else 'DENY')
        super().end_headers()

root = Path(__file__).resolve().parent.parent / 'public'
server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(root)))
print(f'한글담: http://localhost:{args.port}/  (종료: Ctrl+C)', flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    server.server_close()
