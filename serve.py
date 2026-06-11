#!/usr/bin/env python3
"""開發預覽伺服器：停用快取，避免改版後瀏覽器載到新舊混合的程式。"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


http.server.ThreadingHTTPServer(('127.0.0.1', PORT), NoCacheHandler).serve_forever()
