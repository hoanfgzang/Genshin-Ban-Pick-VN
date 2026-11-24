from __future__ import annotations

import secrets
import string

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..core.deps import get_current_user
from ..core.errors import bad_request, not_found
from ..models.match import Match
from ..models.ruleset import RuleSet
from ..models.user import User
from ..schemas.match import CreateMatchRequest, MatchState, MatchSummaryResponse
from ..schemas.ruleset import RuleSetConfig
from ..services.draft_engine import create_initial_match_state
from ..services.room_manager import room_manager

router = APIRouter(prefix="/api", tags=["matches"])

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


async def _generate_unique_code(db: AsyncSession) -> str:
    for _ in range(15):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        exists = await db.execute(select(Match.id).where(Match.code == code))
        if exists.scalar_one_or_none() is None:
            return code
    raise RuntimeError("Không thể sinh mã phòng duy nhất.")


@router.post("/matches", response_model=MatchState)
async def create_match(
    body: CreateMatchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MatchState:
    res = await db.execute(select(RuleSet).where(RuleSet.id == body.ruleset_id))
    ruleset_row = res.scalar_one_or_none()
    if not ruleset_row:
        raise not_found("RULESET_NOT_FOUND", "Không tìm thấy bộ luật đã chọn.")
    if not ruleset_row.is_active:
        raise bad_request("RULESET_INACTIVE", "Bộ luật này hiện đang tạm khóa.")

    config = RuleSetConfig.model_validate(ruleset_row.config_json)
    code = await _generate_unique_code(db)
    state = create_initial_match_state(
        code=code,
        ruleset_id=ruleset_row.id,
        ruleset_name=ruleset_row.name,
        ruleset=config,
        host_user_id=user.id,
        match_format=body.format,
    )

    match = Match(
        code=code,
        ruleset_id=ruleset_row.id,
        ruleset_name=ruleset_row.name,
        ruleset_snapshot=config.model_dump(by_alias=True),
        status=state.status,
        host_user_id=user.id,
        state_json=state.model_dump(by_alias=True),
    )
    db.add(match)
    await db.commit()
    return state


@router.get("/matches/{code}", response_model=MatchState)
async def get_match(
    code: str,
    db: AsyncSession = Depends(get_db),
) -> MatchState:
    state = await room_manager.get_state(db, code)
    if not state:
        raise not_found("MATCH_NOT_FOUND", "Không tìm thấy phòng đấu.")
    return state


@router.get("/me/matches", response_model=list[MatchSummaryResponse])
async def list_my_matches(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MatchSummaryResponse]:
    stmt = (
        select(Match)
        .where(
            or_(
                Match.host_user_id == user.id,
                Match.blue_user_id == user.id,
                Match.red_user_id == user.id,
            )
        )
        .order_by(Match.created_at.desc())
        .limit(20)
    )
    res = await db.execute(stmt)
    rows = res.scalars().all()
    summaries: list[MatchSummaryResponse] = []
    for row in rows:
        st = MatchState.model_validate(row.state_json)
        b_player = st.sides["blue"].player
        r_player = st.sides["red"].player
        b_wins = st.series_scores.get(b_player.user_id, 0) if b_player else 0
        r_wins = st.series_scores.get(r_player.user_id, 0) if r_player else 0
        summaries.append(
            MatchSummaryResponse(
                id=row.id,
                code=row.code,
                ruleset_name=row.ruleset_name,
                status=st.status,
                winner_side=st.winner_side,
                blue_player=b_player,
                red_player=r_player,
                blue_final_score=st.sides["blue"].final_score,
                red_final_score=st.sides["red"].final_score,
                format=st.format,
                current_game=st.current_game,
                max_games=st.max_games,
                blue_series_wins=b_wins,
                red_series_wins=r_wins,
                created_at=row.created_at,
                finished_at=row.finished_at,
            )
        )
    return summaries
