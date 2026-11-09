"""Keep the rejected stock SSAO candidate outside the shipped application."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]


class SsaoBoundaryTests(unittest.TestCase):
    def test_stock_candidate_has_no_product_import_or_placeholder_control(self):
        forbidden = re.compile(r"\bSSAOPass\b|\bSSAOShader\b|__ssao_assessment__|appearance-ssao|ssao-settings")
        for directory in (ROOT / "src/client/src", ROOT / "src/client/public"):
            for path in directory.rglob("*"):
                if path.suffix not in (".ts", ".js", ".html"):
                    continue
                with self.subTest(path=str(path.relative_to(ROOT))):
                    self.assertIsNone(forbidden.search(path.read_text()), "Assessment code must not ship without a newly approved policy")


if __name__ == "__main__":
    unittest.main()
