"""Canonical option lists derived from scholarships.json vocabulary.

Tag values on the right must exactly match strings used in the dataset.
"""

from typing import TypedDict


class VocabularyOption(TypedDict):
    label: str
    value: str


# Grade levels appearing in eligibility.grade_levels across the dataset.
GRADE_LEVEL_OPTIONS: dict[str, str] = {
    "Middle school": "middle_school",
    "High school (any grade)": "high_school",
    "High school junior": "high_school_junior",
    "High school senior": "high_school_senior",
    "College undergraduate": "college_undergraduate",
    "College graduate": "college_graduate",
    "College sophomore": "college_sophomore",
    "College junior": "college_junior",
}

# Citizenship values accepted by the matcher for student profiles.
CITIZENSHIP_OPTIONS: dict[str, str] = {
    "US citizen": "us_citizen",
    "Permanent resident": "permanent_resident",
    "DACA recipient": "daca",
    "US national": "us_national",
    "International student": "international",
}

# Demographic tags are race and ethnicity categories only. Non-racial criteria
# (financial need, first-generation status, athletics, etc.) are intentionally
# excluded. Values for African American, Asian/Pacific Islander, and
# Hispanic/Latino match strings used in eligibility.demographics in the dataset.
DEMOGRAPHIC_TAG_OPTIONS: dict[str, str] = {
    "American Indian or Alaska Native": "native_american",
    "Asian or Pacific Islander": "asian_pacific_islander",
    "Black or African American": "african_american",
    "Hispanic or Latino": "hispanic_latino",
    "Middle Eastern or North African": "middle_eastern_north_african",
    "Multiracial": "multiracial",
    "White": "white",
}

# Academic field-of-study categories appearing in eligibility.fields_of_study.
# Recognized academic subject areas only (no catch-all categories). Some areas
# overlap (for example "science" and "natural sciences"). The matcher uses an
# explicit one-way hierarchy, not raw substring matching, so broad student tags
# do not accidentally satisfy narrow scholarship requirements.
FIELD_OF_STUDY_OPTIONS: dict[str, str] = {
    "Agriculture": "agriculture",
    "Architecture": "architecture",
    "Arts (visual and performing)": "arts",
    "Business": "business",
    "Communications and journalism": "communications",
    "Computer science": "computer_science",
    "Education": "education",
    "Engineering": "engineering",
    "Environmental science": "environmental_science",
    "Health and medicine": "health_medicine",
    "Humanities": "humanities",
    "Law": "law",
    "Literature": "literature",
    "Mathematics": "mathematics",
    "Music": "music",
    "Natural sciences": "natural_sciences",
    "Nursing": "nursing",
    "Philosophy": "philosophy",
    "Research": "research",
    "Science": "science",
    "Social sciences": "social_sciences",
    "Technology": "technology",
}

FINANCIAL_NEED_LEVEL_OPTIONS: dict[str, str] = {
    "Low": "low",
    "Medium": "medium",
    "High": "high",
    "Unspecified": "unspecified",
}

# US states and DC as two-letter codes (canonical form for matcher and input).
STATE_OPTIONS: dict[str, str] = {
    "Alabama": "AL",
    "Alaska": "AK",
    "Arizona": "AZ",
    "Arkansas": "AR",
    "California": "CA",
    "Colorado": "CO",
    "Connecticut": "CT",
    "Delaware": "DE",
    "District of Columbia": "DC",
    "Florida": "FL",
    "Georgia": "GA",
    "Hawaii": "HI",
    "Idaho": "ID",
    "Illinois": "IL",
    "Indiana": "IN",
    "Iowa": "IA",
    "Kansas": "KS",
    "Kentucky": "KY",
    "Louisiana": "LA",
    "Maine": "ME",
    "Maryland": "MD",
    "Massachusetts": "MA",
    "Michigan": "MI",
    "Minnesota": "MN",
    "Mississippi": "MS",
    "Missouri": "MO",
    "Montana": "MT",
    "Nebraska": "NE",
    "Nevada": "NV",
    "New Hampshire": "NH",
    "New Jersey": "NJ",
    "New Mexico": "NM",
    "New York": "NY",
    "North Carolina": "NC",
    "North Dakota": "ND",
    "Ohio": "OH",
    "Oklahoma": "OK",
    "Oregon": "OR",
    "Pennsylvania": "PA",
    "Rhode Island": "RI",
    "South Carolina": "SC",
    "South Dakota": "SD",
    "Tennessee": "TN",
    "Texas": "TX",
    "Utah": "UT",
    "Vermont": "VT",
    "Virginia": "VA",
    "Washington": "WA",
    "West Virginia": "WV",
    "Wisconsin": "WI",
    "Wyoming": "WY",
}

GRADE_LEVEL_VALUES = frozenset(GRADE_LEVEL_OPTIONS.values())
CITIZENSHIP_VALUES = frozenset(CITIZENSHIP_OPTIONS.values())
DEMOGRAPHIC_TAG_VALUES = frozenset(DEMOGRAPHIC_TAG_OPTIONS.values())
FIELD_OF_STUDY_VALUES = frozenset(FIELD_OF_STUDY_OPTIONS.values())
FINANCIAL_NEED_LEVEL_VALUES = frozenset(FINANCIAL_NEED_LEVEL_OPTIONS.values())
STATE_CODE_VALUES = frozenset(STATE_OPTIONS.values())


def _to_option_list(options: dict[str, str]) -> list[VocabularyOption]:
    return [{"label": label, "value": value} for label, value in options.items()]


def get_vocabulary() -> dict[str, list[VocabularyOption]]:
    """Return display-label-to-tag option lists for constrained form fields."""
    return {
        "grade_level": _to_option_list(GRADE_LEVEL_OPTIONS),
        "citizenship": _to_option_list(CITIZENSHIP_OPTIONS),
        "demographic_tags": _to_option_list(DEMOGRAPHIC_TAG_OPTIONS),
        "fields_of_study": _to_option_list(FIELD_OF_STUDY_OPTIONS),
        "financial_need_level": _to_option_list(FINANCIAL_NEED_LEVEL_OPTIONS),
        "state": _to_option_list(STATE_OPTIONS),
    }
