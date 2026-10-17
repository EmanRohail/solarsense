"""Firestore on Google Cloud, in-memory locally. Photos and videos are never stored, only the results.

Collections:
  inspections/{id}   diagnosis from a photo or video, plus follow-up Q&A
  checks/{id}        performance checks from inverter screenshots
  ui/{lang:hash}     interface text translated by Gemini, cached
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

_db = None
_mem: dict[str, dict[str, dict]] = {"inspections": {}, "checks": {}, "ui": {}}
_mode = "memory"


def init() -> str:
    global _db, _mode
    if os.getenv("USE_FIRESTORE", "true").lower() == "true":
        try:
            from google.cloud import firestore

            _db = firestore.Client(project=os.getenv("GOOGLE_CLOUD_PROJECT") or None)
            _mode = "firestore"
        except Exception as e:  # noqa: BLE001
            print(f"[store] Firestore unavailable ({e.__class__.__name__}); using memory")
    return _mode


def mode() -> str:
    return _mode


def save(collection: str, doc: dict, doc_id: str | None = None) -> str:
    did = doc_id or uuid.uuid4().hex[:12]
    doc = {**doc, "id": did, "updated_at": datetime.now(timezone.utc).isoformat()}
    if _db is not None:
        _db.collection(collection).document(did).set(doc)
    else:
        _mem[collection][did] = doc
    return did


def get(collection: str, doc_id: str) -> dict | None:
    if _db is not None:
        snap = _db.collection(collection).document(doc_id).get()
        return snap.to_dict() if snap.exists else None
    return _mem[collection].get(doc_id)


def append_qa(doc_id: str, qa: dict) -> None:
    doc = get("inspections", doc_id)
    if not doc:
        return
    doc.setdefault("qa", []).append(qa)
    if _db is not None:
        _db.collection("inspections").document(doc_id).set({"qa": doc["qa"]}, merge=True)
