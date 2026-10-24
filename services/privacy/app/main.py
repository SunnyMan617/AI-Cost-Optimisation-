import re
from typing import Dict, List

from fastapi import FastAPI
from pydantic import BaseModel
from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer, RecognizerResult
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig

from app.uk_detectors import contains_uk_ni, contains_uk_postcode, is_valid_nhs_number


class MaskRequest(BaseModel):
    text: str


class MaskResponse(BaseModel):
    masked_text: str
    mappings: Dict[str, str]
    entities: List[Dict[str, str]]


class RestoreRequest(BaseModel):
    text: str
    mappings: Dict[str, str]


class RestoreResponse(BaseModel):
    restored_text: str


class NHSPatternRecognizer(PatternRecognizer):
    def __init__(self):
        pattern = Pattern(name="nhs_number", regex=r"\b\d{3}\s?\d{3}\s?\d{4}\b", score=0.6)
        super().__init__(supported_entity="UK_NHS_NUMBER", patterns=[pattern])

    def analyze(self, text, entities, nlp_artifacts=None):
        results = super().analyze(text=text, entities=entities, nlp_artifacts=nlp_artifacts)
        filtered = []
        for result in results:
            candidate = text[result.start:result.end]
            if is_valid_nhs_number(candidate):
                filtered.append(result)
        return filtered


class UKNIRecognizer(PatternRecognizer):
    def __init__(self):
        pattern = Pattern(
            name="uk_ni_number",
            regex=r"\b(?!BG|GB|KN|NK|NT|TN|ZZ)[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]?\b",
            score=0.7,
        )
        super().__init__(supported_entity="UK_NI_NUMBER", patterns=[pattern])

    def analyze(self, text, entities, nlp_artifacts=None):
        if not contains_uk_ni(text):
            return []
        return super().analyze(text=text, entities=entities, nlp_artifacts=nlp_artifacts)


class UKPostcodeRecognizer(PatternRecognizer):
    def __init__(self):
        pattern = Pattern(name="uk_postcode", regex=r"\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b", score=0.5)
        super().__init__(supported_entity="UK_POSTCODE", patterns=[pattern])

    def analyze(self, text, entities, nlp_artifacts=None):
        results = super().analyze(text=text, entities=entities, nlp_artifacts=nlp_artifacts)
        return [result for result in results if contains_uk_postcode(text[result.start:result.end])]


app = FastAPI(title="Privacy Service")
analyzer = AnalyzerEngine()
analyzer.registry.add_recognizer(NHSPatternRecognizer())
analyzer.registry.add_recognizer(UKNIRecognizer())
analyzer.registry.add_recognizer(UKPostcodeRecognizer())
anonymizer = AnonymizerEngine()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/mask", response_model=MaskResponse)
def mask(req: MaskRequest):
    results = analyzer.analyze(
        text=req.text,
        language="en",
        entities=["PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER", "CREDIT_CARD", "UK_NHS_NUMBER", "UK_NI_NUMBER", "UK_POSTCODE"],
    )
    operators = {}
    mappings: Dict[str, str] = {}
    entities: List[Dict[str, str]] = []
    for i, result in enumerate(results):
        token = f"<PII_{i}>"
        original = req.text[result.start:result.end]
        mappings[token] = original
        entities.append({"entity_type": result.entity_type, "value": original})
        operators[result.entity_type] = OperatorConfig("replace", {"new_value": token})
    anonymized = anonymizer.anonymize(text=req.text, analyzer_results=results, operators=operators)
    return MaskResponse(masked_text=anonymized.text, mappings=mappings, entities=entities)


@app.post("/restore", response_model=RestoreResponse)
def restore(req: RestoreRequest):
    restored = req.text
    for token, value in req.mappings.items():
        restored = restored.replace(token, value)
    return RestoreResponse(restored_text=restored)
