# Existing Work Status — Pure Contract Model

> Map only supplied, verified evidence. This template does not perform Local
> Git, Remote, or PR queries and never checks out, pushes, creates, or repairs
> a Branch.

## A. New Branch and PR absent

Future new Branch planning is possible after every other gate passes.

## B. Normal Local and Remote Issue Branch

Future existing-work resume planning is possible after the same Contract and
preflight gates pass.

## C. Local-only Branch

Recovery or alignment planning is required. Automatic checkout and push are
forbidden.

## D. Remote-only Branch

Recovery or alignment planning is required. Automatic checkout and push are
forbidden.

## E. Open Draft PR

Future existing-work resume planning is possible; duplicate PR creation is
forbidden.

## F. Local and Remote Divergence

Hard stop: report `CONFLICTED` and request user judgment. Do not auto-align.

## G. Merge complete

Implementation planning is forbidden. Only a future Jira-state alignment
candidate may be reported.

## H. Branch collision with another Issue Key or PR

Hard stop: report `CONFLICTED` and request user judgment.
