"""Catch repository-relative Markdown links broken by documentation relocation."""
import re
import unittest
from pathlib import Path
from urllib.parse import unquote, urlsplit

REPO = Path(__file__).resolve().parents[2]


class DocumentationLinksTests(unittest.TestCase):
    def test_relative_document_links_resolve(self):
        documents = [REPO / 'AGENTS.md', *sorted((REPO / 'docs').rglob('*.md')),
                     REPO / 'src/client/public/textures/terrain/ASSETS.md']
        for document in documents:
            for target in re.findall(r'\]\(([^\s)]+)\)', document.read_text()):
                parsed = urlsplit(target)
                if parsed.scheme or parsed.netloc or not parsed.path:
                    continue
                with self.subTest(document=document.relative_to(REPO), target=target):
                    self.assertTrue((document.parent / unquote(parsed.path)).exists())
