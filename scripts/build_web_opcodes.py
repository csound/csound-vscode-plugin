#!/usr/bin/env python3
"""Update the Csound manual resources bundled with the web extension.

The web extension cannot download the manual at runtime like the desktop server,
so this script refreshes `src/web/resources/csound-json_data/`:
- copies the manual JSON data (csound.json, flags.json, macros.json, manual_indexes.json);
- packs every opcode markdown page into opcodes.json ({opcode name: markdown}).
Pages are processed like `load_opcodes` in the Rust server (csound-lsp/src/assets.rs),
so web and desktop hovers show the same text.

The source can be either a csound_manual checkout (docs/opcodes, docs/examples,
parse_data_to_lsp/json_data) or an extracted release asset (csound_resources/).

Usage:
    python3 scripts/build_web_opcodes.py [SOURCE] [-o OUTPUT_DIR]
"""

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = PLUGIN_ROOT.parent / "csound_data" / "csound_manual"
DEFAULT_OUTPUT = PLUGIN_ROOT / "src" / "web" / "resources" / "csound-json_data"
DATA_FILES = ("csound.json", "flags.json", "macros.json", "manual_indexes.json")

# same patterns as csound-lsp/src/assets.rs
INCLUDE_EXAMPLE = re.compile(r'--8<--\s+"([^"]+)"')
RE_CSOUND = re.compile(r"```[ \t]*csound[^\n]*")
RE_N = re.compile(r"[ \t]*(```\n)")
RE_BS = re.compile(r"<br\s*/?>")


def find_source_dirs(source: Path) -> tuple[Path, Path, Path]:
    """Return (opcodes, examples, json data) folders of a release or a manual checkout."""
    for opcodes, examples, data in (
        (source / "csound_resources" / "opcodes", source / "csound_resources" / "examples", source / "csound_resources"),
        (source / "docs" / "opcodes", source / "docs" / "examples", source / "parse_data_to_lsp" / "json_data"),
    ):
        if opcodes.is_dir():
            return opcodes, examples, data
    sys.exit(f"error: no opcodes folder found in {source}")


def expand_includes(content: str, examples: Path, missing: list[str]) -> str:
    def replace(cap: re.Match) -> str:
        name = Path(cap[1]).name
        if not name:
            return f"<!-- undefined includes {cap[1]} -->"
        try:
            return (examples / name).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            missing.append(name)
            return f"<!-- undefined includes {name} -->"

    return INCLUDE_EXAMPLE.sub(replace, content)


def load_opcodes(opcodes: Path, examples: Path, missing: list[str]) -> dict[str, str]:
    data = {}
    for page in sorted(opcodes.glob("*.md")):
        try:
            content = page.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            print(f"warning: skipped unreadable page {page.name}", file=sys.stderr)
            continue
        content = expand_includes(content, examples, missing)
        content = RE_CSOUND.sub("\n```csound\n", content)
        content = RE_N.sub("\n```\n", content)
        content = RE_BS.sub("\n\n", content)
        data[page.stem] = content
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", nargs="?", type=Path, default=DEFAULT_SOURCE,
                        help=f"csound_manual checkout or extracted release (default: {DEFAULT_SOURCE})")
    parser.add_argument("-o", "--output", type=Path, default=DEFAULT_OUTPUT,
                        help=f"output folder (default: {DEFAULT_OUTPUT})")
    args = parser.parse_args()

    opcodes, examples, data_dir = find_source_dirs(args.source.resolve())
    args.output.mkdir(parents=True, exist_ok=True)

    for name in DATA_FILES:
        src = data_dir / name
        if not src.is_file():
            print(f"warning: missing data file {src}", file=sys.stderr)
            continue
        json.loads(src.read_text(encoding="utf-8"))  # refuse to ship broken JSON
        shutil.copyfile(src, args.output / name)
        print(f"{src} -> {args.output / name}")

    missing: list[str] = []
    data = load_opcodes(opcodes, examples, missing)

    # one opcode per line keeps git diffs readable
    out = args.output / "opcodes.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=0, sort_keys=True) + "\n", encoding="utf-8")

    print(f"{len(data)} opcodes from {opcodes} -> {out} ({out.stat().st_size / 1e6:.1f} MB)")
    for name in sorted(set(missing)):
        print(f"warning: missing example {name}", file=sys.stderr)


if __name__ == "__main__":
    main()
