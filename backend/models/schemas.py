from pydantic import BaseModel
from typing import Optional


class TranslateRequest(BaseModel):
    project_id: str
    target_lang: str
    source_lang: str = "auto"
    paragraph_mode: bool = False


class SaveLayoutRequest(BaseModel):
    project_id: str
    pages: list  # full pages array with updated blocks


class SpanData(BaseModel):
    text: str
    font: str
    size: float
    color: str
    bold: bool
    italic: bool
    bbox: list[float]


class LineData(BaseModel):
    spans: list[SpanData]
    bbox: list[float]


class BlockData(BaseModel):
    id: str
    bbox: list[float]
    lines: list[LineData]


class ImageData(BaseModel):
    id: str
    path: str
    bbox: list[float]


class PageData(BaseModel):
    page: int
    width: float
    height: float
    background_image: str
    blocks: list[BlockData]
    images: list[ImageData]


class ProjectResponse(BaseModel):
    project_id: str
    pages: list[PageData]
    pdf_filename: str
