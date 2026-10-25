"""Run both C645 capture scripts against a repeatable D-pad sequence (Python 3)."""
import argparse
import json
from pathlib import Path
import subprocess
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", required=True, type=Path)
    parser.add_argument("--device", default="192.168.31.18:5555")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    adb = str(args.adb.resolve())
    if not Path(adb).is_file():
        parser.error("ADB executable does not exist")
    repo = Path(__file__).resolve().parents[1]
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    common = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]
    device_args = ["-Device", args.device, "-AdbPath", adb, "-Seconds", "30"]
    jobs = []
    with (out / "benchmark.log").open("w") as bench, (out / "diagnose.log").open("w") as diag:
        try:
            jobs.append(subprocess.Popen(
                common + [str(repo / "benchmark-c645.ps1")] + device_args
                + ["-OutputPath", str(out / "presentation-times.txt")],
                stdout=bench, stderr=subprocess.STDOUT))
            jobs.append(subprocess.Popen(
                common + [str(repo / "diagnose-c645.ps1")] + device_args
                + ["-OutputDirectory", str(out)],
                stdout=diag, stderr=subprocess.STDOUT))
            time.sleep(4)
            if any(job.poll() not in (None, 0) for job in jobs):
                raise RuntimeError("Capture failed; inspect the output logs")
            # Begin on the first card of the first catalog row in every run.
            # Telemetry samples a 30s window; the full input sequence can take longer.
            keys = [22] * 4 + [21] * 4 + [20] + [22] * 4 + [21] * 4 + [19]
            commands = "; ".join(f"input keyevent {key}; sleep 0.15" for key in keys)
            started = time.time()
            result = subprocess.run(
                [adb, "-s", args.device, "shell", commands],
                capture_output=True, text=True, timeout=120)
            (out / "scenario.json").write_text(json.dumps({
                "keys": keys, "sleepSeconds": 0.15, "startUnix": started,
                "elapsed": time.time() - started, "returncode": result.returncode,
            }, indent=2), encoding="utf-8")
            codes = [job.wait(timeout=180) for job in jobs]
            if result.returncode or any(codes):
                raise RuntimeError("Navigation/capture failed; inspect the output logs")
        finally:
            # Only terminate helper processes created by this run, never TV apps.
            for job in jobs:
                if job.poll() is None:
                    job.terminate()
                    job.wait(timeout=10)
    print((out / "benchmark.log").read_text(errors="replace"))
    print(f"Diagnostics saved to {out}")


if __name__ == "__main__":
    main()
