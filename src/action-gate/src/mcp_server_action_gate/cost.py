from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class CostAvoidanceEstimate:
    unattended_high_tier_denied: int
    write_simulated: int
    fde_minutes_saved: float
    hourly_operator_cost_usd: float
    ungated_blast_cost_usd: float
    estimated_operator_savings_usd: float
    estimated_blast_avoidance_usd: float
    estimated_total_avoidance_usd: float
    notes: list[str]

    def to_dict(self) -> dict:
        return asdict(self)


def estimate_cost_avoidance(
    *,
    unattended_high_tier_denied: int,
    write_simulated: int,
    fde_minutes_saved: float,
    hourly_operator_cost_usd: float = 200.0,
    ungated_blast_cost_usd: float = 25000.0,
) -> CostAvoidanceEstimate:
    """
    Illustrative Gate/Prove cost sketch for Instant Audit / consultation.

    Defaults are mid-market FDE assumptions — not a quote.
    """
    operator = round((fde_minutes_saved / 60.0) * hourly_operator_cost_usd, 2)
    blast = round(unattended_high_tier_denied * ungated_blast_cost_usd, 2)
    return CostAvoidanceEstimate(
        unattended_high_tier_denied=unattended_high_tier_denied,
        write_simulated=write_simulated,
        fde_minutes_saved=fde_minutes_saved,
        hourly_operator_cost_usd=hourly_operator_cost_usd,
        ungated_blast_cost_usd=ungated_blast_cost_usd,
        estimated_operator_savings_usd=operator,
        estimated_blast_avoidance_usd=blast,
        estimated_total_avoidance_usd=round(operator + blast, 2),
        notes=[
            "illustrative_not_a_quote",
            "unattended_high_tier_denied_avoids_agent_executing_destructive_tools",
            "write_simulated_is_gate_prove_no_side_effects",
            "compare_to_instant_audit_499_evaluation_instrument",
        ],
    )
