from __future__ import annotations

import re
import unicodedata


FAULT_PATTERNS: tuple[tuple[str, str], ...] = (
    ("HS", r"\bh\s*s\b|\bhors\s+service\b"),
    ("cassé", r"\bcass(?:e|ee|es|ees)\b|\bbrise(?:e|s|es)?\b"),
    ("pour pièces", r"\bpour\s+piec(?:e|es)\b|\bpieces?\s+detachees?\b"),
    ("à réparer", r"\ba\s+reparer\b|\breparation\s+a\s+prevoir\b"),
    ("en panne", r"\ben\s+panne\b|\bpanne(?:e|s)?\b"),
    ("ne fonctionne plus", r"\bne\s+fonctionne\s+plus\b|\bfonctionne\s+plus\b"),
    ("ne s'allume plus", r"\bne\s+s\s+allume\s+plus\b|\bs\s+allume\s+plus\b"),
    ("écran cassé", r"\becran\s+(?:est\s+)?(?:casse|brise|fissure)\b"),
    ("dalle HS", r"\bdalle\s+(?:h\s*s|hors\s+service)\b"),
    ("HDMI HS", r"\bhdmi\s+(?:h\s*s|hors\s+service)\b|\bport\s+hdmi\s+(?:casse|defectueux)\b"),
    ("batterie HS", r"\bbatterie\s+(?:h\s*s|morte|defectueuse|hors\s+service)\b"),
    ("ne charge plus", r"\bne\s+charge\s+plus\b|\bcharge\s+plus\b"),
    ("carte mère", r"\bcarte\s+mere\b"),
    ("rétroéclairage", r"\bretro\s*eclairage\b|\bbacklight\b"),
    ("pour bricoleur", r"\bpour\s+(?:un\s+)?bricoleur\b"),
    ("vendu en l'état", r"\bvendu(?:e)?\s+en\s+l\s+etat\b|\ben\s+l\s+etat\b"),
    ("défectueux", r"\bdefectueu(?:x|se|ses)\b"),
    ("défaut", r"\bdefaut(?:s)?\b"),
)


def normalize_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    without_accents = "".join(
        character for character in decomposed if not unicodedata.combining(character)
    )
    return re.sub(r"[^a-z0-9]+", " ", without_accents).strip()


def detect_fault_keywords(*values: str | None) -> list[str]:
    haystack = normalize_text(" ".join(value for value in values if value))
    if not haystack:
        return []
    return [label for label, pattern in FAULT_PATTERNS if re.search(pattern, haystack)]
