"""Structured outputs the Gemini agents must return."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class Issue(BaseModel):
    title: str = Field(description="Short name of the problem, in the user's language")
    detail: str = Field(description="One or two sentences on what you can see, in the user's language")
    severity: str = Field(description="One of: low, medium, high, danger")
    likely_cause: str = Field(description="Most likely cause, in the user's language")
    where: Optional[str] = Field(None, description="Where it is in the photo or video, in plain words, in the user's language")
    confidence: str = Field("medium", description="How sure you are from what is visible: high, medium or low")
    box_2d: Optional[list[int]] = Field(
        None, description="For photos only: [ymin, xmin, ymax, xmax] normalised 0-1000 around where the problem is visible")


class Action(BaseModel):
    step: str = Field(description="What to do, in the user's language, plain words")
    who: str = Field(description="'you' if a homeowner can do it safely, 'technician' otherwise")


class Diagnosis(BaseModel):
    subject: str = Field(description="What the media shows: panels, inverter, wiring, battery, mounting, meter, other, not_solar")
    summary: str = Field(description="One sentence verdict in the user's language")
    overall_severity: str = Field(description="One of: ok, low, medium, high, danger")
    issues: list[Issue]
    output_loss_low_pct: Optional[int] = Field(None, description="Lower estimate of energy lost because of these issues, percent")
    output_loss_high_pct: Optional[int] = Field(None, description="Upper estimate of energy lost, percent")
    actions: list[Action]
    safety_warning: Optional[str] = Field(None, description="Only if there is an electrical or fall risk, in the user's language")
    looks_ok: list[str] = Field(default_factory=list, description="Up to 3 short things that look fine, in the user's language")
    next_photo: Optional[str] = Field(None, description="What to photograph next to confirm or rule out a problem, in the user's language")
    call_technician: bool
    confidence: str = Field(description="low, medium or high")
    spoken_script: str = Field(description="What the assistant says out loud: 30-45 seconds, warm and simple, in the user's language")


class InverterDay(BaseModel):
    date: str = Field(description="YYYY-MM-DD if visible, otherwise a label like 'today'")
    kwh: float


class InverterReading(BaseModel):
    is_inverter_app: bool = Field(description="False if the image is not an inverter/solar monitoring screen")
    brand: Optional[str] = None
    capacity_kw: Optional[float] = Field(None, description="System/PV capacity in kW if shown")
    today_kwh: Optional[float] = None
    month_kwh: Optional[float] = None
    days_into_month: Optional[int] = Field(None, description="If month_kwh is shown, how many days it covers, if inferable")
    daily: list[InverterDay] = Field(default_factory=list, description="Per-day energy values if a chart or list is visible")
    current_power_kw: Optional[float] = None
    fault_codes: list[str] = Field(default_factory=list)
    notes: Optional[str] = None


class PerformanceExplanation(BaseModel):
    summary: str = Field(description="One sentence verdict in the user's language")
    likely_causes: list[str] = Field(description="Most likely reasons for the gap, most likely first, user's language")
    actions: list[Action]
    spoken_script: str = Field(description="30-40 seconds spoken in the user's language, mention the money lost per month in the given currency")


class Answer(BaseModel):
    question_heard: str = Field(description="The user's question as you understood it, in their language")
    answer: str = Field(description="Answer in the user's language, 2-4 sentences")
    spoken_script: str = Field(description="Same answer phrased for speaking aloud")
