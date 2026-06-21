---
description: INACTIVE — ML pipeline from previous project (Medical Billing Platform). Not applicable to FSD Task (Airtable Integration Dashboard).
argument-hint: [experiment-name]
---

## STATUS: NOT APPLICABLE

This command was for the Medical Billing Platform ML pipeline (Phase 4+).
The FSD Task (Airtable Integration Dashboard) has no ML requirements.

# ML Pipeline Run

> **INACTIVE — Phase 4+ only.**
>
> This command is not in scope for the current build phases (Phase 1–3).
> It will become relevant in **Phase 4** for:
> - AI-assisted ICD-10/CPT code suggestions from encounter notes
> - Denial pattern detection and prediction
> - Automated eligibility pre-screening
>
> Do not invoke this command until Phase 4 is scoped and the `ml-engineer` agent is activated.

---

When Phase 4 is reached, this command will orchestrate:

1. **Data Stage** — Export labeled billing data (claim outcomes, denial reasons, code patterns)
2. **Training Stage** — Train classification/recommendation models
3. **Evaluation Stage** — Validate against billing accuracy benchmarks
4. **Deployment** — Serve predictions via NestJS API endpoints

Revisit and rewrite this command when Phase 4 begins.
