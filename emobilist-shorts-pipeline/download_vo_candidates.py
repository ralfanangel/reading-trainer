#!/usr/bin/env python3
"""Download RAW clips likely to contain clean Ralf VO from NAS."""
from __future__ import annotations

import json
from pathlib import Path

from pipeline_config import DATA_ROOT, NAS_RAW_PATHS
from setup_nas import download_file, login

VO_DIR = DATA_ROOT / "raw" / "vo_candidates"
SCAN = DATA_ROOT / "vo_scan_projects.json"

# Workshop / talking-head clips first
VO_PICKS = {
    "vitilan": [
        "IMG_0043.MOV", "IMG_0044.MOV", "IMG_0015.MOV", "IMG_0016.MOV",
        "IMG_0017.MOV", "IMG_0018.MOV", "IMG_0020.MOV", "IMG_0021.MOV",
        "IMG_0008.MOV", "IMG_0009.MOV", "IMG_0010.MOV", "IMG_0011.MOV",
        "IMG_0022.MOV", "IMG_0023.MOV", "IMG_0027.MOV",
    ],
    "invanti": [
        "IMG_1068.MOV", "IMG_1069.MOV", "IMG_1070.MOV", "IMG_1071.MOV",
        "IMG_1072.MOV", "IMG_1080.MOV", "IMG_1081.MOV", "IMG_1082.MOV",
        "IMG_1064.MOV", "IMG_1065.MOV", "IMG_1066.MOV",
    ],
    "lumos": [
        "IMG_7686.MOV", "IMG_7687.MOV", "IMG_7688.MOV", "IMG_7689.MOV",
        "IMG_7690.MOV", "IMG_7691.MOV", "IMG_7692.MOV", "IMG_7693.MOV",
        "IMG_7694.MOV", "IMG_7695.MOV",
    ],
    "tst": [
        "IMG_0564.MOV", "IMG_0565.MOV", "IMG_0566.MOV", "IMG_0567.MOV",
        "IMG_0568.MOV", "IMG_0569.MOV", "IMG_0578.mov", "IMG_0579.mov",
        "IMG_0580.mov", "IMG_0581.mov",
    ],
    "onewheel": [
        "IMG_7292 2.MOV", "IMG_7293 2.MOV", "IMG_7294 2.MOV",
        "IMG_7295 2.MOV", "IMG_7424.MOV", "IMG_7425.MOV",
    ],
}

PROJECT_REMOTE = {
    "vitilan": NAS_RAW_PATHS["250322_VitilanV3"],
    "invanti": NAS_RAW_PATHS["250513_Invanti_Tide2"],
    "lumos": NAS_RAW_PATHS["250103_LUMOS_Hemlet"],
    "tst": NAS_RAW_PATHS["250413_TST_002 Fatbike"],
    "onewheel": NAS_RAW_PATHS["241217_OneWheel"],
}


def main() -> None:
    login()
    VO_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    for project, files in VO_PICKS.items():
        remote_base = PROJECT_REMOTE[project]
        local_dir = VO_DIR / project
        local_dir.mkdir(parents=True, exist_ok=True)
        print(f"\n{project}:")
        for name in files:
            remote = f"{remote_base}/{name}"
            local = local_dir / name
            try:
                download_file(remote, local)
                total += 1
            except Exception as e:
                print(f"  warn {name}: {e}")
    print(f"\nDone: attempted {total} VO candidate clips -> {VO_DIR}")


if __name__ == "__main__":
    main()
