#!/usr/bin/env python3
"""Build the encrypted AeroAssist investor and team portal.

Everything the portal shows lives in portal/vault/, encrypted. This script
builds that folder from a PRIVATE input folder (never commit it):

  portal-input/
    people.csv     id,name,role,units,since[,invested][,email][,title]
                     role = prospect | investor | employee | admin
                     invested = total paid for the units, in dollars (optional)
    library.csv    group,category,title,description,date,file
                     group = company | investors | holders | team | admin
                     (who may open the document; see GROUPS below)
    documents.csv  investor,category,title,date,file          (optional)
                     personal files: investor = a portal ID, * for everyone,
                     or @role; category = tax | agreements | certificates |
                     updates | team | other
    transactions.csv  id,date,type,units,amount,note           (optional)
                     one row per purchase, gift, transfer or repayment
    settings.json  {"asOf": "2026-10-09", "unitsOutstanding": 10000,
                    "unitPrice": 2000, "priceLabel": "$2M round at $20M pre-money",
                    "priceHistory": [{"date": "2023-04-01", "price": 400, "label": "First round"}],
                    "announcements": [{"date": "2026-10-09", "title": "...", "body": "..."}],
                    "taxNote": "When this year's K-1s will be ready (shown to unit holders)",
                    "companyFacts": [["Founded", "2022"], ["Headquarters", "Phoenix, Arizona"]],
                    "note": "Message shown to everyone"}       (optional)
    keys.json      group keys, created on first run    (keep private, keep safe)
    codes.csv      each person's access code, created on first run (keep private)

How access works:
  * Each library group has its own random 256-bit key (keys.json). Every
    library file is encrypted with its group's key, so a person can only open
    the groups their role includes.
  * Each person has a manifest encrypted with their access code (PBKDF2,
    250,000 rounds). It holds their name, holdings, the keys for their
    groups, and a personal key for their own documents.

Common jobs:
  * Add or remove a person: edit people.csv and rebuild. Removing someone
    also stops their code working, but they may have kept copies of the
    group keys; for a departure that matters, rotate the group keys.
  * Rotate a person's code: delete their row from codes.csv and rebuild.
  * Rotate a group key (after someone leaves): delete that group from
    keys.json and rebuild. Everyone keeps their own code.
  * Add a library document: add the file and a row to library.csv, rebuild.

Usage:  python3 tools/portal_build.py [input_dir]
Needs:  pip install cryptography
"""
import base64, csv, hashlib, json, os, secrets, shutil, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITER = 250000                     # must match portal/index.html
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
GROUPS = {   # library group -> roles that may open it
    "company":   {"prospect", "investor", "employee", "admin"},
    "investors": {"prospect", "investor", "admin"},
    "holders":   {"investor", "admin"},
    "team":      {"employee", "admin"},
    "admin":     {"admin"},
}
ROLES = {"prospect", "investor", "employee", "admin"}
PCATS = {"tax", "agreements", "certificates", "updates", "team", "other"}
TYPES = {".pdf": "application/pdf", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
         ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
         ".png": "image/png", ".jpg": "image/jpeg", ".csv": "text/csv"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VAULT = os.path.join(ROOT, "portal", "vault")


def norm_id(v):
    return "".join(str(v).split()).upper()


def norm_code(v):
    return str(v).replace("-", "").replace(" ", "").upper()


def new_code():
    raw = "".join(secrets.choice(ALPHABET) for _ in range(16))   # 80 bits
    return "-".join(raw[i:i + 4] for i in range(0, 16, 4))


def seal_code(data, code):
    salt, iv = os.urandom(16), os.urandom(12)
    key = hashlib.pbkdf2_hmac("sha256", norm_code(code).encode(), salt, ITER, 32)
    return salt + iv + AESGCM(key).encrypt(iv, data, None)


def seal_key(data, key):
    iv = os.urandom(12)
    return iv + AESGCM(key).encrypt(iv, data, None)


def b64(b):
    return base64.b64encode(b).decode()


def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        return [{k.strip(): (v or "").strip() for k, v in r.items() if k} for r in csv.DictReader(f)]


def put(data, key):
    name = secrets.token_hex(12) + ".enc"
    with open(os.path.join(VAULT, "f", name), "wb") as f:
        f.write(seal_key(data, key))
    return name


def meta(path, title, date, extra):
    ext = os.path.splitext(path)[1].lower()
    d = {"title": title, "date": date, "size": os.path.getsize(path),
         "type": TYPES.get(ext, "application/octet-stream"), "name": os.path.basename(path)}
    d.update(extra)
    return d


def main():
    src = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "portal-input"))
    if src.startswith(ROOT + os.sep) and os.path.basename(src) != "portal-input":
        sys.exit("Keep the input folder outside the site, or name it portal-input (git ignores it).")
    people = read_csv(os.path.join(src, "people.csv"))
    if not people:
        sys.exit("people.csv is missing or empty.")
    library = read_csv(os.path.join(src, "library.csv"))
    personal = read_csv(os.path.join(src, "documents.csv"))
    txns = read_csv(os.path.join(src, "transactions.csv"))
    settings = json.load(open(os.path.join(src, "settings.json"))) if os.path.exists(os.path.join(src, "settings.json")) else {}

    # Check everything before touching the vault.
    for p in people:
        p["role"] = (p.get("role") or "").lower()
        if not p.get("id") or p["role"] not in ROLES:
            sys.exit(f"people.csv: every row needs an id and a role ({', '.join(sorted(ROLES))}); problem row: {p}")
    ids = [norm_id(p["id"]) for p in people]
    if len(set(ids)) != len(ids):
        sys.exit("people.csv: the same ID appears twice.")
    for d in library:
        if d.get("group") not in GROUPS:
            sys.exit(f"library.csv: unknown group {d.get('group')!r} for {d.get('title')}")
        if not os.path.isfile(os.path.join(src, d["file"])):
            sys.exit(f"library.csv: missing file {d['file']}")
    for d in personal:
        if d.get("category", "").lower() not in PCATS:
            sys.exit(f"documents.csv: unknown category {d.get('category')!r} for {d.get('title')}")
        if not os.path.isfile(os.path.join(src, d["file"])):
            sys.exit(f"documents.csv: missing file {d['file']}")

    keys_path = os.path.join(src, "keys.json")
    keys = json.load(open(keys_path)) if os.path.exists(keys_path) else {}
    for g in GROUPS:
        if g not in keys:
            keys[g] = b64(os.urandom(32))
    with open(keys_path, "w") as f:
        json.dump(keys, f, indent=1)
    gkey = {g: base64.b64decode(keys[g]) for g in GROUPS}

    codes_path = os.path.join(src, "codes.csv")
    codes = {norm_id(r["id"]): r["code"] for r in read_csv(codes_path) if r.get("code")}

    if os.path.isdir(VAULT):
        shutil.rmtree(VAULT)
    os.makedirs(os.path.join(VAULT, "f"))

    # Library: one encrypted catalog per group, named by a hash of its key.
    counts = {}
    for g in GROUPS:
        docs = []
        for d in (x for x in library if x["group"] == g):
            path = os.path.join(src, d["file"])
            docs.append(meta(path, d["title"], d.get("date", ""), {
                "desc": d.get("description", ""), "cat": d.get("category", "Documents"),
                "file": put(open(path, "rb").read(), gkey[g])}))
        name = hashlib.sha256(gkey[g]).hexdigest()[:24] + ".enc"
        with open(os.path.join(VAULT, name), "wb") as f:
            f.write(seal_key(json.dumps({"group": g, "docs": docs}).encode(), gkey[g]))
        counts[g] = len(docs)

    # People.
    rows = []
    for p in people:
        iid, role = norm_id(p["id"]), p["role"]
        code = codes.get(iid) or new_code()
        pkey = os.urandom(32)
        mine = []
        for d in personal:
            w = d["investor"]
            if w == "*" or w.lower() == "@" + role or norm_id(w) == iid:
                path = os.path.join(src, d["file"])
                mine.append(meta(path, d["title"], d.get("date", ""), {
                    "cat": d["category"].lower(), "file": put(open(path, "rb").read(), pkey)}))
        groups = sorted(g for g, rs in GROUPS.items() if role in rs)
        my_txns = [{"date": t.get("date", ""), "type": t.get("type", ""), "units": float(t.get("units") or 0),
                    "amount": float(t.get("amount") or 0), "note": t.get("note", "")}
                   for t in txns if norm_id(t.get("id", "")) == iid]
        manifest = {
            "holder": {"name": p.get("name", ""), "units": int(float(p.get("units") or 0)), "since": p.get("since", ""),
                       "invested": float(p.get("invested") or 0), "title": p.get("title", ""), "email": p.get("email", "")},
            "role": role, "groups": {g: keys[g] for g in groups}, "pk": b64(pkey),
            "unitsOutstanding": int(settings.get("unitsOutstanding", 10000)),
            "unitPrice": float(settings.get("unitPrice", 0)), "priceLabel": settings.get("priceLabel", ""),
            "priceHistory": settings.get("priceHistory", []), "announcements": settings.get("announcements", []), "taxNote": settings.get("taxNote", ""), "company": settings.get("companyFacts", []),
            "asOf": settings.get("asOf", ""), "note": settings.get("note", ""), "docs": mine, "transactions": my_txns,
        }
        if role == "admin":   # admins see who has access (never anyone's code)
            manifest["roster"] = [{"id": norm_id(q["id"]), "name": q.get("name", ""), "role": q["role"],
                                   "units": int(float(q.get("units") or 0)), "invested": float(q.get("invested") or 0)}
                                  for q in people]
        vname = hashlib.sha256(("aeroassist-portal:" + iid).encode()).hexdigest()[:24] + ".enc"
        with open(os.path.join(VAULT, vname), "wb") as f:
            f.write(seal_code(json.dumps(manifest).encode(), code))
        rows.append((iid, p.get("name", ""), role, code, len(mine), groups))

    with open(codes_path, "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["id", "name", "role", "code"])
        for iid, name, role, code, *_ in rows:
            w.writerow([iid, name, role, code])
    # Decoy files so the number of people isn't obvious from outside.
    for _ in range(max(0, 32 - len(rows))):
        with open(os.path.join(VAULT, secrets.token_hex(12) + ".enc"), "wb") as f:
            f.write(os.urandom(200 + secrets.randbelow(1800)))

    print("Library:", ", ".join(f"{g} {n}" for g, n in counts.items()))
    print(f"People: {len(rows)}")
    for iid, name, role, _, n, groups in rows:
        print(f"  {iid:<12} {name:<26} {role:<9} {n} own docs  opens: {', '.join(groups)}")
    print(f"Codes: {codes_path}   Group keys: {keys_path}   (both private)")


if __name__ == "__main__":
    main()
