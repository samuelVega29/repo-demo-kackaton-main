"""ROI parsing contract for POST /api/analyses.

- roi = null/empty -> whole camera frame (None).
- otherwise -> JSON polygon of 4+ normalized points; irregular areas allowed.
"""
from fastapi import HTTPException
from pytest import raises

from app.routers.analyses import parse_roi


def test_none_and_blank_mean_whole_frame() -> None:
    assert parse_roi(None) is None
    assert parse_roi("") is None
    assert parse_roi("   ") is None


def test_valid_polygon_roundtrips() -> None:
    roi = "[[0.1,0.1],[0.9,0.1],[0.9,0.9],[0.1,0.9]]"
    assert parse_roi(roi) == [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]


def test_irregular_polygon_allowed() -> None:
    roi = "[[0.1,0.1],[0.5,0.05],[0.9,0.1],[0.85,0.9],[0.15,0.95]]"
    assert len(parse_roi(roi)) == 5


def test_less_than_four_points_rejected() -> None:
    with raises(HTTPException):
        parse_roi("[[0.1,0.1],[0.9,0.1],[0.9,0.9]]")


def test_out_of_range_coordinate_rejected() -> None:
    with raises(HTTPException):
        parse_roi("[[0.1,0.1],[1.5,0.1],[0.9,0.9],[0.1,0.9]]")
    with raises(HTTPException):
        parse_roi("[[-0.1,0.1],[0.9,0.1],[0.9,0.9],[0.1,0.9]]")


def test_non_json_rejected() -> None:
    with raises(HTTPException):
        parse_roi("not-json")


def test_non_numeric_coordinates_rejected() -> None:
    with raises(HTTPException):
        parse_roi("[[0.1,0.1],['a',0.1],[0.9,0.9],[0.1,0.9]]")