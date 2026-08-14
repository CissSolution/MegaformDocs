import asyncio
import re
import subprocess
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent.parent / "scripts"
AUDIO_DIR = Path(__file__).parent.parent / "audio"
VOICE = "en-US-GuyNeural"


def extract_narration(text: str) -> str:
    lines = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # Skip metadata/scene lines like [SCENE 1 — INTRO / 0:00-0:10]
        if line.startswith("[") and "]" in line:
            continue
        # Skip title lines that are all caps without narration
        if line.isupper() and "MEGAFORM" in line:
            continue
        lines.append(line)
    return " ".join(lines)


async def generate(script_file: Path):
    narration = extract_narration(script_file.read_text(encoding="utf-8"))
    out_file = AUDIO_DIR / f"{script_file.stem}.mp3"
    print(f"Generating {out_file.name} ...")
    cmd = [
        "edge-tts",
        "--text", narration,
        "--voice", VOICE,
        "--write-media", str(out_file),
    ]
    subprocess.run(cmd, check=True)
    print(f"Done: {out_file}")


async def main():
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    scripts = sorted(SCRIPTS_DIR.glob("*.txt"))
    for s in scripts:
        await generate(s)


if __name__ == "__main__":
    asyncio.run(main())
