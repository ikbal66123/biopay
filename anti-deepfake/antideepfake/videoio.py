"""Baca/tulis video lewat FFmpeg (pipe rawvideo, tanpa menyimpan ribuan PNG ke disk).

- `probe`        : resolusi, fps, jumlah frame, durasi, rotasi, info audio.
- `iter_frames`  : generator frame RGB uint8 (rotasi HP sudah diterapkan).
- `extract_audio`: salin audio apa adanya (tanpa re-encode) ke file terpisah.
- `VideoWriter`  : tulis frame RGB ke H.264 kualitas tinggi + mux audio.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Iterator

import numpy as np

# Codec audio yang boleh disalin langsung ke MP4 tanpa re-encode.
MP4_AUDIO_OK = {"aac", "mp3", "alac", "ac3", "eac3", "opus", "flac"}


def require_ffmpeg() -> None:
    for tool in ("ffmpeg", "ffprobe"):
        if shutil.which(tool) is None:
            raise RuntimeError(f"{tool} tidak ditemukan. Pasang FFmpeg (mis. `sudo apt install ffmpeg` / `brew install ffmpeg`).")


@dataclass
class VideoInfo:
    path: str
    width: int            # lebar tampilan (setelah rotasi)
    height: int
    fps: Fraction
    n_frames: int         # perkiraan dari metadata; jumlah sebenarnya dihitung saat decode
    duration: float
    rotation: int
    pix_fmt: str
    codec: str
    has_audio: bool
    audio_codec: str | None
    color_transfer: str | None

    @property
    def fps_str(self) -> str:
        return f"{self.fps.numerator}/{self.fps.denominator}"

    @property
    def is_hdr(self) -> bool:
        return (self.color_transfer or "") in {"smpte2084", "arib-std-b67"}


def _fraction(s: str | None) -> Fraction | None:
    try:
        f = Fraction(s)
        return f if f > 0 else None
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def probe(path: str | Path) -> VideoInfo:
    require_ffmpeg()
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    data = json.loads(out)
    v = next((s for s in data["streams"] if s.get("codec_type") == "video"), None)
    if v is None:
        raise ValueError(f"Tidak ada stream video di {path}")
    a = next((s for s in data["streams"] if s.get("codec_type") == "audio"), None)

    rotation = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rotation = int(round(float(sd["rotation"])))
    if not rotation and "rotate" in v.get("tags", {}):
        rotation = int(v["tags"]["rotate"])
    w, h = int(v["width"]), int(v["height"])
    if abs(rotation) % 180 == 90:
        w, h = h, w

    fps = _fraction(v.get("avg_frame_rate")) or _fraction(v.get("r_frame_rate")) or Fraction(30)
    duration = float(v.get("duration") or data.get("format", {}).get("duration") or 0)
    n = int(v["nb_frames"]) if str(v.get("nb_frames", "")).isdigit() else int(round(duration * float(fps)))
    return VideoInfo(
        path=str(path), width=w, height=h, fps=fps, n_frames=n, duration=duration, rotation=rotation,
        pix_fmt=v.get("pix_fmt", ""), codec=v.get("codec_name", ""),
        has_audio=a is not None, audio_codec=a.get("codec_name") if a else None,
        color_transfer=v.get("color_transfer"),
    )


def iter_frames(path: str | Path, info: VideoInfo | None = None) -> Iterator[np.ndarray]:
    """Decode semua frame sebagai RGB uint8 (H, W, 3), urut, tanpa duplikasi/drop."""
    info = info or probe(path)
    w, h = info.width, info.height
    cmd = ["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:v:0", "-fps_mode", "passthrough",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=w * h * 3 * 4)
    size = w * h * 3
    try:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield np.frombuffer(buf, dtype=np.uint8).reshape(h, w, 3)
    finally:
        proc.stdout.close()
        proc.kill()
        proc.wait()


def extract_audio(src: str | Path, dst_dir: str | Path) -> Path | None:
    """Salin stream audio pertama apa adanya ke `dst_dir/audio.mka` (Matroska menerima codec apa pun)."""
    info = probe(src)
    if not info.has_audio:
        return None
    dst = Path(dst_dir) / "audio.mka"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-map", "0:a:0", "-vn", "-c:a", "copy", str(dst)],
                   check=True)
    return dst


class VideoWriter:
    """Tulis frame RGB ke MP4 H.264 (yuv420p, BT.709) dan gabungkan audio.

    CRF 14 + preset 'slow' = praktis tak terlihat bedanya dengan sumber, ukuran file
    lebih besar dari aslinya. Perturbasi tetap ada; platform nanti akan mengompres ulang.
    """

    def __init__(self, path: str | Path, width: int, height: int, fps: Fraction | str,
                 audio: str | Path | None = None, audio_codec: str | None = None,
                 crf: int = 14, preset: str = "slow") -> None:
        require_ffmpeg()
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.width, self.height = width, height
        fps = fps if isinstance(fps, str) else f"{fps.numerator}/{fps.denominator}"
        cmd = ["ffmpeg", "-v", "error", "-y",
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{width}x{height}", "-r", fps, "-i", "-"]
        if audio:
            cmd += ["-i", str(audio)]
        # yuv420p butuh dimensi genap: pad 1 piksel bila perlu (jarang, video HP selalu genap)
        vf = "pad=ceil(iw/2)*2:ceil(ih/2)*2,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"
        cmd += ["-map", "0:v:0", "-vf", vf, "-c:v", "libx264", "-crf", str(crf), "-preset", preset,
                "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
                "-movflags", "+faststart"]
        if audio:
            ac = ["-c:a", "copy"] if (audio_codec in MP4_AUDIO_OK) else ["-c:a", "aac", "-b:a", "256k"]
            cmd += ["-map", "1:a:0", *ac]
        cmd += [str(self.path)]
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        self.frames = 0

    def write(self, frame: np.ndarray) -> None:
        assert frame.shape == (self.height, self.width, 3) and frame.dtype == np.uint8
        self.proc.stdin.write(np.ascontiguousarray(frame).tobytes())
        self.frames += 1

    def close(self) -> None:
        self.proc.stdin.close()
        err = self.proc.stderr.read().decode(errors="replace")
        if self.proc.wait() != 0:
            raise RuntimeError(f"FFmpeg gagal menulis {self.path}:\n{err}")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, *_):
        if exc_type is None:
            self.close()
        else:
            self.proc.kill()


def transcode(src: str | Path, dst: str | Path, *, max_side: int = 1920, bitrate: str = "2M",
              preset: str = "medium", audio_bitrate: str = "128k") -> Path:
    """Kompres ulang video seperti platform media sosial (H.264, bitrate rendah, sisi terpanjang <= max_side)."""
    vf = (f"scale='if(gt(iw,ih),min({max_side},iw),-2)':'if(gt(iw,ih),-2,min({max_side},ih))',"
          "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p")
    br = int(bitrate.rstrip("kKmM")) * (1000 if bitrate[-1] in "kK" else 1_000_000)
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", vf, "-c:v", "libx264", "-preset", preset,
           "-b:v", bitrate, "-maxrate", str(int(br * 1.5)), "-bufsize", str(br * 2),
           "-c:a", "aac", "-b:a", audio_bitrate, "-movflags", "+faststart", str(dst)]
    subprocess.run(cmd, check=True)
    return Path(dst)
