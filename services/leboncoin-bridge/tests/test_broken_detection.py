from app.broken_detection import detect_fault_keywords


def test_detection_is_case_accent_and_punctuation_insensitive() -> None:
    detected = detect_fault_keywords(
        "TV SAMSUNG — DALLE H.S.",
        "Vendue en l’état, rétro-éclairage défectueux.",
    )
    assert "dalle HS" in detected
    assert "vendu en l'état" in detected
    assert "rétroéclairage" in detected
    assert "défectueux" in detected


def test_detection_covers_repair_vocabulary() -> None:
    detected = detect_fault_keywords(
        "Écran cassé, batterie morte, ne charge plus, carte mère à réparer"
    )
    assert {"cassé", "écran cassé", "batterie HS", "ne charge plus", "carte mère", "à réparer"} <= set(detected)


def test_detection_avoids_hs_inside_unrelated_words() -> None:
    assert detect_fault_keywords("Casque Marshall en parfait état") == []
