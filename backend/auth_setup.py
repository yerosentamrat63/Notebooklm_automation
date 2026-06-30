"""
One-time auth setup script.

Run this ONCE locally to authenticate with Google NotebookLM.
It will open a browser window for you to log in,
then save the session cookies for use by the server.

Usage:
    python backend/auth_setup.py

After running, set the output as NOTEBOOKLM_AUTH_JSON on Render.
"""

import json
import os
import sys


def main():
    print("=" * 60)
    print("NotebookLM Auto-Pilot — Auth Setup")
    print("=" * 60)
    print()
    print("This script will open a browser for you to log into Google.")
    print("After login, it will capture your NotebookLM session.")
    print()
    print("Option 1: Use the notebooklm CLI (recommended)")
    print("Option 2: Manually export cookies and set as env var")
    print()

    choice = input("Choose (1 or 2, default 1): ").strip() or "1"

    if choice == "1":
        setup_via_cli()
    elif choice == "2":
        setup_manual()
    else:
        print("Invalid choice.")
        sys.exit(1)


def setup_via_cli():
    import subprocess

    print()
    print("Running: notebooklm login --browser-cookies chrome")
    print("(A browser window may open. Complete the Google login.)")
    print()

    result = subprocess.run(
        ["notebooklm", "login", "--browser-cookies", "chrome"],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print("CLI login failed. Trying Playwright-based login...")
        result = subprocess.run(
            ["notebooklm", "login"],
            capture_output=True,
            text=True,
        )

    if result.returncode == 0:
        print()
        print("Login successful!")
        print()

        storage_path = os.path.expanduser(
            "~/.notebooklm/profiles/default/storage_state.json"
        )

        if os.path.exists(storage_path):
            with open(storage_path) as f:
                auth_data = json.load(f)

            auth_json = json.dumps(auth_data)
            print("=" * 60)
            print("COPY THE LINE BELOW and set it as NOTEBOOKLM_AUTH_JSON")
            print("environment variable on Render:")
            print("=" * 60)
            print()
            print(auth_json)
            print()
            print("=" * 60)
        else:
            print(f"Could not find auth file at: {storage_path}")
            print("Check ~/.notebooklm/ for the storage_state.json file.")
    else:
        print("Login failed.")
        print(result.stderr)
        sys.exit(1)


def setup_manual():
    print()
    print("Manual setup:")
    print("1. Open https://notebooklm.google.com in Chrome")
    print("2. Log into your Google account")
    print("3. Open DevTools (F12) → Application → Cookies")
    print("4. Export cookies as JSON (use EditThisCookie or similar)")
    print("5. Set the JSON as NOTEBOOKLM_AUTH_JSON env var on Render")
    print()


if __name__ == "__main__":
    main()
