import pytest

from app.relevance import REPAIR_RELEVANCE_THRESHOLD, classify_listing


@pytest.mark.parametrize(
    ("title", "included", "kind"),
    [
        ("iPhone 13 écran cassé", True, "device"),
        ("iPhone 13 écran non cassé fonctionne parfaitement", False, "device"),
        ("iPhone 13 excellent état garantie 6 mois", False, "device"),
        ("Lot de 3 verres trempés 9H iPhone 15", False, "accessory"),
        ("Coque iPhone 13 neuve", False, "accessory"),
        ("iPhone 13 pour pièces ne s'allume plus", True, "device"),
        ("iPhone 13 dos cassé mais fonctionne", True, "device"),
        ("Réparation écran iPhone 13", False, "service"),
        ("Réparation iPhone express", False, "service"),
        ("Réparation tous ordinateurs apple", False, "service"),
        ("Écran iPhone", False, "spare_part"),
        ("Écran OLED compatible iPhone 13", False, "spare_part"),
    ],
)
def test_repair_relevance_examples(title: str, included: bool, kind: str) -> None:
    result = classify_listing(title, None, "iPhone écran cassé")
    assert result.included is included
    assert result.listing_kind == kind
    if included:
        assert result.repair_relevance_score >= REPAIR_RELEVANCE_THRESHOLD
    else:
        assert result.exclusion_reasons


def test_real_fault_outweighs_mild_functional_wording() -> None:
    result = classify_listing("iPhone 13 dos cassé mais fonctionne", None, "iPhone écran cassé")
    assert result.included
    assert result.repair_relevance_score == 70
    assert "dos cassé" in result.positive_signals
    assert "fonctionne" in result.negative_signals
