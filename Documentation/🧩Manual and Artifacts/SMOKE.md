# Smoke test — EDITORS.WirelessBuddy

Is `EDITORS.WirelessBuddy` deployed? Written by `.apk.scripts/smoke.py` from the module's own shape; what each check means is in that script's header.

← [Wiki home](../README.md)

**✅ PASS** — 3/3 checks, since 2026-11-12 00:25 EST

| Check | Target | Result | Detail |
|---|---|---|---|
| pushed | [APK.softapp.EDITORS.WirelessBuddy](https://github.com/LikeDotAudio/APK.softapp.EDITORS.WirelessBuddy.git) | ✅ | HEAD is on origin |
| web | [index.html](https://apk.audio/APK%3ASoftapps/EDITORS/EDITORS.WirelessBuddy/index.html) | ✅ | HTTP 200 |
| app | `OS/Wireless Mic Buddy` → `PODS/POD.THIN/Softapps/EDITORS/EDITORS.WirelessBuddy/index.html` | ✅ | present |

Re-run: `python3 .apk.scripts/smoke.py PODS/POD.THIN/Softapps/EDITORS/EDITORS.WirelessBuddy`

<!-- smoke:sig 17ab34c124a4 since 2026-11-12 00:25 EST -->
