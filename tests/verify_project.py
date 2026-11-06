import json
import os
import re
import threading
import unittest
import urllib.request
import socketserver

import sys
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT_DIR)

from serve import GitHubPagesSPAHandler


class ProjectVerificationTests(unittest.TestCase):
    def test_required_files_exist(self):
        required = [
            ".nojekyll",
            ".gitignore",
            "index.html",
            "404.html",
            "manifest.webmanifest",
            "sw.js",
            "serve.py",
            "supabase/schema.sql",
            "css/styles.css",
            "js/config.js",
            "js/paper.js",
            "js/airplane.js",
            "js/storage.js",
            "js/app.js",
            "icons/icon.svg",
            "README.md",
        ]
        for rel in required:
            full = os.path.join(ROOT_DIR, rel)
            self.assertTrue(os.path.isfile(full), f"Missing required file: {rel}")

    def test_manifest_json_valid(self):
        with open(os.path.join(ROOT_DIR, "manifest.webmanifest"), "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["display"], "standalone")
        self.assertTrue(len(data["icons"]) >= 1)

    def test_36_paper_swatches_configured(self):
        with open(os.path.join(ROOT_DIR, "js", "config.js"), "r", encoding="utf-8") as f:
            content = f.read()
        hexes = re.findall(r'"#[0-9a-fA-F]{6}"', content)
        # PAPER_SWATCHES block has at least 36 hex values
        self.assertGreaterEqual(len(hexes), 36)

    def test_relative_js_imports_resolve(self):
        js_dir = os.path.join(ROOT_DIR, "js")
        for fname in os.listdir(js_dir):
            if not fname.endswith(".js"):
                continue
            fpath = os.path.join(js_dir, fname)
            with open(fpath, "r", encoding="utf-8") as f:
                src = f.read()
            local_imports = re.findall(r'from\s+"(\./[^"]+)"', src)
            for rel_imp in local_imports:
                target = os.path.normpath(os.path.join(js_dir, rel_imp))
                self.assertTrue(
                    os.path.isfile(target),
                    f"Broken relative import {rel_imp} in {fname}",
                )

    def test_css_balanced_braces(self):
        with open(os.path.join(ROOT_DIR, "css", "styles.css"), "r", encoding="utf-8") as f:
            css = f.read()
        # Strip CSS comments before counting braces
        clean = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
        self.assertEqual(clean.count("{"), clean.count("}"), "Unbalanced braces in styles.css")

    def test_spa_server_routes_and_assets(self):
        httpd = socketserver.TCPServer(("127.0.0.1", 0), GitHubPagesSPAHandler)
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            routes = [
                "/",
                "/space",
                "/feed/Personal",
                "/feed/Global",
                "/write/Personal",
                "/search",
                "/outbox",
                "/letter/1001",
                "/css/styles.css",
                "/js/app.js",
                "/manifest.webmanifest",
            ]
            for r in routes:
                url = f"http://127.0.0.1:{port}{r}"
                with urllib.request.urlopen(url, timeout=5) as resp:
                    self.assertEqual(resp.status, 200, f"Expected 200 for {r}")
                    body = resp.read().decode("utf-8", errors="ignore")
                    self.assertGreater(len(body), 20)
        finally:
            httpd.shutdown()
            httpd.server_close()


if __name__ == "__main__":
    unittest.main()
