#!/usr/bin/env python3
"""
Instagram Reel Transcriber
Downloads an Instagram reel's audio and transcribes it using OpenAI Whisper.
Outputs a formatted script.

Usage:
    python3 transcribe_instagram.py <instagram_url> [-m model] [-o output_file]
    python3 transcribe_instagram.py --local <audio_or_video_file> [-m model] [-o output_file]

Examples:
    python3 transcribe_instagram.py https://www.instagram.com/reel/ABC123/
    python3 transcribe_instagram.py --local video.mp4 -m small -o script.txt
"""

import argparse
import json
import os
import re
import ssl
import sys
import tempfile
import urllib.request

import whisper
import yt_dlp


def download_audio_ytdlp(url: str, output_dir: str) -> tuple:
    """Download audio from an Instagram reel URL using yt-dlp."""
    output_path = os.path.join(output_dir, "audio.%(ext)s")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_path,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
        "quiet": True,
        "no_warnings": True,
        "nocheckcertificate": True,
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
        },
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        print(f"Downloading audio from: {url}")
        info = ydl.extract_info(url, download=True)
        title = info.get("title", "Untitled")
        uploader = info.get("uploader", "Unknown")

    audio_file = os.path.join(output_dir, "audio.mp3")
    if not os.path.exists(audio_file):
        for ext in ["m4a", "webm", "wav", "ogg"]:
            candidate = os.path.join(output_dir, f"audio.{ext}")
            if os.path.exists(candidate):
                audio_file = candidate
                break

    if not os.path.exists(audio_file):
        raise FileNotFoundError("Failed to download audio file")

    return audio_file, title, uploader


def download_audio_embed(url: str, output_dir: str) -> tuple:
    """Fallback: scrape the Instagram embed page for the video URL."""
    match = re.search(r"/reel/([A-Za-z0-9_-]+)", url)
    if not match:
        match = re.search(r"/p/([A-Za-z0-9_-]+)", url)
    if not match:
        raise ValueError(f"Could not extract post ID from URL: {url}")

    post_id = match.group(1)
    embed_url = f"https://www.instagram.com/p/{post_id}/embed/"

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(
        embed_url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
        },
    )

    print(f"Trying embed fallback for post: {post_id}")
    with urllib.request.urlopen(req, context=ctx) as resp:
        html = resp.read().decode("utf-8", errors="replace")

    video_url = None
    patterns = [
        r'"video_url"\s*:\s*"([^"]+)"',
        r'"contentUrl"\s*:\s*"([^"]+)"',
        r'<source\s+src="([^"]+)"',
        r'"src"\s*:\s*"(https://[^"]*\.mp4[^"]*)"',
    ]
    for pat in patterns:
        m = re.search(pat, html)
        if m:
            video_url = m.group(1).replace("\\u0026", "&").replace("\\/", "/")
            break

    if not video_url:
        raise RuntimeError("Could not find video URL in embed page.")

    print("Downloading video...")
    video_path = os.path.join(output_dir, "video.mp4")
    video_req = urllib.request.Request(video_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(video_req, context=ctx) as resp:
        with open(video_path, "wb") as f:
            f.write(resp.read())

    audio_path = os.path.join(output_dir, "audio.mp3")
    os.system(
        f'ffmpeg -i "{video_path}" -vn -acodec libmp3lame -q:a 2 '
        f'"{audio_path}" -y -loglevel quiet'
    )

    if not os.path.exists(audio_path):
        raise FileNotFoundError("Failed to extract audio from video")

    return audio_path, "Instagram Reel", "Unknown"


def extract_audio_from_file(file_path: str, output_dir: str) -> str:
    """Extract audio from a local video/audio file."""
    audio_path = os.path.join(output_dir, "audio.mp3")

    # If it's already an audio file, just use it
    ext = os.path.splitext(file_path)[1].lower()
    if ext in [".mp3", ".wav", ".m4a", ".ogg", ".flac"]:
        return file_path

    # Extract audio from video
    print(f"Extracting audio from: {file_path}")
    ret = os.system(
        f'ffmpeg -i "{file_path}" -vn -acodec libmp3lame -q:a 2 '
        f'"{audio_path}" -y -loglevel quiet'
    )
    if ret != 0 or not os.path.exists(audio_path):
        raise RuntimeError(f"Failed to extract audio from {file_path}")

    return audio_path


def transcribe_audio(audio_path: str, model_name: str = "base") -> dict:
    """Transcribe audio using Whisper."""
    print(f"Loading Whisper model: {model_name}")
    model = whisper.load_model(model_name)
    print("Transcribing audio...")
    result = model.transcribe(audio_path)
    return result


def format_script(title: str, uploader: str, result: dict) -> str:
    """Format the transcription as a script."""
    lines = []
    lines.append("=" * 60)
    lines.append(f"TITLE: {title}")
    lines.append(f"CREATOR: {uploader}")
    lines.append("=" * 60)
    lines.append("")

    segments = result.get("segments", [])
    if segments:
        for seg in segments:
            start = seg["start"]
            end = seg["end"]
            text = seg["text"].strip()
            start_fmt = f"{int(start // 60):02d}:{start % 60:05.2f}"
            end_fmt = f"{int(end // 60):02d}:{end % 60:05.2f}"
            lines.append(f"[{start_fmt} - {end_fmt}]")
            lines.append(f"  {text}")
            lines.append("")
    else:
        lines.append(result.get("text", ""))

    lines.append("=" * 60)
    lines.append("FULL TRANSCRIPT:")
    lines.append("=" * 60)
    lines.append("")
    lines.append(result.get("text", "").strip())
    lines.append("")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Transcribe Instagram reels to text scripts"
    )
    parser.add_argument("url", nargs="?", help="Instagram reel URL")
    parser.add_argument(
        "--local",
        help="Path to a local audio or video file to transcribe",
    )
    parser.add_argument(
        "-m",
        "--model",
        default="base",
        choices=["tiny", "base", "small", "medium", "large"],
        help="Whisper model size (default: base)",
    )
    parser.add_argument(
        "-o", "--output", default=None,
        help="Output file path (default: print to stdout)",
    )
    args = parser.parse_args()

    if not args.url and not args.local:
        parser.error("Provide an Instagram URL or use --local with a file path")

    with tempfile.TemporaryDirectory() as tmp_dir:
        if args.local:
            # Local file mode
            if not os.path.exists(args.local):
                print(f"Error: File not found: {args.local}", file=sys.stderr)
                sys.exit(1)
            audio_path = extract_audio_from_file(args.local, tmp_dir)
            title = os.path.basename(args.local)
            uploader = "Local File"
        else:
            # URL download mode - try methods in order
            audio_path = None
            title = uploader = None

            methods = [
                ("yt-dlp", download_audio_ytdlp),
                ("embed scrape", download_audio_embed),
            ]

            for name, method in methods:
                try:
                    audio_path, title, uploader = method(args.url, tmp_dir)
                    break
                except Exception as e:
                    print(f"{name} failed: {e}")
                    continue

            if audio_path is None:
                print(
                    "\nAll download methods failed. Instagram requires authentication "
                    "from this network.\n\n"
                    "Alternative: Download the reel manually and use --local mode:\n"
                    "  python3 transcribe_instagram.py --local <video_file>\n",
                    file=sys.stderr,
                )
                sys.exit(1)

        result = transcribe_audio(audio_path, args.model)
        script = format_script(title, uploader, result)

    if args.output:
        with open(args.output, "w") as f:
            f.write(script)
        print(f"\nScript saved to: {args.output}")
    else:
        print("\n")
        print(script)


if __name__ == "__main__":
    main()
