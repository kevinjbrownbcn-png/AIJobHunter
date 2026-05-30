#!/usr/bin/env python3
"""
build_exe.py — One-click builder for AI Job Hunter Dashboard .exe
=================================================================
Packages launch_dashboard.py + ai_job_hunter_dashboard.html into a
standalone Windows executable using PyInstaller.

config.json is intentionally NOT bundled — it stays next to the .exe
so you can update credentials without rebuilding.

Requirements (install once):
    pip install pyinstaller pywebview

Usage:
    python build_exe.py              # folder output (fast startup, default)
    python build_exe.py --onefile    # single .exe (easier to share)
    python build_exe.py --debug      # keep console window for troubleshooting

Output:
    dist/AIJobHunter/AIJobHunter.exe   (--onedir, default)
    dist/AIJobHunter.exe               (--onefile)
"""

import argparse
import os
import shutil
import subprocess
import sys

# ---------------------------------------------------------------------------
# Config — change these if your files have different names
# ---------------------------------------------------------------------------
APP_NAME     = "AIJobHunter"
SCRIPT_FILE  = "launch_dashboard.py"
HTML_DIR     = "."          # entire src/ folder is bundled (scripts live inside it)
CONFIG_FILE  = "config.json"        # kept EXTERNAL — never bundled
# ---------------------------------------------------------------------------


def find_file(filename: str, base_dir: str) -> str:
    """Locate a required file in base_dir; abort with a clear message if missing."""
    path = os.path.join(base_dir, filename)
    if not os.path.isfile(path):
        print(f"\n[ERROR] Required file not found: {path}")
        print(f"  Make sure '{filename}' is in the same folder as this build script.\n")
        sys.exit(1)
    return path


def check_pyinstaller() -> None:
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print(
            "\n[ERROR] PyInstaller is not installed.\n"
            "Install it with:\n\n"
            "    pip install pyinstaller\n"
        )
        sys.exit(1)


def _force_remove(path: str) -> None:
    """
    Robustly delete a file or folder on Windows.
    Handles two common failure modes:
      - PermissionError on read-only files (chmod first, then retry)
      - Locked files from a running .exe or OneDrive sync (retry with delay)
    """
    import stat
    import time

    def _on_error(func, failing_path, exc_info):
        # Strip read-only flag and retry once
        try:
            os.chmod(failing_path, stat.S_IWRITE)
            func(failing_path)
        except Exception:
            pass  # will be reported at the top level

    for attempt in range(3):
        try:
            if os.path.isfile(path):
                os.chmod(path, stat.S_IWRITE)
                os.remove(path)
            elif os.path.isdir(path):
                shutil.rmtree(path, onexc=_on_error)
            return   # success
        except PermissionError as exc:
            if attempt < 2:
                print(f"[CLEAN] Locked — retrying in 2s ({exc.filename})")
                time.sleep(2)
            else:
                print(f"[CLEAN] WARNING: Could not delete {path}")
                print(f"         Reason : {exc}")
                print(f"         Fix    : close the app / pause OneDrive, then rebuild.")


def clean_build_artifacts(base_dir: str) -> None:
    """
    Remove all artifacts from a previous build so the next one starts fresh:
      - build/          PyInstaller working directory
      - dist/           all previous output (exe, folders, config copy)
      - AIJobHunter.spec  leftover spec file
      - __pycache__/    bytecode cache next to the scripts
    """
    removed = []
    skipped = []

    # Folders
    for folder in ("build", "dist"):
        target = os.path.join(base_dir, folder)
        if os.path.isdir(target):
            _force_remove(target)
            removed.append(folder + "/")
        else:
            skipped.append(folder + "/")

    # .spec file
    spec = os.path.join(base_dir, f"{APP_NAME}.spec")
    if os.path.isfile(spec):
        _force_remove(spec)
        removed.append(f"{APP_NAME}.spec")
    else:
        skipped.append(f"{APP_NAME}.spec")

    # __pycache__ next to the scripts (PyInstaller bytecode cache)
    pycache = os.path.join(base_dir, "__pycache__")
    if os.path.isdir(pycache):
        _force_remove(pycache)
        removed.append("__pycache__/")
    else:
        skipped.append("__pycache__/")

    if removed:
        print(f"[CLEAN] Deleted : {', '.join(removed)}")
    if skipped:
        print(f"[CLEAN] Not found (skipped): {', '.join(skipped)}")


def copy_config_next_to_exe(base_dir: str, onefile: bool) -> None:
    """
    After building, copy config.json (template if real one missing) into
    the dist output folder so the user has a ready-to-fill file right there.
    """
    src = os.path.join(base_dir, CONFIG_FILE)
    if not os.path.isfile(src):
        return   # nothing to copy

    if onefile:
        dest_dir = os.path.join(base_dir, "dist")
    else:
        dest_dir = os.path.join(base_dir, "dist", APP_NAME)

    dest = os.path.join(dest_dir, CONFIG_FILE)
    if os.path.isdir(dest_dir):
        shutil.copy2(src, dest)
        print(f"[INFO] config.json copied to: {dest}")


def build(onefile: bool, debug: bool, base_dir: str) -> None:
    script_path = find_file(SCRIPT_FILE, base_dir)

    # Bundle the entire src/ folder (base_dir, since scripts live inside src/).
    # config.json is explicitly NOT added here — it lives next to the .exe.
    # The folder is mapped to "src/" inside the bundle so resolve_html_path
    # finds index.html at sys._MEIPASS/src/index.html.
    add_data = f"{base_dir}{os.pathsep}src"

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", APP_NAME,
        "--add-data", add_data,
        "--noconfirm",
        "--clean",
        # Explicitly exclude config.json from the bundle
        "--exclude-module", "config",
    ]

    if onefile:
        cmd.append("--onefile")
    else:
        cmd.append("--onedir")

    if not debug:
        cmd.append("--noconsole")

    icon_path = os.path.join(base_dir, "icon.ico")
    if os.path.isfile(icon_path):
        print(f"[INFO] Using icon: {icon_path}")
        cmd += ["--icon", icon_path]
    else:
        print("[INFO] No icon.ico found — using default PyInstaller icon.")
        print("       (Place icon.ico next to this script to use a custom icon.)")

    cmd.append(script_path)

    print("\n[INFO] Running PyInstaller...")
    print("  " + " ".join(cmd) + "\n")

    result = subprocess.run(cmd, cwd=base_dir)

    if result.returncode != 0:
        print("\n[ERROR] PyInstaller failed. See output above for details.\n")
        sys.exit(result.returncode)

    # Copy config.json into dist so the user can fill it in straight away
    copy_config_next_to_exe(base_dir, onefile)

    # -----------------------------------------------------------------------
    # Final summary
    # -----------------------------------------------------------------------
    if onefile:
        exe      = os.path.join(base_dir, "dist", f"{APP_NAME}.exe")
        cfg_dest = os.path.join(base_dir, "dist", CONFIG_FILE)
        print(f"\n{'='*60}")
        print(f"  Build complete!")
        print(f"  Executable : {exe}")
        print(f"  Config     : {cfg_dest}  <-- fill this in before running")
        print(f"{'='*60}")
        print("\n  Keep config.json in the SAME FOLDER as the .exe.")
        print("  html_path in config.json is not needed for the .exe (src/ is bundled).")
        print("  Do NOT share or commit config.json — it contains your keys.\n")
    else:
        out_dir  = os.path.join(base_dir, "dist", APP_NAME)
        exe      = os.path.join(out_dir, f"{APP_NAME}.exe")
        cfg_dest = os.path.join(out_dir, CONFIG_FILE)
        print(f"\n{'='*60}")
        print(f"  Build complete!")
        print(f"  Folder     : {out_dir}")
        print(f"  Executable : {exe}")
        print(f"  Config     : {cfg_dest}  <-- fill this in before running")
        print(f"{'='*60}")
        print("\n  Share the entire folder.")
        print("  config.json travels WITH the folder — fill it in first.")
        print("  html_path in config.json is not needed (src/ is bundled).")
        print("  Do NOT share or commit config.json — it contains your keys.\n")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build AI Job Hunter Dashboard into a Windows .exe"
    )
    parser.add_argument(
        "--onefile",
        action="store_true",
        help="Pack everything into a single .exe (slower startup, easier to share)",
    )
    parser.add_argument(
        "--onedir",
        action="store_true",
        help="Output a folder with the .exe (faster startup, default)",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Keep the console window open (useful for troubleshooting crashes)",
    )
    parser.add_argument(
        "--no-clean",
        action="store_true",
        help="Skip removing previous build/dist folders",
    )
    args = parser.parse_args()

    onefile  = args.onefile and not args.onedir
    base_dir = os.path.dirname(os.path.abspath(__file__))

    print(f"\n{'='*60}")
    print(f"  AI Job Hunter Dashboard — EXE Builder")
    print(f"{'='*60}")
    print(f"  Mode    : {'single .exe' if onefile else 'folder (onedir)'}")
    print(f"  Debug   : {'yes (console visible)' if args.debug else 'no'}")
    print(f"  Base dir: {base_dir}\n")

    check_pyinstaller()

    if not args.no_clean:
        clean_build_artifacts(base_dir)

    build(onefile=onefile, debug=args.debug, base_dir=base_dir)


if __name__ == "__main__":
    main()