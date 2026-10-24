import re


NI_REGEX = re.compile(r"\b(?!BG|GB|KN|NK|NT|TN|ZZ)[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]?\b", re.IGNORECASE)
POSTCODE_REGEX = re.compile(
    r"\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b",
    re.IGNORECASE,
)


def is_valid_nhs_number(value: str) -> bool:
    digits = re.sub(r"\D", "", value)
    if len(digits) != 10:
        return False
    nums = [int(x) for x in digits]
    weighted_sum = sum((10 - i) * nums[i] for i in range(9))
    check_digit = 11 - (weighted_sum % 11)
    if check_digit == 11:
        check_digit = 0
    if check_digit == 10:
        return False
    return nums[9] == check_digit


def contains_uk_ni(value: str) -> bool:
    return NI_REGEX.search(value) is not None


def contains_uk_postcode(value: str) -> bool:
    return POSTCODE_REGEX.search(value) is not None
