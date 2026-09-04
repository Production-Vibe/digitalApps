"""One-time binding of an authenticated Google session for E2E.

Google shows an "app created by a Google Apps Script user" consent gate before
the app loads, and it is not passable headless (Google blocks automated login).

Run this ONCE in a headed browser window that opens on your desktop:
  - If not signed in, sign in to the Google account you use for the app.
  - Approve / continue through the consent screen for the app.
  - When the in-app "ЦифровойНаряд" login form (Логин/Пароль) appears, the gate
    is passed. The script detects it automatically and saves the session.

Exit: 0 on success (session saved), 1 on timeout.

Usage (background, then interact with the browser window):
    python session_setup.py
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import helpers

POLL_SECONDS = float(os.environ.get("ND_SESSION_TIMEOUT", "420"))


def main():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=config.PROFILE_DIR,
            channel=config.BROWSER_CHANNEL,
            headless=False,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
            ],
            ignore_default_args=["--enable-automation"],
            viewport={"width": 1280, "height": 850},
        )
        # Mask automation fingerprints so Google's login doesn't flag the
        # browser as "unsafe app/browser" and refuse the sign-in.
        ctx.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = window.chrome || { runtime: {} };
            Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru', 'en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        """)
        page = ctx.new_page()
        helpers.open_app(page, wait=False)
        print("Браузер открыт. Залогиньтесь в Google и пройдите консент-экран.")
        print("Жду появления формы входа #login ...", flush=True)

        deadline = time.time() + POLL_SECONDS
        found = False
        while time.time() < deadline:
            # NOTE: do NOT re-navigate here while the user is mid-OAuth. During
            # Google sign-in the tab legitimately leaves the app host
            # (accounts.google.com); re-opening the app would cancel the login.
            # The in-app login form lives inside the sandboxed iframe
            # (userCodeAppPanel), so look it up across all frames.
            fr = helpers.frame_locator(page, "#login", timeout=1200)
            if fr is not None:
                found = True
                break
            page.wait_for_timeout(400)

        # Save whatever authentic session state we have (before any screenshot
        # that could throw and abort the save).
        try:
            ctx.storage_state(path=config.STORAGE_STATE)
            print(f"[OK] Сохранено: {config.STORAGE_STATE}", flush=True)
        except Exception as e:
            print(f"[!] Не удалось сохранить storage_state: {e}", flush=True)

        if found:
            print("[OK] Форма входа приложения видна — консент-гейт пройден.", flush=True)
        else:
            print("[!] Таймаут: форма #login не появилась.", flush=True)
            try:
                helpers.save_screenshot(page, "session_setup_timeout.png")
                print("[!] Скриншот:", os.path.join(config.SCREENSHOT_DIR, "session_setup_timeout.png"), flush=True)
            except Exception:
                pass

        try:
            ctx.close()
        except Exception:
            pass
        sys.exit(0 if found else 1)


if __name__ == "__main__":
    main()
