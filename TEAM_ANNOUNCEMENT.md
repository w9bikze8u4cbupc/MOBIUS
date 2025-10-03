# Immediate: Revoke exposed tokens, rotate, and enable branch-protection prep (short timeline)

**Team —**

We discovered token strings in a session which must be treated as potentially exposed. Immediate actions (please complete now if you have access):

## Immediate Actions

1. **Revoke any tokens you suspect were exposed.** Treat them as compromised.

2. **Create a new fine‑grained GitHub token** scoped to this repo ([mobius-games-tutorial-generator](https://github.com/w9bikze8u4cbupc/mobius-games-tutorial-generator)) with these permissions:
   - Repository: Contents (read/write), Pull requests (read/write), Administration (if you will run the branch-protection apply script)
   - Short expiry (recommended 30 days) or use a token with the smallest effective scope you need.

3. **Test the token locally** with the three verification checks (paste only status codes / JSON back to the admin-thread):
   - `GET /user`
   - `GET /repos/:owner/:repo`
   - `GET /repos/:owner/:repo/branches/main/protection`
   - We have diagnostic curl scripts in [scripts/](./scripts) and debug helpers — redact tokens when sharing output.

4. **Run the setup-hooks script locally** to enable the pre-commit token-detection hook:
   - Unix: `./scripts/setup-hooks.sh`
   - Windows: `.\scripts\setup-hooks.ps1`

## Next Steps

Once a valid token is confirmed, we will run the apply script to set the standard branch-protection config. After one successful CI cycle, we'll verify Action check names and plan the stricter enforcement (CODEOWNERS, signed commits) within 24–72 hours of confirmation.

## Notes

- If you get a 401 on the verification checks, your token may be corrupted or insufficiently scoped — recreate and retest.
- If you need an admin to run the apply step, reply to this thread and tag an admin.

I'll open a small PR adding contributing/onboarding notes and the brief rollout timeline. Reply if you cannot complete the token rotation today.

— Security Lead