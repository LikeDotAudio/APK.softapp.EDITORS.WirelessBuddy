# Smoke test — EDITORS.WirelessBuddy

Is `EDITORS.WirelessBuddy` deployed? Written by `.apk.scripts/smoke.py` from the module's own shape; what each check means is in that script's header.

← [Wiki home](../README.md)

**❌ FAIL** — 2/3 checks, since 2026-11-12 00:16 EST

| Check | Target | Result | Detail |
|---|---|---|---|
| pushed | [APK.softapp.EDITORS.WirelessBuddy](https://github.com/LikeDotAudio/APK.softapp.EDITORS.WirelessBuddy.git) | ❌ | 1 commit(s) not pushed |
| web | [index.html](https://apk.audio/APK%3ASoftapps/EDITORS/EDITORS.WirelessBuddy/index.html) | ✅ | HTTP 200 |
| app | `OS/Wireless Mic Buddy` → `PODS/POD.THIN/Softapps/EDITORS/EDITORS.WirelessBuddy/index.html` | ✅ | present |

Re-run: `python3 .apk.scripts/smoke.py PODS/POD.THIN/Softapps/EDITORS/EDITORS.WirelessBuddy`

<!-- smoke:sig 778aab197763 since 2026-11-12 00:16 EST -->
