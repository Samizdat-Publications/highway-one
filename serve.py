#!/usr/bin/env python3
"""Dev static server for Highway One (stdlib only).

Exists instead of `python -m http.server` for two reasons:
  1. no-store headers: browsers heuristically cache ES modules and keep running
     code you just edited away.
  2. PORT support so parallel sessions don't fight over one port
     (Last Stop / Subway Zombies uses 8431; this project defaults to 8432).

Usage:  python serve.py [port]     (default 8432, or PORT env)
"""
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class DevHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        msg = fmt % args
        if '404' in msg:
            sys.stderr.write('404 %s\n' % (args[0] if args else ''))


def main():
    port = int(os.environ.get('PORT') or (sys.argv[1] if len(sys.argv) > 1 else 8432))
    root = os.path.dirname(os.path.abspath(__file__))
    handler = partial(DevHandler, directory=root)
    with ThreadingHTTPServer(('127.0.0.1', port), handler) as httpd:
        print('Highway One dev server: http://localhost:%d  (root %s)' % (port, root), flush=True)
        httpd.serve_forever()


if __name__ == '__main__':
    main()
