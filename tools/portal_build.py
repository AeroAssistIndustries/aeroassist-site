#!/usr/bin/env python3
"""Build the encrypted AeroAssist investor and team portal vault.

Reads a PRIVATE input folder (never commit it) and writes encrypted files to
portal/vault/. Each person gets one encrypted manifest and their own encrypted
copy of every document they may see. The manifest also carries the codes for the
shared areas their role may open (raise briefing, document library, holder
reports), so one sign-in opens everything. Nothing readable is published: a file
opens only in the person's browser with their ID and access code.

Input folder layout (default: ./portal-input, which .gitignore excludes):

  portal-input/
    people.csv      id,name,role,units,since
                      role  = prospect | investor | employee | admin
                      units = units held (investors), else blank
    documents.csv   investor,category,title,date,file
                      investor = a portal ID, * for everyone, or @role (e.g. @employee)
                      category = tax | agreements | certificates | updates | team | other
                      file     = path relative to portal-input
    settings.json   {"rooms": {"briefing": "<investor page code>",
                               "library": "<document library code>",
                               "holders": "<unit-holder code>"},
                     "asOf": "2026-10-09", "unitsOutstanding": 10000,
                     "note": "Text shown to everyone"}
                    Optional "roleRooms" overrides which areas each role opens.

Access codes are kept in portal-input/codes.csv (also private). An investor
without a code gets a new random one; existing codes are kept, so rebuilding
does not lock anyone out. To revoke or rotate a code, delete that row and
rebuild, then send the new code. Old encrypted files stay in this public
repository's history, readable only with the old code.

Usage:  python3 tools/portal_build.py [input_dir]
Needs:  pip install cryptography
"""
import csv, hashlib, json, os, secrets, shutil, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITER = 250000                      # must match portal/index.html
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # no 0/O, 1/I
CATS = {"tax", "agreements", "certificates", "updates", "team", "other"}
ROLES = {"prospect", "investor", "employee", "admin"}
ROLE_ROOMS = {"prospect": ["briefing", "library"], "investor": ["briefing", "library", "holders"],
              "employee": ["library"], "admin": ["briefing", "library", "holders"]}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VAULT = os.path.join(ROOT, "portal", "vault")


def norm_id(v):
    return "".join(str(v).split()).upper()


def norm_code(v):
    return str(v).replace("-", "").replace(" ", "").upper()


def new_code():
    raw = "".join(secrets.choice(ALPHABET) for _ in range(16))   # 80 bits
    return "-".join(raw[i:i + 4] for i in range(0, 16, 4))


def seal(data, code):
    salt, iv = os.urandom(16), os.urandom(12)
    key = hashlib.pbkdf2_hmac("sha256", norm_code(code).encode(), salt, ITER, 32)
    return salt + iv + AESGCM(key).encrypt(iv, data, None)


def vault_name(inv_id):
    return hashlib.sha256(("aeroassist-portal:" + inv_id).encode()).hexdigest()[:24]


def main():
    src = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "portal-input"))
    if src.startswith(ROOT + os.sep) and os.path.basename(src) != "portal-input":
        sys.exit("Keep the input folder outside the site or name it portal-input (ignored by git).")
    people_csv = os.path.join(src, "people.csv")
    if not os.path.exists(people_csv):
        people_csv = os.path.join(src, "investors.csv")   # older name; role defaults to investor
    with open(people_csv, newline="") as f:
        investors = [r for r in csv.DictReader(f) if (r.get("id") or "").strip()]
    for r in investors:
        r["role"] = (r.get("role") or "investor").strip().lower()
        if r["role"] not in ROLES:
            sys.exit(f"Unknown role {r['role']!r} for {r['id']}")
    docs = []
    p = os.path.join(src, "documents.csv")
    if os.path.exists(p):
        with open(p, newline="") as f:
            docs = [r for r in csv.DictReader(f) if (r.get("file") or "").strip()]
    settings = {}
    p = os.path.join(src, "settings.json")
    if os.path.exists(p):
        settings = json.load(open(p))

    codes_path = os.path.join(src, "codes.csv")
    codes = {}
    if os.path.exists(codes_path):
        with open(codes_path, newline="") as f:
            codes = {norm_id(r["id"]): r["code"] for r in csv.DictReader(f) if r.get("code")}

    for d in docs:
        if d["category"].strip().lower() not in CATS:
            sys.exit(f"Unknown category {d['category']!r} for {d['file']}")
        if not os.path.isfile(os.path.join(src, d["file"])):
            sys.exit(f"Missing file: {d['file']}")

    if os.path.isdir(VAULT):
        shutil.rmtree(VAULT)
    os.makedirs(os.path.join(VAULT, "f"))

    rows = []
    for inv in investors:
        iid = norm_id(inv["id"])
        code = codes.get(iid) or new_code()
        codes[iid] = code
        who = [d["investor"].strip() for d in docs]
        mine = [d for d, w in zip(docs, who) if w == "*" or w.lower() == "@" + inv["role"] or norm_id(w) == iid]
        role_rooms = settings.get("roleRooms", {}).get(inv["role"], ROLE_ROOMS[inv["role"]])
        rooms = {k: v for k, v in settings.get("rooms", {}).items() if k in role_rooms and v}
        listed = []
        for d in mine:
            data = open(os.path.join(src, d["file"]), "rb").read()
            fname = secrets.token_hex(12) + ".enc"
            open(os.path.join(VAULT, "f", fname), "wb").write(seal(data, code))
            ext = os.path.splitext(d["file"])[1].lower()
            listed.append({
                "title": d["title"].strip(), "cat": d["category"].strip().lower(),
                "date": d.get("date", "").strip(), "file": fname, "size": len(data),
                "type": {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg"}.get(ext, "application/octet-stream"),
                "name": os.path.basename(d["file"]),
            })
        manifest = {
            "holder": {"name": inv.get("name", "").strip(), "units": int(float(inv.get("units") or 0)),
                       "since": inv.get("since", "").strip()},
            "role": inv["role"], "rooms": rooms,
            "unitsOutstanding": int(settings.get("unitsOutstanding", 10000)),
            "asOf": settings.get("asOf", ""), "note": settings.get("note", ""), "docs": listed,
        }
        open(os.path.join(VAULT, vault_name(iid) + ".enc"), "wb").write(seal(json.dumps(manifest).encode(), code))
        rows.append((iid, inv.get("name", "").strip(), code, len(listed), inv["role"], sorted(rooms)))

    with open(codes_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "name", "code"])
        for iid, name, code, *_ in rows:
            w.writerow([iid, name, code])
    # Unused files make the investor count less obvious from the outside.
    for _ in range(max(0, 24 - len(rows))):
        open(os.path.join(VAULT, secrets.token_hex(12) + ".enc"), "wb").write(os.urandom(28 + secrets.randbelow(900) + 64))

    print(f"Built {len(rows)} portal sign-ins in portal/vault/")
    for iid, name, _, n, role, rms in rows:
        print(f"  {iid:<10} {name:<28} {role:<9} {n} documents  areas: {', '.join(rms) or 'none'}")
    print(f"Access codes: {codes_path}  (private: send each code separately from the ID)")
    if not settings.get("rooms"):
        print("Note: settings.json has no \"rooms\" codes, so nobody gets the briefing or library through the portal.")


if __name__ == "__main__":
    main()
