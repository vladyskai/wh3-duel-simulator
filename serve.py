"""Serve the simulator on this computer, with browser caching turned off.

A plain `python -m http.server` lets the browser keep old copies of the files, so after an
update a reload can mix new and old files and the page does not start. This server tells
the browser never to keep a copy, so every reload gets the newest files.

Run: python serve.py [port]   (default port 8766), then open http://localhost:8766
"""
import functools
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):  # keep the window quiet
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCache, directory=root)
    print(f'WH3 duel simulator: http://localhost:{port}  (close this window to stop it)')
    http.server.ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()


if __name__ == '__main__':
    main()
