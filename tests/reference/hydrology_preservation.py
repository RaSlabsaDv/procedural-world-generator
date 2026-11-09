"""Check all pre-hydrology fields against captured v10 API output, not new output.

Historical helper: run against a frozen pre-channel generation-v13 deployment.
Current generation-v14 terrain is intentionally different; use the native frozen
V13 pipeline test for archived fingerprints. Command: PWG_BASE_URL=... python3 .../this.py.
Canonical JSON hashing uses sorted keys, compact separators and Python's numeric
formatting on parsed wire numbers. Timing, build identity and changed version tags
are deliberately outside the fingerprint; every old result field and summary is in.
"""
import hashlib
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen


def main():
    base = os.environ.get("PWG_BASE_URL", "http://127.0.0.1:8080")
    cases = json.loads((Path(__file__).parent / "fixtures/hydrology-prechange.json").read_text())
    for case in cases:
        request = case["request"]
        request["algorithmVersion"] = "diverse-landscape-v13"
        response = urlopen(Request(base + "/api/v1/terrains", data=json.dumps(request).encode(),
                                   headers={"Content-Type": "application/json"}), timeout=120)
        with response:
            current = json.load(response)
        result = current["result"]
        for field in ("lakes", "hydrology", "rivers", "algorithmVersion", "resultVersion"):
            del result[field]
        data = {"result": result, "simulation": current["simulation"]}
        digest = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        if digest != case["sha256"]:
            raise AssertionError((case["name"], digest, case["sha256"]))
        print(case["name"], digest, "unchanged")


if __name__ == "__main__":
    main()
