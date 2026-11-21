import re
from typing import Tuple, List

# Email address regex
EMAIL_REGEX = re.compile(
    r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'
)

# Phone number regex: matches US and international formats, e.g.:
# +1-555-123-4567, (555) 123-4567, 555-123-4567, +44 20 7123 4567, 10-digit numbers
PHONE_REGEX = re.compile(
    r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b'
    r'|(?:\+\d{1,3}[-.\s]?)?\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b'
    r'|\b\d{10}\b'
)

# Payment card numbers: 13 to 19 digits (Visa, Mastercard, Amex, etc.)
CARD_REGEX = re.compile(
    r'\b(?:\d{4}[-\s]){3}\d{4}\b'
    r'|\b\d{4}[-\s]\d{6}[-\s]\d{5}\b'
    r'|\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|3[47]\d{13}|6(?:011|5\d{2})\d{12})\b'
    r'|\b\d{15,19}\b'
)

def redact_pii(text: str) -> Tuple[str, List[str]]:
    """
    Redacts emails, phone numbers, and payment card numbers from user query.
    Returns the redacted text and a list of detected PII categories.
    """
    if not text:
        return text, []

    detected = []

    # 1. Redact Cards first (so 15-16 digit numbers aren't partially matched as phone)
    if CARD_REGEX.search(text):
        detected.append("card")
        text = CARD_REGEX.sub("[CARD_REDACTED]", text)

    # 2. Redact Emails
    if EMAIL_REGEX.search(text):
        detected.append("email")
        text = EMAIL_REGEX.sub("[EMAIL_REDACTED]", text)

    # 3. Redact Phone Numbers
    if PHONE_REGEX.search(text):
        detected.append("phone")
        text = PHONE_REGEX.sub("[PHONE_REDACTED]", text)

    return text, detected
