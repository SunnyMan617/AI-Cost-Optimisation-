from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_mask_uses_unique_tokens_for_multiple_person_spans():
    text = "Alice and Bob are attending."
    masked_response = client.post("/mask", json={"text": text})
    assert masked_response.status_code == 200

    payload = masked_response.json()
    masked_text = payload["masked_text"]
    mappings = payload["mappings"]

    assert "<PII_0>" in masked_text
    assert "<PII_1>" in masked_text
    assert mappings["<PII_0>"] != mappings["<PII_1>"]

    restored_response = client.post("/restore", json={"text": masked_text, "mappings": mappings})
    assert restored_response.status_code == 200
    assert restored_response.json()["restored_text"] == text
