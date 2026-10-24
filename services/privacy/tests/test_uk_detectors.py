from app.uk_detectors import contains_uk_ni, contains_uk_postcode, is_valid_nhs_number


def test_nhs_checksum_passes_valid_number():
    assert is_valid_nhs_number("943 476 5919")


def test_nhs_checksum_fails_invalid_number():
    assert not is_valid_nhs_number("943 476 5918")


def test_uk_ni_detection():
    assert contains_uk_ni("The NI number is QQ123456C") is False
    assert contains_uk_ni("The NI number is AB123456C")


def test_uk_postcode_detection():
    assert contains_uk_postcode("Our office is in SW1A 1AA")
