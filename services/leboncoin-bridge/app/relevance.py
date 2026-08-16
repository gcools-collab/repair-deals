from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Literal

from app.broken_detection import normalize_text

ListingKind = Literal["device", "accessory", "spare_part", "service", "lot", "unknown"]
REPAIR_RELEVANCE_THRESHOLD = 60
SEARCH_RELEVANCE_THRESHOLD = 55

POSITIVE_PATTERNS: tuple[tuple[str, str, int], ...] = (
    ("écran cassé", r"\becran\s+(?:est\s+)?(?:casse|brise|fissure)\b", 70),
    ("ne s'allume plus", r"\b(?:ne\s+)?s\s+allume\s+plus\b", 70),
    ("pour pièces", r"\bpour\s+piec(?:e|es)\b", 70),
    ("à réparer", r"\ba\s+reparer\b|\breparation\s+a\s+prevoir\b", 65),
    ("HDMI HS", r"\b(?:port\s+)?hdmi\s+(?:h\s*s|hors\s+service|casse|defectueux)\b", 70),
    ("batterie HS", r"\bbatterie\s+(?:h\s*s|morte|defectueuse|hors\s+service)\b", 65),
    ("dos cassé", r"\b(?:dos|vitre\s+arriere)\s+(?:casse|brise|fissure)\b", 70),
    ("ne charge plus", r"\b(?:ne\s+)?charge\s+plus\b", 65),
    ("ne fonctionne plus", r"\b(?:ne\s+)?fonctionne\s+plus\b", 65),
    ("en panne", r"\ben\s+panne\b", 60),
    ("pour bricoleur", r"\bpour\s+(?:un\s+)?bricoleur\b", 60),
    ("vendu en l'état", r"\bvendu(?:e)?\s+en\s+l\s+etat\b", 50),
    ("cassé", r"\bcass(?:e|ee|es|ees)\b|\bbrise(?:e|s|es)?\b|\bfissure(?:e|s|es)?\b", 45),
    ("HS", r"\bh\s*s\b|\bhors\s+service\b", 45),
    ("défectueux", r"\bdefectueu(?:x|se|ses)\b", 45),
)

NEGATIVE_PATTERNS: tuple[tuple[str, str, int], ...] = (
    ("panne niée", r"\b(?:pas|non)\s+(?:casse|brise|fissure|h\s*s|en\s+panne)\b|\becran\s+non\s+casse\b", 80),
    ("aucune casse", r"\baucune?\s+casse\b", 80),
    ("aucun défaut", r"\baucun\s+defaut\b", 75),
    ("aucun problème", r"\baucun\s+probleme\b", 70),
    ("fonctionne parfaitement", r"\bfonctionne\s+(?:parfaitement|tres\s+bien)\b|\bparfaitement\s+fonctionnel\b", 70),
    ("testé fonctionnel", r"\bteste(?:e)?\s+fonctionnel(?:le)?\b", 65),
    ("comme neuf", r"\bcomme\s+neuf\b", 65),
    ("excellent état", r"\bexcellent\s+etat\b", 65),
    ("très bon état", r"\btres\s+bon\s+etat\b", 45),
    ("garantie", r"\bgarantie\s+(?:de\s+)?\d+\s+mois\b|\bsous\s+garantie\b", 40),
    ("vendu fonctionnel", r"\bvendu(?:e)?\s+(?:comme\s+)?fonctionnel(?:le)?\b", 55),
    ("fonctionne", r"\bfonctionne\b", 10),
)

ACCESSORY = (r"\bverres?\s+trempes?\b", r"\bprotection\s+(?:d\s+)?ecran\b", r"\bcoque\b", r"\betui\b", r"\bhousse\b", r"\bcable\b", r"\bchargeur\s+seul\b", r"\badaptateur\b", r"\bfilm\s+(?:de\s+)?protection\b", r"\bvitre\s+de\s+protection\b", r"\blot\s+d\s+accessoires\b")
SERVICE = (r"^reparation\b", r"\breparation\s+(?:d\s+)?ecran\b", r"\bservice\s+de\s+reparation\b", r"\bje\s+repare\b", r"^depannage\b")
SPARE_PART = (r"^ecran\s+(?:pour\s+)?iphone\b", r"\becran\s+(?:oled|lcd|amoled)\s+(?:compatible|pour)\b", r"\bpiece\s+detachee\b", r"\bmodule\s+de\s+remplacement\b")
QUERY_NOISE = {"a", "reparer", "reparation", "casse", "cassee", "brise", "fissure", "ecran", "hs", "panne", "pieces", "pour", "ne", "plus", "allume", "fonctionne", "batterie", "morte", "port", "hdmi", "defectueux"}


@dataclass(frozen=True)
class RepairClassification:
    repair_relevance_score: int
    search_relevance_score: int
    exclusion_reasons: list[str]
    positive_signals: list[str]
    negative_signals: list[str]
    listing_kind: ListingKind

    @property
    def included(self) -> bool:
        return not self.exclusion_reasons


def _any(patterns: tuple[str, ...], text: str) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)


def listing_kind(title: str, description: str | None = None) -> ListingKind:
    title_text = normalize_text(title)
    text = normalize_text(" ".join(filter(None, (title, description))))
    if _any(SERVICE, title_text):
        return "service"
    if _any(ACCESSORY, title_text):
        return "accessory"
    if _any(SPARE_PART, title_text):
        return "spare_part"
    if re.search(r"\blot\s+(?:de\s+)?\d*", title_text):
        return "lot"
    if re.search(r"\b(?:iphone|ipad|macbook|playstation|ps[345]|xbox|switch|telephone|smartphone|ordinateur|pc|tv|televiseur|console)\b", text):
        return "device"
    return "unknown"


def classify_listing(title: str, description: str | None, query: str) -> RepairClassification:
    text = normalize_text(" ".join(filter(None, (title, description))))
    positives = [(label, weight) for label, pattern, weight in POSITIVE_PATTERNS if re.search(pattern, text)]
    negatives = [(label, weight) for label, pattern, weight in NEGATIVE_PATTERNS if re.search(pattern, text)]
    positive_signals = list(dict.fromkeys(label for label, _ in positives))
    negative_signals = list(dict.fromkeys(label for label, _ in negatives))
    strongest_positive = max((weight for _, weight in positives), default=0)
    negative_penalty = max((weight for _, weight in negatives), default=0)
    repair_score = max(0, min(100, strongest_positive + min(25, max(0, len(positive_signals) - 1) * 10) - negative_penalty))

    kind = listing_kind(title, description)
    terms = [token for token in normalize_text(query).split() if len(token) >= 2 and token not in QUERY_NOISE]
    matched = sum(1 for term in terms if re.search(rf"\b{re.escape(term)}\b", text))
    identity_score = 60 if terms and matched == len(terms) else (40 if matched else 0)
    search_score = 100 if not terms else min(100, identity_score + (25 if positive_signals else 0) + (15 if kind == "device" else 0))

    reasons: list[str] = []
    if kind in {"accessory", "service", "spare_part"}:
        reasons.append(f"listing_kind:{kind}")
    if terms and matched == 0:
        reasons.append("search_identity_mismatch")
    if terms and search_score < SEARCH_RELEVANCE_THRESHOLD:
        reasons.append("search_relevance_below_threshold")
    if repair_score < REPAIR_RELEVANCE_THRESHOLD:
        reasons.append("repair_relevance_below_threshold")
    if negative_penalty >= 55 and strongest_positive < 70:
        reasons.append("strong_functional_contradiction")
    return RepairClassification(repair_score, search_score, reasons, positive_signals, negative_signals, kind)
